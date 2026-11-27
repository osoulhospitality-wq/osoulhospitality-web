import test from "node:test";
import assert from "node:assert/strict";
import {forecastSeries} from "../../command-center/enterprise/src/facility-outlook.mjs";

function observations(values, first="2024-01") {
  const index=Number(first.slice(0,4))*12+Number(first.slice(5))-1;
  return values.map((value,i)=>{
    const m=index+i;
    const month=String(Math.floor(m/12)).padStart(4,"0")+"-"+String(m%12+1).padStart(2,"0");
    return {month,value,source:"fixture:"+month};
  });
}
const frozen=Object.freeze(observations(Array(12).fill(30)).map(Object.freeze));
const asOf="2025-01-20";
function withheld(r,status,reason) {assert.equal(r.status,status); assert.equal(r.reason,reason); assert.equal(r.estimate,null);}

test("uses calendar close, simple baseline and real out-of-sample error for a stable level",()=>{
  const r=forecastSeries(frozen,asOf);
  assert.equal(r.status,"forecast"); assert.equal(r.method,"last_value"); assert.equal(r.estimate,30);
  assert.equal(r.mae,0); assert.equal(r.baselineMae,0); assert.equal(r.holdoutMonths,3);
  assert.equal(r.holdoutStart,"2024-10"); assert.equal(r.holdoutEnd,"2024-12");
  assert.equal(r.nextMonth,"2025-01"); assert.equal(r.horizonMonths,1);
  assert.equal(r.seasonality,"under_two_annual_cycles"); assert.equal(r.seasonalAdjustment,false);
  assert.deepEqual(r.sources,frozen.map(({month,source})=>({month,source})));
  assert.ok(!Object.hasOwn(r,"confidence"));
});
test("strictly earlier rolling origins predict a persistent trend, including its holdout",()=>{
  const r=forecastSeries(observations(Array.from({length:12},(_,i)=>40+2*i)),asOf);
  assert.equal(r.status,"forecast"); assert.equal(r.method,"median_drift"); assert.equal(r.estimate,64);
  assert.equal(r.mae,0); assert.equal(r.baselineMae,2);
});
test("holdout is independent of selection and can veto an earlier trend",()=>{
  const history=observations([100,105,110,115,120,125,130,135,140,140,140,140]);
  const r=forecastSeries(history,asOf);
  withheld(r,"unreliable","holdout_worse_than_baseline");
  assert.equal(r.method,"median_drift"); assert.equal(r.mae,5); assert.equal(r.baselineMae,0);
});
test("smoother earns its place on repeated small fluctuations",()=>{
  const r=forecastSeries(observations(Array.from({length:24},(_,i)=>[98,100,102][i%3])),"2026-01-15");
  assert.equal(r.status,"forecast"); assert.equal(r.method,"moving_mean_3");
  assert.ok(Math.abs(r.estimate-100)<1e-10); assert.ok(Math.abs(r.mae-4/3)<1e-10); assert.ok(r.mae<r.baselineMae);
  assert.equal(r.seasonality,"annual_pattern_not_tested"); assert.equal(r.holdoutMonths,6);
});
test("an unfamiliar last-month jump can veto an otherwise acceptable average error",()=>{
  const r=forecastSeries(observations([...Array(11).fill(100),125]),asOf);
  withheld(r,"unreliable","recent_structural_break");
  assert.ok(r.mae>0 && r.relativeError<r.errorShareLimit);
});
test("large held-out error triggers abstention",()=>{
  const r=forecastSeries(observations([...Array(9).fill(10),90,10,90]),asOf);
  withheld(r,"unreliable","holdout_error_high"); assert.ok(r.mae>0);
});
test("zero and negative financial series do not acquire fake positivity or confidence",()=>{
  const zero=forecastSeries(observations(Array(12).fill(0)),asOf);
  assert.equal(zero.status,"forecast"); assert.equal(zero.estimate,0); assert.equal(zero.relativeError,0);
  const negative=forecastSeries(observations(Array(12).fill(-10)),asOf);
  assert.equal(negative.estimate,-10);
});
test("optional metric bounds constrain occupancy without clipping a forecast",()=>{
  const r=forecastSeries(observations(Array.from({length:12},(_,i)=>67+3*i)),asOf,{min:0,max:100});
  withheld(r,"unreliable","forecast_out_of_bounds");
  withheld(forecastSeries(observations(Array(12).fill(101)),asOf,{min:0,max:100}),"invalid","observation_out_of_bounds");
});
test("stable extreme values do not overflow the mean",()=>{
  const r=forecastSeries(observations(Array(12).fill(Number.MAX_VALUE)),asOf);
  assert.equal(r.status,"forecast"); assert.equal(r.estimate,Number.MAX_VALUE); assert.equal(r.mae,0);
});
test("unrepresentable distances cannot produce a numerical prediction",()=>{
  const r=forecastSeries(observations(Array.from({length:12},(_,i)=>i%2?Number.MAX_VALUE:-Number.MAX_VALUE)),asOf);
  withheld(r,"invalid","numerical_range"); assert.equal(r.mae,null);
});
test("sorts a copy and preserves source-month pairing",()=>{
  const reversed=[...frozen].reverse();
  assert.deepEqual(forecastSeries(reversed,asOf),forecastSeries(frozen,asOf));
  assert.equal(reversed[0].month,"2024-12");
});
test("sparse, stale and gaps all abstain without an invented error statistic",()=>{
  for(const [rows,status,why] of [[[],"insufficient","too_few_months"],[frozen.slice(3),"insufficient","too_few_months"],
    [frozen.slice(0,-1),"stale","latest_closed_month_missing"],[frozen.filter((_,i)=>i!==6),"insufficient","calendar_gap"]]){
    const r=forecastSeries(rows,asOf);
    withheld(r,status,why); assert.equal(r.mae,null); assert.equal(r.baselineMae,null);
  }
});
test("UTC New Year boundary and leap-day date input are explicit",()=>{
  assert.equal(forecastSeries(frozen,new Date("2025-01-01T00:00:00Z")).status,"forecast");
  const r=forecastSeries(observations(Array(12).fill(1),"2023-02"),"2024-02-29");
  assert.equal(r.status,"forecast"); assert.equal(r.historyEnd,"2024-01");
});
test("duplicate, future and unclosed month are invalid even if more history is available",()=>{
  withheld(forecastSeries([...frozen,frozen[1]],asOf),"invalid","duplicate_month");
  for(const m of ["2025-01","2025-02"]) withheld(forecastSeries([...frozen,{month:m,value:10,source:"receipt"}],asOf),"invalid","month_not_closed");
});
for(const corrupt of [{month:"2024-2"},{month:"2024-00"},{month:"2024-13"},{value:NaN},{value:Infinity},{value:"30"},{source:" "},{source:null},{verified:false},{complete:false}]){
  test("rejects malformed/unverified monthly point "+JSON.stringify(corrupt),()=>{
    withheld(forecastSeries([{...frozen[0],...corrupt},...frozen.slice(1)],asOf),"invalid","invalid_observation");
  });
}
for(const date of [null,"2025-01","2025-13-01","2025-02-29","01/01/2025",new Date(NaN)]){
  test("rejects ambiguous/invalid as-of input "+String(date),()=>withheld(forecastSeries(frozen,date),"invalid","invalid_as_of"));
}
test("bounds and series must use explicit numeric types",()=>{
  for(const bad of [null,[],{min:Infinity},{max:"100"},{min:10,max:1}])
    withheld(forecastSeries(frozen,asOf,bad),"invalid","invalid_bounds");
  withheld(forecastSeries({},asOf),"invalid","invalid_series");
});
