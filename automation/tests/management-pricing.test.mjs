import test from "node:test";
import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en"}};
const {compareMonths}=await import("../../command-center/enterprise/src/management-history.js");
const {rateEvidence,bookingPace,publicEvidenceUrl,verifiedForecast}=await import("../../command-center/enterprise/src/facility-pricing.js");
const row=(period,value,extra={})=>({period,value,building_id:"x",metric:"electricity_cost",source:"ledger",locator:"tab",unit:"SAR",...extra});
const compare=(a,b)=>compareMonths([a,b],"electricity_cost",a.period,b.period);
test("supports full YYYY-MM and whole calendar intervals; absolute plus relative changes",()=>{
  const a=row("2024-01",20,{range:"2024-01"}),b=row("2024-02",24,{range:["2024-02-01","2024-02-29"]});
  assert.equal(compare(a,b).delta,4);assert.equal(compare(a,b).percent,20);
  assert.equal(compare(row("2024-01",0),b).percent,null);
});
test("partial booking revenue is a recorded value, never a comparable full-month decline",()=>{
  const a=row("2024-06",100,{metric:"nightly_rental_revenue",range:"2024-06"}),b=row("2024-07",20,{metric:a.metric,range:"2024-07-01/2024-07-05"});
  const result=compareMonths([a,b],a.metric,a.period,b.period);
  assert.equal(result.b.value,20);assert.equal(result.delta,null);assert.equal(result.percent,null);
});
test("incompatible source, units, facility and ambiguous observations do not create deltas",()=>{
  const a=row("2024-04",20),b=row("2024-05",21);
  for(const overrides of [{building_id:"y"},{unit:"kWh"},{source:"other"},{locator:""},{range:["2024-05-15","2024-05-31"]}])
    assert.equal(compare(a,{...b,...overrides}).delta,null);
  assert.equal(compareMonths([a,b,b],a.metric,a.period,b.period).delta,null);
});
test("compares quotes only within covered dates, exact terms and linked evidence",()=>{
  const day={date:"2026-08-02",basis:"all_in_comparable",terms:"studio total",source_ids:["own","peer"],own_rate_sar:200,market_low_sar:180,market_high_sar:200,recommended_low_sar:185,recommended_high_sar:195};
  const common={observed_on:"2026-08-01",valid_from:day.date,valid_to:day.date,terms:day.terms,reference:"internal:rate"};
  const sources=[{...common,id:"own",kind:"facility",label:"Property",price_sar:200},{...common,id:"peer",kind:"competitor",label:"Peer 1",price_sar:180}];
  assert.equal(rateEvidence(day,{sources}).own,200);
  assert.match(rateEvidence(day,{sources}).market,/180/);
  assert.equal(rateEvidence({...day,date:"2026-08-03"},{sources}).own,null);
  assert.equal(rateEvidence({...day,terms:"other"},{sources}).market,"Unverified");
  assert.equal(rateEvidence({...day,basis:"unknown"},{sources}).suggested,"Unverified");
});
test("on-books ratios preserve zero and require sales attribution, valid denominators and currency inputs",()=>{
  const day={on_books_nights:2,available_nights:4,on_books_room_revenue_sar:400},sales=[{kind:"sales"}];
  assert.deepEqual(bookingPace(day,sales),{sold:2,occupancy:50,adr:200,revpar:100});
  assert.equal(bookingPace(day,[]).adr,null);
  assert.equal(bookingPace({...day,on_books_nights:8},sales).revpar,null);
  assert.equal(bookingPace({...day,on_books_nights:0,on_books_room_revenue_sar:0},sales).revpar,0);
  assert.equal(bookingPace({...day,available_nights:0,on_books_nights:0},sales).occupancy,null);
});

test("numeric recommendation requires three distinct properties, a verified own night and unsold capacity",()=>{
  const d={date:"2026-06-05",terms:"room all-in SAR",basis:"all_in_comparable",own_rate_sar:205,market_low_sar:190,market_high_sar:215,
    on_books_nights:2,available_nights:4,recommended_low_sar:203,recommended_high_sar:209};
  const src=(id,kind,label,price_sar)=>({id,kind,label,price_sar,terms:d.terms,observed_on:"2026-06-04",valid_from:d.date,valid_to:d.date,reference:"internal:row"});
  const sources=[src("own","facility","Own",205),src("a","competitor","WEST",190),src("aa","competitor"," West ",200),
    src("b","competitor","East",210),src("c","competitor","North",215),src("s","sales","Inventory")];
  d.source_ids=sources.map(s=>s.id);
  assert.match(rateEvidence(d,{sources}).suggested,/203/);
  assert.equal(rateEvidence(d,{sources:sources.filter(s=>s.id!=="c")}).suggested,"Unverified");
  assert.equal(rateEvidence({...d,on_books_nights:4},{sources}).suggested,"Unverified");
  assert.equal(rateEvidence(d,{sources:sources.filter(s=>s.kind!=="sales")}).suggested,"Unverified");
  assert.equal(rateEvidence(d,{sources:sources.map(s=>s.id==="own"?{...s,stay_total_sar:800}:s)}).own,null);
});

test("source links allow a public HTTPS reference and reject sensitive or non-public destinations",()=>{
  const valid="https://www.google.com/maps/search/?api=1&query=hotel";
  assert.equal(publicEvidenceUrl(valid),valid);
  for(const ref of ["internal:ledger","http://example.com","javascript:alert(1)","https://localhost/x","https://127.0.0.1/x",
    "https://alice@example.com/x","https://example.com/?access_token=example","https://example.internal/info"])
    assert.equal(publicEvidenceUrl(ref),null);
});
test("historical forecast needs six unique same-weekday, same-lead observations and matches the bounded median",()=>{
  const day={date:"2026-10-14",on_books_nights:3,available_nights:4,forecast_booked_nights:4},asOf="2026-10-12";
  const back=(date,days)=>new Date(Date.parse(date+"T00:00:00Z")-days*86400000).toISOString().slice(0,10);
  const history=Array.from({length:6},(_,i)=>{
    const stay=back(day.date,(i+1)*7);
    return {kind:"historical_pickup",historical_stay_date:stay,historical_as_of:back(stay,2),observed_on:stay,matched_pickup_nights:3,match_note:"Matched comparable inventory"};
  });
  const sales={kind:"sales"},sources=[sales,...history];
  assert.equal(verifiedForecast(day,sources,asOf).projected,4);
  assert.equal(verifiedForecast({...day,forecast_booked_nights:3},sources,asOf),null);
  assert.equal(verifiedForecast(day,[sales,...history.slice(1)],asOf),null);
  assert.equal(verifiedForecast(day,[sales,...history,{...history[0]}],asOf),null);
  assert.equal(verifiedForecast(day,[sales,...history.slice(1),{...history[0],historical_as_of:history[0].historical_stay_date}],asOf),null);
});
