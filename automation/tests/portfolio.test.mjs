import test from "node:test";
import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en"}};
const {portfolioPage,orderDensity,portfolioWorkbook,hasPortfolioAccess}=await import("../../command-center/enterprise/src/portfolio.js");

function fake(role,options={}) {
  const log=[];
  const member={organization_id:"org1",user_id:"user1",role,active:true,...options.member};
  const fixtures=Array.from({length:11},(_,i)=>({id:String(i+1).padStart(2,"0"),name:"Facility "+i}));
  const client={auth:{getUser:async()=>({data:{user:{id:"user1"}}})},from(table){
    const call={table};log.push(call);
    const q={
      select(fields,params){call.fields=fields;call.head=params?.head;return q;},
      eq(k,v){call[k]=v;return q;},in(k,v){call[k]=v;return q;},order(k){call.order=k;return q;},gt(k,v){call.gt=v;return q;},
      limit(n){call.limit=n;return q;},is(k,v){call[k]=v;return q;},abortSignal(signal){call.signal=signal;return q;},
      async maybeSingle(){return {data:member}},
      then(resolve,reject){
        let v={data:[],count:0};
        if(table==="facilities") v={data:fixtures.filter(r=>!call.gt || r.id>call.gt).slice(0,Math.min(2,call.limit))};
        if(table==="facility_assets")v=options.failAsset?{error:"denied"}:{count:5};
        if(table==="facility_work_orders" && call.head)v={count:2};
        if(table==="facility_work_orders" && !call.head)v={data:[{created_at:"2026-11-27T23:59:00Z"}]};
        return Promise.resolve(v).then(resolve,reject);
      }
    };return q;
  }};
  return {client,log};
}
test("management roles require active exact organization membership for the authenticated subject",async()=>{
  for (const [role,allowed] of [["owner",true],["approver",true],["viewer",false],["analyst",false],["finance",false]]) {
    const f=fake(role);assert.equal(await hasPortfolioAccess(f.client,"org1",new AbortController().signal),allowed);
    assert.equal(f.log[0].user_id,"user1");assert.equal(f.log[0].organization_id,"org1");assert.equal(f.log[0].active,true);
  }
  for(const member of [{active:false},{user_id:"other"},{organization_id:"other"}]){
    assert.equal(await hasPortfolioAccess(fake("owner",{member}).client,"org1",new AbortController().signal),false);
  }
});
test("page lookahead and bounded counts survive a server cap below the requested page size",async()=>{
  const f=fake("owner"),signal=new AbortController().signal;
  const a=await portfolioPage(f.client,"org1",null,signal),b=await portfolioPage(f.client,"org1",a.next,signal);
  assert.equal(a.rows.length,8);assert.equal(b.rows.length,3);assert.equal(b.next,null);
  assert.equal(new Set([...a.rows,...b.rows].map(r=>r.name)).size,11);
  assert.equal(a.rows[0].latest,"2026-11-28");
  assert(f.log.every(q=>q.organization_id==="org1"));
  assert(f.log.filter(q=>q.table!=="facilities").every(q=>q.facility_id || q["facility_assets.facility_id"]));
});
test("missing rows and zero denominators leave density unavailable, zero activity remains zero",async()=>{
  const a=await portfolioPage(fake("owner",{failAsset:true}).client,"org1",null,new AbortController().signal);
  assert.equal(a.rows[0].assets,null);assert.equal(a.rows[0].outstanding,2);
  for(const args of [[2,0],[null,5],[2,null],[-1,5]])assert.equal(orderDensity(...args),null);
  assert.equal(orderDensity(0,5),0);assert.equal(orderDensity(1,3),33.3);
});
test("scope cancellation stops the read",async()=>{
  const c=new AbortController();c.abort();await assert.rejects(portfolioPage(fake("owner").client,"org1",null,c.signal));
});
test("SpreadsheetML encodes strings as literal text, numbers as numeric and unavailable cells as blank",()=>{
  const doc=portfolioWorkbook([['=cmd(& 1 <2>)',0,null],['العليا','a\u0001b',12.5]]);
  assert.match(doc,/ss:Type="String">=cmd\(&amp; 1 &lt;2&gt;\)/);
  assert.match(doc,/ss:Type="Number">12.5<\/Data>/);assert.match(doc,/<Cell\/>/);
  assert(!doc.includes('ss:Formula') && doc.includes('ab') && !doc.includes('\u0001'));
});
