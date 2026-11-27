#!/usr/bin/env node
// Read-only reconciliation of Supabase migration history against recorded release evidence.
// It never connects to a database and never executes SQL. It reads the migration directory
// and a committed evidence file, then reports PASS/FAIL per check. Exit code 1 on any FAIL.
//
// Usage:
//   node scripts/check-migration-reconciliation.mjs \
//     --migrations-dir supabase/migrations \
//     --evidence automation/evidence/production-migrations-20261127.json
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const BOOTSTRAP = Object.freeze({ version: '20261125190000', name: 'bootstrap_enterprise_foundation' });

// The 14 migrations published with the #91 release, in order.
export const RELEASE_91 = Object.freeze([
  ['20261126190000', 'draqon_field_handoff'],
  ['20261126210000', 'facility_survey'],
  ['20261126211000', 'facility_pm'],
  ['20261126213451', 'field_forms_for_technicians'],
  ['20261126215141', 'field_form_quality_reviews'],
  ['20261126215207', 'field_site_lookup_and_financial_review'],
  ['20261126220843', 'retain_prechange_field_release_snapshot'],
  ['20261126222249', 'field_release_verified_building_and_maintenance'],
  ['20261126224253', 'draqon_verified_contact_receipts'],
  ['20261126224643', 'draqon_management_decision_inbox'],
  ['20261127031000', 'field_asset_cycle'],
  ['20261127031100', 'field_asset_evidence'],
  ['20261127031200', 'field_building_verified_facts'],
  ['20261127031300', 'field_cycle_scheduler'],
]);

// Pins the bootstrap's adoption block compares against. Reviewed constants, not derived from SQL.
export const PINNED_POLICY_DIGEST = '94f2aae34523121a9c25105f2a7831e4';
export const PINNED_HELPERS = Object.freeze({
  current_org_role: '6ebde145530f58cd1544af004b0d33ed',
  has_org_access: 'c087753e26580ee369a5b667119de38c',
  can_write_org: '65888f7cae355b044ab34752b6216eec',
  can_approve_org: '103db875c0e634628f2b91da59b36f15',
  prevent_org_reassignment: '14ba0392188f9a4b3090a0ee923edef7',
  bootstrap_org_owner: '6c120a16cbc349bf4744d1622634a945',
});

const DDL = /^\s*(create|alter|drop|grant|revoke|insert|update|delete|truncate)\b/i;
const OPEN = 'execute $foundation$';
const CLOSE = '$foundation$;';

export function listMigrations(dir, readDir = readdirSync) {
  return readDir(dir)
    .map(f => f.match(/^(\d{14})_([a-z0-9_]+)\.sql$/))
    .filter(Boolean)
    .map(m => ({ version: m[1], name: m[2] }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

// DDL is allowed only inside the foundation block that runs on an empty project.
// On an existing installation that block is skipped, so the adoption path must contain no DDL.
export function ddlOutsideFoundationBlock(sql) {
  const open = sql.indexOf(OPEN);
  const close = open < 0 ? -1 : sql.indexOf(CLOSE, open + OPEN.length);
  if (open < 0 || close < 0) return { found: false, hits: [] };
  const outside = sql.slice(0, open) + sql.slice(close + CLOSE.length);
  const hits = outside.split('\n').filter(line => DDL.test(line));
  return { found: true, hits };
}

export function reconcile({ files, applied, bootstrapSql, recorded }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, status: ok ? 'PASS' : 'FAIL', detail });

  const fileByVersion = new Map(files.map(f => [f.version, f]));
  const appliedByVersion = new Map(applied.map(a => [a.version, a]));

  // 1. Every release-91 migration is applied in production under the same version and name.
  const missingRelease = RELEASE_91.filter(([v, n]) => appliedByVersion.get(v)?.name !== n).map(([v, n]) => `${v}_${n}`);
  add('release-91-applied', missingRelease.length === 0, missingRelease.length ? `missing or renamed: ${missingRelease.join(', ')}` : '14/14 applied with exact version and name');

  // 2. Repository and production agree on every migration both know about, by name and version.
  const drift = applied
    .filter(a => !RELEASE_91.some(([v]) => v === a.version))
    .filter(a => !fileByVersion.has(a.version) || fileByVersion.get(a.version).name !== a.name)
    .map(a => `${a.version}_${a.name}`);
  add('repo-prod-version-match', drift.length === 0, drift.length ? `applied but not matching repo: ${drift.join(', ')}` : 'no drift');

  // 3. The bootstrap exists in the repository.
  const bootstrapInRepo = fileByVersion.get(BOOTSTRAP.version)?.name === BOOTSTRAP.name;
  add('bootstrap-in-repo', bootstrapInRepo, bootstrapInRepo ? BOOTSTRAP.version : 'bootstrap migration not present in migrations directory');

  // 4. The bootstrap is applied in production.
  const bootstrapApplied = appliedByVersion.get(BOOTSTRAP.version)?.name === BOOTSTRAP.name;
  add('bootstrap-applied-prod', bootstrapApplied, bootstrapApplied ? 'applied' : 'absent from production schema_migrations');

  // 5. The bootstrap sorts before the first facility migration, as its header requires.
  const facility = files.find(f => f.name === 'add_facility_operations');
  const ordered = !bootstrapInRepo || !facility || BOOTSTRAP.version < facility.version;
  add('bootstrap-ordering', ordered, facility ? `bootstrap ${BOOTSTRAP.version} before ${facility.version}` : 'no facility migration to compare');

  if (bootstrapSql == null) {
    add('bootstrap-readonly-adoption', false, 'bootstrap SQL unavailable');
  } else {
    // 6. Adoption path contains no DDL outside the empty-project block.
    const ddl = ddlOutsideFoundationBlock(bootstrapSql);
    add('bootstrap-readonly-adoption', ddl.found && ddl.hits.length === 0, !ddl.found ? 'foundation block markers not found' : ddl.hits.length ? `DDL outside block: ${ddl.hits.join(' | ')}` : 'no DDL outside foundation block');

    // 7. The file pins the reviewed policy digest and all six helper bodies.
    const missingPins = [PINNED_POLICY_DIGEST, ...Object.values(PINNED_HELPERS)].filter(p => !bootstrapSql.includes(p));
    add('bootstrap-pins-present', missingPins.length === 0, missingPins.length ? `pins absent from file: ${missingPins.join(', ')}` : '1 policy digest + 6 helper pins present');
  }

  // 8. Recorded production evidence (user-reported, not reproduced by this check).
  if (recorded) {
    add('prod-rls-13of13', recorded.rls?.enabled === recorded.rls?.total && recorded.rls?.total === 13, `${recorded.rls?.enabled}/${recorded.rls?.total} tables RLS enabled`);
    add('prod-policy-digest', recorded.policyDigest === PINNED_POLICY_DIGEST, recorded.policyDigest === PINNED_POLICY_DIGEST ? 'matches pin' : `observed ${recorded.policyDigest}`);
    for (const [fn, pin] of Object.entries(PINNED_HELPERS)) {
      const observed = recorded.helpers?.[fn]?.observedMd5;
      const ok = observed === pin;
      add(`prod-helper-${fn}`, ok, ok ? 'matches pin' : `observed ${observed ?? 'n/a'} vs pin ${pin}${recorded.helpers?.[fn]?.sqlstate ? ` (SQLSTATE ${recorded.helpers[fn].sqlstate})` : ''}`);
    }
  }
  return checks;
}

function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'migrations-dir': { type: 'string', default: 'supabase/migrations' },
      evidence: { type: 'string', default: 'automation/evidence/production-migrations-20261127.json' },
    },
  });
  const files = listMigrations(values['migrations-dir']);
  const evidence = JSON.parse(readFileSync(values.evidence, 'utf8'));
  const bootstrapFile = join(values['migrations-dir'], `${BOOTSTRAP.version}_${BOOTSTRAP.name}.sql`);
  let bootstrapSql = null;
  try { bootstrapSql = readFileSync(bootstrapFile, 'utf8'); } catch { bootstrapSql = null; }
  const checks = reconcile({ files, applied: evidence.applied, bootstrapSql, recorded: evidence.recorded });
  const failed = checks.filter(c => c.status === 'FAIL');
  for (const c of checks) console.log(`${c.status}  ${c.name}  ${c.detail}`);
  console.log(`\n${checks.length - failed.length} PASS, ${failed.length} FAIL`);
  return failed.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
