import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOOTSTRAP,
  PINNED_HELPERS,
  PINNED_POLICY_DIGEST,
  RELEASE_91,
  ddlOutsideFoundationBlock,
  listMigrations,
  reconcile,
} from '../../scripts/check-migration-reconciliation.mjs';

const releaseFiles = RELEASE_91.map(([version, name]) => ({ version, name }));
const repoFacility = [
  { version: '20261125193000', name: 'add_facility_operations' },
  { version: '20261125232000', name: 'allow_phone_only_website_leads' },
];
const prodFacility = [
  { version: '20261125193457', name: 'add_facility_operations' },
  { version: '20261125231431', name: 'allow_phone_only_website_leads' },
];

function bootstrapFixture({ pins = true, ddlOutside = false } = {}) {
  const pinLines = pins
    ? [PINNED_POLICY_DIGEST, ...Object.values(PINNED_HELPERS)].map(p => `-- pin ${p}`).join('\n')
    : '';
  const outside = ddlOutside ? 'create table public.stray (id int);\n' : '';
  return [
    'do $migration$',
    'declare found_count integer;',
    'begin',
    `${outside}  if found_count = 0 then`,
    '    execute $foundation$',
    'create table public.organizations (id uuid primary key);',
    '$foundation$;',
    '  elsif found_count <> 13 then',
    "    raise exception 'Incomplete' using errcode='55000';",
    '  end if;',
    pinLines,
    'end;',
    '$migration$;',
    '',
  ].join('\n');
}

const cleanRecorded = {
  rls: { total: 13, enabled: 13 },
  policyDigest: PINNED_POLICY_DIGEST,
  helpers: Object.fromEntries(Object.entries(PINNED_HELPERS).map(([fn, pin]) => [fn, { observedMd5: pin }])),
};

const byName = checks => Object.fromEntries(checks.map(c => [c.name, c]));

test('listMigrations parses 14-digit versions and sorts them', () => {
  const dir = ['20261127031300_field_cycle_scheduler.sql', '20261125190000_bootstrap_enterprise_foundation.sql', 'README.md'];
  const out = listMigrations('x', () => dir);
  assert.deepEqual(out.map(m => m.version), ['20261125190000', '20261127031300']);
});

test('DDL inside the foundation block is allowed; DDL outside is rejected', () => {
  assert.deepEqual(ddlOutsideFoundationBlock(bootstrapFixture()).hits, []);
  const bad = ddlOutsideFoundationBlock(bootstrapFixture({ ddlOutside: true }));
  assert.equal(bad.found, true);
  assert.equal(bad.hits.length, 1);
});

test('missing foundation markers are reported, not treated as clean', () => {
  assert.equal(ddlOutsideFoundationBlock('select 1;').found, false);
});

test('production without the bootstrap fails only the bootstrap-applied check', () => {
  const checks = byName(reconcile({
    files: [...releaseFiles, ...repoFacility, BOOTSTRAP],
    applied: [...prodFacility, ...releaseFiles],
    bootstrapSql: bootstrapFixture(),
    recorded: null,
  }));
  assert.equal(checks['release-91-applied'].status, 'PASS');
  assert.equal(checks['bootstrap-in-repo'].status, 'PASS');
  assert.equal(checks['bootstrap-applied-prod'].status, 'FAIL');
  assert.equal(checks['bootstrap-readonly-adoption'].status, 'PASS');
  assert.equal(checks['bootstrap-pins-present'].status, 'PASS');
});

test('facility version drift between repo and production is detected', () => {
  const checks = byName(reconcile({
    files: [...releaseFiles, ...repoFacility, BOOTSTRAP],
    applied: [...prodFacility, ...releaseFiles],
    bootstrapSql: bootstrapFixture(),
    recorded: null,
  }));
  assert.equal(checks['repo-prod-version-match'].status, 'FAIL');
  assert.match(checks['repo-prod-version-match'].detail, /20261125193457_add_facility_operations/);
});

test('a renamed or missing release migration fails release-91-applied', () => {
  const applied = releaseFiles.slice(1).concat(prodFacility);
  const checks = byName(reconcile({ files: [], applied, bootstrapSql: null, recorded: null }));
  assert.equal(checks['release-91-applied'].status, 'FAIL');
  assert.match(checks['release-91-applied'].detail, /20261126190000_draqon_field_handoff/);
});

test('DDL outside the block fails the read-only adoption check', () => {
  const checks = byName(reconcile({
    files: [...releaseFiles, ...repoFacility, BOOTSTRAP],
    applied: releaseFiles,
    bootstrapSql: bootstrapFixture({ ddlOutside: true }),
    recorded: null,
  }));
  assert.equal(checks['bootstrap-readonly-adoption'].status, 'FAIL');
});

test('missing pins fail the pins check', () => {
  const checks = byName(reconcile({
    files: [...releaseFiles, ...repoFacility, BOOTSTRAP],
    applied: releaseFiles,
    bootstrapSql: bootstrapFixture({ pins: false }),
    recorded: null,
  }));
  assert.equal(checks['bootstrap-pins-present'].status, 'FAIL');
});

test('recorded clean production evidence passes every prod check', () => {
  const checks = byName(reconcile({
    files: [...releaseFiles, ...repoFacility, BOOTSTRAP],
    applied: releaseFiles,
    bootstrapSql: bootstrapFixture(),
    recorded: cleanRecorded,
  }));
  for (const [name, check] of Object.entries(checks)) {
    if (name.startsWith('prod-')) assert.equal(check.status, 'PASS', name);
  }
});

test('the bootstrap_org_owner helper mismatch is recorded as FAIL with its SQLSTATE', () => {
  const recorded = structuredClone(cleanRecorded);
  recorded.helpers.bootstrap_org_owner = { observedMd5: '365b4af093c127ff713f80dc53fd21d1', sqlstate: '55000' };
  const checks = byName(reconcile({
    files: [...releaseFiles, ...repoFacility, BOOTSTRAP],
    applied: releaseFiles,
    bootstrapSql: bootstrapFixture(),
    recorded,
  }));
  assert.equal(checks['prod-helper-bootstrap_org_owner'].status, 'FAIL');
  assert.match(checks['prod-helper-bootstrap_org_owner'].detail, /SQLSTATE 55000/);
  assert.equal(checks['prod-helper-can_write_org'].status, 'PASS');
  assert.equal(checks['prod-rls-13of13'].status, 'PASS');
});
