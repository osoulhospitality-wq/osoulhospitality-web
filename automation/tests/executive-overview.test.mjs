import test from "node:test";
import assert from "node:assert/strict";
globalThis.document = {documentElement:{lang:"en-SA"}};
const {periodInRiyadh, completionRatio, readExecutiveOverview, decisionItems} = await import("../../command-center/enterprise/src/executive-overview.js");

test("month and day roll at Riyadh midnight including year boundary", () => {
  assert.deepEqual(periodInRiyadh(new Date("2025-12-31T21:00:00Z"),7), {today:"2026-01-01",first:"2026-01-01",end:"2026-01-07"});
  assert.deepEqual(periodInRiyadh(new Date("2024-02-28T21:00:00Z"), 7), {today:"2024-02-29",first:"2024-02-01",end:"2024-03-06"});
});
test("PPM completion is valid only with a complete issued cohort", () => {
  assert.equal(completionRatio(4,4,1),0.25);
  assert.equal(completionRatio(8,8,0),0);
  assert.equal(completionRatio(2,2,2),1);
  for(const inputs of [[0,0,0],[5,4,3],[2,2,3],[2,2,-1],[null,0,0],[2.5,2.5,0],[2,2,null]])
    assert.equal(completionRatio(...inputs),null);
});

function testClient(responses) {
  const requests = [];
  function from(table) {
    const calls = []; const index = requests.length;
    requests.push({table,calls});
    const q = {then(resolve,reject) {return Promise.resolve().then(() => responses(index)).then(resolve,reject)}};
    for(const name of ["select","eq","gte","lte","lt","in","order","is","limit"]){
      q[name] = (...args) => { calls.push([name,...args]);return q; };
    }
    return q;
  }
  return {from, requests};
}

test("every operational read binds site and organization and separates issued, pending and unscheduled evidence", async () => {
  const client = testClient(()=>({count:2,data:[]}));
  const period = {today:"2026-11-28", first:"2026-11-01"};
  const result = await readExecutiveOverview(client,"org-a","site-a",period);
  assert.equal(result.issued,2);assert.equal(result.completed,2);
  assert.equal(client.requests.length,6);
  const has = (r, ...parts) => r.calls.some(c => JSON.stringify(c)===JSON.stringify(parts));
  for(const request of client.requests){
    assert.ok(has(request,"eq","organization_id","org-a"));assert.ok(has(request,"eq","facility_id","site-a"));
    assert.equal(request.calls.filter(c => c[0]==="select").length,1);
    if(request.table==="facility_pm_occurrences"&&!has(request,"lt","due_on",period.today)){
      assert.ok(has(request,"gte","due_on",period.first));assert.ok(has(request,"lte","due_on",period.today));
    }
  }
  assert.ok(client.requests.some(r=>has(r,"eq","facility_work_orders.status","completed")));
  assert.ok(client.requests.some(r=>has(r,"is","field_form_reviews",null)&&has(r,"eq","status","submitted")));
  assert.ok(client.requests.some(r=>has(r,"in","facility_work_orders.status",["open","in_progress"])&&has(r,"lt","due_on",period.today)));
  assert.ok(client.requests.some(r=>has(r,"is","paused_at",null)&&has(r,"lt","next_due_on",period.today)));
});
test("query errors are preserved for individual sources and never converted to zero", async () => {
  const client = testClient(()=>{throw Error("offline")});
  const result = await readExecutiveOverview(client,"o","f",periodInRiyadh());
  assert.deepEqual([result.issued,result.known,result.completed,result.waiting],[null,null,null,null]);
  assert.ok(result.overdue.error);assert.ok(result.pending.error);
});

test("decision card separates unverified sources from zero and never invents a decision", () => {
  const byAnchor = items => Object.fromEntries(items.map(item => [item.anchor, item]));
  const unread = decisionItems({overdue:{error:true}, pending:{error:true}, waiting:{error:true}});
  assert.ok(unread.every(item => item.state === "unverified" && item.count === null));
  const clear = byAnchor(decisionItems({overdue:{count:0,data:[]}, pending:{count:0,data:[]}, waiting:{count:0,data:[]}}));
  assert.ok(Object.values(clear).every(item => item.state === "clear" && item.count === 0));
  const mixed = byAnchor(decisionItems({overdue:{count:3,data:[]}, pending:{count:0,data:[]}, waiting:{error:true}}));
  assert.equal(mixed["fm-overdue-orders"].state, "decision");
  assert.equal(mixed["fm-overdue-orders"].count, 3);
  assert.equal(mixed["fm-pending-reviews"].state, "clear");
  assert.equal(mixed["fm-overdue-plans"].state, "unverified");
});
test("every decision names the authorized role, the action and an existing evidence anchor", () => {
  const items = decisionItems({overdue:{count:1,data:[]}, pending:{count:2,data:[]}, waiting:{count:4,data:[]}});
  assert.deepEqual(items.map(item => item.anchor), ["fm-overdue-orders","fm-pending-reviews","fm-overdue-plans"]);
  for (const item of items) {
    assert.equal(item.state, "decision");
    assert.ok(item.owner && item.action && item.reason && item.label);
  }
});
