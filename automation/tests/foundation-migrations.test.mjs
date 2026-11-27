import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

import {installCronFixture, useFixtureCron} from './pglite-cron-fixture.mjs';

const folder = new URL('../../supabase/migrations/', import.meta.url);
const files = (await readdir(folder)).filter(file => file.endsWith('.sql')).sort();
const foundation = files.find(file => file.endsWith('_bootstrap_enterprise_foundation.sql'));
const sql = file => readFile(new URL(file, folder), 'utf8');
const value = async (db, command) => Object.values((await db.query(command)).rows[0])[0];

async function sandbox(t) {
  const db = new PGlite({ extensions: { pgcrypto } });
  t.after(() => db.close());
  await installCronFixture(db);
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,owner_id text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    create schema private;
    create function private.public_probe() returns boolean language sql as $$select true$$;
    grant usage on schema private to anon;
  `);
  return db;
}

test('all repository migrations initialize a clean Supabase fixture in lexical order', async t => {
  const db = await sandbox(t);
  for (const file of files) {
    await db.exec(useFixtureCron(await sql(file)));
  }
  assert.equal(await value(db,"select count(*)::int from cron.job where jobname='purge-expired-website-leads'"),1);
  assert.equal(await value(db,"select count(*)::int from cron.job where jobname='osoul-approved-field-maintenance' and schedule='*/10 * * * *' and command='select private.field_cycle_tick(25)'"),1);
  assert.equal(await value(db,"select to_regprocedure('public.draqon_approve_field(uuid,uuid,uuid)') is not null"),true);
  assert.equal(await value(db,"select to_regclass('public.draqon_field_events') is not null"),true);
  assert.equal(await value(db,"select has_table_privilege('anon','public.website_leads','INSERT')"),true);
  assert.equal(await value(db,"select has_table_privilege('anon','public.website_leads','SELECT')"),false);
  assert.equal(await value(db,"select has_function_privilege('anon','private.public_probe()','execute')"),true);
  assert.equal(await value(db,"select has_schema_privilege('anon','private','usage')"),true);
  await db.exec(await sql(foundation));
});

test('adopts manually installed enterprise schema and preserves rows, policies, grants and IDs', async t => {
  const db=await sandbox(t);
  await db.exec(await readFile(new URL('../../command-center/enterprise/schema.sql',import.meta.url),'utf8'));
  await db.exec(`insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000001','fixture@example.invalid');
    insert into public.organizations(name,created_by) values ('Test Hotel','10000000-0000-4000-8000-000000000001')`);
  const state=`select jsonb_build_object(
    'tenant',(select jsonb_agg(to_jsonb(o)) from public.organizations o),
    'member',(select jsonb_agg(to_jsonb(m)) from public.organization_members m),
    'acl',(select jsonb_agg(array[c.oid::text,c.relacl::text] order by c.oid) from pg_class c where c.relnamespace='public'::regnamespace),
    'policies',(select jsonb_agg(p.oid order by p.oid) from pg_policy p),
    'triggers',(select jsonb_agg(t.oid order by t.oid) from pg_trigger t))`;
  const before=await value(db,state);
  await db.exec(await sql(foundation));
  assert.deepEqual(await value(db,state),before);
  await db.exec('create policy unreviewed_select on public.requests for select to authenticated using (true)');
  await assert.rejects(db.exec(await sql(foundation)),{code:'55000'});
  await db.exec('drop policy unreviewed_select on public.requests; alter table public.organization_members disable row level security');
  await assert.rejects(db.exec(await sql(foundation)),{code:'55000'});
  assert.equal(await value(db,"select relrowsecurity from pg_class where oid='public.organization_members'::regclass"),false);
});

test('partial catalog and conflicting bucket fail atomically without changing existing objects', async t => {
  const db=await sandbox(t), migration=await sql(foundation);
  await db.exec('create table public.organizations(marker boolean)');
  await assert.rejects(db.exec(migration),{code:'55000'});
  assert.equal(await value(db,"select to_regclass('public.organization_members') is null"),true);
  await db.exec("drop table public.organizations; insert into storage.buckets(id,public) values('command-center-documents',true)");
  await assert.rejects(db.exec(migration),{code:'23505'});
  assert.equal(await value(db,"select public from storage.buckets where id='command-center-documents'"),true);
  assert.equal(await value(db,"select to_regclass('public.organizations') is null"),true);
});
