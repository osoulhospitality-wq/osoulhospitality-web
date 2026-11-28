import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const entry=process.argv[2]?pathToFileURL(resolve(process.argv[2])).href:"@electric-sql/pglite";
const {PGlite}=await import(entry);
const db=new PGlite();
const org=randomUUID(), other=randomUUID(), client=randomUUID(), facility=randomUUID();
const day="2025-01-05",terms="Studio, 2 guests, 1 night, refundable, tax/fees included";
const src=(id,kind,price_sar)=>({id,kind,label:id,observed_on:day,valid_from:day,valid_to:day,reference:"internal:qa",...(price_sar?{terms,price_sar}:{})});
const sources=[src("other","competitor",120),src("first","facility",130),src("second","competitor",145),src("ledger","sales"),src("third","competitor",135)];
const line={date:day,basis:"all_in_comparable",terms,demand:"steady",reason:"A dated comparison exists",action:"Review rate",
  source_ids:sources.map(s=>s.id),own_rate_sar:130,market_low_sar:120,market_high_sar:145,recommended_low_sar:125,recommended_high_sar:145,
  available_nights:6,on_books_nights:2,on_books_room_revenue_sar:260,pickup_nights:-1,cancellations_nights:1};
const report={currency:"SAR",days:[line],sources};
const submit=async(payload=report,revision=0,cadence="daily",organization=org)=>(await db.query(
  "select private.fm_store_facility_revenue_report($1,'tenant','property',$2,$3,$3,$4,$5::jsonb) as result",
  [organization,cadence,day,revision,JSON.stringify(payload)])).rows[0].result;
const read=async(organization=org,site=facility)=>(await db.query(
  "select public.fm_facility_revenue_history($1,$2) as result",[organization,site])).rows[0].result.reports;
const empty=d=>({date:d,basis:"unknown",demand:"unknown",reason:"Unverified",action:"Request evidence",source_ids:[]});
try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create schema private;create schema auth;
 create table private.fm_clients(id uuid,organization_id uuid,code text,detail jsonb);
 create table private.fm_client_sites(organization_id uuid,client_id uuid,facility_id uuid,code text,detail jsonb,unique(organization_id,client_id,facility_id,code));
 create table public.audit_events(organization_id uuid,actor_id uuid,action text,entity_type text,entity_id text,details jsonb);
 create function private.current_org_role(target uuid) returns text language sql stable as $$select case when target::text=current_setting('qa.org',true) then current_setting('qa.role',true) end$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('qa.aal',true))$$;
 grant usage on schema private,auth to authenticated, service_role;
 `);
 await db.query("insert into private.fm_clients values($1,$2,'tenant','{}')",[client,org]);
 await db.query("insert into private.fm_client_sites values($1,$2,$3,'property','{}')",[org,client,facility]);
 const directory=new URL("../../supabase/migrations/",import.meta.url);
 const names=(await readdir(directory)).filter(name=>/_facility_revenue_(snapshots|stay_quotes|eligibility)\.sql$/.test(name)).sort();assert.equal(names.length,3);
 for(const name of names) await db.exec(await readFile(new URL(name,directory),"utf8"));
 assert.deepEqual(await submit(),{recorded:true,revision:1});
 assert.deepEqual(await submit(),{recorded:false,revision:1});
 const analogue={...src("analogue","historical_pickup"),historical_stay_date:"2024-12-29",historical_as_of:"2024-12-29",matched_pickup_nights:3,match_note:"Matched weekday, lead time and operating conditions"};
 const matches=["2024-12-29","2024-12-22","2024-12-15","2024-12-08","2024-12-01","2024-11-24"].map((date,i)=>({...analogue,id:"analogue"+i,historical_stay_date:date,historical_as_of:date}));
 const revised={...report,sources:[...sources,...matches],days:[{...line,source_ids:[...line.source_ids,...matches.map(s=>s.id)],forecast_booked_nights:5,reason:"Verified against amended source"}]};
 await assert.rejects(submit(revised,0),/revision changed/);
 assert.equal((await submit(revised,1)).revision,2);
 await assert.rejects(submit({...revised,days:[{...revised.days[0],forecast_booked_nights:6}]},2),/Forecast differs/);
 await assert.rejects(submit({...revised,sources:[...sources,{...matches[0],historical_as_of:"2024-12-28"},...matches.slice(1)]},2),/match weekday/);
 await assert.rejects(submit({...revised,days:[{...revised.days[0],source_ids:revised.days[0].source_ids.slice(0,-1)}]},2),/six distinct/);
 const bundle={id:"package",kind:"facility",label:"Direct stay package",observed_on:day,valid_from:day,valid_to:"2025-01-11",check_out:"2025-01-12",stay_total_sar:800,reference:"internal:quote-summary",terms,retrieval_note:"Quoted for entire stay; actual nightly breakdown unavailable"};
 const ownOnly={currency:"SAR",days:[{...empty(day),basis:"all_in_comparable",terms,source_ids:["first","package"],own_rate_sar:130}],sources:[sources[1],bundle]};
 assert.equal((await submit(ownOnly,2)).revision,3);
 await assert.rejects(submit({...ownOnly,days:[{...ownOnly.days[0],own_rate_sar:800/7}]},3),/differ/);
 await assert.rejects(submit({...ownOnly,sources:[sources[1],{...bundle,price_sar:100}]},3));
 const weekly={currency:"SAR",days:[5,6,7,8,9,10,11].map(d=>empty("2025-01-"+String(d).padStart(2,"0"))),sources:[]};
 assert.equal((await submit(weekly,0,"weekly")).revision,1);
 for(const [payload,pattern] of [
  [{...report,days:[{...line,terms:"different terms"}]},/terms/],
  [{...report,days:[{...line,source_ids:line.source_ids.filter(id=>id!=="third")}]},/Unverified suggested/],
  [{...report,sources:sources.map(item=>item.id==="other"?{...item,property_key:"Hotel  A"}:item.id==="third"?{...item,property_key:"hotel-a"}:item)},/Unverified suggested/],
  [{...report,days:[{...line,own_rate_sar:null,source_ids:line.source_ids.filter(id=>id!=="first")}]},/Unverified suggested/],
  [{...report,sources:sources.map(item=>item.id==="third"?{...item,property_key:"FI-RST"}:item)},/its own competitor/],
  [{...report,days:[{...line,on_books_nights:null}]},/Unverified suggested/],
  [{...report,days:[{...line,available_nights:null}]},/Unverified suggested/],
  [{...report,days:[{...line,on_books_nights:line.available_nights}]},/Unverified suggested/],
  [{...report,days:[{...line,forecast_booked_nights:5}]},/Forecast needs/],
  [{...report,days:[{...line,market_high_sar:155}]},/differ/],
  [{...report,days:[{...line,own_rate_sar:999}]},/differ/],
  [{...report,days:[{...line,source_ids:["missing"]}]},/Unknown/],
  [{...report,sources:sources.map(s=>({...s,observed_on:"2025-01-06"}))},/period/],
  [{...report,sources:sources.map(s=>({...s,valid_from:"2025-01-06",valid_to:"2025-01-06"}))},/cover/],
  [{...report,sources:sources.map(s=>({...s,reference:"https://example.test/?token=invalid"}))},/sanitized/],
  [{...report,days:[{...empty(day),on_books_nights:1}],sources:[]},/Sales/],
  [{...report,days:[{...empty(day),pickup_nights:1}],sources:[]},/Sales/],
  [{...report,days:[{...empty(day),recommended_low_sar:130,recommended_high_sar:140}],sources:[]},/Unverified/],
  [{...report,days:[{...empty(day),demand:"high"}],sources:[]},/demand evidence/],
  [{...report,days:[{...empty(day),guest_name:"invalid"}]},/Invalid/],
 ]) await assert.rejects(submit(payload,2),pattern);
 await assert.rejects(submit(report,0,"daily",other));
 await db.exec("update private.fm_clients set detail='{\"simulation\":true}'");await assert.rejects(submit());await db.exec("update private.fm_clients set detail='{}'");
 assert.equal((await db.query("select count(*)::int n from public.audit_events")).rows[0].n,4);
 await db.exec(`set role authenticated;set qa.org='${org}';set qa.role='owner';set qa.aal='aal2'`);
 assert.equal((await read()).length,2);assert.equal((await read()).find(r=>r.cadence==="daily").revision,3);
 assert.deepEqual(await read(other),[]);assert.deepEqual(await read(org,randomUUID()),[]);
 await assert.rejects(submit());await assert.rejects(db.exec("delete from private.fm_facility_revenue_reports"));
 await db.exec("set qa.aal='aal1'");assert.deepEqual(await read(),[]);
 await db.exec("set qa.aal='aal2';set qa.role='viewer'");assert.deepEqual(await read(),[]);
 await db.exec("reset role;set role anon");await assert.rejects(read());
 await db.exec("reset role;set role service_role");await assert.rejects(submit());
 console.log("Revenue report staging PASS: dated evidence, strict like-for-like rates, seven-day coverage, decision-only ranges, safe unknowns, sales evidence, immutable revisions, audit counts and scope isolation.");
}finally{await db.close();}
