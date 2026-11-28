import test from "node:test";
import assert from "node:assert/strict";
import { AGENTS, getAgent, REGISTRY_VERSION } from "./registry.mjs";

test("all requested executive, board, marketing and specialist roles resolve", () => {
  const ids = new Set(AGENTS.map(agent => agent.id));
  assert.equal(ids.size, AGENTS.length);
  for (const id of ["CEO","COS","CSO","CFO","COO","CCO","CGO","CTO","CAIO","CDO","CHRO","CLO","CXO","CQO","PMO","CISO","CPO","PRODUCT","CMO"]) {
    assert.ok(ids.has(id), id);
  }
  for (const [prefix, size] of [["M",22],["S",6],["F",9],["O",8],["C",9],["T",9],["A",8]]) {
    for (let i=1; i<=size; i++) assert.ok(ids.has(prefix + String(i).padStart(2,"0")));
  }
  assert.equal(AGENTS.filter(a=>a.id.startsWith("BOARD_")).length,4);
  assert.equal(AGENTS.filter(a=>a.department==="audit").length,10);
});
test("every assignment produces a unique system instruction and traceable deliverable",()=>{
  assert.equal(new Set(AGENTS.map(a=>a.systemPrompt)).size,AGENTS.length);
  assert.equal(new Set(AGENTS.map(a=>a.outputs[0])).size,AGENTS.length);
  for (const a of AGENTS) {
    assert.equal(a.version,REGISTRY_VERSION);
    assert.equal(a.history.roleId,a.id);
    assert.equal(a.history.tenantRequired,true);
    assert.ok(a.inputs[0] && a.kpis[0] && a.knowledgeSources.length && a.tools.length);
    assert.ok(a.systemPrompt.includes(a.nameAr) && a.systemPrompt.includes(a.outputs[0]));
    assert.equal(a.budget.authorizedSpend,0);
    assert.equal(a.permissions.externalWrites,false);
    assert.equal(a.permissions.maySelfApprove,false);
    assert.ok(Object.isFrozen(a.permissions));
  }
});
test("management trees terminate at the owner and substitutes are declared or manual",()=>{
  for (const a of AGENTS) {
    let manager=a.manager; const seen=new Set([a.id]);
    while(manager!=="OWNER"){
      assert.ok(getAgent(manager),"unknown manager "+manager);
      assert.ok(!seen.has(manager),"management cycle");seen.add(manager);
      manager=getAgent(manager).manager;
    }
    if(a.substitute!==null) assert.ok(a.substitute!==a.id && getAgent(a.substitute));
  }
  assert.equal(getAgent("invented"),undefined);
});
test("audit reports to owner, marketing QA is outside the production chain",()=>{
  for(const a of AGENTS.filter(a=>a.department==="audit")){
    assert.equal(a.manager,"BOARD_AUDIT");
    assert.equal(a.escalation,"OWNER");
    assert.equal(a.permissions.independentReview,true);
  }
  assert.equal(getAgent("BOARD_AUDIT").manager,"OWNER");
  assert.equal(getAgent("M22").manager,"CQO");
  assert.equal(getAgent("M13").permissions.independentReview,false);
});
