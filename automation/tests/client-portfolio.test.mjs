import test from "node:test";
import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en"}};
const {scopeRows}=await import("../../command-center/enterprise/src/client-reports.js");
const data=(code,amount,metric="electricity_cost",extra={})=>({building_id:code,unit:"SAR",value:amount,period:"2000-02",metric,source:"invoice",locator:"sheet",...extra});
const client=(...rows)=>({detail:{portfolioCode:"all"},facilities:[{code:"a"},{code:"b"}],observations:rows});
test("sum full matched building invoices once, without rounding drift",()=>{
  const d=client(data("a",1.21),data("b",2.42));
  assert.equal(scopeRows(d)[0].value,3.63);
  assert.equal(scopeRows(d,{code:"b"}).length,1);
  assert.equal(d.observations.length,2);
});
test("prefer printed portfolio total and preserve a real zero",()=>{
  assert.deepEqual(scopeRows(client(data("a",1),data("b",2),data("all",0))).map(r=>r.value),[0]);
});
test("incomplete, duplicate, partial, mixed-source and unassigned bills are not totalled",()=>{
  for(const rows of [[data("a",3)],[data("a",3),data("a",2)],[data("a",3),data("b",2,"electricity_cost",{range:["2000-02-01","2000-02-09"]})],
    [data("a",3),data("b",2,"electricity_cost",{source:"different"})],[data("unknown",3),data("b",2)]]){
    assert.equal(scopeRows(client(...rows)).length,0);
  }
});
test("never rebuild booking revenue, reviews or maintenance from building sums",()=>{
  for(const key of ["nightly_rental_revenue","guest_reviews","work_orders"]){
    assert.deepEqual(scopeRows(client(data("a",3,key),data("b",2,key))),[]);
  }
});
