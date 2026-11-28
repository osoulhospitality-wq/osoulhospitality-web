import test from "node:test";
import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en-SA"}};
const {contractPortfolio,comparableQuotes,readCommercialRows}=await import("../../command-center/enterprise/src/commercial-intelligence.js");

const active={name:"Agreement",status:"active",annual_value:"123.45",currency:"SAR",end_date:"2028-03-01",notice_days:1};
test("contract values are by currency, retain zero, count unknowns and exclude non-active records",()=>{
  const rows=[active,{...active,annual_value:null},{...active,annual_value:0},{...active,currency:"USD",annual_value:"0.06"},{...active,status:"expired",annual_value:20}];
  const result=contractPortfolio(rows,"2028-03-01");
  assert.deepEqual(result.totals,[{currency:"SAR",cents:12345,count:3,priced:2},{currency:"USD",cents:6,count:1,priced:1}]);
  assert.equal(result.notices[0].notice,"2028-02-29");
  assert.equal(result.notices[0].past,true);
});
test("invalid or absent renewal metadata cannot imply that a renewal deadline passed",()=>{
  assert.equal(contractPortfolio([{...active,end_date:null},{...active,end_date:"2028-02-31"},{...active,notice_days:null}],"2028-01-01").notices.length,0);
  assert.equal(contractPortfolio([active],"2028-02-29").notices[0].past,false);
});
const quote={supplier_id:"S",supplier:{name:"Supplier"},quote_date:"2026-06-01",currency:"SAR",tax_rate:15,delivery_cost:0,discount:0,quote_number:"June"};
const line={product_id:"P",description:"Filter M6",quantity:5,standard_qty:4,pack_price:20,unit:"ea",quote};
const newer={...line,pack_price:30,quote:{...quote,quote_date:"2026-07-01",quote_number:"July"}};
const asof="2026-08-01";
test("latest two distinct matching quotation dates with normalized unit rate, historic dates and source references",()=>{
  const older={...line,pack_price:120,quote:{...quote,quote_date:"2026-05-01"}};
  const [pair]=comparableQuotes([newer,line,older,newer],asof);
  assert.deepEqual([pair.before,pair.after,pair.percent,pair.start,pair.end,pair.references],[5,7.5,50,"2026-06-01","2026-07-01","June · July"]);
});
test("cannot compare different suppliers, identifiers, specifications, units, quantities or quote charges",()=>{
  for (const changes of [{product_id:"P2"},{description:"Filter M8"},{unit:"kg"},{quantity:8},{standard_qty:8},{product_id:null}]){
    assert.equal(comparableQuotes([line,{...newer,...changes}],asof).length,0);
  }
  for (const changes of [{supplier_id:"X"},{currency:"USD"},{discount:12},{tax_rate:0},{delivery_cost:4},{quote_date:"2030-01-01"},{delivery_cost:null}]){
    assert.equal(comparableQuotes([line,{...newer,quote:{...newer.quote,...changes}}],asof).length,0);
  }
});
test("suppress ambiguous same-day prices and invalid inputs; keep true zero values",()=>{
  assert.equal(comparableQuotes([line,newer,{...newer,pack_price:29}],asof).length,0);
  assert.equal(comparableQuotes([line,{...newer,pack_price:null}],asof).length,0);
  assert.equal(comparableQuotes([{...line,pack_price:0},newer],asof)[0].percent,null);
  assert.equal(comparableQuotes([line,{...newer,pack_price:0}],asof)[0].percent,-100);
});
function mockClient(pages, log){
  return {from(table){const record={table};
    const q={select(columns){record.columns=columns;return q},eq(col,value){record.scope=[col,value];return q},gt(col,value){record.gt=[col,value];return q},order(col){record.order=col;return q},limit(n){record.limit=n;return q},
      async abortSignal(signal){log.push(record);assert.equal(signal.aborted,false);return pages.shift()}};
    return q;
  }};
}
test("keyset pagination reads all authorized pages, including with server cap below the page size",async()=>{
  const log=[],pages=[{data:[{id:"a"}]},{data:[{id:"b"}]},{data:[]}];
  const result=await readCommercialRows(mockClient(pages,log),"contracts","id","orgA",new AbortController().signal);
  assert.deepEqual(result,[{id:"a"},{id:"b"}]);
  assert.deepEqual(log.map(q=>q.gt?.[1]),[undefined,"a","b"]);
  assert(log.every(q=>q.scope[0]==="organization_id" && q.scope[1]==="orgA" && q.order==="id"));
});
test("partial reads, stalled pagination and aborted reads cannot contribute partial totals",async()=>{
  for(const pages of [[{data:[{id:"a"}]},{error:"denied"}],[{data:[{id:"a"}]},{data:[{id:"a"}]}]]){
    await assert.rejects(readCommercialRows(mockClient(pages,[]),"contracts","id","orgA",new AbortController().signal));
  }
  const ctrl=new AbortController();ctrl.abort();
  await assert.rejects(readCommercialRows(mockClient([],[]),"quotes","id","orgA",ctrl.signal),/cancelled/);
});
