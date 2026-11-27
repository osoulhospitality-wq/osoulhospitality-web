/**
 * Single-host sandbox dispatcher for testing DRAQON's control protocol. SQLite
 * provides durable atomic reservations and per-tenant idempotency. No external
 * adapter, deployment capability, network endpoint or model credentials.
 *
 * Administrative methods belong to trusted infrastructure, never an agent tool.
 * After restart, reconcile any dispatching attempt against the destination before
 * retrying. All currency values are integer minor units of one configured currency.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { assess, isIdentifier, validMoney } from './control-policy.mjs';

export class ControlLedger {
  #db;
  #now;
  #verify;

  constructor(path, {now = Date.now, verifyReceipt}) {
    if (typeof verifyReceipt !== 'function') throw new Error('Independent receipt verifier required');
    this.#now = now;
    this.#verify = verifyReceipt;
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA busy_timeout=3000;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS budgets(tenant TEXT PRIMARY KEY, cap INTEGER NOT NULL CHECK(cap>=0),
        used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0), stopped INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS jobs(tenant TEXT NOT NULL REFERENCES budgets(tenant), task TEXT NOT NULL,
        digest TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, actor TEXT NOT NULL, receipt_type TEXT NOT NULL,
        attempt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, state TEXT NOT NULL, cap INTEGER NOT NULL,
        due INTEGER, receipt TEXT, charged INTEGER, PRIMARY KEY(tenant,task));
      CREATE UNIQUE INDEX IF NOT EXISTS receipt_once ON jobs(tenant,receipt_type,receipt) WHERE receipt IS NOT NULL;
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY, at INTEGER NOT NULL,
        tenant TEXT, task TEXT, actor TEXT, code TEXT NOT NULL, detail TEXT);
    `);
  }
  close() { this.#db.close(); }
  #one(sql, ...v) { return this.#db.prepare(sql).get(...v); }
  #write(sql, ...v) { return this.#db.prepare(sql).run(...v); }
  #tx(fn) {
    this.#db.exec('BEGIN IMMEDIATE');
    try { const result=fn(); this.#db.exec('COMMIT'); return result; }
    catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }
  #event(tenant, task, actor, code, detail=null) {
    this.#write('INSERT INTO events(at,tenant,task,actor,code,detail) VALUES(?,?,?,?,?,?)',
      this.#now(),tenant,task,actor,code,detail);
    return {code};
  }
  configure(tenant, {cap,stopped}, operatorId) {
    if (!isIdentifier(tenant) || !isIdentifier(operatorId) || !validMoney(cap) || typeof stopped !== 'boolean')
      throw new Error('Invalid control configuration');
    return this.#tx(() => {
      const prior=this.#one('SELECT used FROM budgets WHERE tenant=?',tenant);
      if (prior && cap < prior.used) throw new Error('New cap below committed exposure');
      this.#write('INSERT INTO budgets(tenant,cap,stopped) VALUES(?,?,?) ON CONFLICT(tenant) DO UPDATE SET cap=excluded.cap,stopped=excluded.stopped',tenant,cap,Number(stopped));
      return this.#event(tenant,null,operatorId,stopped?'STOPPED':'CONTROL_CONFIGURED',String(cap));
    });
  }
  reserve(command, trust) {
    const now=this.#now();
    const decision=assess(command,trust,now);
    const tenant=isIdentifier(trust?.subject?.tenantId)?trust.subject.tenantId:null;
    const actor=isIdentifier(trust?.subject?.actorId)?trust.subject.actorId:null;
    const task=isIdentifier(command?.taskId)?command.taskId:null;
    return this.#tx(() => {
      const record=(code,detail=null)=>this.#event(tenant,task,actor,code,detail);
      if (!decision.allowed) return record(decision.code);
      const funding=this.#one('SELECT * FROM budgets WHERE tenant=?',tenant);
      if (!funding || funding.stopped) return record('STOPPED');
      const job=this.#one('SELECT * FROM jobs WHERE tenant=? AND task=?',tenant,task);
      if (job && job.digest!==decision.digest) return record('IDEMPOTENCY_CONFLICT');
      if (job && job.state!=='retry_wait') return record('EXISTING_'+job.state.toUpperCase());
      if (job && job.cap!==trust.maxCostMinor) return record('TERMS_CHANGED');
      if (job && job.due>now) return record('BACKOFF');
      if (trust.maxCostMinor>funding.cap-funding.used) return record('BUDGET_EXCEEDED');
      const attempt=job ? job.attempt+1 : 1, token=randomUUID();
      this.#write('UPDATE budgets SET used=used+? WHERE tenant=?',trust.maxCostMinor,tenant);
      if (job) this.#write("UPDATE jobs SET attempt=?, token=?, state='dispatching',due=NULL,actor=? WHERE tenant=? AND task=?",attempt,token,actor,tenant,task);
      else this.#write("INSERT INTO jobs(tenant,task,digest,action,target,actor,receipt_type,attempt,token,state,cap) VALUES(?,?,?,?,?,?,?,?,?,'dispatching',?)",
        tenant,task,decision.digest,command.action,command.targetId,actor,decision.receiptType,attempt,token,trust.maxCostMinor);
      record('DISPATCH_RESERVED',JSON.stringify({digest:decision.digest,attempt,approvalId:decision.approvalId,reviewId:decision.reviewId,cap:trust.maxCostMinor}));
      return {code:'DISPATCH_RESERVED',token,attempt};
    });
  }
  // Only the adapter holding the attempt token may submit outcomes. Unknown
  // outcomes retain the reservation and cannot automatically create a new attempt.
  settle(token, outcome) {
    return this.#tx(() => {
      const j=this.#one('SELECT * FROM jobs WHERE token=?',token);
      if (!j) return {code:'UNRECOGNIZED_ATTEMPT'};
      if (!['dispatching','reconcile'].includes(j.state)) return {code:'EXISTING_'+j.state.toUpperCase()};
      const record=(code,detail=null)=>this.#event(j.tenant,j.task,j.actor,code,detail);
      const change=(state,due=null)=>this.#write('UPDATE jobs SET state=?,due=? WHERE token=?',state,due,token);
      if (outcome==='known_not_applied' || outcome==='permanent_not_applied') {
        // This branch is for definitive no-effect AND no-billing acknowledgements only.
        const retry=outcome==='known_not_applied' && j.attempt<3;
        const delay=retry ? 1000*(2**(j.attempt-1)) : null;
        change(retry?'retry_wait':'dead_letter',retry?this.#now()+delay:null);
        this.#write('UPDATE budgets SET used=used-? WHERE tenant=?',j.cap,j.tenant);
        return record(retry?'RETRY_SCHEDULED':'DEAD_LETTER');
      }
      let receipt=null;
      if (outcome==='verify') {
        try { receipt=this.#verify({tenantId:j.tenant,taskId:j.task,targetId:j.target,digest:j.digest,type:j.receipt_type}); }
        catch { /* Missing independent evidence is an uncertain outcome. */ }
      }
      if (!receipt || receipt.tenantId!==j.tenant || receipt.taskId!==j.task ||
          receipt.targetId!==j.target || receipt.type!==j.receipt_type || receipt.digest!==j.digest ||
          !isIdentifier(receipt.id) || !validMoney(receipt.chargedMinor) || receipt.chargedMinor>j.cap ||
          this.#one('SELECT task FROM jobs WHERE tenant=? AND receipt_type=? AND receipt=?',j.tenant,j.receipt_type,receipt.id)) {
        change('reconcile');
        return record('RECONCILE_REQUIRED');
      }
      this.#write("UPDATE jobs SET state='completed',receipt=?,charged=? WHERE token=?",receipt.id,receipt.chargedMinor,token);
      this.#write('UPDATE budgets SET used=used-? WHERE tenant=?',j.cap-receipt.chargedMinor,j.tenant);
      return record('VERIFIED_COMPLETE',receipt.id);
    });
  }
  // Operator-only telemetry: omit task text, identities and attempt capabilities.
  summary(tenant) {
    const budget=this.#one('SELECT cap,used,stopped FROM budgets WHERE tenant=?',tenant);
    const states=this.#db.prepare('SELECT state,count(*) AS n FROM jobs WHERE tenant=? GROUP BY state').all(tenant);
    const audit=this.#one('SELECT count(*) AS n FROM events WHERE tenant=?',tenant);
    return {budget:budget ? {...budget}:null,states:Object.fromEntries(states.map(x=>[x.state,x.n])),events:audit.n};
  }
}

