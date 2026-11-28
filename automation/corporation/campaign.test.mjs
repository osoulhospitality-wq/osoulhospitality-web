import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CampaignRehearsal,stages } from './campaign.mjs';
import { fixtureRequest,fixtureScope,fixtureTime,runCampaign,renderCard } from './campaign-rehearsal.mjs';

const {tenant,campaign} = fixtureScope;
function setup(t,{until=0,path=':memory:',now=()=>fixtureTime}={}) {
  const db = new CampaignRehearsal(path,now);
  t.after(()=>db.close());
  db.start(tenant,campaign);
  for (const s of stages.slice(0,until)) db.advance(...fixtureRequest(db,s));
  return db;
}
function at(db,i) {return fixtureRequest(db,stages[i]);}
test('all seventeen stages include evidence and finish with a scoped lesson and measurable synthetic funnel',t=>{
  const db=setup(t), r=runCampaign(db);
  assert.equal(r.steps.length,17);
  assert.equal(r.state,'verified_rehearsal');
  assert.deepEqual(r.steps[15].payload.observed,{qualifiedPerVisit:0.1,attributedRevenueMinor:0,roas:null});
  assert.equal(r.steps[11].payload.observed.confirmed,true);
  assert.ok(r.steps.every(s=>s.payload.input.evidence));
  assert.equal(r.externalActions,0);
});
test('replaying all events leaves one local publication receipt and unchanged history',t=>{
  const db=setup(t);
  assert.deepEqual(runCampaign(db),runCampaign(db));
});
test('every step refuses a principal lacking the assigned role',t=>{
  const db=setup(t);
  for (const [i,s] of stages.entries()) {
    const req=at(db,i);
    assert.throws(()=>db.advance(...req.slice(0,3),{...req[3],role:'OTHER'},req[4]),/ROLE_DENIED/);
    db.advance(...req);
  }
});
test('every step checks tenant membership independently from claimed role',t=>{
  const db=setup(t);
  for (const [i] of stages.entries()) {
    const req=at(db,i);
    assert.throws(()=>db.advance(...req.slice(0,3),{...req[3],tenant:'Other'},req[4]),/WRONG_PRINCIPAL/);
    db.advance(...req);
  }
  assert.equal(db.report('Other',campaign).steps.length,0);
});
test('no approval shortcuts and no missing evidence',t=>{
  const db=setup(t);
  assert.throws(()=>db.advance(...at(db,1)),/OUT_OF_ORDER/);
  const req=at(db,0);delete req[4].evidence;
  assert.throws(()=>db.advance(...req),/MISSING_EVIDENCE/);
});
test('the producer cannot simulate a QA signoff with a second role',t=>{
  const db=setup(t,{until:9}),req=at(db,9);req[3].id='fixture-M06';
  assert.throws(()=>db.advance(...req),/INDEPENDENCE_REQUIRED/);
});
test('owner signoff cannot reuse the QA identity, accept a changed artifact or ignore open critical findings',t=>{
  const db=setup(t,{until:10}),req=at(db,10);
  assert.throws(()=>db.advance(...req.slice(0,3),{...req[3],id:'fixture-M22'},req[4]),/INDEPENDENCE_REQUIRED/);
  assert.throws(()=>db.advance(...req.slice(0,4),{...req[4],digest:'stale'}),/REVISION_MISMATCH/);
  assert.throws(()=>db.advance(...req.slice(0,4),{...req[4],criticalOpen:1}),/SIGNOFF_BLOCKED/);
});
test('historical draft cannot be changed on replay',t=>{
  const db=setup(t,{until:9}),req=at(db,4);req[4].arabic='different';
  assert.throws(()=>db.advance(...req),/REPLAY_CONFLICT/);
});
test('simulation rejects real providers, changed channel, unapproved paid spend, early publication',t=>{
  const db=setup(t,{until:11,now:()=>fixtureTime-3600000}),req=at(db,11);
  for (const edit of [{publisher:'live-provider'},{channel:'another-channel'},{spendMinor:1}])
    assert.throws(()=>db.advance(...req.slice(0,4),{...req[4],...edit}),/PUBLISH_POLICY/);
  assert.throws(()=>db.advance(...req),/NOT_DUE/);
});
test('paused publishing and missing provider are visible, without a verified receipt',t=>{
  let clock=fixtureTime;
  const db=setup(t,{until:11,now:()=>clock}),req=at(db,11);
  db.stop(tenant,campaign);
  assert.throws(()=>db.advance(...req),/STOPPED/);
  db.stop(tenant,campaign,false);
  assert.throws(()=>db.advance(...req,{failure:'provider_unavailable'}),/PROVIDER_UNAVAILABLE/);
  const r=db.report(tenant,campaign);assert.equal(r.steps.length,11);
  assert.deepEqual(r.failures.map(f=>f.code),['STOPPED','PROVIDER_UNAVAILABLE']);
  assert.throws(()=>db.advance(...req),/BACKOFF/);
  clock+=1000;
  assert.equal(db.advance(...req).observed.confirmed,true);
});
test('lost acknowledgement reconciles across connections with the original local receipt',t=>{
  const folder=mkdtempSync(join(tmpdir(),'draqon-campaign-'));
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const path=join(folder,'ledger.db'),db=setup(t,{path,until:11});
  const req=at(db,11);assert.equal(db.advance(...req,{failure:'lost_ack'}).state,'reconcile_required');
  assert.equal(db.report(tenant,campaign).steps.length,11);
  const recovered=setup(t,{path});
  const first=recovered.advance(...at(recovered,11)),again=db.advance(...req);
  assert.equal(first.observed.receipt,again.observed.receipt);
  assert.equal(recovered.report(tenant,campaign).steps.length,12);
});
test('lead and revenue attribution cannot exceed source counts or invent revenue with zero wins',t=>{
  const db=setup(t,{until:13}),lead=at(db,13);
  assert.throws(()=>db.advance(...lead.slice(0,4),{...lead[4],qualified:4}),/INVALID_ARTIFACT/);
  db.advance(...lead); const conversion=at(db,14);
  assert.throws(()=>db.advance(...conversion.slice(0,4),{...conversion[4],revenueMinor:1}),/INVALID_ARTIFACT/);
});
test('no platform delivery can claim to have produced a video for a static brief',t=>{
  const db=setup(t,{until:7}),req=at(db,7);
  assert.throws(()=>db.advance(...req.slice(0,4),{...req[4],status:'published'}),/INVALID_ARTIFACT/);
});
test('synthetic creative renders as an accessible local specimen with escaped text',t=>{
  const db=setup(t),r=runCampaign(db),design=r.steps[6].payload.input;
  const svg=renderCard({...design,headline:'<test>&'});
  assert.match(svg,/<title>/);assert.match(svg,/&lt;test&gt;&amp;/);
});

test('three definitive publisher failures dead-letter the local attempt and preserve its evidence',t=>{
  let clock=fixtureTime;
  const db=setup(t,{until:11,now:()=>clock}),req=at(db,11);
  for (const delay of [1000,2000,4000]) {
    assert.throws(()=>db.advance(...req,{failure:'provider_unavailable'}),/PROVIDER_UNAVAILABLE/);
    clock+=delay;
  }
  assert.throws(()=>db.advance(...req),/DEAD_LETTER/);
  const state=db.report(tenant,campaign);
  assert.equal(state.state,'incomplete');
  assert.equal(state.steps.length,11);
  assert.equal(state.failures.at(-1).code,'DEAD_LETTER');
});
