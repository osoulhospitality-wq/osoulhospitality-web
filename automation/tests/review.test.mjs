import assert from "node:assert/strict";
import { after, test } from "node:test";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { assess, fingerprint, textFingerprint } from "../enterprise/control-policy.mjs";
import { ControlLedger } from "../enterprise/control-ledger.mjs";
import { benchmarkPackets, scoreBenchmark } from "../enterprise/review-benchmark.mjs";
import { arbitrateReview, createClaudeReviewer, REVIEW_MODEL } from "../enterprise/review.mjs";

const results = [];
const request = { tenantId: "sandbox_A", taskId: "test_101", mode: "report" };
const clear = { task_id: request.taskId, review_status: "clear", findings: [], evidence: ["E1"],
  severity: "none", recommended_fix: "", confidence: 0.8, required_tests: [], approval_requirement: false };
const controls = { policyPermits: true, sourcesVerified: true, testsPassed: true, humanApprovalRequired: false, modelsAgree: true };

function fixture({ changePacket, changeGrant, changeResponse, fetchError, httpStatus, changeRequest, noCredential, settlementError } = {}) {
  const audit = { calls: 0, reservations: 0, settlements: [], provider: null };
  const run = createClaudeReviewer({
    loadApprovedPacket: async () => {
      const packet = { tenantId: request.tenantId, taskId: request.taskId, classification: "synthetic",
        draft: "تم فحص المدخل.", evidence: [{ sourceId: "fixture_entrance", excerpt: "اكتمل فحص المدخل.", classification: "synthetic", tenantId: request.tenantId }] };
      changePacket?.(packet);
      return packet;
    },
    authorizeAndReserve: async (params) => {
      audit.reservations += 1;
      audit.grantParams = params;
      const grant = { allowed: true, reservationId: "local-reservation" };
      changeGrant?.(grant);
      return grant;
    },
    settleReservation: async (id, s) => {
      audit.settlements.push({ id, ...s });
      if (settlementError) throw new Error("settlement_unavailable");
    },
    credential: async () => noCredential ? null : "synthetic-test-marker",
    fetchImpl: async (url, options) => {
      audit.calls += 1;
      audit.provider = { url, redirect: options.redirect, timeout: options.signal instanceof AbortSignal, body: JSON.parse(options.body) };
      if (fetchError) throw new Error("synthetic transport");
      const result = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(clear) }], usage: { input_tokens: 175, output_tokens: 32 } };
      changeResponse?.(result);
      return { status: httpStatus ?? 200, ok: !httpStatus, json: async () => result };
    },
  });
  const args = { ...request };
  changeRequest?.(args);
  return { audit, execute: () => run(args) };
}

function check(id, input, expected, run) {
  test(id + " " + input, async () => {
    const start = performance.now();
    let actual;
    try { actual = await run(); } catch (err) { actual = err.message; }
    const durationMs = +(performance.now() - start).toFixed(3);
    const pass = actual === expected;
    results.push({ id, input, expected, actual, durationMs, externalCostUsd: 0, evidence: "node:test/"+id,
      status: pass ? "pass" : "fail", correction: pass ? null : "Inspect differing outcome and rerun fixture." });
    assert.equal(actual, expected);
  });
}

check("REV-01", "Approved synthetic report, per-source grant, fixed provider route and no tools", "reviewed", async () => {
  const f = fixture(); const got = await f.execute();
  assert.deepEqual(got.review, clear);
  assert.deepEqual(got.evidenceMap, { E1: "fixture_entrance" });
  assert.equal(f.audit.provider.url, "https://api.anthropic.com/v1/messages");
  assert.equal(f.audit.provider.redirect,"error"); assert.equal(f.audit.provider.timeout,true);
  assert.equal(f.audit.provider.body.model,REVIEW_MODEL); assert.equal(f.audit.provider.body.tools,undefined);
  assert.equal(f.audit.provider.body.output_config.format.schema.additionalProperties,false);
  assert.equal(f.audit.grantParams.packetDigest, got.packetDigest);
  assert.deepEqual(f.audit.settlements.map(s=>s.state),["metered"]); return "reviewed";
});
check("REV-02", "Omit original source identities and private host notes from outbound request", "minimized", async () => {
  const f=fixture({changePacket(p){p.ownerEmail="NONEXPORT-CANARY";p.evidence[0].internalNote="NONEXPORT-CANARY";}});
  await f.execute();const sent=JSON.stringify(f.audit.provider.body);
  assert.ok(!sent.includes("NONEXPORT-CANARY")&&!sent.includes("fixture_entrance")&&!sent.includes("sandbox_A"));return "minimized";
});

const invalidPackets = [
  ["REV-03","Different task identity",p=>p.taskId="other_task","review_packet_rejected"],
  ["REV-04","Different tenant on draft",p=>p.tenantId="sandbox_B","review_packet_rejected"],
  ["REV-05","Confidential packet",p=>p.classification="customer_sensitive","review_packet_rejected"],
  ["REV-06","Confidential source",p=>p.evidence[0].classification="internal","review_evidence_rejected"],
  ["REV-07","Other tenant on evidence",p=>p.evidence[0].tenantId="sandbox_B","review_evidence_rejected"],
  ["REV-08","Empty evidence set",p=>p.evidence=[],"review_packet_rejected"],
  ["REV-09","Oversized draft",p=>p.draft="a".repeat(3201),"review_packet_rejected"],
  ["REV-10","Oversized excerpt",p=>p.evidence[0].excerpt="a".repeat(601),"review_evidence_rejected"],
  ["REV-11","Repeated source",p=>p.evidence.push({...p.evidence[0]}),"duplicate_source"],
];
for(const [id,label,mutate,expected] of invalidPackets) check(id,label,expected,async()=>{
  const f=fixture({changePacket:mutate});try{await f.execute();return "accepted";}finally{assert.equal(f.audit.calls,0);assert.equal(f.audit.reservations,0);}
});
check("REV-12","Human gate or kill switch denies reservation","review_denied",async()=>{
  const f=fixture({changeGrant(g){g.allowed=false;}});try{await f.execute();return "accepted";}finally{assert.equal(f.audit.calls,0);}
});
check("REV-13","Credential unconfigured","review_credential_unavailable",async()=>{
  const f=fixture({noCredential:true});try{await f.execute();return "accepted";}finally{assert.equal(f.audit.calls,0);assert.equal(f.audit.settlements[0].state,"not_sent");}
});
check("REV-14","Provider transport drops after submission","review_transport_unavailable",async()=>{
  const f=fixture({fetchError:true});try{await f.execute();return "accepted";}finally{assert.equal(f.audit.calls,1);assert.equal(f.audit.settlements[0].state,"unknown_charge");}
});
for(const [idx,status] of [401,429,503].entries())check("REV-"+(15+idx),"Provider HTTP "+status,"review_provider_"+status,async()=>{
  const f=fixture({httpStatus:status});try{await f.execute();return "accepted";}finally{assert.equal(f.audit.calls,1);}
});
const invalidResponses=[
  ["REV-18","Output truncated",r=>r.stop_reason="max_tokens","review_not_complete"],
  ["REV-19","Provider refusal",r=>r.stop_reason="refusal","review_not_complete"],
  ["REV-20","Unexpected second response block",r=>r.content.push({...r.content[0]}),"review_not_complete"],
  ["REV-21","Invalid response syntax",r=>r.content[0].text="{","invalid_review"],
  ["REV-22","No usage receipt",r=>delete r.usage,"review_usage_missing"],
];
for(const [id,label,mutate,expected] of invalidResponses)check(id,label,expected,async()=>{
  const f=fixture({changeResponse:mutate});return (await f.execute()).review.review_status;
});
const invalidReviews=[
  ["REV-23","Wrong task id",{task_id:"other_task"},"invalid_review"],
  ["REV-24","Unknown cited evidence",{evidence:["E9"]},"invalid_review"],
  ["REV-25","Confidence out of range",{confidence:1.5},"invalid_review"],
  ["REV-26","Clear with unresolved tests",{required_tests:["verify"]},"inconsistent_clear"],
  ["REV-27","Findings without remedy",{review_status:"revise",findings:["Mismatch"]},"unsupported_finding"],
  ["REV-28","Unknown recommendation field",{execute_action:true},"invalid_review"],
  ["REV-29","Model proposes unrecognised status",{review_status:"approved"},"invalid_review"],
];
for(const [id,label,delta,expected] of invalidReviews)check(id,label,expected,async()=>{
  const f=fixture({changeResponse(r){r.content[0].text=JSON.stringify({...clear,...delta});}});return (await f.execute()).review.review_status;
});
const decisions=[
  ["REV-30","Policy denies despite agreement",{}, {policyPermits:false},"blocked_by_policy"],
  ["REV-31","No independent corroboration",{}, {sourcesVerified:false},"human_review"],
  ["REV-32","No completed tests",{}, {testsPassed:false},"human_review"],
  ["REV-33","Models disagree",{}, {modelsAgree:false},"human_review"],
  ["REV-34","High-impact approval remains mandatory",{}, {humanApprovalRequired:true},"human_review"],
  ["REV-35","Reviewer escalates",{review_status:"escalate"},{},"human_review"],
  ["REV-36","Both clear with confirmed facts",{},{},"eligible_for_policy_check"],
  ["REV-37","Noncritical correction needed",{review_status:"revise",severity:"medium"},{},"revise_and_retest"],
];
for(const [id,label,r,c,expected] of decisions)check(id,label,expected,()=>arbitrateReview({...clear,...r},{...controls,...c}));
check("REV-38","Unsupported mode fails before reserve","invalid_review_request",async()=>{
  const f=fixture({changeRequest(r){r.mode="publish";}});try{await f.execute();return "accepted";}finally{assert.equal(f.audit.calls,0);}
});
check("REV-39","Lost reservation settlement blocks result","settlement_unavailable",async()=>{
  const f=fixture({settlementError:true});try{await f.execute();return "returned";}finally{assert.equal(f.audit.calls,1);}
});
check("REV-40","All five review modes use one schema and advisory capability","five modes",async()=>{
  for(const mode of ["code","workflow","decision","report","improvement"]){
    const f=fixture({changeRequest(r){r.mode=mode;}});await f.execute();
    assert.equal(JSON.parse(f.audit.provider.body.messages[0].content).review_mode,mode);
    assert.equal(f.audit.provider.body.tools,undefined);
  }return "five modes";
});
check("REV-41","Independent review uses an admitted budget; agreement cannot close an order","approval still required",async()=>{
  const now=1000;
  const tenantId="tenant_A", taskId="sandboxReview";
  const trust = {subject:{actorId:"planner",tenantId,maxLevel:3,allowedActions:["recommend","close_work_order"]},
    resource:{id:"WO_3",tenantId,risk:"low",dataClass:"public",status:"in_progress"},
    environment:"sandbox", maxCostMinor:1};
  const proposed={taskId:"close_3",targetId:"WO_3",action:"close_work_order",description:"Synthetic closure",revision:1};
  const verifiedReceipts=new Map();
  const ledger=new ControlLedger(":memory:",{now:()=>now,verifyReceipt:(identity)=>verifiedReceipts.get(identity.digest)});
  let reviewCommand;
  const reviewer=createClaudeReviewer({
    loadApprovedPacket:async()=>({taskId,tenantId,classification:"synthetic",draft:"A visit is awaiting verification.",
      evidence:[{sourceId:"fixture_status",tenantId,classification:"synthetic",excerpt:"The work order is in progress."}]}),
    authorizeAndReserve:async (packet)=>{
      reviewCommand={taskId,targetId:"WO_3",action:"recommend",revision:1,description:packet.packetDigest};
      const inputReview={tenantId,id:"review-packet-receipt",cleared:true,dataClass:"public",textDigest:textFingerprint(reviewCommand.description),issuedAt:0,expiresAt:2000};
      const ticket=ledger.reserve(reviewCommand,{...trust,inputReview});
      return {allowed:ticket.code==="DISPATCH_RESERVED",reservationId:ticket.token};
    },
    credential:async()=>"synthetic-test-marker",
    fetchImpl:async()=>({ok:true,json:async()=>({usage:{input_tokens:120,output_tokens:30},stop_reason:"end_turn",
      content:[{type:"text",text:JSON.stringify({...clear,task_id:taskId})}]})}),
    settleReservation:async(token,settled)=>{
      assert.equal(settled.reviewValidated,true);
      // In the sandbox, a separate receipt store records the validated review and tariff.
      const sha=fingerprint(reviewCommand);
      verifiedReceipts.set(sha,{tenantId,taskId,targetId:"WO_3",type:"recommendation",digest:sha,id:"simReceipt",chargedMinor:1});
      assert.equal(ledger.settle(token,"verify").code,"VERIFIED_COMPLETE");
    },
  });
  try {
    ledger.configure(tenantId,{cap:2,stopped:false},"operator");
    const reviewed=await reviewer({taskId,tenantId,mode:"decision"});
    assert.equal(arbitrateReview(reviewed.review,controls),"eligible_for_policy_check");
    assert.equal(assess(proposed,trust,now).code,"APPROVAL_REQUIRED");
    const approval={tenantId,digest:fingerprint(proposed),issuedAt:0,expiresAt:2000,id:"permit",decision:"approved",approverId:"owner",role:"authorized_approver",limitMinor:1};
    assert.equal(assess(proposed,{...trust,approval},now).code,"VERIFIED_VISIT_REQUIRED");
    await assert.rejects(reviewer({taskId,tenantId,mode:"decision"}),{message:"review_denied"});
    return "approval still required";
  } finally {ledger.close();}
});
check("REV-42","A reviewer sees twelve matched synthetic packets without ground-truth labels","labels withheld",()=>{
  const rows=benchmarkPackets();assert.equal(rows.length,12);
  assert.ok(rows.every(row=>row.classification==="synthetic"&&!Object.hasOwn(row,"expected")));return "labels withheld";
});
check("REV-43","No receipt is scored as a measured model pass","missing samples untested",()=>{
  const rows=scoreBenchmark([]);assert.ok(rows.every(row=>row.status==="untested"&&row.actual===null));return "missing samples untested";
});
check("REV-44","Benchmark marks an unsupported clear separately from a missing response","false clear detected",()=>{
  const rows=scoreBenchmark([{taskId:"B02",reviewStatus:"clear",receiptId:"synthetic-NOT-a-provider-result"}]);
  assert.equal(rows.find(r=>r.taskId==="B02").falseClear,true);assert.equal(rows.filter(r=>r.status==="untested").length,11);
  return "false clear detected";
});
after(()=>{
  if(process.env.DRAQON_REVIEW_TEST_REPORT)writeFileSync(process.env.DRAQON_REVIEW_TEST_REPORT,
    JSON.stringify({environment:"Node sandbox with injected synthetic transport",providerCalls:0,tests:results},null,2)+"\n");
});
