import test from "node:test";
import assert from "node:assert/strict";
globalThis.document = { documentElement: {lang:"en"} };
const { engineeringRows, riskAssessment } = await import("../../command-center/enterprise/src/engineering-intelligence.js");
const assets = [{id:"asset-1",asset_code:"CH-11",name:"Chiller"},{id:"asset-2",asset_code:"P-2",name:"Pump"}];
function documentForm(id,code,fields,day="2026-11-04",decision="accepted"){
  return { id, code, asset:"CH-11", submitted_at:day+"T13:00:00Z",
    review:[{decision,reviewed_at:day+"T15:00:00Z"}], ...fields };
}
test("rating uses accepted scale only and never manufactures a percentage",()=>{
  assert.deepEqual(riskAssessment({likelihood:"۴",impact:"٥",condition:"2",hazard:"نعم"}), {score:20,condition:2,hazard:true});
  for(const bad of ["",null,1.5,"0","6",{}]) assert.equal(riskAssessment({likelihood:bad,impact:5}).score,null);
  assert.deepEqual(riskAssessment(),{score:null,condition:null,hazard:null});
});
test("only matching registered assets receive accepted inventory, condition and linked orders",()=>{
 const rows=engineeringRows(assets,[
  documentForm("a","F03",{system:"Water",location:"Technical room"},"2026-11-02"),
  documentForm("b","F03",{system:"HVAC",location:"Roof"},"2026-11-04"),
  documentForm("c","F03",{system:"Power",location:"2"},"2026-11-05","rejected"),
  documentForm("d","F04",{likelihood:"4",impact:"5",condition:"4",hazard:"no"}),
  documentForm("e","F04",{asset:"not-registered",hazard:"yes"})
 ],[{asset_id:"asset-1",status:"completed"},{asset_id:"asset-1",status:"open"},{asset_id:"asset-3",status:"open"}]);
 assert.deepEqual(rows.map(r=>[r.asset_code,r.location,r.system,r.risk.score,r.open,r.history.length]),[
  ["CH-11","Roof","HVAC",20,1,2],["P-2","","",null,0,0]
 ]);
});
test("concurrent conflicting submissions are unknown until superseded",()=>{
 const same=[documentForm("a","F03",{location:"Floor 1"}),documentForm("b","F03",{location:"Floor 3"})];
 assert.equal(engineeringRows(assets,same,[])[0].location,"");
 assert.equal(engineeringRows(assets,[...same,documentForm("c","F03",{location:"Floor 2"},"2026-11-05")],[])[0].location,"Floor 2");
});
test("missing acceptance timestamps or asset links cannot establish evidence",()=>{
 const row={...documentForm("a","F03",{location:"Unit 12"}),review:[{decision:"accepted",reviewed_at:null}]};
 const [asset]=engineeringRows(assets,[row,documentForm("b","F04",{asset:"",hazard:"yes"})],[]);
 assert.equal(asset.location,""); assert.equal(asset.risk.hazard,null);
});
test("earliest scheduled PM retains an overdue active plan and excludes paused and unverified plans",()=>{
 const plan={asset_id:"asset-1",verified_at:"2026-11-02",next_due_on:"2026-11-20",task:"service"};
 const rows=engineeringRows(assets,[],[],[plan,{...plan,next_due_on:"2026-12-02"},{...plan,next_due_on:"2026-11-10",paused_at:"2026-11-01"},{...plan,next_due_on:"2026-11-03",verified_at:null}]);
 assert.equal(rows[0].nextPlan.next_due_on,"2026-11-20");assert.equal(rows[1].nextPlan,undefined);
});
