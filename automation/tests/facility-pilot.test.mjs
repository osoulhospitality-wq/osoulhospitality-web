import test from "node:test";
import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en"}};
const {pilotScope}=await import("../../command-center/enterprise/src/facility-pilot.js");
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
