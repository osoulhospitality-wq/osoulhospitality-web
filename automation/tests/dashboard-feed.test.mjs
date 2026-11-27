import test from "node:test";
import assert from "node:assert/strict";
import {feedLabels, matchesScope, mergeFeeds, scopeOf, terminalShare} from "../../command-center/app/request-feed.js";

const issue = (number, fields = {}) => ({
  number, title:"Review contractor scope", body:"", state:"open", labels:[], updated_at:"2026-01-01T00:00:00Z", ...fields
});

for (const [name, fields, expected] of [
  ["QA label", {labels:[{name:"qa"}]}, "pilot"],
  ["workflow QA label", {labels:["dragon-qa"]}, "pilot"],
  ["explicit test label", {labels:["dragon-test"]}, "pilot"],
  ["pilot label wins conflict", {labels:["qa","dragon-operational"]}, "pilot"],
  ["historical live-start", {title:"[LIVE-START 03] Arabic licensing"}, "pilot"],
  ["old Arabic pilot declaration", {body:"بيانات تجريبية مصطنعة"}, "pilot"],
  ["legacy production health check", {title:"Dragon Production Health Check — August"}, "pilot"],
  ["submitted Arabic pilot", {body:"- مصدر الطلب: Osoul Command Center v13.0.0"}, "pilot"],
  ["submitted English pilot", {body:"- Source: Osoul Command Center v13.0.0"}, "pilot"],
  ["legacy end-to-end", {title:"Dragon E2E Acceptance Test"}, "pilot"],
  ["operational classification", {labels:["dragon-operational"]}, "operational"],
  ["unclassified failure", {labels:["dragon-failed"]}, "unclassified"],
  ["routine testing is real work", {title:"Test the pump during maintenance",body:"Arrange an acceptance test."}, "unclassified"]
]) test(name, () => assert.equal(scopeOf(issue(1,fields)), expected));

test("work queue retains unclassified failures, including standalone terminal labels", () => {
  assert.ok(feedLabels.includes("dragon-failed"));
  assert.ok(matchesScope(issue(61,{labels:["dragon-failed"]}),"queue"));
});
test("pilot records stay in pilot and all scopes", () => {
  const sample = issue(38,{title:"[LIVE-START 01] Dispatch",labels:["dragon-completed"]});
  assert.ok(!matchesScope(sample,"queue"));
  assert.ok(matchesScope(sample,"pilot"));
  assert.ok(matchesScope(sample,"all"));
});
test("all four status feeds are covered", () => assert.deepEqual(new Set(feedLabels),new Set(["dragon-task","dragon-processing","dragon-completed","dragon-failed"])));
test("merge keeps the newest representation across status transitions", () => {
  const initial = issue(5,{labels:["dragon-task"]});
  const final = issue(5,{labels:["dragon-completed"],updated_at:"2026-02-01T00:00:00Z"});
  assert.deepEqual(mergeFeeds([[initial],[final],[initial]]),[final]);
});
test("pull requests and malformed IDs are excluded", () => {
  assert.deepEqual(mergeFeeds([[issue(4,{pull_request:{}}),issue(null)],[]]),[]);
});
test("no terminal observations yield an undefined share", () => {
  assert.equal(terminalShare({completed:0,failed:0,conflict:0}),null);
});
test("failed and conflicting observations enter the denominator", () => {
  assert.equal(terminalShare({completed:2,failed:1,conflict:1}),50);
});
test("a confirmed failure yields a real zero", () => {
  assert.equal(terminalShare({completed:0,failed:1,conflict:0}),0);
});
