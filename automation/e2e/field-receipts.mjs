import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const names = ['auth-postgrest.json', 'field-browser.json', 'building-memory-browser.json', 'council-monitor-scheduler.json'];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const requiredCases = [
  'operator_verified_totp','approver_verified_totp','password_only_cannot_issue','read_other_site',
  'operator_cannot_approve','issue_replay','no_visit','coordinator_cannot_close','audit_receipt','business_receipt',
  'survey_verified_actor','scan_wrong_site','pm_receipt_replay','desk_evidence_checked','council_foreign_read'
];

function requireEvidence(condition, message) {
  if (!condition) throw new Error(message);
}

function checkedList(rows, idField, statusField, success, label) {
  requireEvidence(Array.isArray(rows) && rows.length > 0, label + ': empty check list');
  const ids = new Set();
  for (const row of rows) {
    const id = row?.[idField];
    requireEvidence(typeof id === 'string' && id.trim() && !ids.has(id), label + ': missing or duplicate check identifier');
    requireEvidence(row[statusField] === success, label + ': unsuccessful check');
    ids.add(id);
  }
  return ids;
}

export async function checkReceipts(directory, commit) {
  requireEvidence(/^[0-9a-f]{40}$/.test(commit), 'Require the full tested Git commit');
  const files = {};
  const receipts = [];
  for (const name of names) {
    const bytes = await readFile(join(directory,name));
    receipts.push(JSON.parse(bytes));
    files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  const [auth, field, memory, schedule] = receipts;
  const actual = checkedList(auth.cases, 'id', 'passed', true, 'Auth/API');
  requireEvidence(auth.cases.every(row => Object.hasOwn(row, 'actual') && Object.hasOwn(row, 'expected') && isDeepStrictEqual(row.actual, row.expected)), 'Auth/API outcome differs from its expected result');
  for (const id of requiredCases) requireEvidence(actual.has(id), 'Missing critical Auth/API check: ' + id);

  requireEvidence(field.result === 'pass' && uuid.test(field.orderId), 'Field journey has no passed order');
  const fieldChecks = checkedList(field.checks, 'name', 'pass', true, 'Field browser');
  requireEvidence(fieldChecks.has('Independent approver closes via standard work-order action'), 'Field browser omitted independent closure');
  requireEvidence(memory.result === 'pass' && uuid.test(memory.assetId), 'Building journey has no passed asset');
  const memoryChecks = checkedList(memory.checks, 'name', 'status', 'pass', 'Building browser');
  requireEvidence(memoryChecks.has('Same physical code at a different authorized property returns no record or printable label'), 'Building browser omitted scoped label lookup');
  requireEvidence(schedule.status === 'passed' && schedule.nativeBackgroundRun === true &&
    schedule.enrolledSnapshotCount === 1 && schedule.repeatSameDayCount === 1 && schedule.unscheduledSiteCount === 0,
    'Scheduler failed to prove scoped, repeatable execution');
  return {
    testedCommit: commit, scope: 'Disposable integration environment', files,
    checks: {auth: auth.cases.length, fieldBrowser: field.checks.length, buildingBrowser: memory.checks.length,
      backgroundSchedule: 1}
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, commit] = process.argv.slice(2);
  const manifest = await checkReceipts(directory, commit);
  await writeFile(join(directory, 'field-receipts.json'), JSON.stringify(manifest, null, 2)+'\n', {mode:0o600});
  console.log('Verified the four isolated field receipts for', commit);
}
