import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {checkReceipts} from '../e2e/field-receipts.mjs';

const commit = 'a'.repeat(40);
const uuid = '00000000-0000-4000-8000-000000000001';
const cases = [
  'operator_verified_totp','approver_verified_totp','password_only_cannot_issue','read_other_site',
  'operator_cannot_approve','issue_replay','no_visit','coordinator_cannot_close','audit_receipt','business_receipt',
  'survey_verified_actor','scan_wrong_site','pm_receipt_replay','desk_evidence_checked','council_foreign_read'
];
const fileNames = ['auth-postgrest.json','field-browser.json','building-memory-browser.json','council-monitor-scheduler.json'];
async function makeReports(t, change = () => {}) {
  const dir = await mkdtemp(join(tmpdir(), 'field-receipts-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  const reports = [
    {cases: cases.map(id => ({id, expected:true, actual:true, passed:true}))},
    {result:'pass', orderId:uuid, checks:[{name:'Independent approver closes via standard work-order action', pass:true}]},
    {result:'pass', assetId:uuid, checks:[{name:'Same physical code at a different authorized property returns no record or printable label', status:'pass'}]},
    {status:'passed', nativeBackgroundRun:true, enrolledSnapshotCount:1, repeatSameDayCount:1, unscheduledSiteCount:0}
  ];
  change(reports);
  await Promise.all(reports.map((report,i) => report && writeFile(join(dir,fileNames[i]), JSON.stringify(report))));
  return dir;
}

test('commit-bound evidence lists the four exact file digests', async t => {
  const dir = await makeReports(t);
  const manifest = await checkReceipts(dir,commit);
  assert.equal(manifest.testedCommit,commit);
  assert.deepEqual(Object.keys(manifest.files),fileNames);
  assert.ok(Object.values(manifest.files).every(x => /^[0-9a-f]{64}$/.test(x)));
  await assert.rejects(checkReceipts(dir,'main'), /full tested Git commit/);
});
for (const [description, mutate, pattern] of [
  ['missing receipt', r => {r[1]=null;}, /ENOENT/],
  ['partition check omitted', r => {r[0].cases.pop();}, /Missing critical Auth/],
  ['case duplicated', r => {r[0].cases.push(r[0].cases[0]);}, /duplicate/],
  ['passed flag inconsistent with outcome', r => {r[0].cases[0].actual=false;}, /differs/],
  ['field browser omitted the independent close', r => {r[1].checks[0].name='start';}, /omitted independent/],
  ['building browser includes a failing step', r => {r[2].checks[0].status='fail';}, /unsuccessful/],
  ['scheduler produced duplicate snapshot', r => {r[3].repeatSameDayCount=2;}, /Scheduler failed/]
]) {
  test('rejects ' + description, async t => {
    const dir = await makeReports(t,mutate);
    await assert.rejects(checkReceipts(dir,commit),pattern);
  });
}
