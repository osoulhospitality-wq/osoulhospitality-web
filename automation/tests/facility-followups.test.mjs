import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

test('unresolved property work survives subsequent rounds until an explicit verified resolution',async t=>{
  const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
  const root=new URL('../../',import.meta.url);
  await db.exec('create role anon;create role authenticated;create role service_role');
  await db.exec(await readFile(new URL('automation/e2e/dr/fixture.sql',root),'utf8'));
  for(const name of (await readdir(new URL('supabase/migrations/',root))).filter(n=>n>='20261125190000' && !n.includes('website')).sort())
    await db.exec(await readFile(new URL('supabase/migrations/'+name,root),'utf8'));
  const [org,site,otherSite,owner,operator,asset]=Array.from({length:6},randomUUID);
  const q=(sql,values=[])=>db.query(sql,values);
  const val=async(sql,values=[])=>Object.values((await q(sql,values)).rows[0])[0];
  await q('insert into auth.users(id) values ($1),($2)',[owner,operator]);
  await q("insert into public.organizations(id,name,created_by) values($1,'Fixture company',$2)",[org,owner]);
  await q("insert into public.organization_members(organization_id,user_id,role,full_name) values($1,$2,'analyst','Operator')",[org,operator]);
  await q("insert into public.facilities(id,organization_id,name) values($1,$2,'Property A'),($3,$2,'Property B')",[site,org,otherSite]);
  await q("insert into public.facility_assets(id,organization_id,facility_id,name,asset_code) values($1,$2,$3,'Pump A','P1')",[asset,org,site]);
  const login=async(id,aal='aal2')=>{
    await db.exec('reset role;set role authenticated');
    await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);
  };
  await login(owner);
  const open=()=>val('select public.facility_review_open($1,$2,current_date+2)',[org,site]);
  const topic=(round,key,checked)=>val("select public.facility_review_decide($1,$2,$3,$4,$5,'Synthetic review observation',case when $5='follow_up' then current_date+2 else null end)",[org,site,round,key,checked?'checked':'follow_up']);
  async function complete(round,checkAsset) {
    for(const key of ['building','staff','assets','maintenance','swot','prices']) await topic(round,key,checkAsset&&key==='assets');
    return val('select public.facility_review_close($1,$2,$3)',[org,site,round]);
  }
  const list=async(s=site)=>(await q('select * from public.facility_review_followups($1,$2)',[org,s])).rows;
  const first=await open();await complete(first,false);
  const second=await open();
  const resolve=(target=second,key='assets',facility=site)=>val('select public.facility_review_resolve_followup($1,$2,$3,$4,$5)',[org,facility,first,key,target]);
  await t.test('previous six tasks survive a new open round and remain site-scoped',async()=>{
    assert.equal((await list()).length,6);assert.equal((await list(otherSite)).length,0);
    assert.ok((await list()).every(r=>r.round_id===first&&r.note&&r.due_on));
  });
  await t.test('same round and live checked draft cannot resolve closed obligation',async()=>{
    await assert.rejects(resolve(first),{code:'23514'});
    await topic(second,'assets',true);await assert.rejects(resolve(),{code:'23514'});
  });
  await complete(second,true);const third=await open();await complete(third,true);
  await t.test('all historical unresolved rows remain visible even with newer closed rounds',async()=>{
    assert.equal((await list()).length,16);
    assert.ok((await list()).some(r=>r.round_id===first&&r.topic==='assets'));
  });
  await t.test('resolution enforces same site/topic, verified actor and role',async()=>{
    await assert.rejects(resolve(second,'staff'),{code:'23514'});
    await assert.rejects(resolve(second,'assets',otherSite),{code:'42501'});
    await login(operator);await assert.rejects(resolve(),{code:'42501'});
    await login(owner,'aal1');await assert.rejects(resolve(),{code:'42501'});
    await assert.rejects(list(),{code:'42501'});await login(owner);
  });
  await t.test('accepts exact evidence once and retains original item plus approved receipt',async()=>{
    assert.equal(await resolve(),second);assert.equal(await resolve(),second);
    await assert.rejects(resolve(third),{code:'23505'});
    const rows=await list();assert.equal(rows.length,15);assert.ok(!rows.some(r=>r.round_id===first&&r.topic==='assets'));
    const row=(await q('select r.resolved_by,r.checked_round_id,i.state from public.facility_review_resolutions r join public.facility_review_items i using(round_id,topic)')).rows[0];
    assert.equal(row.resolved_by,owner);assert.equal(row.checked_round_id,second);assert.equal(row.state,'follow_up');
    await assert.rejects(q('delete from public.facility_review_resolutions'),{code:'42501'});
    await db.exec('reset role');
    await assert.rejects(q('delete from public.facility_review_resolutions'),{code:'55000'});
  });
});
