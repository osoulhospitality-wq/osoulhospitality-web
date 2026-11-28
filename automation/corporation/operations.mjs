// Local trusted-host rehearsal, without a network, model or production adapter.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getAgent } from './registry.mjs';
import { DATASETS, analyse, digest, identifier, prepareSnapshot, timestamp } from './knowledge.mjs';

const POLICY = Object.freeze({
  work_orders: { goal: 'Measure open work orders, late work and missing due dates', source: 'work_orders' },
  sar_budget: { goal: 'Compare aggregate SAR spend with budget for a common reporting period', source: 'sar_budget' },
});

export class Operations {
  #db; #tenant; #clock;
  constructor(path, tenant, clock = () => new Date().toISOString()) {
    if (!identifier(tenant)) throw new Error('Invalid tenant');
    this.#tenant = tenant;
    this.#clock = clock;
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS op_sources(tenant TEXT NOT NULL, source TEXT NOT NULL, version INTEGER NOT NULL,
        kind TEXT NOT NULL, body TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(tenant, source, version));
      CREATE TABLE IF NOT EXISTS op_jobs(tenant TEXT NOT NULL, id TEXT NOT NULL, source TEXT NOT NULL, version INTEGER NOT NULL,
        kind TEXT NOT NULL, stage TEXT NOT NULL, body TEXT, proof TEXT, PRIMARY KEY(tenant,id));
      CREATE TABLE IF NOT EXISTS op_events(sequence INTEGER PRIMARY KEY, tenant TEXT NOT NULL, job TEXT,
        actor TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL, detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS op_stops(tenant TEXT PRIMARY KEY, enabled INTEGER NOT NULL);
    `);
  }
  close() { this.#db.close(); }
  #tx(fn) {
    this.#db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.#db.exec('COMMIT'); return result; }
    catch (e) { this.#db.exec('ROLLBACK'); throw e; }
  }
  #now() { return timestamp(this.#clock()); }
  #log(id, actor, action, detail) {
    this.#db.prepare('INSERT INTO op_events(tenant,job,actor,action,at,detail) VALUES(?,?,?,?,?,?)')
      .run(this.#tenant, id, actor, action, this.#now(), JSON.stringify(detail));
  }
  #latest(source) {
    return this.#db.prepare('SELECT * FROM op_sources WHERE tenant=? AND source=? ORDER BY version DESC LIMIT 1')
      .get(this.#tenant, source);
  }
  #job(id) {
    const job = this.#db.prepare('SELECT * FROM op_jobs WHERE tenant=? AND id=?').get(this.#tenant, id);
    if (!job) throw new Error('Task unavailable');
    return job;
  }
  #active() {
    const stop = this.#db.prepare('SELECT enabled FROM op_stops WHERE tenant=?').get(this.#tenant);
    if (stop?.enabled) throw new Error('Tenant work is paused');
  }
  #current(job) {
    const latest = this.#latest(job.source);
    if (!latest || latest.version !== job.version) throw new Error('Source version superseded; plan a new task');
    const source = JSON.parse(latest.body);
    if (source.expiresAt <= this.#now() || digest(source) !== latest.digest) throw new Error('Stale or inconsistent evidence');
    return source;
  }
  // Host-level controls. These must never be published as model-callable tools.
  setPaused(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Expected boolean');
    return this.#tx(() => {
      this.#db.prepare('INSERT INTO op_stops VALUES(?,?) ON CONFLICT(tenant) DO UPDATE SET enabled=excluded.enabled')
        .run(this.#tenant, Number(enabled));
      this.#log(null, 'OWNER', enabled ? 'pause' : 'resume', {});
    });
  }
  ingest(source, snapshot) {
    if (!identifier(source)) throw new Error('Invalid source');
    return this.#tx(() => {
      this.#active();
      const body = prepareSnapshot(snapshot, this.#now()), fingerprint = digest(body);
      const prev = this.#latest(source);
      if (prev?.digest === fingerprint) return prev.version;
      if (prev) {
        if (prev.kind !== body.kind) throw new Error('Source kind immutable');
        if (JSON.parse(prev.body).observedAt >= body.observedAt) throw new Error('Conflicting or older source observation');
      }
      const version = (prev?.version ?? 0) + 1;
      this.#db.prepare('INSERT INTO op_sources VALUES(?,?,?,?,?,?)')
        .run(this.#tenant, source, version, body.kind, JSON.stringify(body), fingerprint);
      this.#log(null, 'OWNER', 'ingest', {source, version, reference: body.reference, fingerprint});
      return version;
    });
  }
  plan(id, source, version) {
    if (!identifier(id) || !identifier(source) || !Number.isSafeInteger(version) || version < 1) throw new Error('Invalid task');
    return this.#tx(() => this.#plan(id, source, version));
  }
  #plan(id, source, version) {
    this.#active();
    const prior = this.#db.prepare('SELECT * FROM op_jobs WHERE tenant=? AND id=?').get(this.#tenant, id);
    if (prior) {
      if (prior.source === source && prior.version === version) return prior.stage;
      throw new Error('Conflicting task id');
    }
    const material = this.#current({source, version});
    const role = DATASETS[material.kind];
    if (!getAgent(role.producer) || !getAgent(role.reviewer)) throw new Error('Unregistered role');
    this.#db.prepare("INSERT INTO op_jobs VALUES(?,?,?,?,?,'planned',NULL,NULL)").run(this.#tenant, id, source, version, material.kind);
    this.#log(id, 'COS', 'plan', {goal: POLICY[material.kind].goal, producer: role.producer, reviewer: role.reviewer,
      source, version, inferenceBudgetHalala: 0, boundary: 'internal-offline-analysis'});
    return 'planned';
  }
  execute(id, actor) {
    return this.#tx(() => {
      this.#active();
      const job = this.#job(id);
      if (actor !== DATASETS[job.kind].producer) throw new Error('Producer role denied');
      if (job.stage !== 'planned') return job.stage;
      const body = this.#current(job), result = analyse(body);
      this.#db.prepare("UPDATE op_jobs SET stage='produced',body=? WHERE tenant=? AND id=?").run(JSON.stringify(result), this.#tenant, id);
      this.#log(id, actor, 'produce', {source: job.source, version: job.version, sourceDigest: digest(body), resultDigest: digest(result)});
      return 'produced';
    });
  }
  review(id, actor, expected) {
    return this.#tx(() => {
      this.#active();
      const job = this.#job(id);
      if (actor !== DATASETS[job.kind].reviewer) throw new Error('Independent reviewer required');
      const source = this.#current(job);
      if (['closed', 'reviewed', 'blocked'].includes(job.stage)) {
        if (JSON.parse(job.proof).expectedDigest !== digest(expected ?? null)) throw new Error('Review already finalized');
        return job.stage;
      }
      if (job.stage !== 'produced') throw new Error('Produced task required');
      const computed = analyse(source), result = JSON.parse(job.body);
      // Require an independently supplied full expected result; key order is immaterial.
      const accepted = equalRecord(computed, result) && equalRecord(computed, expected);
      const proof = {sourceDigest: digest(source), outputDigest: digest(result), expectedDigest: digest(expected ?? null),
        reference: source.reference, reviewer: actor, accepted, assessedAt: this.#now()};
      this.#db.prepare('UPDATE op_jobs SET stage=?,proof=? WHERE tenant=? AND id=?')
        .run(accepted ? 'reviewed' : 'blocked', JSON.stringify(proof), this.#tenant, id);
      this.#log(id, actor, accepted ? 'verified' : 'correction_required', proof);
      return accepted ? 'reviewed' : 'blocked';
    });
  }
  finish(id) {
    return this.#tx(() => {
      this.#active();
      const job = this.#job(id);
      if (job.stage === 'closed') return 'closed';
      this.#current(job);
      if (job.stage !== 'reviewed' || !JSON.parse(job.proof)?.accepted) throw new Error('Verified evidence required');
      this.#db.prepare("UPDATE op_jobs SET stage='closed' WHERE tenant=? AND id=?").run(this.#tenant, id);
      this.#log(id, 'COS', 'close', {proof: JSON.parse(job.proof), lesson: 'Retain the observed period and denominator with the result.'});
      return 'closed';
    });
  }
  correctivePlan(id, nextId, source, version) {
    // Retain the failed comparison and open a separately reviewed successor.
    return this.#tx(() => {
      const failed = this.#job(id);
      if (!identifier(nextId) || !Number.isSafeInteger(version) || failed.stage !== 'blocked' ||
          nextId === id || source !== failed.source || version < failed.version) throw new Error('Invalid correction');
      const stage = this.#plan(nextId, source, version);
      if (stage !== 'planned') throw new Error('Successor already executed');
      const prior = this.#db.prepare("SELECT detail FROM op_events WHERE tenant=? AND job=? AND action='corrective_plan'").get(this.#tenant,nextId);
      if (prior && JSON.parse(prior.detail).predecessor !== id) throw new Error('Conflicting predecessor');
      if (!prior) this.#log(nextId,'CQO','corrective_plan',{predecessor:id, comparison:JSON.parse(failed.proof).expectedDigest});
      return stage;
    });
  }
  report(id) {
    const job = this.#job(id);
    const events = this.#db.prepare('SELECT actor,action,at,detail FROM op_events WHERE tenant=? AND job=? ORDER BY sequence').all(this.#tenant,id);
    return {tenant:this.#tenant, task:id, stage:job.stage, kind:job.kind, source:job.source, version:job.version,
      output:JSON.parse(job.body), proof:JSON.parse(job.proof), events:events.map(e=>({...e,detail:JSON.parse(e.detail)}))};
  }
}

function equalRecord(a,b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(a).length !== Object.keys(b).length) return false;
  return Object.entries(a).every(([k,v])=>Object.hasOwn(b,k) && b[k] === v);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [path, tenant, command, ...args] = process.argv.slice(2);
    if (!path || !tenant || !command) throw new Error('Usage: node operations.mjs DATABASE TENANT COMMAND [arguments]. See operations.md');
    const store = new Operations(path, tenant);
    try {
      const [id, arg, arg2, arg3] = args;
      const jsonFile = file => JSON.parse(readFileSync(file,'utf8'));
      const actions = {
        ingest:()=>store.ingest(id,jsonFile(arg)), plan:()=>store.plan(id,arg,Number(arg2)),
        execute:()=>store.execute(id,arg), review:()=>store.review(id,arg,jsonFile(arg2)),
        close:()=>store.finish(id), report:()=>store.report(id),
        correct:()=>store.correctivePlan(id,arg,arg2,Number(arg3)), pause:()=>store.setPaused(true), resume:()=>store.setPaused(false),
      };
      if (!Object.hasOwn(actions,command)) throw new Error('Unknown command');
      console.log(JSON.stringify(actions[command]() ?? {ok:true},null,2));
    } finally { store.close(); }
  } catch(e) { console.error(e.message); process.exitCode=1; }
}
