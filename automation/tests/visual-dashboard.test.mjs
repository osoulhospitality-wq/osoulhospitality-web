import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {documentElement:{lang:'en'}};
const {weekWindows,weeklyIntake,monthWindows,monthlyIntake} = await import('../../command-center/enterprise/src/visual-dashboard.js');

test('28 days of Riyadh entries span four adjoining weeks across UTC midnight',()=>{
  const w=weekWindows(new Date('2026-11-27T22:30:00Z'));
  assert.equal(w.length,4);
  assert.equal(w[0].start,'2026-10-31T21:00:00.000Z');
  assert.equal(w[3].end,'2026-11-28T21:00:00.000Z');
  w.slice(1).forEach((week,i)=>assert.equal(week.start,w[i].end));
});

test('each week uses the organization and facility and distinguishes zero from failed reads',async()=>{
  const calls=[];
  const signal=new AbortController().signal;
  const client={from(table){
    const call={table,filters:[]};
    calls.push(call);
    const index=calls.length-1;
    const query={select(fields,opts){call.fields=fields;call.opts=opts;return query;},
      eq(k,v){call.filters.push([k,v]);return query;},gte(k,v){call.gte=[k,v];return query;},
      lt(k,v){call.lt=[k,v];return query;},abortSignal(s){assert.equal(s,signal);return index===1?Promise.reject(new Error()):Promise.resolve(index===2?{error:true}:{count:index});}};
    return query;
  }};
  const result=await weeklyIntake(client,'org-x','site-a',signal,new Date('2026-11-28T00:00Z'),0);
  assert.deepEqual(result.map(w=>w.count),[0,null,null,3]);
  for(const [i,call] of calls.entries()) {
    assert.deepEqual(call.filters,[['organization_id','org-x'],['facility_assets.facility_id','site-a']]);
    assert.match(call.fields,/facility_assets!inner/);assert.deepEqual(call.opts,{count:'exact',head:true});
    assert.equal(call.table,'facility_work_orders');assert.deepEqual(call.gte,['created_at',result[i].start]);assert.deepEqual(call.lt,['created_at',result[i].end]);
  }
});

test('calendar months cross year boundaries and end at the read instant',()=>{
  const now=new Date('2026-01-31T21:17:00Z');
  const periods=monthWindows(now);
  assert.equal(periods[0].start,'2025-08-31T21:00:00.000Z');
  assert.equal(periods[5].start,'2026-01-31T21:00:00.000Z');
  assert.equal(periods[5].end,now.toISOString());
  periods.slice(1).forEach((period,i)=>assert.equal(period.start,periods[i].end));
});

test('no recorded start date leaves historical coverage unknown and avoids count queries',async()=>{
  const result=await monthlyIntake({},'org','facility',new AbortController().signal,new Date('2026-11-28T00:00Z'),NaN);
  assert.equal(result.length,6);assert(result.every(m=>m.count===null));
});
