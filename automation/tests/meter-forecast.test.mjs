import test from "node:test";import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en"}};
const {forecastMeter}=await import("../../command-center/enterprise/src/meter-forecast.js");
const month=i=>new Date(Date.UTC(2023,i,1)).toISOString().slice(0,10);
function series(seasonal=false){
  const rows=[];
  for(let i=0;i<36;i++){
    const period_month=month(i),days=new Date(Date.UTC(2023,i+1,0)).getUTCDate();
    const posted=new Date(Date.UTC(2023,i+1,1,8)).toISOString();
    rows.push({period_month,kind:"water_m3",subject:"M1",revision:1,covered_days:days,
      consumption:days*(seasonal ? 4+i%12:10),recorded_at:posted,verified_at:posted});
  }return rows;
}
const predict=rows=>forecastMeter(rows,"2025-12","water_m3","M1",Date.parse("2026-01-02"));
test("forecasts next calendar month using daily rate for varying month length and a separate holdout",()=>{
 const f=predict(series());assert.equal(f.method,"rolling");assert.equal(f.value,310);assert.equal(f.mae,0);
 assert.equal(f.target,"2026-01-01");assert.equal(f.start,"2025-08-01");assert.equal(f.end,"2025-11-01");
});
test("selects seasonal naive when its prior-origin error is lower",()=>{
 const f=predict(series(true));assert.equal(f.method,"seasonal");assert.equal(f.value,124);
});
test("suppresses partial, missing, mixed meters, late-entered or unverified histories",()=>{
 for(const change of [{covered_days:2},{verified_at:null},{kind:"electricity_kwh"},{subject:"M2"}]){
   const r=series();Object.assign(r[27],change);assert.equal(predict(r).reason,"coverage");
 }
 const late=series().map(r=>({...r,verified_at:"2025-12-31T12:00:00Z"}));assert.equal(predict(late).reason,"origins");
 const revised=series();revised.push({...revised[29],revision:2,verified_at:null});assert.equal(predict(revised).reason,"coverage");
});
test("suppresses zero-reference or unstable holdouts",()=>{
 assert.equal(predict(series().map(r=>({...r,consumption:0}))).reason,"fit");
 const r=series();r[34].consumption=500000;assert.equal(predict(r).reason,"fit");
});
test("later revisions cannot leak into a historical forecast",()=>{
 const r=series();r.push({...r[31],revision:2,consumption:100000,recorded_at:"2026-04-01",verified_at:"2026-04-02"});assert.equal(predict(r).mae,0);
});
