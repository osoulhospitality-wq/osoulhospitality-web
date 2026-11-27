import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {stageCouncilImport,importCouncil} from '../enterprise/council-import.mjs';

const org='00000000-0000-4000-8000-000000000001',facility='00000000-0000-4000-8000-000000000002';
const source='00000000-0000-4000-8000-000000000003',approval='00000000-0000-4000-8000-000000000004',actor='00000000-0000-4000-8000-000000000005';
const now=new Date('2026-11-26T12:00:00Z'),origin='http://127.0.0.1:54321';
const header='organization_id,facility_id,metric,month,value,source_system,source_export_id,retrieved_on,approval_ref';
const makeRow=(metric='occupancy_pct',value='70',overrides={})=>Object.values(Object.assign({org,facility,metric,month:'2026-10-01',value,system:'PMS',source,retrieved:'2026-11-01',approval},overrides)).join(',');
const stage=(...lines)=>stageCouncilImport([header,...lines].join('\n'),{org,facility,now});
const token=claims=>['eyJhbGciOiJSUzI1NiJ9',Buffer.from(JSON.stringify({role:'authenticated',aal:'aal2',aud:'authenticated',iss:origin+'/auth/v1',exp:now.getTime()/1000+600,sub:actor,...claims})).toString('base64url'),'synthetic'].join('.');
const config=()=>({DRAQON_APPROVED_PROJECT_URL:origin,DRAQON_PUBLISHABLE_KEY:'sb_publishable_synthetic',DRAQON_USER_ACCESS_TOKEN:token({})});
const args={apply:true,url:origin,now};
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
test('BOM, quoted headers, reordered columns and canonical decimal preserve the same scoped receipt',()=>{
 const a=stage(makeRow());const lines=[header.split(',').reverse().map(c=>'"'+c+'"').join(','),makeRow('occupancy_pct','070.000').split(',').reverse().join(',')];
 const b=stageCouncilImport('\uFEFF'+lines.join('\r\n')+'\r\n',{org,facility,now});assert.equal(a.rows[0].id,b.rows[0].id);assert.equal(b.rows[0].payload.p_value,'70');
});
test('closed month, retrieval, calendar validity and Riyadh month boundary',()=>{
 assert.throws(()=>stage(makeRow(undefined,undefined,{retrieved:'2026-10-30'})),/retrieval/);
 assert.throws(()=>stage(makeRow(undefined,undefined,{retrieved:'2026-11-28'})),/retrieval/);
 assert.throws(()=>stage(makeRow(undefined,undefined,{month:'2026-11-01'})),/not_closed/);
 assert.throws(()=>stage(makeRow(undefined,undefined,{retrieved:'2026-02-30'})),/retrieval/);
 const raw=header+'\n'+makeRow(undefined,undefined,{month:'2026-11-01',retrieved:'2026-11-30'});
 assert.equal(stageCouncilImport(raw,{org,facility,now:new Date('2026-11-30T21:05:00Z')}).rows.length,1);
});
test('catalog validation accepts signed cash and rejects fractional count, excessive money precision and percent',()=>{
 assert.equal(stage(makeRow('cash_balance_sar','-10.20')).rows[0].payload.p_value,'-10.2');
 for(const pair of [['unknown','1'],['qualified_leads','2.1'],['operating_cost_sar','1.001'],['operating_cost_sar','-2'],['lead_conversion_pct','100.1'],['energy_kwh','-3'],['occupancy_pct','=2+3']])assert.throws(()=>stage(makeRow(...pair)));
});
test('unexpected columns, duplicate headers, names, email and non-opaque source / approval references are rejected',()=>{
 for(const raw of [header+',guest_email\n'+makeRow()+',qa@example.invalid',header.replace('source_export_id','metric')+'\n'+makeRow(),header+'\n'+makeRow(undefined,undefined,{source:'a.person@example.invalid'}),header+'\n'+makeRow(undefined,undefined,{approval:'Jane Doe'}),header+'\n'+makeRow(undefined,undefined,{system:'reservation 1234'}),header+'\n'+makeRow()+'\n"not closed'])assert.throws(()=>stageCouncilImport(raw,{org,facility,now}));
});
test('mixed organizations or sites fail staging before any write',()=>{
 assert.throws(()=>stage(makeRow(),makeRow(undefined,undefined,{org:actor})),/scope_mismatch/);assert.throws(()=>stage(makeRow(undefined,undefined,{facility:actor})),/scope_mismatch/);
});
test('distinct source revisions remain independently addressable and conflicting evidence is visible',()=>{
 const batch=stage(makeRow(),makeRow('occupancy_pct','71'),makeRow());
 assert.notEqual(batch.rows[0].id,batch.rows[1].id);assert.equal(batch.rows[0].id,batch.rows[2].id);assert.deepEqual(batch.disagreements,['occupancy_pct/2026-10-01']);
 const explicit=header+',request_id\n'+makeRow()+','+actor+'\n'+makeRow('occupancy_pct','71')+','+actor;
 assert.throws(()=>stageCouncilImport(explicit,{org,facility,now}),/payload_conflict/);
});
test('dry run is offline by default and report omits raw values and references',async()=>{
 const out=await importCouncil(stage(makeRow()),{request:()=>assert.fail('network'),env:{}});assert.equal(out.mode,'dry_run');assert.equal(out.rows[0].state,'validated');assert.ok(!JSON.stringify(out).includes(approval));assert.ok(!JSON.stringify(out).includes('p_value'));
});
test('apply rejects mismatched origin, insecure remote URL, non-user identity, service key and expired sessions offline',async()=>{
 for(const override of [{url:'https://wrong.example'},{url:'http://remote.example'},{url:'http://user@127.0.0.1:54321'},{url:origin+'/other'},{url:origin+'?x=1'}])await assert.rejects(importCouncil(stage(makeRow()),{...args,...override,env:config(),request:()=>assert.fail('network')}));
 for(const c of [{role:'service_role'},{role:'anon'},{is_anonymous:true},{aal:'aal1'},{exp:0},{aud:'other'},{iss:'https://other.example/auth/v1'}])await assert.rejects(importCouncil(stage(makeRow()),{...args,env:{...config(),DRAQON_USER_ACCESS_TOKEN:token(c)},request:()=>assert.fail('network')}));
 for(const key of ['sb_secret_synthetic',token({role:'service_role'})])await assert.rejects(importCouncil(stage(makeRow()),{...args,env:{...config(),DRAQON_PUBLISHABLE_KEY:key},request:()=>assert.fail('network')}));
});
test('server validation of the signed user precedes every batch; redirect credentials are never forwarded',async()=>{
 let calls=0;await assert.rejects(importCouncil(stage(makeRow()),{...args,env:config(),request:(url,opt)=>{calls++;assert.equal(url,origin+'/auth/v1/user');assert.equal(opt.redirect,'error');return json({id:approval});}}),/server_user_mismatch/);assert.equal(calls,1);
});
test('unknown delivery, unprocessed tail and safe verified replay; mismatched resume rejected before network',async()=>{
 const batch=stage(makeRow(),makeRow('qualified_leads','2'),makeRow('guest_complaints','1'));
 const db=new Set();let dropped=false,writes=0;
 async function request(url,opts){
   if(url.endsWith('/user'))return json({id:actor,is_anonymous:false});
   assert.equal(opts.redirect,'error');assert.equal(url,origin+'/rest/v1/rpc/facility_council_record');const body=JSON.parse(opts.body);
   writes++;db.add(body.p_id);if(!dropped&&body.p_metric==='qualified_leads'){dropped=true;throw new Error('ambiguous network result');}return json(body.p_id);
 }
 const opts={...args,env:config(),request};const first=await importCouncil(batch,opts);
 assert.deepEqual(first.rows.map(x=>x.state),['acknowledged','unknown','unprocessed']);assert.equal(db.size,2);
 const snapshots=[];const next=await importCouncil(batch,{...opts,resume:first,persist:r=>snapshots.push(structuredClone(r))});
 assert.deepEqual(next.rows.map(x=>x.state),['acknowledged','acknowledged','acknowledged']);assert.equal(db.size,3);assert.equal(writes,5);assert.equal(snapshots.length,4);
 await assert.rejects(importCouncil(batch,{...opts,resume:{...first,fileDigest:'other'},request:()=>assert.fail('network')}),/resume_manifest_mismatch/);
});
test('server RLS rejection and shape errors preserve scope and omit remote personal error strings',async()=>{
 const opts={...args,env:config(),request:u=>u.endsWith('/user')?json({id:actor}):json({code:'42501',message:'private user address'},403)};
 const r=await importCouncil(stage(makeRow(),makeRow('guest_complaints','1')),opts);assert.equal(r.rows[0].state,'rejected');assert.equal(r.rows[0].code,'42501');assert.equal(r.rows[1].state,'unprocessed');assert.ok(!JSON.stringify(r).includes('private user'));
});
test('normal offline CLI entry point writes a receipt-only report with all rows',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'council-aggregate-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const csv=join(dir,'approved.csv'),report=join(dir,'report.json');await writeFile(csv,header+'\n'+makeRow(undefined,undefined,{month:'2001-01-01',retrieved:'2001-02-01'}));
 const c=spawnSync(process.execPath,['automation/enterprise/council-import.mjs','--input',csv,'--org',org,'--facility',facility,'--report',report],{encoding:'utf8'});
 assert.equal(c.status,0,c.stderr);assert.equal(JSON.parse(await readFile(report,'utf8')).rows[0].state,'validated');
});
