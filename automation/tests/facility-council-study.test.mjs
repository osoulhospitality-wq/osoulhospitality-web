import {test} from "node:test";
import assert from "node:assert/strict";
import {buildCouncilStudy,buildCouncilDecisions,councilMetrics,references} from "../../command-center/enterprise/src/facility-council.mjs";

const asOf="2026-11-26";
function row(metric,month,value,status="verified"){
  return {metric,month:month+"-01",value,status,source_ref:"Synthetic dated closing ledger "+month,retrieved_on:"2026-11-03"};
}
function pair(key,a,b){return [row(key,"2026-09",a),row(key,"2026-10",b)];}
test("fourteen discipline cards specify units, named owners, primary methodology and a source basis",()=>{
  const cards=buildCouncilStudy({history:[],asOf});assert.equal(cards.length,14);assert.equal(new Set(cards.map(x=>x.id)).size,14);
  for(const c of cards){assert.equal(c.latest,null);assert.equal(c.outlook.estimate,null);assert.equal(c.outlook.status,"insufficient");
    assert.ok(c.source.url.startsWith("https://"));for(const k of ["title","unit","action","owner","basis","question"])assert.ok(c[k][0]&&c[k][1]);}
  assert.equal(councilMetrics.length,cards.length);assert.ok(references.forecast.url.includes("nist.gov"));
});
test("verified zero and signed SAR survive while disputed and blank readings are withheld",()=>{
  const cards=buildCouncilStudy({asOf,history:[row("overdue_pm","2026-10","0"),row("capex_variance_sar","2026-10","-22.56"),
    row("cash_balance_sar","2026-10",null,"conflict"),row("staff_shortfall","2026-10","")],brief:{maintenance:{due:3}}});
  const card=k=>cards.find(c=>c.id===k);assert.equal(card("overdue_pm").latest.value,0);assert.equal(card("capex_variance_sar").latest.value,-22.56);
  assert.equal(card("staff_shortfall").latest,null);assert.equal(card("cash_balance_sar").latest,null);assert.equal(card("cash_balance_sar").outlook.status,"invalid");
});
test("four cross-disciplinary comparisons retain both properties of each change, sources, owners and alternatives",()=>{
  const history=[...pair("repeat_faults",3,4),...pair("guest_complaints",1,5),...pair("qualified_leads",7,8),...pair("lead_conversion_pct",80,60),
    ...pair("cash_balance_sar",2400,800),...pair("capex_variance_sar",-200,225),...pair("late_milestones",1,3),...pair("overdue_pm",2,4)];
  const memos=buildCouncilDecisions({history,asOf});assert.equal(memos.length,4);
  for(const d of memos){assert.equal(d.evidence.length,4);assert.equal(d.options.length,2);assert.ok(d.evidence.every(r=>r.source_ref));assert.ok(d.next[0]&&d.owner[1]);}
  assert.equal(buildCouncilDecisions({history:history.filter(r=>r.month==="2026-10-01"),asOf}).length,0);
});
test("missing, disputed, duplicate or not-yet-retrieved evidence cannot support a joint recommendation",()=>{
  const one=pair("repeat_faults",1,2),two=pair("guest_complaints",1,3);
  for(const rows of [[...one,two[0]],[...one,...two,two[1]],[...one,two[0],{...two[1],status:"conflict"}],[...one,two[0],{...two[1],retrieved_on:"2026-12-01"}]])
    assert.deepEqual(buildCouncilDecisions({history:rows,asOf}),[]);
});
test("holdout-backed occupancy warning retains monthly source references with a defined horizon",()=>{
  const history=Array.from({length:12},(_,i)=>{const d=new Date(Date.UTC(2025,10+i,1));return row("occupancy_pct",d.toISOString().slice(0,7),40+i);});
  const c=buildCouncilStudy({history,asOf}).find(c=>c.id==="occupancy_pct");
  assert.equal(c.outlook.status,"forecast");assert.equal(c.outlook.estimate,52);assert.equal(c.outlook.nextMonth,"2026-11");assert.equal(c.outlook.sources.length,12);
});

test("monthly change in a rate is expressed in percentage points with its comparison source",()=>{
  const card=buildCouncilStudy({history:pair("lead_conversion_pct",50,40),asOf}).find(c=>c.id==="lead_conversion_pct");
  assert.match(card.signal[1],/Decreased by 10 percentage points/);assert.match(card.signal[1],/Synthetic dated closing ledger 2026-09/);
});
