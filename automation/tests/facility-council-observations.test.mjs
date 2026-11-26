import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

test('monthly council source evidence and scoped adjudication',async t=>{
  const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
  const repo=new URL('../../',import.meta.url);
  const load=path=>readFile(new URL(path,repo),'utf8');
  await db.exec('create role anon;create role authenticated;create role service_role');
  await db.exec(await load('automation/e2e/dr/fixture.sql'));
  for(const migration of ['20261125190000_bootstrap_enterprise_foundation','20261125193000_add_facility_operations',
    '20261126190000_draqon_field_handoff','20261126221000_facility_council_observations'])
    await db.exec(await load('supabase/migrations/'+migration+'.sql'));
  const q=(sql,args=[])=>db.query(sql,args);
  const v=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
  const [org,other,site,peer,foreign,owner,analyst,viewer,outsider,first,duplicate,second,third]=Array.from({length:13},randomUUID);
  const login=async(id,aal='aal2')=>{
    await db.exec('reset role;set role authenticated');
    await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);
  };
  await q("insert into auth.users(id) values ($1),($2),($3),($4)",[owner,analyst,viewer,outsider]);
  await q("insert into public.organizations(id,name,created_by) values($1,'Fixture A',$2),($3,'Fixture B',$4)",[org,owner,other,outsider]);
  await q("insert into public.organization_members(organization_id,user_id,role,full_name) values($1,$2,'analyst','Analyst'),($1,$3,'viewer','Viewer')",[org,analyst,viewer]);
  await q("insert into public.facilities(id,organization_id,name) values($1,$2,'First'),($3,$2,'Peer'),($4,$5,'Other')",[site,org,peer,foreign,other]);
  const defaults={org,site,id:first,metric:'occupancy_pct',month:'2024-01-01',value:78.25,source:'PMS fixture / JAN-2024 v1',retrieved:'2024-02-01'};
  const record=(o={})=>v('select public.facility_council_record($1,$2,$3,$4,$5,$6,$7,$8)',Object.values({...defaults,...o}));
  const history=async(s=site,target=org)=>(await q('select * from public.facility_council_history($1,$2)',[target,s])).rows;
  const resolve=(chosen,ids,reason='Signed PMS extract verified against reconciled room nights',s=site)=>
    v('select public.facility_council_resolve($1,$2,$3,$4,$5)',[org,s,chosen,reason,ids]);
  const reject=(promise,code)=>assert.rejects(promise,{code});
  await login(owner);
  await t.test('one approved closed period including the source and verifier',async()=>{
    assert.equal(await record(),first);
    const [m]=await history();assert.equal(m.status,'verified');assert.equal(Number(m.value),78.25);
    assert.equal(m.verified_by,owner);assert.equal(m.source_ref,defaults.source);assert.equal(m.observation_id,first);
    assert.equal(m.evidence_count,1);assert.equal(m.evidence[0].id,first);
  });
  await t.test('stable key and replayed extract deduplicate; reusing either key cannot change content',async()=>{
    assert.equal(await record(),first);assert.equal(await record({id:duplicate}),first);
    await reject(record({value:75}), '23505');await reject(record({id:duplicate,value:75}), '23505');
    assert.equal((await history())[0].evidence_count,1);
  });
  await t.test('unreported site and missing months yield no manufactured measurements',async()=>{
    assert.deepEqual(await history(peer),[]);assert.equal((await history()).length,1);
  });
  for(const [label,change,code] of [
    ['unknown metric',{metric:'room_nights'},'23514'],['percentage above 100',{value:101},'23514'],
    ['percentage negative',{value:-0.1},'23514'],['fractional count',{metric:'guest_complaints',value:1.2},'23514'],
    ['negative count',{metric:'late_milestones',value:-1},'23514'],['energy negative',{metric:'energy_kwh',value:-1},'23514'],
    ['gross cost negative',{metric:'operating_cost_sar',value:-10},'23514'],
    ['more precision than SAR minor unit',{metric:'capex_variance_sar',value:1.001},'23514'],
    ['NaN',{value:'NaN'},'23514'],['infinity',{value:'Infinity'},'23514'],
    ['not the first day',{month:'2024-01-10'},'23514'],['source extracted before the last calendar day',{retrieved:'2024-01-30'},'23514'],
    ['incomplete or future reporting period',{month:'2099-01-01',retrieved:'2099-02-01'},'23514'],
    ['future extraction date',{retrieved:'2099-02-01'},'23514'],['no traceable source label',{source:' '},'23514'],
    ['site from another institution',{site:foreign},'42501'],
  ]) await t.test(label,()=>reject(record({id:randomUUID(),...change}),code));
  await t.test('last-day final extract for a closed month is eligible; current month cannot be verified',async()=>{
    const id=randomUUID();
    assert.equal(await record({id,metric:'lead_conversion_pct',retrieved:'2024-01-31'}),id);
    const month=await v("select date_trunc('month',now() at time zone 'Asia/Riyadh')::date::text");
    await reject(record({id:randomUUID(),month,retrieved:month}),'23514');
  });
  await t.test('signed financial data, zero count and fractional kWh are accepted',async()=>{
    for(const [metric,value] of [['cash_balance_sar',-120.55],['capex_variance_sar',-5.75],['guest_complaints',0],['energy_kwh',123.456]]) {
      const id=randomUUID();assert.equal(await record({id,metric,value}),id);
      assert.equal(Number((await history()).find(r=>r.metric===metric).value),value);
    }
  });
  await t.test('same-value corroboration is counted and different values explicitly abstain',async()=>{
    const corroboration=randomUUID();
    await record({id:corroboration,source:'Signed second agreeing extract'});
    let group=(await history()).find(r=>r.metric==='occupancy_pct');assert.equal(group.status,'verified');assert.equal(group.evidence_count,2);
    await record({id:second,value:79.5,source:'Reconciled alternate extract'});
    group=(await history()).find(r=>r.metric==='occupancy_pct');
    assert.equal(group.status,'conflict');assert.equal(group.value,null);assert.equal(group.source_ref,null);assert.equal(group.observation_id,null);
    assert.equal(group.evidence.length,3);
    const ids=group.evidence.map(e=>e.id);
    await reject(resolve(first,[first,second]),'23514');
    await reject(resolve(second,[...ids,second]),'23514');
    await reject(resolve(second,ids,' '),'23514');
    await reject(resolve(second,ids,'Reviewed all records',peer),'42501');
    const receipt=await resolve(second,ids);assert.equal(await resolve(second,ids.toReversed()),receipt);
    await reject(resolve(first,ids),'23505');
    group=(await history()).find(r=>r.metric==='occupancy_pct');
    assert.equal(group.status,'resolved');assert.equal(Number(group.value),79.5);assert.equal(group.decided_by,owner);assert.equal(group.resolution_id,receipt);
    assert.equal(group.observation_id,second);
    await record({id:third,value:80,source:'Newly arrived signed correction'});
    group=(await history()).find(r=>r.metric==='occupancy_pct');assert.equal(group.status,'conflict');assert.equal(group.value,null);
    await reject(resolve(second,ids),'23514');
  });
  await t.test('AAL and staff scope enforced on source tables, read projection and decisions',async()=>{
    await login(owner,'aal1');await reject(record(),'42501');await reject(history(),'42501');await reject(resolve(first,[first]),'42501');
    assert.equal(await v('select count(*)::int from public.facility_council_monthly'),0);
    await login(analyst);assert.ok((await history()).length>0);await reject(record(),'42501');await reject(resolve(first,[first]),'42501');
    await login(viewer);await reject(history(),'42501');assert.equal(await v('select count(*)::int from public.facility_council_observations'),0);
    await login(outsider);await reject(history(),'42501');assert.deepEqual(await history(foreign,other),[]);await reject(record(),'42501');
    await login(owner);await reject(q('delete from public.facility_council_observations'),'42501');
    await db.exec('reset role');await reject(q('delete from public.facility_council_observations'),'55000');
    await reject(q('delete from public.facility_council_resolutions'),'55000');
    assert.equal(await v('select count(*)::int from private.facility_council_metric_catalog()'),14);
  });
});
