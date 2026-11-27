import test from 'node:test';
import assert from 'node:assert/strict';
import {kpis,calculateKpi,groups} from './kpis.mjs';
import {readSnapshot} from './desk-evidence.mjs';
import {snapshotFromLedgerReport} from './desk-export.mjs';
const metric=id=>kpis.find(k=>k.id===id);
const stamp='2026-01-01T12:00:00Z',now=new Date(stamp);
const base=()=>({version:1,origin:'synthetic',tenant:'osoul',from:'2026-01-01T08:00:00+03:00',to:stamp,asOf:stamp,items:[],metrics:[]});
const row=()=>({tenant:'osoul',id:'commercial.win_rate',observedAt:stamp,sourceRef:'fixture.crm.period',coverage:'complete',inputs:{won_deals:0,decided_deals:4}});
test('every department includes distinct code, bilingual definitions, owner, formula, evidence and cadence',()=>{
 assert.equal(new Set(kpis.map(k=>k.id)).size,kpis.length);assert.equal(kpis.length,43);
 for(const item of kpis){assert.ok(groups[item.group]);assert.ok(item.arDefinition && item.enDefinition && item.source.length===2 && item.formula && item.owner);assert.ok(item.target===null)}
});
test('all 43 indicators compute from supplied inputs',()=>{
 for(const metric of kpis){let inputs=Object.fromEntries(metric.inputs.map(k=>[k,2]));if(metric.calculation==='breakEven')inputs.net_revenue=4;
 assert.ok(Number.isFinite(calculateKpi(metric,inputs)),metric.id)}
});
test('preserves measured zero, rejects missing inputs, zero denominator and invalid shares',()=>{
 const win=metric('commercial.win_rate');assert.equal(calculateKpi(win,{won_deals:0,decided_deals:4}),0);
 for(const data of [{won_deals:0,decided_deals:0},{won_deals:5,decided_deals:4},{won_deals:-1,decided_deals:4},{won_deals:2},{won_deals:'2',decided_deals:4}])assert.equal(calculateKpi(win,data),null);
});
test('net losses and realized margins retain signs; break-even requires positive contribution',()=>{
 assert.equal(calculateKpi(metric('finance.ebitda'),{operating_profit:-200,depreciation:50,amortization:25}),-125);
 assert.equal(calculateKpi(metric('finance.break_even'),{fixed_cost:100,net_revenue:100,variable_cost:100}),null);
 assert.equal(calculateKpi(metric('finance.break_even'),{fixed_cost:100,net_revenue:200,variable_cost:100}),200);
});
test('valid snapshot computes metric, including a measured zero',()=>{const s=base();s.metrics=[row()];assert.equal(readSnapshot(s,'osoul',now).metrics.get(row().id).value,0)});
test('partial coverage suppresses even a valid number',()=>{const s=base();s.metrics=[{...row(),coverage:'partial'}];assert.equal(readSnapshot(s,'osoul',now).metrics.get(row().id).value,null)});
test('rejects scope mixing in envelope and individual rows across metrics and events',()=>{
 const s=base();assert.throws(()=>readSnapshot(s,'other',now),/scope/);
 s.metrics=[{...row(),tenant:'other'}];assert.throws(()=>readSnapshot(s,'osoul',now),/scope/);
 s.metrics=[];s.items=[{tenant:'other'}];assert.throws(()=>readSnapshot(s,'osoul',now),/scope/);
});
test('rejects missing, duplicate, future or out-of-period evidence and unclassified exports',()=>{
 for(const mutation of [s=>s.metrics=[row(),row()],s=>s.metrics=[{...row(),observedAt:'2025-01-01T09:00:00Z'}],s=>s.metrics=[{...row(),sourceRef:''}],s=>s.asOf='2027-01-01T00:00:00Z',s=>s.origin='live']){const s=base();mutation(s);assert.throws(()=>readSnapshot(s,'osoul',now))}
});
test('events retain tenant provenance, explicit zero progress, and unique stable keys',()=>{
 const s=base(),item={tenant:'osoul',observedAt:stamp,sourceRef:'fixture.p',feed:'projects',key:'p1',title:'Project',owner:'PMO',status:'pending',progress:0};
 s.items=[item];assert.equal(readSnapshot(s,'osoul',now).items[0].progress,0);
 s.items.push(item);assert.throws(()=>readSnapshot(s,'osoul',now),/duplicate/);
});
test('ledger export accepts closed tasks only with independent evidence and strips raw detail',()=>{
 const r={tenant:'osoul',version:1,task:'verify-budget',stage:'closed',kind:'sar_budget',proof:{accepted:true},
 events:['plan','produce','verified','close'].map((action,i)=>({actor:['COS','CFO','CQO','COS'][i],action,at:stamp,detail:{secret:'must not appear'}}))};
 const s=snapshotFromLedgerReport(r,'osoul',now);assert.equal(s.origin,'local-ledger');assert.deepEqual(s.metrics,[]);assert.equal(s.items.length,5);assert.equal(s.items.at(-1).status,'completed');assert.ok(!JSON.stringify(s).includes('must not appear'));
 assert.throws(()=>snapshotFromLedgerReport(r,'other',now));assert.throws(()=>snapshotFromLedgerReport({...r,proof:{accepted:false}},'osoul',now));
});
