import test from "node:test";
import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en"}};
const {pilotScope,coverageMix,serviceMix}=await import("../../command-center/enterprise/src/facility-pilot.js");
const buildings=[{code:"a",name:"North"},{code:"b",name:"South"}];
const scenario={sites:[{code:"a",name:{ar:"أ",en:"North"},visits:[{id:"trial"}]},
  {code:"b",contracts:[{id:"c"}]},{code:"outside",facts:[{label:"unused"}]}]};
test("pilot portfolio uses only buildings in the selected client payload",()=>{
  assert.deepEqual(pilotScope(scenario,buildings).map(s=>s.code),["a","b"]);
  assert.equal(pilotScope(scenario,buildings,"outside").length,0);
});
test("pilot drill down never borrows facts, agreements or visits from another site",()=>{
  const [south]=pilotScope(scenario,buildings,"b");assert.equal(south.name,"South");
  assert.deepEqual(south.visits,[]);assert.equal(south.contracts[0].id,"c");
  assert.deepEqual(pilotScope(null,buildings),[]);
});

test("coverage counts checklist headings once even when a heading has several agreements",()=>{
  const site={coverage:[
    {key:"S01",status:"documented",contractIds:["a","b"]},
    {key:"S02",status:"simulated",contractIds:["c"]},
    {key:"S03",status:"reference",benchmark:{annualCost:2500},contractIds:[]},
    {key:"S04",status:"unknown",contractIds:[]}
  ],contracts:[]};
  assert.deepEqual(coverageMix(site),{documented:1,simulated:1,reference:2});
});
test("reference rates do not turn into local agreements; an explicit zero remains a valid price",()=>{
  const contracts=[{status:"documented",annualCost:0},{status:"simulated",annualCost:1200},
    {status:"documented",annualCost:null,benchmark:{annualCost:500}}];
  assert.deepEqual(serviceMix(contracts),{documented:1,simulated:1,reference:1});
  assert.deepEqual(coverageMix({contracts}),serviceMix(contracts));
  assert.deepEqual(coverageMix({coverage:[],contracts}),{documented:0,simulated:0,reference:0});
});
