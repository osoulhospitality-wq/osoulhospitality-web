import test from "node:test";
import assert from "node:assert/strict";
import {exportFacilityDossier} from "../../command-center/enterprise/src/facility-dossier-export.js";

function fixture(t, {stale = false, leak = false, failure = false} = {}) {
  let blob, clicks=0, current=true;
  const reads=[];
  t.mock.method(URL,"createObjectURL",value=>{blob=value;return "blob:synthetic";});
  t.mock.method(URL,"revokeObjectURL",()=>{});
  const previous=Object.getOwnPropertyDescriptor(globalThis,"document");
  Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>({click:()=>{clicks++;}})}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,"document",previous);else delete globalThis.document;});
  const field=(id,date,value)=>({id,observed_on:date,fact_value:value,source_ref:'  =ref,"ملف"',asset_id:null,fact_key:"units",verified_at:"2026-11-27"});
  const scoped = items=>items.map(x=>({organization_id:"O",facility_id:"F",...x}));
  const tables={
    facility_memory_records:scoped([field("1","2026-11-20","obsolete-value"),field("2","2026-11-22","8"),field("3","2026-11-22","9")]),
    facility_assets:scoped(Array.from({length:101},(_,i)=>({id:String(i),name:i===100?'معدات, "تجربة"':"asset",asset_code:"CODE"+i,scan_token:"opaque"+i}))),
    facility_pm_plans:scoped([{id:"P",asset_id:"1",task:"PM task",period_count:2,period_unit:"weeks",next_due_on:"2026-12-01",source_reference:"manual",source_date:"2026-11-01"}]),
    facility_review_followups:[{topic:"assets",round_id:"R",note:"open followup",due_on:"2026-12-02"}],
    facility_review_items:scoped([{topic:"staff",round_id:"A",decision_note:"active round followup",follow_up_on:"2026-12-03"}])
  };
  if(leak)tables.facility_assets[0].facility_id="OTHER";
  const make=(name,params)=>{
    const filters={};
    const q={select:()=>q,order:()=>q,not:(key,op,v)=>{filters[key]=[op,v];return q;},is:(key,v)=>{filters[key]=v;return q;},
      eq:(key,value)=>{filters[key]=value;return q;},
      single:async()=>{assert.deepEqual(filters,{organization_id:"O",id:"F"});return {data:{id:"F",name:"فندق الاختبار",organization_id:"O"}};},
      range:async(a,b)=>{
        reads.push({name,filters,a});
        if(name==="facility_review_followups")assert.deepEqual(params,{p_org:"O",p_facility:"F"});
        else {assert.equal(filters.organization_id,"O");assert.equal(filters.facility_id,"F");}
        if(stale&&name==="facility_pm_plans")current=false;
        if(failure&&name==="facility_assets"&&a===100)return {error:new Error("page failure")};
        return {data:tables[name].slice(a,b+1)};
      }};
    return q;
  };
  const client={from:make,rpc:make};
  return {run:()=>exportFacilityDossier(client,"O","F",{facility:"untrusted wrong site name"},()=>current),
    read:()=>blob,clicks:()=>clicks,reads};
}

test("scoped Arabic dossier retains original current disputed sources, all asset pages, active PM and open follow-ups",async t=>{
  const ctx=fixture(t);await ctx.run();assert.equal(ctx.clicks(),1);
  const bytes=new Uint8Array(await ctx.read().arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[239,187,191]);
  const csv=await ctx.read().text();
  for(const value of ["فندق الاختبار","CODE100","opaque100",'معدات, ""تجربة""',"2026-12-01","manual","2026-12-02","active round followup"])assert.ok(csv.includes(value),value);
  assert.ok(csv.includes(`"'  =ref,""ملف"""`));assert.equal(csv.match(/Conflicting sources/g).length,2);assert.ok(!csv.includes("obsolete-value"));assert.ok(!csv.includes("wrong site name"));
  assert.deepEqual(ctx.reads.filter(x=>x.name==="facility_assets").map(x=>x.a),[0,100]);
  assert.equal(ctx.reads.find(x=>x.name==="facility_pm_plans").filters.paused_at,null);
  assert.deepEqual(ctx.reads.find(x=>x.name==="facility_memory_records").filters.verified_at,["is",null]);
});
test("cross-site row aborts all download",async t=>{const ctx=fixture(t,{leak:true});await assert.rejects(ctx.run,/scope mismatch/);assert.equal(ctx.clicks(),0);});
test("changing the selected site cancels download",async t=>{const ctx=fixture(t,{stale:true});await ctx.run();assert.equal(ctx.clicks(),0);});
test("a later page error never yields a partial or cached dossier",async t=>{const ctx=fixture(t,{failure:true});await assert.rejects(ctx.run,/page failure/);assert.equal(ctx.clicks(),0);});
