import assert from "node:assert/strict";
import {test} from "node:test";
import {summarizeGuestReviewSample as summarize} from "../../command-center/enterprise/src/guest-review-sample.mjs";
const sample=body=>summarize("2025-09-01 | "+body,"2025-09-02");
for(const [line,topics] of [
  ["الغرفة نظيفة",["cleanliness_strength"]],["المكيف ضعيف",["cooling_weakness"]],["الفني حضر بسرعة",["response_strength"]],
  ["ضجيج داخل الغرفة",["noise_weakness"]],["our room was clean",["cleanliness_strength"]],["air conditioning was not working",["cooling_weakness"]],
  ["maintenance responded promptly",["response_strength"]],["Room was too noisy",["noise_weakness"]],
  ["the room was not very clean",[]],["لم تكن الغرفة نظيفة",[]],["لم يقل أحد إن المكيف لا يعمل",[]],
  ["There was no noise in the room",[]],["if the AC was broken",[]],["The room was very clean but the carpet was dirty",[]],
  ["the street is noisy",[]],["site construction near the hotel",[]],["parking and a nearby transit line",[]],
  ["المشروع المجاور فيه ضوضاء",[]],["not a single repair complaint",[]]
]) test("Guest language signal • "+line,()=>assert.deepEqual(Object.keys(sample(line).topics),topics));
test("privacy output and review/site separation",()=>{
  const r=sample("SyntheticName42 said the room was clean and the corridor was noisy.");
  assert.equal(r.examined,1); assert.equal(r.topics.cleanliness_strength.supporting,1); assert.equal(r.topics.noise_weakness.supporting,1);
  assert.ok(!JSON.stringify(r).includes("SyntheticName42")); assert.ok(!JSON.stringify(r).includes("corridor"));
  assert.ok(Object.values(r.topics).every(x=>x.examples.every(e=>Object.keys(e).sort().join(',')==="date,line")));
});
test("skips identifying tokens, bad dates, extra columns, blanks and repeated dated statements",()=>{
  const r=summarize(['date,review','2025-01-02,"Spotless, very clean"','2025-01-02 | Spotless very clean','2025-01-01\tالمكيف ضعيف',
      '2025-01-03 | email me at a@example.invalid and the room was clean','2025-02-29 | clean rooms','2030-01-01 | AC was weak','bad','2025-01-01,extra,columns','2025-01-01 | contact ٠٥٠١٢٣٤٥٦٧','2025-01-05 | unknown topic',''].join('\n'),'2025-11-01');
  assert.equal(r.examined,3); assert.equal(r.duplicates,1); assert.equal(r.excluded,6); assert.equal(r.uncertain,1);
  assert.equal(r.from,"2025-01-01"); assert.equal(r.to,"2025-01-05");
});
test("dated examples bounded, every eligible row counted and no persisted quote",()=>{
  const r=summarize(Array.from({length:7},(_,i)=>'2025-05-0'+(i+1)+' | ☀️ clean rooms').join('\n'),'2025-06-01');
  assert.equal(r.topics.cleanliness_strength.examples.length,3); assert.equal(r.topics.cleanliness_strength.supporting,7); assert.equal(r.examined,7);
});
test("empty and oversized input do not manufacture sample evidence",()=>{
  assert.deepEqual(summarize("",'2025-10-01').topics,{});
  assert.throws(()=>summarize("x".repeat(60001))); assert.throws(()=>summarize(Array(204).fill('x').join('\n')));
});
