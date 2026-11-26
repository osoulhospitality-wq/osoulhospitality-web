import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("Private draft, second-person approval, assigned field order, evidence and restore", async t => {
  const db = new PGlite({extensions:{pgcrypto}});
  t.after(()=>db.close());
  const evidence = [];
  t.after(async()=>{if(process.env.DRAQON_FIELD_REPORT) await writeFile(process.env.DRAQON_FIELD_REPORT,JSON.stringify(evidence,null,2));});
  async function check(name, input, expected, operation) {
    const start=performance.now();
    let actual;
    try { actual=await operation(); } catch (error) { actual=error.code || error.message; }
    evidence.push({name, input, expected, actual, status:actual===expected?"pass":"fail", duration_ms:performance.now()-start, external_cost_usd:0, source:"WASM PostgreSQL with synthetic Supabase session", corrective_action:actual===expected?null:"Review regression before release"});
    assert.equal(actual,expected,name);
  }
  const scalar=async (sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const org=randomUUID(), other=randomUUID(), op=randomUUID(), owner=randomUUID(), outsider=randomUUID(), siteTech=randomUUID(), shiftLead=randomUUID();
  const asset=randomUUID(), otherAsset=randomUUID(), id=randomUUID(), fac=randomUUID(), secondFac=randomUUID();
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,owner_id text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
  `);
  for(const file of ["command-center/enterprise/schema.sql","supabase/migrations/20261125193000_add_facility_operations.sql","supabase/migrations/20261126190000_draqon_field_handoff.sql"]){
    await db.exec(await readFile(new URL("../../"+file,import.meta.url),"utf8"));
  }
  const claims=async (uid,aal="aal2")=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,aal})]);
  await db.query("insert into auth.users(id) values ($1),($2),($3),($4),($5)",[op,owner,outsider,siteTech,shiftLead]);
  await claims(owner);
  await db.query("insert into public.organizations(id,name,created_by) values($1,'Hotel A',$2)",[org,owner]);
  await claims(outsider);
  await db.query("insert into public.organizations(id,name,created_by) values($1,'Hotel B',$2)",[other,outsider]);
  await db.query("insert into public.organization_members(organization_id,user_id,full_name,role) values($1,$2,'Coordinator','analyst'),($1,$3,'Site technician','analyst'),($1,$4,'Shift lead','approver')",[org,op,siteTech,shiftLead]);
  await db.query("insert into public.facilities(id,organization_id,name) values($1,$2,'Hotel A'),($3,$4,'Hotel B')",[fac,org,secondFac,other]);
  await db.query("insert into public.facility_assets(id,facility_id,organization_id,asset_code,name) values($1,$2,$3,'AHU','Air unit'),($4,$5,$6,'P1','Pump')",[asset,fac,org,otherAsset,secondFac,other]);
  const session=async(uid,aal)=>{await db.exec("set role authenticated");await claims(uid,aal);};
  const prepare=(key=id,a=asset,summary="Inspect cooling",issue=79)=>scalar("select public.draqon_prepare_field($1,$2,$3,$4,$5)",[org,key,a,summary,issue]);
  const approve=(assignee=op)=>scalar("select public.draqon_approve_field($1,$2,$3)",[org,id,assignee]);
  await session(op);
  await check("prepare","authorised operator + asset + issue",id,()=>prepare());
  await check("retry intake","same reference and payload",id,()=>prepare());
  await check("conflicting retry","same reference, updated description","23505",()=>prepare(id,asset,"New instructions"));
  await check("duplicate issue","same org and public issue, new key","23505",()=>prepare(randomUUID()));
  await check("invalid asset boundary","asset belonging to another site organization","23503",()=>prepare(randomUUID(),otherAsset,"Inspect pump",100));
  await check("operator approval","nonapprover","42501",()=>approve());
  await session(owner);
  await check("stop default","pilot not enabled","55000",()=>approve());
  await check("no side effects when stopped","order count",0,()=>scalar("select count(*)::int from public.facility_work_orders"));
  await db.exec("reset role");
  await db.query("insert into private.draqon_field_pilot values($1,true)",[org]);
  await session(shiftLead);
  await db.exec("reset role");
  await db.query("update public.organization_members set active=false where organization_id=$1 and user_id=$2",[org,shiftLead]);
  await session(shiftLead);
  await check("revoked approving membership","session role withdrawn before approval","42501",()=>approve());
  await db.exec("reset role");
  await db.query("update public.organization_members set active=true where organization_id=$1 and user_id=$2",[org,shiftLead]);
  await session(owner,"aal1");
  await check("verified session required","owner without verified session","42501",()=>approve());
  await session(outsider);
  await check("role-scoped queue","user in another organization",0,()=>scalar("select count(*)::int from public.draqon_field_proposals"));
  await session(owner);
  await check("assignee membership","nonmember assignee","23514",()=>approve(outsider));
  const ownDraft=randomUUID();await prepare(ownDraft,asset,"Assess vibration",80);
  await check("separate approvals","requester also approver","42501",()=>scalar("select public.draqon_approve_field($1,$2,$3)",[org,ownDraft,op]));
  const order=await approve();
  await check("field bridge","created order status","open",()=>scalar("select status from public.facility_work_orders where id=$1",[order]));
  await check("retry approval","same approved reference",order,()=>approve());
  await check("prevent reassignment on replay","different assignee","23505",()=>approve(owner));
  await check("approval evidence","recorded approver",owner,()=>scalar("select approved_by from public.draqon_field_proposals where id=$1",[id]));
  await check("assigned owner","recorded assignee",op,()=>scalar("select assigned_to from public.draqon_field_proposals where id=$1",[id]));
  await db.exec("reset role");
  await db.query("update private.draqon_field_pilot set enabled=false where organization_id=$1",[org]);
  await session(owner);
  await check("paused replay reads receipt","existing work despite paused new issuance",order,()=>approve());
  await session(siteTech);
  const pausedDraft=randomUUID();
  await check("paused draft can be prepared","private manual preparation while issuing new orders paused",pausedDraft,()=>prepare(pausedDraft,asset,"Plan routine inspection",81));
  await session(owner);
  await check("paused draft cannot issue new order","pending draft after pause","55000",()=>scalar("select public.draqon_approve_field($1,$2,$3)",[org,pausedDraft,siteTech]));
  await session(siteTech);
  const advance=async status=>scalar("update public.facility_work_orders set status=$1 where id=$2 returning status",[status,order]);
  await check("field execution","open order to active","in_progress",()=>advance("in_progress"));
  await session(owner);
  await check("closure requires visit","no visit yet","23514",()=>advance("completed"));
  await session(siteTech);
  await db.query("insert into public.facility_visits(organization_id,work_order_id,findings) values($1,$2,'Site inspection recorded')",[org,order]);
  await check("closure requires approver","visit present but operator","23514",()=>advance("completed"));
  await session(shiftLead);
  await check("accepted closure","authorised person and linked visit","completed",()=>advance("completed"));
  await db.exec("reset role");
  const eventActor=eventType=>scalar("select actor_id from public.draqon_field_events where proposal_id=$1 and event_type=$2",[id,eventType]);
  for(const [kind,actor] of [["prepared",op],["issued",owner],["started",siteTech],["visit_recorded",siteTech],["closed",shiftLead]]){
    await check("audited actor for "+kind,kind+" identity from authenticated session",actor,()=>eventActor(kind));
  }
  await check("transition chronology","five timestamped events despite retries",5,()=>scalar("select count(*)::int from public.draqon_field_events where proposal_id=$1 and recorded_at is not null",[id]));
  await session(siteTech);
  await check("member cannot alter field history","change existing event","42501",()=>db.query("update public.draqon_field_events set actor_id=$1 where proposal_id=$2",[owner,id]));
  await check("member cannot append field history","insert independent event","42501",()=>db.query("insert into public.draqon_field_events(organization_id,proposal_id,event_type,entity_id,actor_id) values($1,$2,'visit_recorded',$3,$4)",[org,id,randomUUID(),siteTech]));
  await session(outsider);
  await check("cross-organization history invisible","outside member reads audit history",0,()=>scalar("select count(*)::int from public.draqon_field_events"));
  await session(shiftLead,"aal1");
  await check("MFA to view event records","authorized role at lower assurance",0,()=>scalar("select count(*)::int from public.draqon_field_events"));
  await db.exec("reset role");
  await check("append-only history","administrative UPDATE blocked by append-only trigger","55000",()=>db.query("update public.draqon_field_events set actor_id=$1 where proposal_id=$2",[owner,id]));
  const snapshot=await db.dumpDataDir("gzip");
  const restored=new PGlite({loadDataDir:snapshot,extensions:{pgcrypto}});
  try {
    await check("restore and reconcile","independent database restored from compressed directory",order,async()=> (await restored.query("select p.work_order_id from public.draqon_field_proposals p join public.facility_visits v on v.work_order_id=p.work_order_id join public.facility_work_orders w on w.id=v.work_order_id where p.id=$1 and w.status='completed'",[id])).rows[0].work_order_id);
    await check("restored closure provenance","person who approved field closure survives restore",shiftLead,async()=>(await restored.query("select actor_id from public.draqon_field_events where proposal_id=$1 and event_type='closed'",[id])).rows[0].actor_id);
  } finally {await restored.close();}
});

test("Field UI preserves the correct identity, retry key and reconciliation message", async t=>{
  // Small in-process DOM fixture. No browser layout, remote account or network.
  class Element {
    listeners = new Map();
    children = [];
    value = "";
    textContent = "";
    disabled = false;
    open = false;
    addEventListener(type, fn) {this.listeners.set(type,fn);}
    fire(type) {return this.listeners.get(type)?.({preventDefault(){}});}
    replaceChildren(...children) {this.children=children;}
    append(...children) {this.children.push(...children);}
    add(option) {this.children.push(option);}
  }
  const ids=["draqon-field-handoff","organization-select","draqon-field-form","draqon-field-queue","draqon-field-status"];
  const [panel,organization,form,queue,status]=ids.map(()=>new Element());
  const lookup=Object.fromEntries(ids.map((id,i)=>[id,[panel,organization,form,queue,status][i]]));
  const oldDocument=Object.getOwnPropertyDescriptor(globalThis,"document"), oldOption=Object.getOwnPropertyDescriptor(globalThis,"Option");
  t.after(()=>{
    if(oldDocument)Object.defineProperty(globalThis,"document",oldDocument);else delete globalThis.document;
    if(oldOption)Object.defineProperty(globalThis,"Option",oldOption);else delete globalThis.Option;
  });
  globalThis.document={documentElement:{lang:"en"},getElementById:id=>lookup[id],createElement:()=>new Element()};
  globalThis.Option=class {constructor(label,value){this.label=label;this.value=value;}};
  const submit=new Element();
  form.querySelector=()=>submit;
  form.elements={asset:new Element(),issue:new Element(),summary:new Element()};
  form.reset=()=>Object.values(form.elements).forEach(el=>{el.value=""});
  let identity="owner-a", authEvent, mode="reject";
  const proposal={id:"P1",github_issue:79,summary:"Inspect cooling",submitted_by:"operator"};
  const members=[{user_id:"operator",role:"analyst",full_name:"Coordinator"},{user_id:"owner-a",role:"owner",full_name:"Owner"}];
  const source={facility_assets:[{id:"asset",asset_code:"AHU",name:"Air unit"}],draqon_field_proposals:[proposal],organization_members:members};
  const calls=[];
  let rejectPending;
  const client={
    from(name){
      const response={select(){return this},eq(){return this},order(){return this},limit(){return this},
        then(resolve,reject){return Promise.resolve({data:source[name]}).then(resolve,reject)}};
      return response;
    },
    auth:{getUser:async()=>({data:{user:{id:identity}}}),onAuthStateChange(fn){authEvent=fn;}},
    rpc(name,params){
      calls.push({name,params});
      if(mode==="pending")return new Promise((_res,reject)=>{rejectPending=reject});
      return Promise.reject(Error("Synthetic network interruption"));
    }
  };
  const records=[];
  async function check(name,input,expected,fn) {
    const start=performance.now();
    const actual=await fn();
    const result=JSON.stringify(expected)===JSON.stringify(actual)?"pass":"fail";
    records.push({name,input,expected,actual,status:result,duration_ms:performance.now()-start,external_cost_usd:0,source:"In-process field UI and synthetic RPC/DOM",corrective_action:result==="pass"?null:"Repair UI regression"});
    assert.deepEqual(actual,expected,name);
  }
  t.after(async()=>{
    if(process.env.DRAQON_FIELD_REPORT) {
      const file=process.env.DRAQON_FIELD_REPORT;
      const sql=JSON.parse(await readFile(file,"utf8"));
      await writeFile(file,JSON.stringify([...sql,...records],null,2));
    }
  });
  const {setupFieldHandoff}=await import("../../command-center/enterprise/src/field-handoff.js");
  setupFieldHandoff(client);
  authEvent("INITIAL_SESSION",{user:{id:identity}});
  organization.value="tenant-A";panel.open=true;panel.fire("toggle");
  await new Promise(resolve=>setImmediate(resolve));
  const row=queue.children[0], [label,approve]=row.children;
  label.children[0].value="operator";
  await approve.fire("click");
  await check("ambiguous issue response","approved RPC loses connection",true,()=>status.textContent.includes("unconfirmed") && !approve.disabled);
  form.elements.issue.value="79";form.elements.asset.value="asset";form.elements.summary.value="Inspect cooling";
  await form.fire("submit");const originalId=calls.at(-1).params.p_id;
  await form.fire("submit");
  await check("uncertain preparation reuses reference","identical retry",originalId,()=>calls.at(-1).params.p_id);
  authEvent("SIGNED_IN",{user:{id:identity}});
  await check("same-identity refocus retains draft","repeat sign-in for same user",[true,"Inspect cooling"],()=>[panel.open,form.elements.summary.value]);
  mode="pending";
  const prior=form.fire("submit");
  authEvent("SIGNED_OUT",null);
  identity="owner-b";authEvent("SIGNED_IN",{user:{id:identity}});
  panel.open=true;form.elements.summary.value="New session's draft";status.textContent="new-status";
  rejectPending(Error("Old response"));await prior;
  await check("old identity cannot alter new session","same organization, replaced account, pending rejection",
    ["new-status","New session's draft",false],()=>[status.textContent,form.elements.summary.value,submit.disabled]);
  organization.value="tenant-B";organization.fire("change");
  await check("tenant change clears old queue and draft","switch property workspace",[false,0,""],()=>[panel.open,queue.children.length,form.elements.summary.value]);
});
