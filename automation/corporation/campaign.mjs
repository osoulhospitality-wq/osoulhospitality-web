// Local rehearsal only. No HTTP client, provider secrets, shell adapters or paid actions.
// Actors passed by the test harness are simulated principals, not authenticated production identities.
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const stages = [
  ['signal','M01'], ['audience','M03'], ['opportunity','M21'], ['strategy','M05'],
  ['copy','M06'], ['concept','M08'], ['design','M09'], ['videoDecision','M11'],
  ['brandReview','M04'], ['qualityReview','M22'], ['approval','OWNER'], ['publish','M13'],
  ['community','M14'], ['lead','M17'], ['conversion','CCO'], ['measurement','M18'], ['lesson','CAIO']
].map(([id, role]) => Object.freeze({id,role}));
Object.freeze(stages);

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
const identifier = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const signoffSteps = new Set(['brandReview','qualityReview','approval']);
const producingSteps = new Set(['copy','concept','design','videoDecision']);

export class CampaignRehearsal {
  #db;
  #now;
  constructor(path = ':memory:', now = Date.now) {
    this.#now = now;
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS campaigns(
        tenant TEXT, id TEXT, stopped INTEGER DEFAULT 0, PRIMARY KEY(tenant,id));
      CREATE TABLE IF NOT EXISTS campaign_steps(
        tenant TEXT, campaign TEXT, ordinal INTEGER, stage TEXT, actor TEXT,
        payload TEXT, recorded INTEGER, PRIMARY KEY(tenant,campaign,ordinal));
      CREATE TABLE IF NOT EXISTS simulated_posts(
        tenant TEXT, campaign TEXT, approved_digest TEXT, receipt TEXT, attempted INTEGER,
        PRIMARY KEY(tenant,campaign));
      CREATE TABLE IF NOT EXISTS campaign_failures(
        tenant TEXT,campaign TEXT,stage TEXT,code TEXT,at INTEGER);
    `);
  }
  close() { this.#db.close(); }
  #tx(fn) {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }
  start(tenant, campaign) {
    requireValue(identifier(tenant) && identifier(campaign), 'INVALID_SCOPE');
    this.#db.prepare('INSERT OR IGNORE INTO campaigns(tenant,id) VALUES(?,?)').run(tenant,campaign);
  }
  // Trusted rehearsal operator only. Not exposed to stage handlers.
  stop(tenant, campaign, stopped = true) {
    requireValue(typeof stopped === 'boolean','INVALID_CONTROL');
    const row = this.#db.prepare('UPDATE campaigns SET stopped=? WHERE tenant=? AND id=?')
      .run(Number(stopped),tenant,campaign);
    requireValue(row.changes === 1,'UNKNOWN_CAMPAIGN');
  }
  #read(tenant,campaign) {
    return this.#db.prepare('SELECT ordinal,stage,actor,payload,recorded FROM campaign_steps WHERE tenant=? AND campaign=? ORDER BY ordinal')
      .all(tenant,campaign).map(row => ({...row,payload:JSON.parse(row.payload)}));
  }
  report(tenant,campaign) {
    const steps = this.#read(tenant,campaign);
    const failures = this.#db.prepare('SELECT stage,code,at FROM campaign_failures WHERE tenant=? AND campaign=? ORDER BY rowid')
      .all(tenant,campaign);
    const state = steps.length === stages.length ? 'verified_rehearsal' : 'incomplete';
    return {mode:'local_synthetic',state,steps,failures,externalActions:0,paidMediaSpendMinor:0};
  }
  approvedDigest(tenant,campaign) {
    const rows = this.#read(tenant,campaign).filter(r => r.ordinal < 8);
    requireValue(rows.length === 8,'MISSING_CREATIVE_EVIDENCE');
    return digest([tenant,campaign,rows.map(r => [r.stage,r.actor,r.payload])]);
  }
  advance(tenant,campaign,stage,principal,payload,simulation = {}) {
    try {
      return this.#tx(() => this.#advance(tenant,campaign,stage,principal,payload,simulation));
    } catch (err) {
      // Only fixed diagnostic codes enter the failure log; never persist arbitrary input as an error.
      const code = /^[A-Z_]+$/.test(err.message) ? err.message : 'INTERNAL_ERROR';
      const exists = this.#db.prepare('SELECT 1 FROM campaigns WHERE tenant=? AND id=?').get(tenant,campaign);
      if (exists && principal?.tenant === tenant && stages.some(s => s.id === stage)) {
        this.#db.prepare('INSERT INTO campaign_failures VALUES(?,?,?,?,?)').run(tenant,campaign,stage,code,this.#now());
      }
      throw err;
    }
  }
  #advance(tenant,campaign,stage,principal,payload,simulation) {
    requireValue(principal?.tenant === tenant && identifier(principal?.id),'WRONG_PRINCIPAL');
    const campaignRow = this.#db.prepare('SELECT stopped FROM campaigns WHERE tenant=? AND id=?').get(tenant,campaign);
    requireValue(campaignRow,'UNKNOWN_CAMPAIGN');
    requireValue(!campaignRow.stopped,'STOPPED');
    const index = stages.findIndex(s => s.id === stage);
    requireValue(index >= 0 && principal.role === stages[index].role,'ROLE_DENIED');
    requireValue(payload && Object.getPrototypeOf(payload) === Object.prototype && nonempty(payload.evidence),'MISSING_EVIDENCE');
    const steps = this.#read(tenant,campaign);
    const existing = steps[index];
    if (existing) {
      requireValue(existing.actor === principal.id && JSON.stringify(existing.payload.input) === JSON.stringify(payload),'REPLAY_CONFLICT');
      return existing.payload;
    }
    requireValue(index === steps.length,'OUT_OF_ORDER');
    const previous = id => steps.find(s => s.stage === id)?.payload.input;
    let observed;
    if (signoffSteps.has(stage)) {
      const producers = steps.filter(s => producingSteps.has(s.stage));
      const reviewers = steps.filter(s => signoffSteps.has(s.stage));
      requireValue(![...producers,...reviewers].some(s => s.actor === principal.id),'INDEPENDENCE_REQUIRED');
      requireValue(payload.digest === this.approvedDigest(tenant,campaign),'REVISION_MISMATCH');
      requireValue(payload.decision === 'accepted' && payload.criticalOpen === 0,'SIGNOFF_BLOCKED');
    } else if (stage === 'publish') {
      requireValue(previous('approval')?.digest === payload.digest,'APPROVAL_REQUIRED');
      requireValue(!steps.some(s => signoffSteps.has(s.stage) && s.actor === principal.id),'INDEPENDENCE_REQUIRED');
      const strategy = previous('strategy');
      requireValue(strategy.channel === payload.channel && payload.publisher === 'local-simulator' && payload.spendMinor === 0,'PUBLISH_POLICY');
      requireValue(strategy.scheduleAt === payload.scheduleAt && this.#now() >= Date.parse(payload.scheduleAt),'NOT_DUE');
      const post = this.#db.prepare('SELECT approved_digest,receipt FROM simulated_posts WHERE tenant=? AND campaign=?').get(tenant,campaign);
      if (post) requireValue(post.approved_digest === payload.digest,'REPLAY_CONFLICT');
      // Only a definite pre-delivery failure is eligible for retry. Unknown outcomes
      // reconcile the simulated destination record, even on a fresh connection.
      if (!post) {
        const previousFailures = this.#db.prepare(`
          SELECT count(*) AS attempts, max(at) AS last_failure FROM campaign_failures
          WHERE tenant=? AND campaign=? AND stage='publish' AND code='PROVIDER_UNAVAILABLE'
        `).get(tenant,campaign);
        requireValue(previousFailures.attempts < 3,'DEAD_LETTER');
        if (previousFailures.attempts) {
          const delay = 1000 * 2 ** (previousFailures.attempts - 1);
          requireValue(this.#now() >= previousFailures.last_failure + delay,'BACKOFF');
        }
        if (simulation.failure === 'provider_unavailable') throw new Error('PROVIDER_UNAVAILABLE');
      }
      const receipt = post?.receipt ?? 'simulated-' + digest([tenant,campaign,payload.digest]).slice(0,32);
      this.#db.prepare('INSERT OR IGNORE INTO simulated_posts VALUES(?,?,?,?,?)').run(tenant,campaign,payload.digest,receipt,this.#now());
      if (simulation.failure === 'lost_ack' && !post) {
        this.#db.prepare('INSERT INTO campaign_failures VALUES(?,?,?,?,?)').run(tenant,campaign,stage,'RECONCILE_REQUIRED',this.#now());
        return {state:'reconcile_required'};
      }
      observed = {provider:'local-simulator',receipt,verifiedBy:'simulated_posts_readback',
        confirmed:this.#db.prepare('SELECT receipt FROM simulated_posts WHERE tenant=? AND campaign=?').get(tenant,campaign).receipt === receipt};
      requireValue(observed.confirmed,'RECEIPT_MISMATCH');
    } else {
      requireValue(validateArtifact(stage,payload,previous),'INVALID_ARTIFACT');
      if (stage === 'measurement') {
        const {qualified} = previous('lead');
        const {revenueMinor} = previous('conversion');
        const {visits} = payload;
        requireValue(qualified <= visits,'INCONSISTENT_FUNNEL');
        observed = {qualifiedPerVisit:visits ? qualified/visits : null, attributedRevenueMinor:revenueMinor,roas:null};
      }
    }
    const result = {input:payload,...(observed ? {observed} : {})};
    this.#db.prepare('INSERT INTO campaign_steps VALUES(?,?,?,?,?,?,?)')
      .run(tenant,campaign,index,stage,principal.id,JSON.stringify(result),this.#now());
    return result;
  }
}

function validateArtifact(stage,p,previous) {
  switch (stage) {
    case 'signal': return nonempty(p.source) && nonempty(p.observation) && p.growthRate === null;
    case 'audience': return nonempty(p.segment) && nonempty(p.objection);
    case 'opportunity': return nonempty(p.offer) && nonempty(p.businessQuestion);
    case 'strategy': return p.format === 'single_static_post' && p.channel === 'linkedin' &&
      p.spendMinor === 0 && typeof p.scheduleAt === 'string' && /\+03:00$/.test(p.scheduleAt) &&
      Number.isFinite(Date.parse(p.scheduleAt)) && nonempty(p.timingBasis);
    case 'copy': return nonempty(p.arabic) && nonempty(p.english) && nonempty(p.cta);
    case 'concept': return nonempty(p.story) && nonempty(p.artDirection);
    case 'design': return nonempty(p.headline) && nonempty(p.caption) && nonempty(p.alt) && nonempty(p.layout);
    case 'videoDecision': return p.status === 'not_applicable' && previous('strategy').format === 'single_static_post' && nonempty(p.reason);
    case 'community': return count(p.inquiries) && nonempty(p.routing);
    case 'lead': return count(p.qualified) && p.qualified <= previous('community').inquiries && p.personalData === false;
    case 'conversion': return count(p.wonDeals) && p.wonDeals <= previous('lead').qualified &&
      count(p.revenueMinor) && (p.wonDeals > 0 || p.revenueMinor === 0) && p.currency === 'SAR';
    case 'measurement': return count(p.visits) && nonempty(p.attributionWindow);
    case 'lesson': return nonempty(p.finding) && nonempty(p.nextTest) && nonempty(p.owner);
    default: return false;
  }
}
