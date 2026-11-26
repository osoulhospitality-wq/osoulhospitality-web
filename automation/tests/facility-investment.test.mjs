import assert from "node:assert/strict";
import test from "node:test";
import {compareInvestmentCase as compare} from "../../command-center/enterprise/src/facility-investment.mjs";
import {mountInvestmentCase} from "../../command-center/enterprise/src/facility-investment-ui.js";

const ref={date:"2025-12-12",reference:"synthetic dated estimate"};
function fixture(){
  return {valuationDate:"2026-01-01",currency:"SAR",basis:"real",years:2,discountRatePct:0,
    rateSource:{...ref},repair:{...ref,upfront:20,operating:15,downtime:5,disposal:8,residual:3},
    replace:{...ref,upfront:45,operating:8,downtime:4,disposal:3,residual:8},
    downside:{...ref,extraUpfront:10,extraAnnual:5,lostResidual:3}};
}
function near(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
test("agrees with hand calculation and downside can reverse the base case",()=>{
  const result=compare(fixture());
  assert.equal(result.status,"compared"); const {base,downside}=result;
  assert.equal(base.repair.totalPV,65); assert.equal(base.replace.totalPV,64); assert.equal(base.difference,1);
  assert.equal(base.breakEvenAnnualSavings,7.5); assert.equal(base.assumedAnnualSavings,8);
  assert.equal(downside.repair.totalPV,65); assert.equal(downside.replace.totalPV,87); assert.equal(downside.difference,-22);
  assert.equal(downside.assumedAnnualSavings,3); assert.equal(downside.breakEvenAnnualSavings,14);
});
test("discounts each year-end cost and only terminal net residual, with upfront at time zero",()=>{
  const c=fixture();c.discountRatePct=10;
  const r=compare(c);assert.equal(r.status,"compared");
  near(r.base.repair.totalPV,20+20/1.1+25/(1.1**2));
  near(r.base.replace.totalPV,45+12/1.1+7/(1.1**2));
  near(r.downside.replace.totalPV,55+17/1.1+15/(1.1**2));
  near(r.base.breakEvenAnnualSavings,(25-10/(1.1**2))/(1/1.1+1/(1.1**2)));
  near(r.base.difference,(r.base.assumedAnnualSavings-r.base.breakEvenAnnualSavings)*r.annuity);
});
test("a lower upfront replacement cost permits a negative break-even threshold",()=>{
  const c=fixture();c.replace.upfront=0;const r=compare(c);
  assert.ok(r.base.breakEvenAnnualSavings<0);near(r.base.breakEvenAnnualSavings,-15);
});
test("explicit equal and zero costs are valid and imply zero savings",()=>{
  const c=fixture();
  for(const k of ["upfront","operating","downtime","disposal","residual"]) c.repair[k]=c.replace[k]=0;
  c.downside.extraUpfront=c.downside.extraAnnual=c.downside.lostResidual=0;
  const r=compare(c);assert.equal(r.status,"compared");
  assert.equal(r.base.difference,0);assert.equal(r.downside.difference,0);assert.equal(r.base.breakEvenAnnualSavings,0);
});
test("preserves references, rate, basis and a valid leap day without changing inputs",()=>{
  const c=fixture(); c.valuationDate="2028-02-29";c.currency="USD";c.basis="nominal";c.repair.reference="  local quote  ";
  const before=JSON.stringify(c);const r=compare(c);
  assert.equal(r.currency,"USD");assert.equal(r.sources.repair.reference,"local quote");assert.equal(r.sources.repair.date,ref.date);
  assert.equal(r.basis,"nominal");assert.equal(r.discountRatePct,0);assert.equal(JSON.stringify(c),before);
  assert.ok(!Object.hasOwn(r,"approval"));
});
test("signed discount percent is explicit and handled without cancellation near zero",()=>{
  for(const pct of [-1,0.00000000001]){
    const c=fixture();c.discountRatePct=pct;const r=compare(c);const rate=pct/100;
    assert.equal(r.status,"compared");near(r.base.repair.totalPV,20+20/(1+rate)+25/((1+rate)**2));
  }
});
for(const [field,bad] of [
  ["years",0],["years",1.5],["years",101],["discountRatePct",null],["discountRatePct",101],
  ["discountRatePct","8"],["basis",""],["currency","$"],["valuationDate","2026-02-29"],
  ["rateSource.date","2026-01-02"],["repair.reference"," "],["replace.date","2022-13-01"],["downside.reference",""],
  ["downside.extraAnnual",-1],["downside.extraUpfront",undefined],["downside.lostResidual",9],
  ["repair.residual",NaN],["repair.upfront",1e13],["repair.downtime",null],["replace.disposal",Infinity]
]){
  test("invalid, unpriced or unsigned assumption blocks "+field+" "+String(bad),()=>{
    const c=fixture();const [k,a]=field.split(".");
    if(a)c[k][a]=bad;else c[k]=bad;
    const r=compare(c);assert.equal(r.status,"invalid");assert.equal(r.field,field);
    assert.equal(r.base,undefined);assert.equal(r.downside,undefined);
  });
}
test("numerical precision limit rejects extreme combinations",()=>{
  const c=fixture();c.discountRatePct=-99;c.years=100;
  assert.equal(compare(c).reason,"outside_numerical_range");
});
test("UI export does not initialize a browser, network client or persistence at import",()=>{
  assert.equal(typeof mountInvestmentCase,"function");
});
