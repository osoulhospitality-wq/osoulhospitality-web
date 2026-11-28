import test from "node:test";
import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en-SA"}};
const {reputationTrend,previousClosedMonth}=await import("../../command-center/enterprise/src/reputation.js");
const sample={native_min:1,native_max:5,review_count:45,previous_count:24,average_rating:4.62,previous_average:4.4};
test("a reported native-scale point change is not a percent or weighted cross-platform rating",()=>{
 assert.equal(reputationTrend(sample),0.22);
 assert.equal(reputationTrend({...sample,average_rating:4}),-0.4);
 assert.equal(reputationTrend({...sample,average_rating:4.4}),0);
});
test("zero/missing review cohorts, out-of-scale averages and unconfirmed scales do not produce trends",()=>{
 for(const patch of [{review_count:0},{previous_count:0},{previous_average:null},{average_rating:""},{average_rating:5.1},{average_rating:"NaN"},{native_min:null},{native_max:1},{review_count:1.5}])
  assert.equal(reputationTrend({...sample,...patch}),null);
});
test("most recent closed calendar month handles the January rollover",()=>{
 assert.equal(previousClosedMonth("2026-01-01"),"2025-12");
 assert.equal(previousClosedMonth("2026-11-28"),"2026-10");
});
