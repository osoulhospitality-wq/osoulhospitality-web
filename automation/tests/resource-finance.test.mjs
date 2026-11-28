import test from "node:test";
import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en"}};
const {calculateMonthlyEvidence}=await import("../../command-center/enterprise/src/resource-finance.js");
const financial={period_month:"2026-02-01",kind:"unit_finance_sar",subject:"101",covered_days:28,net_revenue:"1200.12",other_direct_cost:"300.11",maintenance_cost:"69.99"};
const meter={period_month:"2026-02-01",kind:"water_m3",subject:"M1",covered_days:28,consumption:280};
const prior={...meter,period_month:"2026-01-01",covered_days:31,consumption:310};
const result=(rows,month="2026-02")=>calculateMonthlyEvidence(rows,month)[0];
test("direct contribution uses net revenue minus direct costs excluding maintenance minus maintenance once",()=>{
 const r=result([financial]);assert.equal(r.contribution,830.02);assert.equal(r.maintenanceShare,Number(financial.maintenance_cost)/Number(financial.net_revenue)*100);
 assert.equal(result([{...financial,net_revenue:-5,other_direct_cost:0,maintenance_cost:0}]).contribution,-5);
 assert.equal(result([{...financial,net_revenue:0}]).maintenanceShare,null);
});
test("unknown inputs or partial reporting periods never become zeroes in monthly contribution",()=>{
 for(const value of [null,"",undefined]) assert.equal(result([{...financial,maintenance_cost:value}]).contribution,null);
 assert.equal(result([{...financial,covered_days:15}]).contribution,null);
 assert.equal(result([{...financial,maintenance_cost:0}]).maintenanceShare,0);
});
test("meter comparisons normalize month length and use exactly the same registered meter and resource",()=>{
 assert.equal(result([prior,meter]).dailyChange,0);
 for(const bad of [{subject:"M2"},{kind:"electricity_kwh"},{covered_days:25},{consumption:0},{consumption:null},{period_month:"2025-12-01"}])
   assert.equal(result([{...prior,...bad},meter]).dailyChange,null);
 assert.equal(result([prior,{...meter,covered_days:27}]).dailyChange,null);
 assert.equal(result([prior,{...meter,consumption:0}]).dailyChange,-100);
});
test("leap month recognizes all 29 days when calculating daily use, partial February does not qualify",()=>{
 const feb={...meter,period_month:"2024-02-01",covered_days:29,consumption:290};
 const jan={...prior,period_month:"2024-01-01"};
 assert.equal(result([jan,feb],"2024-02").dailyChange,0);
 assert.equal(result([jan,{...feb,covered_days:28}],"2024-02").dailyChange,null);
});
test("values outside conservative cent-level precision bounds suppress result and ratio",()=>{
 const large={...financial,net_revenue:"99999999999999.99"};
 assert.equal(result([large]).contribution,null);assert.equal(result([large]).maintenanceShare,null);
});
