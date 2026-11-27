import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

test('survey records, existing asset labels and a complete review round stay traceable',async t=>{
  const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
  const text=file=>readFile(new URL('../../'+file,import.meta.url),'utf8');
  const migrations=async names=>{for(const name of names)await db.exec(await text('supabase/migrations/'+name+'.sql'));};
  await db.exec('create role anon;create role authenticated;create role service_role');
  await db.exec(await text('automation/e2e/dr/fixture.sql'));
  await migrations(['20261125190000_bootstrap_enterprise_foundation','20261125193000_add_facility_operations','20261126190000_draqon_field_handoff']);
  const [org,orgB,facility,facilityB,site2,asset,order,owner,operator,viewer,outsider]=Array.from({length:11},randomUUID);
  const query=(sql,args=[])=>db.query(sql,args);
  const value=async(sql,args=[])=>Object.values((await query(sql,args)).rows[0])[0];
  async function login(id,aal='aal2'){await db.exec('reset role;set role authenticated');await query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);}
  await query('insert into auth.users(id) values($1),($2),($3),($4)',[owner,operator,viewer,outsider]);
  await query("insert into public.organizations(id,name,created_by) values($1,'Synthetic org A',$2),($3,'Synthetic org B',$4)",[org,owner,orgB,outsider]);
  await query("insert into public.organization_members(organization_id,user_id,full_name,role) values($1,$2,'Jane','analyst'),($1,$3,'Alex','viewer')",[org,operator,viewer]);
  await query("insert into public.facilities(id,organization_id,name) values($1,$2,'Site A'),($3,$4,'Site B'),($5,$2,'Site A2')",[facility,org,facilityB,orgB,site2]);
  await query("insert into public.facility_assets(id,organization_id,facility_id,asset_code,name) values($1,$2,$3,'LEGACY-01','Cold pump')",[asset,org,facility]);
  await query("insert into public.facility_work_orders(id,organization_id,asset_id,summary) values($1,$2,$3,'Existing inspection')",[order,org,asset]);
  await migrations(['20261126210000_facility_survey','20261126211000_facility_pm','20261126212000_facility_benchmark',
    '20261126213000_facility_insights','20261126214000_facility_review_desk','20261126215000_facility_review_followups']);
  const token=await value('select scan_token from public.facility_assets where id=$1',[asset]);
  await t.test('migration backfills legacy asset token without changing code, asset ID or existing work order',async()=>{
    assert.match(token,/^[0-9a-f-]{36}$/);
    assert.equal(await value('select a.asset_code from public.facility_assets a join public.facility_work_orders w on w.asset_id=a.id where w.id=$1 and a.id=$2',[order,asset]),'LEGACY-01');
    await assert.rejects(query('update public.facility_assets set scan_token=gen_random_uuid() where id=$1',[asset]),{code:'23514'});
  });
  const scan=(o=org,site=facility)=>(query('select id from public.facility_asset_by_token($1,$2,$3)',[o,site,token]));
  const brief=(o=org,site=facility)=>value('select public.facility_review_brief($1,$2)',[o,site]);
  const opened=target=>value('select public.facility_review_open($1,$2,$3)',[org,facility,target]);
  const save=(id,key,v,day='2024-01-02',ref='inspection A',site=facility,assetId=null)=>value('select public.facility_memory_save($1,$2,$3,$4,$5,$6,$7,$8)',[org,site,id,assetId,key,v,ref,day]);
  const verify=id=>value('select public.facility_memory_verify($1,$2,$3)',[org,facility,id]);
  const today=await value("select (now() at time zone 'Asia/Riyadh')::date::text");
  const tomorrow=await value("select ((now() at time zone 'Asia/Riyadh')::date+1)::text");
  await login(operator);
  await t.test('site-scoped barcode returns exactly one authorized legacy asset',async()=>{
    assert.deepEqual((await scan()).rows,[{id:asset}]);assert.deepEqual((await scan(org,site2)).rows,[]);
  });
  await t.test('brief starts with sourced zero counts and no invented building or staff facts',async()=>{
    const b=await brief();assert.deepEqual(b.facts,{});assert.equal(b.round,null);assert.equal(b.lastRound,null);assert.equal(b.assets.firstId,asset);
    assert.equal(b.prices.matched,0);assert.equal(b.maintenance.count,0);assert.equal(b.swot.status,'draft');
  });
  const floor=randomUUID();
  await t.test('equivalent Arabic floor value, receipt retry, conflicting reuse and future observations',async()=>{
    assert.equal(await save(floor,'floors_above','٠٣'),floor);
    assert.equal(await save(floor,'floors_above','3'),floor);
    await assert.rejects(save(floor,'floors_above','4'),{code:'23505'});
    await assert.rejects(save(randomUUID(),'lifts','2',tomorrow),{code:'22023'});
    await assert.rejects(save(randomUUID(),'built_area_m2','0'),{code:'23514'});
    await assert.rejects(save(randomUUID(),'floors_above','2.5'),{code:'23514'});
  });
  await t.test('asset observation cannot be associated to another facility',async()=>{
    await assert.rejects(save(randomUUID(),'model','synthetic','2024-01-02','document',site2,asset),{code:'23503'});
  });
  await t.test('unverified records cannot become facts; analyst cannot verify',async()=>{
    assert.equal((await brief()).unverified,1);assert.equal((await brief()).facts.floors_above,undefined);
    await assert.rejects(verify(floor),{code:'42501'});
  });
  await login(owner);await verify(floor);
  await t.test('verified numeric facts carry date, source, stable ID and normalized value',async()=>{
    const f=(await brief()).facts.floors_above;assert.equal(f.id,floor);assert.equal(f.asOf,'2024-01-02');assert.equal(f.source,'inspection A');assert.equal(f.value,'3');assert.equal(f.conflict,false);
  });
  const contradictory=await save(randomUUID(),'floors_above','4','2024-01-02','independent drawing');
  await verify(contradictory);
  await t.test('same-day verified disagreement is explicit and retains both sources',async()=>{
    const f=(await brief()).facts.floors_above;assert.equal(f.conflict,true);assert.equal(f.value,null);assert.equal(f.sources.length,2);
  });
  const round=await opened(tomorrow);
  const decide=(topic,state,note='synthetic desk note',follow=null,r=round)=>value('select public.facility_review_decide($1,$2,$3,$4,$5,$6,$7)',[org,facility,r,topic,state,note,follow]);
  const close=(r=round)=>value('select public.facility_review_close($1,$2,$3)',[org,facility,r]);
  await t.test('open retry preserves first date and six distinct topics',async()=>{
    assert.equal(await opened(today),round);const b=(await brief()).round;assert.equal(b.target,tomorrow);assert.equal(b.items.length,6);assert.equal(new Set(b.items.map(x=>x.topic)).size,6);
  });
  await t.test('target date finite; stale or missing follow-up date and empty reason fail',async()=>{
    await assert.rejects(opened('infinity'),{code:'22023'});
    for(const date of [null,'2000-01-01','infinity'])await assert.rejects(decide('staff','follow_up','need signed tally',date),{code:'22023'});
    await assert.rejects(decide('staff','follow_up','  ',tomorrow),{code:'22023'});
  });
  await t.test('pending topics stop closure and checked building requires all three nonconflicting facts',async()=>{
    await assert.rejects(close(),{code:'23514'});await assert.rejects(decide('building','checked'),{code:'23514'});
    const area=await save(randomUUID(),'built_area_m2','١٠٠٫٥٠','2024-01-02','floor survey');await verify(area);
    const lifts=await save(randomUUID(),'lifts','0','2024-01-02','lift registry');await verify(lifts);
    await assert.rejects(decide('building','checked'),{code:'23514'});
  });
  const newer=await save(randomUUID(),'floors_above','5','2024-01-03','amended drawing');await verify(newer);
  await t.test('most recent verified date supersedes earlier conflict; zero lifts is a verified value',async()=>{
    const b=await brief();assert.equal(b.facts.floors_above.id,newer);assert.equal(b.facts.floors_above.conflict,false);
    assert.equal(b.facts.built_area_m2.value,'100.5');assert.equal(b.facts.lifts.value,'0');
    await decide('building','checked');const snap=await value("select evidence_snapshot from public.facility_review_items where round_id=$1 and topic='building'",[round]);
    assert.equal(snap.floors_above.id,newer);assert.equal(snap.lifts.value,'0');assert.equal(snap.built_area_m2.source,'floor survey');
  });
  await t.test('absent evidence for staff, PM, SWOT and benchmark prices cannot be marked checked',async()=>{
    for(const topic of ['staff','maintenance','swot','prices'])await assert.rejects(decide(topic,'checked'),{code:'23514'});
    await assert.rejects(decide('assets','checked','approved',tomorrow),{code:'22023'});
    await assert.rejects(decide('billing','checked'),{code:'22023'});
    await decide('assets','checked');
  });
  await login(operator);
  await t.test('operator can own dated follow-up but cannot authorize checked evidence or close',async()=>{
    await assert.rejects(decide('assets','checked'),{code:'42501'});await assert.rejects(close(),{code:'42501'});
    for(const topic of ['staff','maintenance','swot','prices'])await decide(topic,'follow_up','Request supporting record',tomorrow);
    const i=(await brief()).round.items.find(x=>x.topic==='staff');assert.equal(i.recordedBy,operator);assert.equal(i.followUpOn,tomorrow);assert.equal(i.state,'follow_up');
  });
  await login(owner);
  await t.test('closed round is immutable, repeat close keeps original outcome and latest round is discoverable',async()=>{
    assert.equal(await close(),'follow_up_required');assert.equal(await close(),'follow_up_required');
    await assert.rejects(decide('assets','checked'),{code:'42501'});
    const b=await brief();assert.equal(b.round,null);assert.equal(b.lastRound.id,round);
    assert.notEqual(await opened(tomorrow),round);assert.equal((await brief()).lastRound.id,round);
  });
  const nextRound=(await brief()).round.id;
  const followups=(o=org,site=facility)=>query('select * from public.facility_review_followups($1,$2)',[o,site]);
  const resolve=(topic,r=nextRound)=>value('select public.facility_review_resolve_followup($1,$2,$3,$4,$5)',[org,facility,round,topic,r]);
  await t.test('follow-ups survive closing and cannot be cleared by linking an open or identical round',async()=>{
    assert.equal((await followups()).rows.length,4);await assert.rejects(resolve('staff',round),{code:'23514'});
    await assert.rejects(resolve('staff'),{code:'23514'});
  });
  const staff=await save(randomUUID(),'staff_total','33','2024-02-01','synthetic roster');await verify(staff);
  await decide('staff','checked','Checked roster',null,nextRound);
  const purchase=randomUUID(),record={id:purchase,invoice_ref:'synthetic-desk',invoice_line:'1',purchased_on:'2024-01-02',item_key:'fixture',
    spec_key:'S',region:'R',currency:'SAR',unit:'ea',packs:2,units_per_pack:1,pack_price:7,vat_mode:'excluded',freight_net:0,discount_net:0};
  await value('select public.draqon_record_facility_purchase($1,$2,$3)',[org,facility,record]);
  await t.test('an invoice without an approved comparable reference cannot justify a checked price decision',async()=>{
    assert.equal((await brief()).prices.count,1);assert.equal((await brief()).prices.matched,0);
    await assert.rejects(decide('prices','checked','Review price',null,nextRound),{code:'23514'});
  });
  await db.exec('reset role');await query('insert into private.draqon_price_curators(user_id) values($1)',[outsider]);
  await login(outsider);await value('select public.draqon_approve_price_reference($1)',[{item_key:'fixture',spec_key:'S',region:'R',
    currency:'SAR',base_unit:'ea',min_qty:0,valid_from:'2023-01-01',valid_until:'2025-01-01',delivered_net_unit_price:7,evidence_ref:'private synthetic approval'}]);
  await login(owner);
  await t.test('checked price topic binds to its own invoice receipt and no central provenance identity is disclosed',async()=>{
    await decide('prices','checked','Approved commercial match',null,nextRound);
    const evidence=await value("select evidence_snapshot from public.facility_review_items where round_id=$1 and topic='prices'",[nextRound]);
    assert.equal(evidence.sample.purchase_id,purchase);assert.equal(evidence.matched,1);
    assert.equal(JSON.stringify(evidence).includes('private synthetic approval'),false);
  });
  for(const tag of ['building','assets'])await decide(tag,'checked','Verified source',null,nextRound);
  for(const tag of ['maintenance','swot'])await decide(tag,'follow_up','Assign inspection',tomorrow,nextRound);
  await close(nextRound);
  await t.test('approved follow-up resolution is idempotent and must cite the same topic with actual verified evidence',async()=>{
    assert.equal(await resolve('staff'),nextRound);assert.equal(await resolve('staff'),nextRound);
    assert.equal((await followups()).rows.some(x=>x.round_id===round&&x.topic==='staff'),false);
    assert.equal((await followups()).rows.some(x=>x.round_id===round&&x.topic==='maintenance'),true);
    await assert.rejects(resolve('maintenance'),{code:'23514'});
    const prev=await value("select state from public.facility_review_items where round_id=$1 and topic='staff'",[round]);assert.equal(prev,'follow_up');
  });
  await login(viewer);
  await t.test('viewer reads round without gaining write authority',async()=>{
    assert.equal((await brief()).canApprove,false);await assert.rejects(opened(today),{code:'42501'});
  });
  await login(outsider);
  await t.test('tenant isolation applies to token, brief, memory search and stored decisions',async()=>{
    assert.deepEqual((await scan()).rows,[]);
    await assert.rejects(brief(),{code:'42501'});await assert.rejects(brief(orgB,facility),{code:'42501'});
    assert.equal(await value('select count(*)::int from public.facility_memory_find($1,$2) where id=$3',[org,facility,floor]),0);
    assert.equal(await value('select count(*)::int from public.facility_review_items where round_id=$1',[round]),0);
    await assert.rejects(opened(today),{code:'42501'});
  });
  await login(owner,'aal1');
  await t.test('low assurance sees neither barcode nor survey and cannot open, close, decide or obtain brief',async()=>{
    assert.deepEqual((await scan()).rows,[]);await assert.rejects(brief(),{code:'42501'});await assert.rejects(opened(today),{code:'42501'});await assert.rejects(close(),{code:'42501'});
  });
});
