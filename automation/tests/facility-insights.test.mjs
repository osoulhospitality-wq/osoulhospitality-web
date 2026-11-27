import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {pgcrypto} from "@electric-sql/pglite/contrib/pgcrypto";
import {buildFacilitySwot, insightTopics} from "../../command-center/enterprise/src/facility-insights.js";

test("SWOT language and empty quadrants are deterministic and source-bound",()=>{
  const rows=Object.keys(insightTopics).map(topic=>({id:randomUUID(),topic}));
  const first=buildFacilitySwot(rows);
  assert.deepEqual(first,buildFacilitySwot(rows));
  assert.deepEqual(Object.values(first).map(r=>r.length),[2,2,2,2]);
  for(const finding of Object.values(first).flat()) {
    assert.match(finding.ar,/[\u0600-\u06ff]/); assert.match(finding.en,/[A-Za-z]/);
    assert.ok(rows.includes(finding.evidence));
  }
  assert.deepEqual(buildFacilitySwot([]),{strength:[],weakness:[],opportunity:[],threat:[]});
  assert.throws(()=>buildFacilitySwot([{topic:"absent"}]),/Unknown/);
});

test("Facility evidence verification, current snapshot and scoped human approval",async t=>{
  const db=new PGlite({extensions:{pgcrypto}}); t.after(()=>db.close());
  await db.exec(`
  create role anon; create role authenticated; create schema auth; create schema storage;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
  grant usage on schema auth to authenticated,anon;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(bucket_id text,name text,owner_id text);
  create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
  for(const file of ["command-center/enterprise/schema.sql","supabase/migrations/20261125193000_add_facility_operations.sql","supabase/migrations/20261126213000_facility_insights.sql"])
    await db.exec(await readFile(new URL("../../"+file,import.meta.url),"utf8"));
  const owner=randomUUID(),otherOwner=randomUUID(),approver=randomUUID(),reader=randomUUID();
  const org=randomUUID(),other=randomUUID(),a=randomUUID(),b=randomUUID(),outside=randomUUID();
  const v=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const claim=(sub,aal="aal2")=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,aal})]);
  await db.query("insert into auth.users(id) values ($1),($2),($3),($4)",[owner,otherOwner,approver,reader]);
  for(const [id,user] of [[org,owner],[other,otherOwner]]) {
    await claim(user); await db.query("insert into public.organizations(id,name,created_by) values($1,'Demo organization',$2)",[id,user]);
  }
  await db.query("insert into public.organization_members(organization_id,user_id,full_name,role) values($1,$2,'Checker','approver'),($1,$3,'Viewer','analyst')",[org,approver,reader]);
  await db.query("insert into public.facilities(id,organization_id,name) values($1,$4,'Alpha'),($2,$4,'Beta'),($3,$5,'Delta')",[a,b,outside,org,other]);
  await db.exec("set role authenticated"); await claim(owner);
  const base={org,site:a,kind:"guest_summary",topic:"cleanliness_strength",url:"https://www.booking.com/hotel/sa/sample.html",start:"2025-09-01",end:"2025-09-10",sample:12,limit:"selected_sample",confirm:true,supporting:null};
  function verify(overrides={}) {
    const x={...base,...overrides};
    return v("select public.facility_verify_insight($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[x.org,x.site,x.kind,x.topic,x.url,x.start,x.end,x.sample,x.limit,x.confirm,x.supporting]);
  }
  const snapshot=(o=org,f=a)=>v("select public.facility_swot($1,$2)",[o,f]);
  const approve=(ids,f=a,ver="swot-v1")=>v("select public.facility_approve_swot($1,$2,$3,$4)",[org,f,ver,ids]);
  const withdraw=(id,f=a)=>v("select public.facility_withdraw_insight($1,$2,$3)",[org,f,id]);
  const fails=(fn,code)=>assert.rejects(fn,e=>e.code===code);
  await t.test("empty starts as uncertified draft",async()=>{
    const s=await snapshot(); assert.equal(s.status,"draft"); assert.equal(s.eligible,false); assert.deepEqual(s.evidence,[]); assert.equal(s.can_verify,true);
  });
  for(const [name,patch] of Object.entries({
    "owner attestation required":{confirm:false},"distinct source date window":{end:"2025-08-01"},"future rejected":{end:"2099-01-01"},
    "no negative counts":{sample:-1},"no more supporting rows than examined":{supporting:13},"no manufactured supporting count without denominator":{sample:null,supporting:1},"known number only for guest samples":{kind:"owner_record"},
    "individual profile not a listing":{url:"https://www.tripadvisor.com/members/guest-one"},
    "no review tracking identifier":{url:"https://www.booking.com/hotel/sa/sample.html?guest=one"},
    "no private source credentials":{url:"https://someone:secret@example.invalid/page"},
    "guest evidence needs property page":{url:"https://example.invalid/sample"},
    "external scope cannot manufacture internal positives":{topic:"access_opportunity"},
    "source required for site":{kind:"site_source",topic:"access_opportunity",url:"",sample:null},
    "unsupported custom observation":{topic:"any_free_text"}
  })) await t.test(name,()=>fails(()=>verify(patch),"23514"));
  await t.test("cross-organization and composite facility mismatch fail",async()=>{
    await fails(()=>verify({site:outside}),"42501"); await fails(()=>snapshot(org,outside),"42501");
    await fails(()=>snapshot(other,outside),"42501");
  });
  const good=await verify({supporting:3});
  assert.equal((await snapshot()).evidence[0].supporting_count,3);
  await t.test("duplicate evidence cannot silently amplify a sample",()=>fails(()=>verify(),"23505"));
  const second=await verify({site:b,sample:null,url:"https://www.google.com/maps?cid=1234"});
  await t.test("separate properties in same portfolio do not mix rows",async()=>{
    const x=await snapshot(), y=await snapshot(org,b);
    assert.deepEqual(x.evidence.map(r=>r.id),[good]); assert.deepEqual(y.evidence.map(r=>r.id),[second]); assert.equal(y.evidence[0].sample_size,null);
  });
  await t.test("incomplete draft cannot be approved",()=>fails(()=>approve([good]),"23514"));
  const weakness=await verify({kind:"owner_record",topic:"cooling_weakness",url:"",sample:null,limit:"field_observation"});
  const opportunity=await verify({kind:"site_source",topic:"access_opportunity",url:"https://example.org/transit",sample:null,limit:"single_source"});
  const threat=await verify({kind:"site_source",topic:"works_threat",url:"https://example.org/road",sample:null,limit:"seasonal"});
  const ids=[good,weakness,opportunity,threat];
  await t.test("wrong facility ID, omitted row, duplicate and wrong rules version cannot be signed",async()=>{
    for(const offered of [[second,weakness,opportunity,threat],[weakness,opportunity,threat],[good,good,weakness,opportunity,threat]]) await fails(()=>approve(offered),"23514");
    await fails(()=>approve(ids,a,"swot-v2"),"23514");
  });
  await t.test("analyst can read scoped region but cannot attest or sign",async()=>{
    await claim(reader); const s=await snapshot(); assert.equal(s.can_verify,false); assert.equal(s.can_approve,false);
    await fails(()=>verify(),"42501"); await fails(()=>approve(ids),"42501");
  });
  await t.test("MFA and column grants resist forged approval",async()=>{
    await claim(owner,"aal1"); await fails(()=>verify(),"42501"); await fails(()=>snapshot(),"42501"); await fails(()=>approve(ids),"42501");
    assert.equal(await v("select count(*)::int from public.facility_insight_evidence"),0);
    await claim(owner); await fails(()=>db.query("update public.facility_swot_approvals set approved_at=now()"),"42501");
  });
  await t.test("approver signs precise IDs reproducibly and cannot create evidence",async()=>{
    await claim(approver); await fails(()=>verify(),"42501");
    assert.equal((await snapshot()).eligible,true);
    const approval=await approve(ids); assert.equal(await approve(ids.toReversed()),approval);
    const signed=await snapshot(); assert.equal(signed.status,"approved"); assert.ok(signed.approved_at);
    assert.equal(await v("select approved_by from public.facility_swot_approvals where id=$1",[approval]),approver);
    assert.equal((await snapshot(org,b)).status,"draft"); await fails(()=>withdraw(good),"42501");
  });
  await t.test("new evidence invalidates a live approval and stale page decisions",async()=>{
    await claim(owner);
    const addition=await verify({kind:"site_source",topic:"demand_opportunity",url:"https://example.org/conference",sample:null,limit:"single_source"});
    assert.equal((await snapshot()).status,"draft");
    await fails(()=>approve(ids),"23514");
    await withdraw(addition);
    // The original verified evidence is again identical, and its historical signature is still valid.
    assert.equal((await snapshot()).status,"approved");
  });
  await t.test("withdrawal invalidates approval without erasing old evidence or approval history",async()=>{
    await claim(owner); await fails(()=>withdraw(second),"22023");
    await withdraw(good); const next=await snapshot(); assert.equal(next.status,"draft"); assert.equal(next.eligible,false); await fails(()=>approve(ids),"23514");
    assert.equal(await v("select count(*)::int from public.facility_swot_approvals"),1);
    assert.equal(await v("select withdrawn_by from public.facility_insight_evidence where id=$1",[good]),owner);
  });
  await t.test("scope window caps the twenty-first pair of distinct site observations",async()=>{
    for(let n=0;n<41;n++) await verify({site:b,kind:"site_source",topic:"works_threat",url:"https://example.org/road/"+n,sample:null,limit:"single_source"});
    const capped=await snapshot(org,b); assert.equal(capped.evidence.length,40);
    assert.ok(!capped.evidence.some(e=>e.id===second)); assert.equal(capped.eligible,false);
  });
  await t.test("outsider receives no records and cannot approve or withdraw",async()=>{
    await claim(otherOwner); assert.equal(await v("select count(*)::int from public.facility_insight_evidence"),0);
    assert.equal(await v("select count(*)::int from public.facility_swot_approvals"),0);
    await fails(()=>approve(ids),"42501"); await fails(()=>withdraw(threat),"42501");
  });
});
