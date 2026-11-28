import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Operations } from './operations.mjs';
import { DATASETS, analyse, prepareSnapshot, timestamp } from './knowledge.mjs';

const now = '2026-11-27T12:00:00.000Z';
const order = {id:'WO-01',state:'open',due:'2026-11-27T10:00:00Z'};
const snapshot = { kind:'work_orders',reference:'cmms.export.r1',observedAt:now,
  expiresAt:'2026-11-28T00:00:00Z',rows:[order,{id:'WO-02',state:'open',due:null},{id:'WO-03',state:'closed',due:order.due}] };
const expected = {total:3,open:2,overdue:1,missingDue:1,oldestOverdueMinutes:120};
function setup(t, tenant='osoul', clock=()=>now) {
  const dir = mkdtempSync(join(tmpdir(),'draqon-internal-'));
  const path=join(dir,'rehearsal.db');
  const db = new Operations(path,tenant,clock);
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
  return {db,path};
}
function plan(db) {
  assert.equal(db.ingest('cmms',snapshot),1);
  assert.equal(db.plan('job1','cmms',1),'planned');
}
test('finance aggregation keeps SAR halala exact and separates missing from zero',()=>{
  const src=prepareSnapshot({...snapshot,kind:'sar_budget',rows:[{id:'line',actualHalala:12003,budgetHalala:10000}]},now);
  assert.deepEqual(analyse(src),{currency:'SAR',lines:1,actualHalala:12003,budgetHalala:10000,varianceHalala:2003});
  assert.throws(()=>prepareSnapshot({...snapshot,kind:'sar_budget',rows:[{id:'line',budgetHalala:25}]},now));
});
test('schema rejects mixed, duplicate, non-finite, invalid time and extra personal fields',()=>{
  for (const rows of [[order,order],[{...order,email:'example.invalid'}],[{...order,state:'unknown'}],[{...order,due:'2026-02-30T12:00:00Z'}]]) {
    assert.throws(()=>prepareSnapshot({...snapshot,rows},now));
  }
  assert.throws(()=>timestamp('not a date'));
  assert.throws(()=>analyse({kind:'sar_budget',rows:[{actualHalala:Number.MAX_SAFE_INTEGER,budgetHalala:0},{actualHalala:1,budgetHalala:0}]}));
});
test('controlled work-order lifecycle is durable, tenant isolated and idempotent',t=>{
  const {db,path}=setup(t);plan(db);assert.equal(db.plan('job1','cmms',1),'planned');
  assert.equal(db.ingest('cmms',{...snapshot,rows:[...snapshot.rows].reverse()}),1);
  assert.throws(()=>db.execute('job1','CFO'));assert.throws(()=>db.finish('job1'));
  assert.equal(db.execute('job1','COO'),'produced');assert.throws(()=>db.review('job1','COO',expected));
  assert.equal(db.review('job1','CQO',expected),'reviewed');
  assert.equal(db.review('job1','CQO',expected),'reviewed');
  assert.equal(db.finish('job1'),'closed');assert.equal(db.finish('job1'),'closed');
  const report=db.report('job1');assert.deepEqual(report.output,expected);assert.equal(report.proof.accepted,true);
  assert.deepEqual(report.events.map(r=>r.action),['plan','produce','verified','close']);
  const later=new Operations(path,'osoul',()=>now),other=new Operations(path,'other-company',()=>now);
  try {assert.deepEqual(later.report('job1'),report);assert.throws(()=>other.report('job1'));assert.throws(()=>other.plan('other','cmms',1));}
  finally {later.close();other.close();}
});
test('correction creates successor while preserving rejected evidence',t=>{
  const {db}=setup(t);plan(db);db.execute('job1','COO');assert.equal(db.review('job1','CQO',{...expected,open:0}),'blocked');
  assert.throws(()=>db.finish('job1'));assert.throws(()=>db.review('job1','CQO',expected));
  assert.throws(()=>db.correctivePlan('job1','job1','cmms',1));
  assert.equal(db.correctivePlan('job1','job2','cmms',1),'planned');
  assert.equal(db.correctivePlan('job1','job2','cmms',1),'planned');
  db.execute('job2','COO');db.review('job2','CQO',expected);db.finish('job2');
  assert.equal(db.report('job1').stage,'blocked');assert.equal(db.report('job2').events.filter(e=>e.action==='corrective_plan').length,1);
});
test('stop blocks work while retaining read access; immutable timestamps and source binding',t=>{
  let clock=now;const {db}=setup(t,'osoul',()=>clock);plan(db);
  db.setPaused(true);assert.throws(()=>db.execute('job1','COO'));assert.equal(db.report('job1').stage,'planned');
  db.setPaused(false);assert.equal(db.execute('job1','COO'),'produced');
  assert.throws(()=>db.ingest('cmms',{...snapshot,rows:[]}));
  clock='2026-11-27T12:05:00.000Z';
  assert.equal(db.ingest('cmms',{...snapshot,observedAt:clock}),2);
  assert.throws(()=>db.review('job1','CQO',expected));
  assert.throws(()=>db.plan('job1','cmms',2));
  assert.throws(()=>db.plan('job2','cmms',1));
  assert.equal(db.plan('job2','cmms',2),'planned');
  clock='2026-11-28T00:00:00.000Z';assert.throws(()=>db.execute('job2','COO'));
});

test('untrusted inputs cannot mutate role routing and dataset schemas',()=>{
  for (const config of Object.values(DATASETS)) {
    assert.ok(Object.isFrozen(config));
    assert.throws(()=>{config.reviewer='COO';}, TypeError);
  }
  assert.throws(()=>{DATASETS.work_orders={};},TypeError);
  assert.throws(()=>prepareSnapshot({...snapshot,unsafeMetadata:'discard'},now));
});
