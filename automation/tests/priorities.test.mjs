import test from 'node:test';
import assert from 'node:assert/strict';
import {planShift} from '../enterprise/priorities.mjs';
const context = {tenantId:'osoul_test',siteIds:['hotel'],now:'2026-11-26T14:00:00Z',shiftEnd:'2026-11-26T20:00:00Z'};
const item = (id,changes={}) => ({id,siteId:'hotel',tenantId:'osoul_test',owner:'duty',status:'open',impact:'routine',dueAt:null,evidence:[],dependsOn:[],...changes});
const run = (...records) => planShift({...context,records});
test('reported hazard goes to a human even when no owner or dependencies are assigned',()=>{
 const [first] = run(item('normal'),item('hazard',{impact:'possible_hazard',owner:null,dependsOn:['open']}));
 assert.deepEqual([first.id,first.disposition,first.blockers],['hazard','human_triage_now',['dependency_unverified','owner_required']]);
});
test('deadline ordering is deterministic across offsets and missing dates',()=>{
 const queue=run(item('later',{dueAt:'2026-11-28T09:00:00+03:00'}),item('end',{dueAt:context.shiftEnd}),item('missing'),item('late',{dueAt:'2026-11-26T16:30:00+03:00'}));
 assert.deepEqual(queue.map(x=>[x.id,x.reason]),[['late','past_due'],['end','due_this_shift'],['later','future_commitment'],['missing','unplanned']]);
});
test('cross-site dependency or missing site metadata cannot disclose another site',()=>{
 const queue=run(item('local',{dependsOn:['private']}),item('private',{siteId:'other_site',status:'accepted',evidence:['restricted']}),item('out',{tenantId:'other'}));
 assert.deepEqual(queue.map(x=>x.blockers),[['dependency_unverified']]);assert.ok(!JSON.stringify(queue).includes('private'));
});
test('accepted work needs evidence to leave the shift list and release dependent work',()=>{
 const pending=item('brief',{status:'accepted'}), next=item('repair',{dependsOn:['brief']});
 assert.deepEqual(run(pending,next).map(x=>x.disposition),['needs_decision','needs_decision']);
 assert.deepEqual(run({...pending,evidence:['site_receipt']},next).map(x=>x.disposition),['plan_work']);
});
test('dependency cycle is held for review without recursive dispatch',()=>{
 assert.ok(run(item('a',{dependsOn:['b']}),item('b',{dependsOn:['a']})).every(row=>row.disposition==='needs_decision'));
});
test('ambiguous record and time window are rejected',()=>{
 assert.throws(()=>run(item('a'),item('a')), /ambiguous/);
 assert.throws(()=>planShift({...context,shiftEnd:'2026-11-26T10:00:00Z',records:[]}),/invalid_shift_context/);
});
