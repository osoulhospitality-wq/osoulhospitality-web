import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {pgcrypto} from "@electric-sql/pglite/contrib/pgcrypto";

test("forward outcomes use immutable issuances and independently adjudicated later actuals", async t=>{
  const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
  const load=file=>readFile(new URL("../../"+file,import.meta.url),"utf8");
  const migration=file=>load("supabase/migrations/"+file+".sql");
  await db.exec("create role anon;create role authenticated;create role service_role");
  await db.exec(await load("automation/e2e/dr/fixture.sql"));
  for(const file of ["20261125190000_bootstrap_enterprise_foundation","20261125193000_add_facility_operations","20261126190000_draqon_field_handoff",
    "20261126211000_facility_pm","20261126221000_facility_council_observations","20261126221500_facility_council_forecasts","20261126222000_facility_council_monitor"])
    await db.exec(await migration(file));
  const q=(sql,args=[])=>db.query(sql,args);
  const value=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
  const [org,other,site,peer,foreign,owner,approver,analyst,viewer,outsider]=Array.from({length:10},randomUUID);
  await q("insert into auth.users(id) values($1),($2),($3),($4),($5)",[owner,approver,analyst,viewer,outsider]);
  await q("insert into public.organizations(id,name,created_by) values($1,'Group A',$2),($3,'Group B',$4)",[org,owner,other,outsider]);
  await q("insert into public.organization_members(organization_id,user_id,role,full_name) values($1,$2,'analyst','Analyst'),($1,$3,'approver','Approver'),($1,$4,'viewer','Viewer')",[org,analyst,approver,viewer]);
  await q("insert into public.facilities(id,organization_id,name) values($1,$4,'Site A'),($2,$4,'Site B'),($3,$5,'Other')",[site,peer,foreign,org,other]);
  await q("insert into private.facility_council_monitor_enrolments(organization_id,facility_id,enabled,changed_by) values($1,$2,true,$3),($1,$4,true,$3),($5,$6,true,$7)",[org,site,owner,peer,other,foreign,outsider]);
  const scores=async(o=org,f=site)=>(await q("select * from public.facility_council_forecast_scores($1,$2)",[o,f])).rows;
  const reset=()=>db.exec("reset role");
  const login=async(id,aal="aal2")=>{await reset();await db.exec("set role authenticated");await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);};
  const month="2024-05-01",metric="occupancy_pct",training=randomUUID(),first=randomUUID(),alternative=randomUUID();
  const outlook=(day,estimate=80)=>({metric,status:"forecast",method:"median_drift",nextMonth:"2024-05",asOf:day,historyEnd:"2024-04",horizonMonths:1,estimate,lastValue:75,observationIds:[training]});
  await q("insert into private.facility_council_monitor_snapshots(organization_id,facility_id,business_day,observed_at,run_source,rule_version,facts) values($1,$2,'2024-05-01','2024-05-01 08:00Z','scheduled','legacy',$3)",[org,site,{outlook:[outlook("2024-05-01",99)]}]);
  await db.exec(await migration("20261126223000_facility_council_outcomes"));
  const addSnapshot=async(day,items,{o=org,f=site,published=day+"T09:00:00Z",observed=day+"T08:00:00Z"}={})=>{
    const id=randomUUID();
    await q("insert into private.facility_council_monitor_snapshots(id,organization_id,facility_id,business_day,observed_at,published_at,run_source,rule_version,facts) values($1,$2,$3,$4,$5,$6,'scheduled','fixture-v1',$7)",
      [id,o,f,day,observed,published,{outlook:items}]);
    return id;
  };
  await t.test("legacy run without publication receipt and post-close replay are not forecasts",async()=>{
    await addSnapshot("2024-05-02",[outlook("2024-05-02",100)]);
    const stamp=await value("select (published_at at time zone 'UTC')::date::text from private.facility_council_monitor_snapshots where business_day='2024-05-02'");
    assert.notEqual(stamp,"2024-05-02"); await login(owner);assert.deepEqual(await scores(),[]);
  });
  // Inject historic *server receipt instants* only inside this privileged disposable database.
  // No test clock or client-controlled publication timestamp exists in the production API.
  await reset();await db.exec("alter table private.facility_council_monitor_snapshots disable trigger council_forecast_publication");
  await addSnapshot("2024-05-03",[{...outlook("2024-05-03"),status:"unreliable",estimate:null}]);
  await addSnapshot("2024-05-04",[outlook("2024-05-04",91),outlook("2024-05-04",98)]);
  await addSnapshot("2024-05-05",[{...outlook("2024-05-05",92),historyEnd:"2024-05"}]);
  const original=await addSnapshot("2024-05-06",[outlook("2024-05-06",80)]);
  await addSnapshot("2024-05-07",[outlook("2024-05-07",86)]);
  await addSnapshot("2024-05-08",[outlook("2024-05-08",87)],{published:"2024-06-01T00:00:00+03:00"});
  await addSnapshot("2024-05-09",[outlook("2024-05-09",0)],{o:other,f:foreign});
  await addSnapshot("2024-05-10",[outlook("2024-05-10",40)],{f:peer});
  await db.exec("alter table private.facility_council_monitor_snapshots enable trigger council_forecast_publication");
  await t.test("first eligible issue, database receipt time, training receipts and a single pending score",async()=>{
    await login(analyst);const rows=await scores();
    assert.equal(rows.length,1);const [r]=rows;assert.equal(r.snapshot_id,original);assert.equal(r.status,"pending");
    assert.equal(r.unit,"pct");assert.equal(Number(r.estimate),80);assert.equal(Number(r.baseline_estimate),75);assert.deepEqual(r.forecast_observation_ids,[training]);
    assert.equal(r.actual,null);assert.equal(r.absolute_error,null);assert.equal(r.signed_error,null);assert.equal(r.baseline_absolute_error,null);
    assert.deepEqual(r.actual_evidence_ids,[]);assert.equal(r.actual_source_ref,null);
  });
  const record=(id,number,source)=>value("select public.facility_council_record($1,$2,$3,$4,$5,$6,$7,$8)",[org,site,id,metric,month,number,source,"2024-06-01"]);
  await t.test("only the closed approved actual settles the first immutable forecast",async()=>{
    await login(approver);await record(first,82,"Fixture signed month close");
    const [r]=await scores();assert.equal(r.status,"settled");assert.equal(r.actual_observation_id,first);assert.equal(r.actual_source_ref,"Fixture signed month close");assert.ok(r.actual_verified_at);
    assert.deepEqual(r.actual_evidence_ids,[first]);assert.equal(Number(r.actual),82);assert.equal(Number(r.signed_error),2);assert.equal(Number(r.absolute_error),2);assert.equal(Number(r.baseline_absolute_error),7);
    assert.equal((await scores(org,peer))[0].status,"pending");
  });
  await t.test("competing sources suppress all actuals and errors until the precise evidence set is resolved",async()=>{
    await record(alternative,78,"Conflicting operating ledger");const [r]=await scores();
    assert.equal(r.status,"conflict");assert.equal(r.actual,null);assert.equal(r.absolute_error,null);assert.equal(r.signed_error,null);assert.equal(r.actual_source_ref,null);
    assert.deepEqual(r.actual_evidence_ids,[first,alternative].sort());assert.equal(r.snapshot_id,original);
    await value("select public.facility_council_resolve($1,$2,$3,$4,$5)",[org,site,alternative,"Coordinated signed audit selects operating ledger",[first,alternative]]);
    const [resolved]=await scores();assert.equal(resolved.status,"settled");assert.equal(Number(resolved.estimate),80);
    assert.equal(Number(resolved.signed_error),-2);assert.equal(Number(resolved.absolute_error),2);
    assert.equal(Number(resolved.baseline_absolute_error),3);assert.ok(resolved.resolution_id);assert.ok(resolved.actual_decided_at);
    assert.equal(resolved.actual_observation_id,alternative);assert.equal(resolved.snapshot_id,original);
  });
  await t.test("a later conflicting revision reopens the outcome without replacing or reweighting its forecast",async()=>{
    await record(randomUUID(),84,"Later restatement under review");const rows=await scores();
    assert.equal(rows.length,1);assert.equal(rows[0].status,"conflict");assert.equal(rows[0].snapshot_id,original);assert.equal(rows[0].actual,null);
  });
  await t.test("normal manual monitoring captures today's actual SQL forecast and its 12 verified sources",async()=>{
    const liveSite=randomUUID();
    await reset();
    await q("insert into public.facilities(id,organization_id,name) values($1,$2,'Current site')",[liveSite,org]);
    await login(owner);
    await value("select public.facility_council_monitor_set($1,$2,true)",[org,liveSite]);
    const periods=(await q("select ((date_trunc('month',now() at time zone 'Asia/Riyadh')::date-(n||' months')::interval)::date)::text m from generate_series(12,1,-1) n")).rows;
    const ids=[];
    for(const [i,r] of periods.entries()) {
      const id=randomUUID(); ids.push(id);
      await value("select public.facility_council_record($1,$2,$3,$4,$5,$6,$7,($5::date+interval '1 month')::date)",[org,liveSite,id,metric,r.m,60+i,"Synthetic verified "+r.m]);
    }
    const snapshot=await value("select public.facility_council_monitor_run($1,$2)",[org,liveSite]);
    const out=await scores(org,liveSite);
    assert.equal(out.length,1);assert.equal(out[0].status,"pending");assert.equal(out[0].snapshot_id,snapshot);
    assert.equal(Number(out[0].estimate),72);assert.equal(Number(out[0].baseline_estimate),71);
    assert.deepEqual(out[0].forecast_observation_ids,ids);assert.ok(out[0].forecast_at);
  });
  await t.test("only verified domain roles can read the scoped outcomes and private snapshots are append-only",async()=>{
    for(const user of [owner,approver,analyst]){await login(user);assert.equal((await scores()).length,1);}
    for(const [user,aal] of [[owner,"aal1"],[viewer,"aal2"],[outsider,"aal2"]]){await login(user,aal);await assert.rejects(scores(),{code:"42501"});}
    await login(owner);await assert.rejects(scores(org,foreign),{code:"42501"});await assert.rejects(scores(other,foreign),{code:"42501"});
    await assert.rejects(q("select * from private.facility_council_monitor_snapshots"),{code:"42501"});
    await reset();for(const stmt of ["update private.facility_council_monitor_snapshots set rule_version='changed' where id=$1","delete from private.facility_council_monitor_snapshots where id=$1"])await assert.rejects(q(stmt,[original]),{code:"55000"});
    await db.exec("set role anon");await assert.rejects(scores(),{code:"42501"});
  });
});
