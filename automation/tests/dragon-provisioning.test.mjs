import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const script = await readFile(new URL('../sql/dragon_locks.sql', import.meta.url), 'utf8');
test('Manual Dragon installation preserves shared permissions and enforces gateway boundaries', async t => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const cases = [];
  t.after(async () => {
    await db.close();
    if (process.env.DRAQON_PROVISIONING_REPORT) {
      await writeFile(process.env.DRAQON_PROVISIONING_REPORT, JSON.stringify(cases, null, 2));
    }
  });
  async function check(input, expected, operation) {
    let actual;
    const start = performance.now();
    try { actual = await operation(); } catch (error) { actual = error.code || error.message; }
    const pass = actual === expected;
    cases.push({ input, expected, actual, duration_ms: performance.now() - start, status: pass ? 'PASS' : 'FAIL',
      external_cost_usd: 0, evidence: 'Synthetic PostgreSQL with real grants and row-level policies',
      corrective_action: pass ? null : 'Block promotion and inspect privileges, policy scope and transaction rollback' });
    assert.equal(actual, expected, input);
  }
  const scalar = async (sql, args) => Object.values((await db.query(sql, args)).rows[0])[0];
  const role = async name => { await db.exec('reset role; set role ' + name); };
  const header = value => db.query("select set_config('request.headers',$1,false)", [JSON.stringify(value)]);
  const install = async () => { await db.exec(script); return true; };
  const lock = async (issue, repo, actor) => {
    await db.query("insert into public.dragon_locks(repository,issue_number,sender,execution_id,command_version) values ($1,$2,$3,'fixture','v1')", [repo,issue,actor]);
    return true;
  };

  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create schema private;
    grant usage on schema private to authenticated, service_role;
    create table private.unrelated(id integer); insert into private.unrelated values(1);
    grant select on private.unrelated to authenticated, service_role;
    create function public.dragon_debug_auth() returns boolean language sql as 'select true';
    revoke all on function public.dragon_debug_auth() from public;
  `);
  await check('Clean install with missing environment scope', 'P0001', install);
  await db.exec('rollback');
  await check('Rejected install left no partial lock table', true, () => scalar("select to_regclass('public.dragon_locks') is null"));
  await db.exec("set draqon.install_repository='fixture-org/requests'; set draqon.install_sender='fixture-sender'; grant execute on function public.dragon_debug_auth() to authenticated");
  await check('Callable legacy diagnostic blocks the manual install', 'P0001', install);
  await db.exec('rollback');
  await check('Legacy endpoint survives rejected installation', true, () => scalar("select to_regprocedure('public.dragon_debug_auth()') is not null"));
  await db.exec("revoke execute on function public.dragon_debug_auth() from authenticated");
  await check('Install scoped policies after owner isolates the diagnostic', true, install);
  await check('Reapplying authorized installation succeeds', true, install);
  await check('Restricted legacy diagnostic definition retained', true, () => scalar("select to_regprocedure('public.dragon_debug_auth()') is not null"));
  await db.exec("insert into private.dragon_api_keys(key_hash,key_name) values (encode(extensions.digest('synthetic-only','sha256'),'hex'),'fixture')");
  for (const api of ['authenticated','service_role','anon']) {
    await role(api);
    await check(api + ' prior shared-schema usage preserved', api !== 'anon', () => scalar("select has_schema_privilege(current_user,'private','USAGE')"));
    await check(api + ' use of unrelated private table preserved', api === 'anon' ? '42501' : 1, () => scalar('select id from private.unrelated'));
    await check(api + ' cannot read key registry', '42501', () => db.query('select * from private.dragon_api_keys'));
    await check(api + ' cannot activate a key', '42501', () => db.query('update private.dragon_api_keys set active=true'));
  }
  await role('anon');
  await header({});
  await check('Missing gateway header denies lock', '42501', () => lock(1,'fixture-org/requests','fixture-sender'));
  await header({'x-app-api-key':'wrong-fixture'});
  await check('Unregistered key denies lock', '42501', () => lock(2,'fixture-org/requests','fixture-sender'));
  await header({'x-app-api-key':'synthetic-only'});
  await check('Authenticated gateway in bound repo/sender can insert without private-schema usage', true, () => lock(3,'fixture-org/requests','fixture-sender'));
  await check('Same key with other repository denied', '42501', () => lock(4,'other/repo','fixture-sender'));
  await check('Same key with other lock sender denied', '42501', () => lock(5,'fixture-org/requests','other'));
  await check('Cannot rewrite repository on valid lock', '42501', () => db.query("update public.dragon_locks set repository='other/repo' where issue_number=3"));
  await check('Can finalize valid lock', 'completed', () => scalar("update public.dragon_locks set status='completed',finished_at=now() where issue_number=3 returning status"));
  await role('authenticated');
  await check('Enterprise client cannot create Dragon lock even with a known key', '42501', () => lock(6,'fixture-org/requests','fixture-sender'));
});
