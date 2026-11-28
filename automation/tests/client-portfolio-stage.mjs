// Exercises the production migration in an isolated PostgreSQL process using synthetic fixtures.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const entry = process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "@electric-sql/pglite";
const {PGlite} = await import(entry);
const db = new PGlite();
const org = randomUUID(), other = randomUUID(), user = randomUUID();
const read = async (id) => (await db.query("select public.fm_client_portfolio($1) as result", [id])).rows[0].result;
const syntheticId = async (query, args) => (await db.query(query + " returning id",args)).rows[0].id;
async function expectSqlError(promise, code) {
  await assert.rejects(promise, error => error.code === code);
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema private;
    create type public.contract_status as enum ('draft','review','active','expired','terminated');
    create table public.organizations(id uuid primary key);
    create table public.organization_members(organization_id uuid, user_id uuid, role text, active boolean,
      primary key(organization_id,user_id));
    create table public.facilities(organization_id uuid not null references public.organizations,
      id uuid primary key default gen_random_uuid(), name text not null, unique(organization_id,id));
    create function auth.jwt() returns jsonb language sql stable as
      $$ select jsonb_build_object('aal',current_setting('qa.aal',true)) $$;
    create function private.current_org_role(target_org uuid) returns text
      language sql stable security definer set search_path='' as
      $$ select role from public.organization_members where organization_id=target_org
           and user_id=current_setting('qa.user',true)::uuid and active $$;
    grant usage on schema auth, private to authenticated;
    grant select on public.facilities to authenticated;
    alter table public.facilities enable row level security;
    create policy member_read on public.facilities for select to authenticated
      using(private.current_org_role(organization_id) is not null);
  `);
  await db.exec(await readFile(new URL("../../supabase/migrations/20261128155212_client_contract_portfolio.sql",import.meta.url),"utf8"));
  await db.query("insert into public.organizations values ($1),($2)",[org,other]);
  await db.query("insert into public.organization_members values ($1,$2,'owner',true)",[org,user]);
  const contractInsert = "insert into private.fm_client_contracts(organization_id,name,evidence_note) values($1,$2,'Source requested')";
  const clientInsert = "insert into private.fm_clients(organization_id,name,code,contract_id) values($1,$2,'CLIENT',$3)";
  const contract = await syntheticId(contractInsert,[org,"Engagement"]);
  const otherContract = await syntheticId(contractInsert,[other,"Unrelated engagement"]);
  const client = await syntheticId(clientInsert,[org,"Client",contract]);
  await expectSqlError(db.query(clientInsert,[org,"Wrong contract",otherContract]),"23505"); // repeated code
  await expectSqlError(db.query("insert into private.fm_clients(organization_id,name,code,contract_id) values($1,'Test','OTHER',$2)",[org,otherContract]),"23503");
  await syntheticId(clientInsert,[other,"Other client",otherContract]);
  const sites = [];
  for (let i=1; i<=4; i++) {
    const facility = await syntheticId("insert into public.facilities(organization_id,name) values($1,$2)",[org,"Building "+i]);
    await db.query("insert into private.fm_client_sites(organization_id,client_id,facility_id,code) values($1,$2,$3,$4)",
      [org,client,facility,"B"+i]);
    sites.push(facility);
  }
  const outside = await syntheticId("insert into public.facilities(organization_id,name) values($1,'Unrelated building')",[other]);
  await expectSqlError(db.query("insert into private.fm_client_sites(organization_id,client_id,facility_id,code) values($1,$2,$3,'B5')",[org,client,outside]),"23503");
  const observation = "insert into private.fm_client_observations(organization_id,client_id,facility_id,building_code,period,metric,value,unit,source,locator) values($1,$2,$3,$4,$5,'invoice',$6,'SAR','ledger','sheet1')";
  await db.query(observation,[org,client,sites[0],"B1","2026-01",125.5]);
  await db.query(observation,[org,client,null,"portfolio","2026-01",125.5]);
  await expectSqlError(db.query(observation,[org,client,sites[1],"B1","2026-02",125.5]),"23503");
  await expectSqlError(db.query(observation,[org,client,sites[0],"B1","2026-01",999]),"23505");
  await db.query("select set_config('qa.user',$1,false)",[user]);
  await db.exec("set role authenticated; set qa.aal='aal2'");
  const [record] = await read(org);
  assert.equal(record.contract.id,contract);
  assert.equal(record.status,"review");
  assert.equal(record.contract.annual_value,null);
  assert.equal(record.contract.end_date,null);
  assert.deepEqual(record.facilities.map(f=>f.id),sites);
  assert.deepEqual(record.observations.map(r=>[r.building_id,r.period,r.value,r.source]),[
    ["B1","2026-01",125.5,"ledger"],["portfolio","2026-01",125.5,"ledger"]
  ]);
  assert.deepEqual(await read(other),[]);
  await expectSqlError(db.query("update private.fm_client_contracts set status='active' where id=$1",[contract]),"42501");
  await db.exec("set qa.aal='aal1'");
  assert.deepEqual(await read(org),[]);
  await db.exec("set qa.aal='aal2'");
  for (const role of ["approver","analyst","viewer"]) {
    await db.exec("reset role");
    await db.query("update public.organization_members set role=$1 where user_id=$2",[role,user]);
    await db.exec("set role authenticated");
    assert.deepEqual(await read(org),[],role+" should not see owner history");
  }
  await db.exec("reset role");
  await db.query("update public.organization_members set role='owner',active=false where user_id=$1",[user]);
  await db.exec("set role authenticated");
  assert.deepEqual(await read(org),[]);
  await db.exec("set role anon");
  await expectSqlError(read(org),"42501");
  console.log("Client contract portfolio PASS: 4 sites, 2 historical scope levels, scoped foreign keys, duplicate prevention, owner read-only access, other tenant, MFA and membership boundaries.");
} finally {
  await db.close();
}
