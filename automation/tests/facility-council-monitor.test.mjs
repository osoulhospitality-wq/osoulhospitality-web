import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

test('opt-in facility monitoring stores daily observed and forecast evidence; workers stay private',async t=>{
  const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
  const read=file=>readFile(new URL('../../'+file,import.meta.url),'utf8');
  await db.exec('create role anon;create role authenticated;create role service_role');
  await db.exec(await read('automation/e2e/dr/fixture.sql'));
  for(const file of ['20261125190000_bootstrap_enterprise_foundation','20261125193000_add_facility_operations','20261126190000_draqon_field_handoff',
    '20261126211000_facility_pm','20261126221000_facility_council_observations','20261126221500_facility_council_forecasts','20261126222000_facility_council_monitor']){
    await db.exec(await read('supabase/migrations/'+file+'.sql'));
  }
  const [org,otherOrg,site,empty,otherSite,manager,analyst,outsider,viewer,asset]=Array.from({length:10},randomUUID);
  const q=(sql,p=[])=>db.query(sql,p), val=async(sql,p=[])=>Object.values((await q(sql,p)).rows[0])[0];
  const admin=()=>db.exec('reset role');
  async function login(id,aal='aal2'){await db.exec('reset role;set role authenticated');await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);}
  await q('insert into auth.users(id) values($1),($2),($3),($4)',[manager,analyst,outsider,viewer]);
  await q("insert into public.organizations(id,name,created_by) values($1,'Monitoring A',$2),($3,'Monitoring B',$4)",[org,manager,otherOrg,outsider]);
  await q("insert into public.organization_members(organization_id,user_id,full_name,role) values($1,$2,'Analyst','analyst'),($1,$3,'Viewer','viewer')",[org,analyst,viewer]);
  await q("insert into public.facilities(id,organization_id,name) values($1,$2,'Main site'),($3,$2,'No data'),($4,$5,'Other tenant')",[site,org,empty,otherSite,otherOrg]);
  await q("insert into public.facility_assets(id,organization_id,facility_id,asset_code,name) values($1,$2,$3,'Q1','Synthetic')",[asset,org,site]);
  const today=await val("select (now() at time zone 'Asia/Riyadh')::date::text");
  const months=(await q("select generate_series(date_trunc('month',current_date)-interval '14 months',date_trunc('month',current_date)-interval '1 month',interval '1 month')::date::text as m")).rows.map(x=>x.m);
  const end=months.at(-1);
  const toggle=(enabled,id=site,o=org)=>val('select public.facility_council_monitor_set($1,$2,$3)',[o,id,enabled]);
  const status=(id=site,o=org)=>val('select public.facility_council_monitor_status($1,$2)',[o,id]);
  const limit=(metric,min,max)=>val('select public.facility_council_monitor_limit($1,$2,$3,$4,$5)',[org,site,metric,min,max]);
  const run=(id=site)=>val('select public.facility_council_monitor_run($1,$2)',[org,id]);
  const tick=()=>val('select private.facility_council_monitor_tick()');
  const record=(metric,month,value,source,id=site)=>val('select public.facility_council_record($1,$2,$3,$4,$5,$6,$7,$8)',[org,id,randomUUID(),metric,month,value,source,today]);
  await login(manager);
  await t.test('defaults are off; missing scheduler is reported and manual refuses unenrolled sites',async()=>{
    const x=await status();assert.equal(x.enabled,false);assert.equal(x.scheduler,'unavailable');assert.equal(x.latest,null);assert.equal(x.metrics.length,14);
    await assert.rejects(run(),{code:'55000'});await assert.rejects(toggle(null),{code:'22023'});
  });
  await t.test('AAL and approval required. Viewer cannot read financial risk, analyst can read but cannot enrol',async()=>{
    await login(manager,'aal1');await assert.rejects(toggle(true),{code:'42501'});await assert.rejects(status(),{code:'42501'});
    await login(viewer);await assert.rejects(status(),{code:'42501'});await assert.rejects(run(),{code:'42501'});
    await login(analyst);assert.equal((await status()).canManage,false);await assert.rejects(toggle(true),{code:'42501'});
    await login(manager);
  });
  await t.test('repeat enrolment keeps first change timestamp, organization/site mismatch rejected',async()=>{
    await toggle(true);const stamp=(await status()).changedAt;await toggle(true);assert.equal((await status()).changedAt,stamp);
    await assert.rejects(toggle(true,otherSite),{code:'42501'});
  });
  await t.test('site thresholds use authoritative metric units and explicit approved values',async()=>{
    for(const [k,lo,hi] of [['bad',0,1],['occupancy_pct',-1,null],['vendor_sla_pct',null,101],['energy_kwh',-0.1,4],['staff_shortfall',null,2.3],['operating_cost_sar',null,'NaN']])
      await assert.rejects(limit(k,lo,hi),{code:'22023'});
    await assert.rejects(limit('cash_balance_sar',4,2),{code:'23514'});
    await limit('cash_balance_sar',-25,80);await limit('cash_balance_sar',null,null);
    assert.equal((await status()).limits.length,0);
    await limit('qualified_leads',null,24);await limit('operating_cost_sar',null,100);await limit('guest_complaints',null,1);
  });
  for(const [i,month]of months.entries())await record('qualified_leads',month,11+i,'Synthetic LMS '+month);
  await record('operating_cost_sar',end,200,'Synthetic ledger');
  await record('guest_complaints',end,10,'Synthetic register');await record('guest_complaints',end,12,'Synthetic second register');
  const earlier=await val("select ((now() at time zone 'Asia/Riyadh')::date-2)::text");
  await val("select public.facility_pm_register($1,$2,$3,$4,'Synthetic PM',1,'months',$5,'Synthetic OEM',$5)",[org,site,randomUUID(),asset,earlier]);
  await t.test('first manual snapshot persists Riyadh day, method, evidence, forecast-only threshold risk and observed breach separately',async()=>{
    const id=await run();const x=await status(),r=x.latest,signals=r.signals;
    assert.equal(r.id,id);assert.equal(r.businessDay,today);assert.equal(r.runSource,'manual');assert.equal(r.duePlans,1);assert.equal(r.overduePlans,1);assert.equal(r.latestClosedMonth,end);
    assert.equal(r.sourceHealth.state,'conflict');assert.equal(r.sourceHealth.verifiedMetrics,2);assert.equal(r.sourceHealth.currentConflicts,1);
    const projected=signals.find(s=>s.metric==='qualified_leads');
    assert.equal(projected.code,'forecast_above_maximum');assert.equal(projected.estimate,25);assert.equal(projected.sourceThrough,end.slice(0,7));assert.equal(projected.method,'median_drift');assert.equal(projected.mae,0);
    assert.equal(r.outlook.find(v=>v.metric==='qualified_leads').observationIds.length,14);
    assert.ok(signals.some(s=>s.code==='metric_above_maximum'&&s.metric==='operating_cost_sar'&&s.value===200));
    assert.equal(signals.some(s=>s.metric==='guest_complaints'),false);
    assert.equal(signals.some(s=>s.code==='metric_above_maximum'&&s.metric==='qualified_leads'),false);
    assert.equal(signals.some(s=>s.code.startsWith('forecast_')&&s.metric==='operating_cost_sar'),false);
  });
  await t.test('same-day snapshot remains immutable after a source correction or threshold change',async()=>{
    const before=(await status()).latest;await limit('qualified_leads',null,200);await record('occupancy_pct',end,90,'Synthetic occupancy');
    assert.equal(await run(),before.id);assert.deepEqual((await status()).latest,before);
  });
  await t.test('tick captures only explicitly opted-in sites; unchanged sites do not make duplicate snapshots',async()=>{
    await toggle(true,empty);await admin();const first=await tick();assert.equal(first.recorded,1);assert.equal(first.failed,0);assert.equal((await tick()).recorded,0);
    await login(manager);const e=(await status(empty)).latest;assert.equal(e.runSource,'scheduled');assert.equal(e.sourceHealth.state,'no_records');
    assert.ok(e.signals.some(s=>s.code==='monthly_missing'));assert.equal(e.outlook.some(f=>f.status==='forecast'),false);
    await login(outsider);assert.equal((await status(otherSite,otherOrg)).latest,null);await assert.rejects(status(site,org),{code:'42501'});await assert.rejects(status(site,otherOrg),{code:'42501'});
    await login(manager);
  });
  await t.test('after stop scheduler and manual work are prevented, retained history stays auditable',async()=>{
    await toggle(false);const before=(await status()).latest;
    await assert.rejects(run(),{code:'55000'});await assert.rejects(limit('energy_kwh',0,2),{code:'55000'});
    await admin();assert.equal(await val("select private.facility_council_monitor_capture($1,$2,'scheduled',clock_timestamp()+interval '1 day',null)",[org,site]),null);
    await login(manager);assert.deepEqual((await status()).latest,before);await toggle(true);
  });
  await t.test('private worker and raw snapshots inaccessible to normal users and service_role',async()=>{
    for(const role of ['authenticated','anon','service_role']){
      await db.exec('reset role;set role '+role);
      await assert.rejects(tick(),{code:'42501'});await assert.rejects(q('select facts from private.facility_council_monitor_snapshots'),{code:'42501'});
      await assert.rejects(val('select private.facility_council_monitor_scheduler(true)'),{code:'42501'});
    }await admin();
  });
  await t.test('Riyadh midnight changes business day at 21:00 UTC, not UTC midnight',async()=>{
    const cap=instant=>val("select private.facility_council_monitor_capture($1,$2,'scheduled',$3,null)",[org,empty,instant]);
    const before=await cap('2030-06-30T20:59:59Z'),after=await cap('2030-06-30T21:00:00Z');
    assert.notEqual(before,after);const dates=(await q('select business_day::text d from private.facility_council_monitor_snapshots where id=any($1::uuid[]) order by business_day',[[before,after]])).rows;
    assert.deepEqual(dates.map(x=>x.d),['2030-06-30','2030-07-01']);
  });
});
