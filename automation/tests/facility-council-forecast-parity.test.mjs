import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { forecastSeries } from '../../command-center/enterprise/src/facility-outlook.mjs';

test('persistable property forecasts agree with the independent JS implementation',async t=>{
  const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
  const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
  await db.exec('create role anon;create role authenticated;create role service_role');
  await db.exec(await read('automation/e2e/dr/fixture.sql'));
  for (const name of ['20261125190000_bootstrap_enterprise_foundation','20261125193000_add_facility_operations',
    '20261126190000_draqon_field_handoff','20261126221000_facility_council_observations','20261126221500_facility_council_forecasts'])
    await db.exec(await read('supabase/migrations/'+name+'.sql'));
  const [org,owner]=[randomUUID(),randomUUID()];
  const q=(sql,args=[])=>db.query(sql,args);
  await q('insert into auth.users(id) values($1)',[owner]);
  await q("insert into public.organizations(id,name,created_by) values($1,'Parity Hotel',$2)",[org,owner]);
  const asOf='2025-01-15', metric='cash_balance_sar', dates=['2024-12-31','2025-01-07','2025-01-15T09:00:00Z'];
  function month(index){return new Date(Date.UTC(2024,index,1)).toISOString().slice(0,7);}
  const numeric=['estimate','mae','baselineMae','relativeError'];
  const fields=['status','reason','method','historyMonths','historyStart','historyEnd','holdoutMonths','holdoutStart','holdoutEnd','seasonality','asOf','nextMonth','seasonalAdjustment','horizonMonths'];
  const tests=[
    ['flat, last-value heldout',Array(12).fill(30)],
    ['upward trend, median drift',Array.from({length:12},(_,i)=>40+2*i)],
    ['selection segment trend reverses in holdout',[100,105,110,115,120,125,130,135,140,140,140,140]],
    ['structural last-period break',[...Array(11).fill(100),125]],
    ['repeated high surprise',[...Array(9).fill(10),90,10,90]],
    ['flat zero scale',Array(12).fill(0)],
    ['signed negative balance',Array.from({length:12},(_,i)=>-40+i)],
    ['percentage forecast over upper bound',Array.from({length:12},(_,i)=>67+3*i),{metric:'occupancy_pct',bounds:{min:0,max:100}}],
    ['insufficient history',Array(4).fill(30),{offset:8}],
    ['missing interior month',Array(12).fill(30),{omit:5}],
    ['stale last month',Array(11).fill(30)],
    ['unresolved agreement conflict',Array(12).fill(30),{conflict:7}],
    ['two-year repeating pattern and smoother',Array.from({length:24},(_,i)=>[98,100,102][i%3]),{offset:-12}],
    ['empty facility feed',[]]
  ];
  let firstSite;
  async function site(){
    const id=randomUUID();await q("insert into public.facilities(id,organization_id,name) values($1,$2,'Fixture property')",[id,org]);return id;
  }
  async function add(s,m,period,value,source,verifiedAt=dates[2]){
    const id=randomUUID();
    await q("insert into public.facility_council_observations(id,organization_id,facility_id,metric,month,value,source_ref,retrieved_on,verified_by,verified_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [id,org,s,m,period+'-01',value,source,dates[1],owner,verifiedAt]);return id;
  }
  const project=async s=>(await q("select private.facility_council_outlook($1,$2,$3) outlook",[org,s,asOf])).rows[0].outlook;
  for(const [name,values,options={}] of tests) await t.test(name,async()=>{
    const s=await site();firstSite??=s;
    const m=options.metric??metric,points=[],ids=[];
    for(let i=0;i<values.length;i++){
      if(i===options.omit)continue;
      const period=month(i+(options.offset??0));
      const id=await add(s,m,period,values[i],'Original '+period);ids.push(id);
      if(i===options.conflict){
        await add(s,m,period,values[i]+1,'Conflicting '+period);
        points.push({month:period,value:null,source:''});
      }else points.push({month:period,value:values[i],source:'Original '+period});
    }
    const js=forecastSeries(points,asOf,options.bounds??{});
    const batch=await project(s);assert.equal(batch.length,14);
    const sql=batch.find(x=>x.metric===m);
    for(const field of fields)assert.equal(sql[field],js[field],name+' '+field);
    for(const field of numeric){
      if(js[field]===null)assert.equal(sql[field],null,name+' '+field);
      else assert.ok(Math.abs(sql[field]-js[field])<=1e-10*Math.max(1,Math.abs(js[field])),name+' '+field);
    }
    assert.equal(sql.periodCount,points.length);
    assert.equal(sql.observationCount,points.length-(options.conflict===undefined?0:1));
    assert.equal(sql.observations.length,points.length);
    assert.equal(sql.lastValue,points.at(-1)?.value??null);
    assert.equal(batch.filter(x=>x.metric!==m).every(x=>x.estimate===null),true);
    if(options.conflict!==undefined)assert.equal(sql.observations[options.conflict].evidenceIds.length,2);
    else assert.deepEqual(sql.observationIds,ids);
  });
  await t.test('historical issuance ignores late sources and resolutions effective after the local cutoff',async()=>{
    const s=await site(),period='2024-12';
    const a=await add(s,metric,period,100,'Signed preliminary'),b=await add(s,metric,period,90,'Reconciled source');
    await add(s,metric,period,80,'Future correction','2025-01-15T21:00:00Z'); // Riyadh Jan 16.
    await q("insert into public.facility_council_resolutions(organization_id,facility_id,metric,month,chosen_id,evidence_ids,evidence_count,reason,decided_by,decided_at) values($1,$2,$3,$4,$5,$6,2,'Later determination',$7,'2025-01-16T10:00:00Z')",
      [org,s,metric,period+'-01',a,[a,b].sort(),owner]);
    const out=(await project(s)).find(x=>x.metric===metric);
    assert.equal(out.reason,'invalid_observation');assert.equal(out.lastValue,null);assert.equal(out.observations[0].evidenceIds.length,2);
  });
  await t.test('an eligible explicit resolution selects the same value and receipt as the browser',async()=>{
    const s=await site(),values=Array(12).fill(45),points=[];let winner;
    for(let i=0;i<12;i++){
      const period=month(i),a=await add(s,metric,period,values[i],'Verified '+period);
      points.push({month:period,value:values[i],source:'Verified '+period});
      if(i===11){
        const alt=await add(s,metric,period,80,'Alternative last month');winner=a;
        await q("insert into public.facility_council_resolutions(organization_id,facility_id,metric,month,chosen_id,evidence_ids,evidence_count,reason,decided_by,decided_at) values($1,$2,$3,$4,$5,$6,2,'Signed reconciliation',$7,'2025-01-15T10:00:00Z')",
          [org,s,metric,period+'-01',a,[a,alt].sort(),owner]);
      }
    }
    const js=forecastSeries(points,asOf),sql=(await project(s)).find(x=>x.metric===metric);
    assert.equal(sql.status,js.status);assert.equal(sql.estimate,js.estimate);assert.equal(sql.observations.at(-1).observationId,winner);
    assert.equal(sql.observations.at(-1).evidenceIds.length,2);
  });
  await t.test('seeded histories agree across varying lengths, levels and disturbances',async()=>{
    let seed=1701;
    const draw=()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};
    for(let repeat=0;repeat<36;repeat++){
      const n=12+Math.floor(draw()*49),series=Array.from({length:n},(_,i)=>Math.round((20+draw()*7+i*(repeat%4))*100)/100);
      if(repeat%3===0)series[n-1]+=20;
      const points=series.map((value,i)=>({month:month(i+12-n),source:'Seeded synthetic',value}));
      const js=forecastSeries(points,asOf);
      const sql=(await q('select private.council_forecast_score($1,$2,$3,null,null) result',[points.map(r=>r.month+'-01'),series,asOf])).rows[0].result;
      for(const field of fields)assert.equal(sql[field],js[field],'seed '+repeat+' '+field);
      for(const field of numeric){
        if(js[field]===null)assert.equal(sql[field],null);
        else assert.ok(Math.abs(sql[field]-js[field])<=1e-10*Math.max(1,Math.abs(js[field])),'seed '+repeat+' '+field);
      }
    }
  });
  await t.test('private owner-only invocation, including refusal of cross-org site',async()=>{
    for(const role of ['anon','authenticated','service_role']){
      assert.equal((await q("select has_function_privilege($1,'private.facility_council_outlook(uuid,uuid,date)','execute') ok",[role])).rows[0].ok,false);
    }
    await assert.rejects(q("select private.facility_council_outlook($1,$2,$3)",[randomUUID(),firstSite,asOf]),{code:'22023'});
  });
});
