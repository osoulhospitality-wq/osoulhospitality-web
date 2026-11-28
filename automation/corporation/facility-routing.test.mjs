import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgent } from './registry.mjs';
import { Operations } from './operations.mjs';
import { facilityCouncil, prepareAssignment, runAnalysis } from './facility-routing.mjs';

const asOf = '2026-11-28T08:00:00.000Z';
const tenant = 'test-company', facility = 'test-building';
const sample = type => ({ tenant, facility, type, reference: 'local.snapshot', observedAt: asOf, expiresAt: '2026-11-30T00:00:00.000Z' });
const taskFor = topic => ({id:'test.' + topic, topic, intent:'prepare'});
const context = evidence => ({tenant, facility, asOf, evidence});

test('thirty distinct FM mandates have accountable producers, independent reviewers, measures and evidence contracts', () => {
  assert.equal(new Set(facilityCouncil.map(rule => rule.topic)).size, 30);
  assert.equal(new Set(facilityCouncil.map(rule => rule.lead)).size, 30);
  for (const rule of facilityCouncil) {
    const card = getAgent(rule.lead);
    assert.ok(card && card.permissions.externalWrites === false);
    assert.equal(getAgent(rule.reviewer).permissions.independentReview, true);
    assert.notEqual(rule.reviewer, rule.lead);
    const task = taskFor(rule.topic);
    assert.equal(prepareAssignment(task, context([])).state, 'awaiting_evidence');
    const facts = rule.evidence.map(sample);
    const packet = prepareAssignment(task, context(facts));
    assert.equal(packet.state, 'prepared');
    assert.equal(packet.measure, card.kpis[0]);
    assert.equal(packet.references.length, facts.length);
    assert.deepEqual(packet, prepareAssignment(task, context(facts.reverse())));
    const controlled = prepareAssignment({...task,intent:'pay'},context(facts));
    assert.equal(controlled.state, 'awaiting_human_authorization');
    assert.match(controlled.approver, /^human\./);
  }
});

test('missing, stale, future and out-of-scope evidence never authorizes dispatch', () => {
  const task = taskFor('prediction');
  const good = facilityCouncil.find(rule => rule.topic === task.topic).evidence.map(sample);
  const host = context([...good.map(row => ({...row, tenant:'other'})), ...good.map(row => ({...row, facility:'other'})),
    {...good[0], expiresAt:asOf}, {...good[1], observedAt:'2026-11-29T00:00:00.000Z'}]);
  const result = prepareAssignment(task,host);
  assert.equal(result.state,'awaiting_evidence'); assert.equal(result.references.length,0);
  assert.equal(result.missing.length,3);
  assert.throws(()=>prepareAssignment({...task, intent:'run_code'},host));
  assert.throws(()=>prepareAssignment({...task, topic:'constructor'},host));
  assert.throws(()=>runAnalysis(null,task,context(good),'unused',1));
});

for (const kind of ['work_orders', 'sar_budget']) {
  test('facility dispatch ties the ' + kind + ' calculation to the versioned ledger and requires independent review', () => {
    const db = new Operations(':memory:',tenant,()=>asOf);
    try {
      const isWork = kind === 'work_orders';
      const task = { ...taskFor(isWork ? 'operations' : 'finance'), intent:'observe' };
      const evidence = sample(kind), host = context([evidence]);
      const rows = isWork ? [{id:'sample.1',state:'open',due:'2026-11-28T07:00:00Z'}] :
        [{id:'sample.1',actualHalala:150,budgetHalala:100}];
      const expected = isWork ? {total:1,open:1,overdue:1,missingDue:0,oldestOverdueMinutes:60} :
        {currency:'SAR',lines:1,actualHalala:150,budgetHalala:100,varianceHalala:50};
      const source = facility + '.' + kind;
      const version = db.ingest(source,{kind,reference:evidence.reference,observedAt:asOf,expiresAt:evidence.expiresAt,rows});
      assert.throws(()=>runAnalysis(db, task, {...host,tenant:'other'},source,version));
      assert.throws(()=>runAnalysis(db, task, context([{...evidence, reference:'unrelated'}]), source,version));
      assert.throws(()=>runAnalysis(db, {...task,intent:'pay'},host,source,version));
      assert.throws(()=>db.report(task.id));
      const report = runAnalysis(db,task,host,source,version);
      assert.deepEqual(report.output,expected); assert.equal(report.stage,'produced');
      assert.deepEqual(report.events.map(e=>e.action),['plan','assign','produce']);
      assert.deepEqual(report,runAnalysis(db,task,host,source,version));
      assert.throws(()=>db.finish(task.id));
      assert.throws(()=>db.review(task.id,isWork ? 'COO' : 'CFO',expected));
      assert.equal(db.review(task.id,'CQO',expected),'reviewed');
      assert.equal(db.finish(task.id),'closed');
      assert.equal(db.report(task.id).proof.accepted,true);
    } finally { db.close(); }
  });
}
