import test from "node:test";
import assert from "node:assert/strict";
globalThis.document = {documentElement:{lang:"en-SA"}};
const {rating,approvedFact} = await import("../../command-center/enterprise/src/facility-performance.js");
test("supplier quality preserves valid zero and localized numeric scores",()=>{
  for (const [value,expected] of [[0,0],["٠",0],["٨٧٫٥",87.5],["۱۰۰",100],["35",35]]) assert.equal(rating(value),expected);
});
test("missing and invalid supplier scores never become zero",()=>{
  for(const bad of [null,undefined,"",{},false,[],"101",-1,Infinity,"unverified","  "]) assert.equal(rating(bad),null);
});
test("building fact respects current approved, scoped fact and conflicting observations",()=>{
  const rows=[
    {key:"units",day:"2026-11-01",value:"7",approved:true},
    {key:"units",day:"2026-11-26",value:"5",approved:true},
    {key:"units",day:"2026-11-27",value:"9",approved:false},
    {key:"lifts",day:"2026-11-27",value:"0",approved:true}
  ];
  assert.equal(approvedFact(rows,"units"),"5 · 2026-11-26");
  assert.equal(approvedFact(rows,"lifts"),"0 · 2026-11-27");
  assert.equal(approvedFact(rows,"staff_total"),"Unavailable");
  assert.equal(approvedFact([...rows,{...rows[1],value:"6"}],"units"),"Conflicting sources");
});
