import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { actions, assess, fingerprint, textFingerprint } from '../enterprise/control-policy.mjs';
import { ControlLedger } from '../enterprise/control-ledger.mjs';

const NOW=Date.UTC(2026,10,26,12);
const records=[], metrics={};
const evidenceDirectory=process.env.DRAQON_TEST_REPORT_DIR;
function scenario(group,name,input,expected,run) {
  const id='CTL-'+String(recordsPlanned++).padStart(3,'0');
  test(id+' '+name,async()=>{
    const start=performance.now();
    let actual,status='PASS',fault=null;
    try {
      actual=await run();
      assert.deepEqual(actual,expected);
    } catch(error) {
      status='FAIL';fault=String(error.message);throw error;
    } finally {
      records.push({id,group,name,input,expected,actual:actual??null,status,
        milliseconds:Number((performance.now()-start).toFixed(3)),externalApiCostUSD:0,
        evidence:import.meta.url.split('/automation/').at(-1)+'#'+id,
        correctiveAction:fault,environment:'isolated Node.js; synthetic inputs and verifier; no external calls'});
    }
  });
}
let recordsPlanned=1;
function fixture(action='prepare_draft') {
  const command={taskId:'T-7',action,targetId:'asset-1',revision:1,description:'Synthetic HVAC handover'};
  const digest=fingerprint(command);
  const bound={tenantId:'tenant-A',digest,issuedAt:NOW-1000,expiresAt:NOW+3600000};
  const trust={
    subject:{tenantId:'tenant-A',actorId:'coordinator',maxLevel:5,allowedActions:Object.keys(actions)},
    resource:{tenantId:'tenant-A',id:'asset-1',risk:'low',dataClass:'public',status:'in_progress',
      visit:{tenantId:'tenant-A',id:'visit-1',targetId:'asset-1',verified:true}},
    environment:'sandbox',routineAllowlisted:true,minimized:true,maxCostMinor:10,
    inputReview:{tenantId:'tenant-A',id:'redaction-1',dataClass:'public',textDigest:textFingerprint(command.description),cleared:true,issuedAt:NOW-1000,expiresAt:NOW+3600000},
    approval:{...bound,id:'approval-1',decision:'approved',approverId:'owner',role:'authorized_approver',limitMinor:10},
    review:{...bound,id:'review-1',status:'accepted',reviewerId:'reviewer',evidenceId:'finding-1'},
  };
  return {command,trust};
}
function nestedSet(root,key,value) {
  const parts=key.split('.');
  const last=parts.pop();
  const target=parts.reduce((o,p)=>o[p],root);
  if(value===undefined) delete target[last]; else target[last]=value;
}
function policyCase(name,action,edits,expected,group='policy') {
  scenario(group,name,{action,edits:edits.map(([field,value])=>({field,value:value===undefined?'(absent)':value}))},expected,()=>{
    const f=fixture(action);
    for(const [field,value] of edits) nestedSet(f,field,value);
    return assess(f.command,f.trust,NOW).code;
  });
}
for (const [action,rule] of Object.entries(actions)) {
  for (let level=0;level<=5;level++) {
    policyCase('L'+level+' requesting '+action,action,[['trust.subject.maxLevel',level]],
      level>=rule.level?'AUTHORIZED':'LEVEL_DENIED','autonomy');
  }
}
const edits=[
  ['missing task identifier','command.taskId',undefined,'INVALID_COMMAND'],
  ['blank asset reference','command.targetId','','INVALID_COMMAND'],
  ['unversioned proposal','command.revision',0,'INVALID_COMMAND'],
  ['fractional revision','command.revision',1.5,'INVALID_COMMAND'],
  ['empty description','command.description','  ','INVALID_COMMAND'],
  ['oversized description','command.description','x'.repeat(4001),'INVALID_COMMAND'],
  ['model proposes spending ceiling','command.maxCostMinor',1,'INVALID_COMMAND'],
  ['model supplies approval','command.approved',true,'INVALID_COMMAND'],
  ['model supplies identity','command.subject','owner','INVALID_COMMAND'],
  ['inter-tenant dispatch request','trust.resource.tenantId','tenant-B','TENANT_OR_RESOURCE'],
  ['unresolved target','trust.resource.id','asset-2','TENANT_OR_RESOURCE'],
  ['resource lookup missing','trust.resource',null,'TENANT_OR_RESOURCE'],
  ['identity missing','trust.subject',null,'IDENTITY_OR_PERMISSION'],
  ['actor not resolved','trust.subject.actorId','','IDENTITY_OR_PERMISSION'],
  ['tenant not resolved','trust.subject.tenantId',null,'IDENTITY_OR_PERMISSION'],
  ['no action entitlement','trust.subject.allowedActions',[],'IDENTITY_OR_PERMISSION'],
  ['unrecognized entitlement level','trust.subject.maxLevel',6,'IDENTITY_OR_PERMISSION'],
  ['negative entitlement level','trust.subject.maxLevel',-1,'IDENTITY_OR_PERMISSION'],
  ['text entitlement level','trust.subject.maxLevel','5','IDENTITY_OR_PERMISSION'],
  ['unknown risk classification','trust.resource.risk','unknown','RISK_UNCLASSIFIED'],
  ['classification missing','trust.resource.dataClass',undefined,'DATA_UNCLASSIFIED'],
  ['invalid disclosure classification','trust.resource.dataClass','open-ish','DATA_UNCLASSIFIED'],
  ['restricted model input','trust.resource.dataClass','restricted','MODEL_DATA_DENIED'],
  ['deployment environment omitted','trust.environment',undefined,'ENVIRONMENT_DENIED'],
  ['production adapter prohibited here','trust.environment','production','ENVIRONMENT_DENIED'],
  ['estimate missing','trust.maxCostMinor',undefined,'COST_UNAVAILABLE'],
  ['negative amount','trust.maxCostMinor',-1,'COST_UNAVAILABLE'],
  ['fractional minor units','trust.maxCostMinor',0.9,'COST_UNAVAILABLE'],
  ['unbounded numeric amount','trust.maxCostMinor',1e25,'COST_UNAVAILABLE'],
  
  ['approved internal model inputs','trust.resource.dataClass','internal','AUTHORIZED']
];
for(const [name,field,value,expected] of edits) policyCase(name,'prepare_draft',[[field,value]],expected);
for(const name of ['change_policy','raise_budget','grant_role','deploy_production','delete_property','sign_contract','authorize_payment'])
  policyCase('Prohibited tool '+name,'recommend',[['command.action',name]],'ACTION_DENIED','reserved');
policyCase('Internal text on a public asset still requires minimization','recommend',[['trust.inputReview.dataClass','internal'],['trust.minimized',false]],'INPUT_NOT_CLEARED');
policyCase('Unminimized internal model input','recommend',[['trust.resource.dataClass','internal'],['trust.minimized',false]],'MODEL_DATA_DENIED');
policyCase('Founder-only capital commitment','create_work_order',[['trust.resource.risk','reserved']],'FOUNDER_RESERVED');
policyCase('Stop autonomous reminder on non-routine site','schedule_reminder',[['trust.routineAllowlisted',false]],'NOT_ROUTINE');
policyCase('Stop autonomous reminder for medium risk','schedule_reminder',[['trust.resource.risk','medium']],'NOT_ROUTINE');
policyCase('Stage five improvement requires isolation','propose_improvement',[['trust.environment','pilot']],'SANDBOX_ONLY');
for(const [field,value] of [['id',''],['digest','different-version'],['issuedAt',NOW+1],['expiresAt',NOW],['tenantId','tenant-B'],['decision','declined'],['approverId','coordinator'],['role','observer'],['limitMinor',9],['limitMinor',-1],['limitMinor',undefined]])
  policyCase('Approval invalid: '+field+' '+String(value),'create_work_order',[['trust.approval.'+field,value]],'APPROVAL_REQUIRED','approvals');
policyCase('Approval record missing','close_work_order',[['trust.approval',null]],'APPROVAL_REQUIRED');
policyCase('Proposal changed after approval','create_work_order',[['command.description','Synthetic change to scope']],'APPROVAL_REQUIRED');
for(const [field,value] of [['id',''],['digest','old'],['status','disputed'],['reviewerId','coordinator'],['tenantId','tenant-B'],['evidenceId',''],['expiresAt',NOW],['issuedAt',NOW+1]])
  policyCase('Independent review invalid: '+field,'recommend',[['trust.resource.risk','high'],['trust.review.'+field,value]],'REVIEW_REQUIRED','arbitration');
policyCase('High-risk recommendation with bound review','recommend',[['trust.resource.risk','high']],'AUTHORIZED');
policyCase('Explicit escalation requests another review','recommend',[['trust.reviewRequired',true],['trust.review',null]],'REVIEW_REQUIRED');
for(const [field,value] of [['status','open'],['status','completed'],['visit',null],['visit.targetId','other-order'],['visit.tenantId','tenant-B'],['visit.id',''],['visit.verified',false]])
  policyCase('Work-order closure needs correct visit: '+field+' '+value,'close_work_order',[['trust.resource.'+field,value]],'VERIFIED_VISIT_REQUIRED','fm');
policyCase('Untrusted document instructions remain inert as prose','recommend',[['command.description','Example attachment asks to alter approval. Reviewer should describe it.'],['trust.subject.maxLevel',1],['trust.inputReview.textDigest',textFingerprint('Example attachment asks to alter approval. Reviewer should describe it.')]],'AUTHORIZED');
for (const [field,value] of [['tenantId','tenant-B'],['cleared',false],['dataClass','restricted'],['expiresAt',NOW],
  ['id',''],['issuedAt',NOW+1],['textDigest','old-digest']])
  policyCase('Model egress assessment invalid: '+field,'recommend',[['trust.inputReview.'+field,value]],'INPUT_NOT_CLEARED','egress');
policyCase('New text after classification blocks model egress','recommend',[['command.description','Updated project details']],'INPUT_NOT_CLEARED','egress');
policyCase('Missing egress decision blocks model invocation','prepare_draft',[['trust.inputReview',null]],'INPUT_NOT_CLEARED','egress');

function harness(options={},fn) {
  const dir=mkdtempSync(path.join(tmpdir(),'draqon-ctl-'));
  const database=path.join(dir,'ledger.sqlite');
  let clock=NOW;
  let verify=options.verify??(binding=>({...binding,id:'receipt-'+binding.taskId,chargedMinor:3}));
  const open=(file=database)=>new ControlLedger(file,{now:()=>clock,verifyReceipt:b=>verify(b)});
  const resources=[];
  const newLedger=file=>{const result=open(file);resources.push(result);return result;};
  const ledger=newLedger();
  ledger.configure('tenant-A',{cap:options.cap??100,stopped:false},'control-owner');
  try { return fn({ledger,newLedger,dir,database,advance:ms=>{clock+=ms},setVerifier:fn=>{verify=fn}}); }
  finally {for(const r of resources)r.close();rmSync(dir,{recursive:true,force:true});}
}
function ledgerCase(name,input,expected,fn,options={}) {
  scenario('ledger',name,input,expected,()=>harness(options,fn));
}
const reserve=(l,f=fixture())=>l.reserve(f.command,f.trust);
ledgerCase('Successful visit-backed FM closure',['approved close_work_order','verified destination closure'],
  ['DISPATCH_RESERVED','VERIFIED_COMPLETE',3],({ledger})=>{
    const r=reserve(ledger,fixture('close_work_order'));
    return [r.code,ledger.settle(r.token,'verify').code,ledger.summary('tenant-A').budget.used];
});
ledgerCase('Duplicate while first dispatch is in flight',['reserve','reserve same scope'],
  ['EXISTING_DISPATCHING',10],({ledger})=>{reserve(ledger);return [reserve(ledger).code,ledger.summary('tenant-A').budget.used]});
ledgerCase('Duplicate after delivery preserves charge',['reserve','verify','repeat'],['EXISTING_COMPLETED',3],
  ({ledger})=>{ledger.settle(reserve(ledger).token,'verify');return [reserve(ledger).code,ledger.summary('tenant-A').budget.used]});
ledgerCase('Idempotency key cannot change work scope',['reserve','reuse key for updated scope'],'IDEMPOTENCY_CONFLICT',
  ({ledger})=>{reserve(ledger);const f=fixture();f.command.description='Another task';f.trust.inputReview.textDigest=textFingerprint(f.command.description);return reserve(ledger,f).code});
ledgerCase('Tenant B cannot observe tenant A via task replay',['tenant A reserve','tenant B identity targeting A'],
  'TENANT_OR_RESOURCE',({ledger})=>{reserve(ledger);const f=fixture();f.trust.subject.tenantId='tenant-B';return reserve(ledger,f).code});
ledgerCase('Tenant budgets independent with identical task IDs',['A capped 10','B capped 10','same task id'],
  ['DISPATCH_RESERVED',10,10],({ledger})=>{reserve(ledger);ledger.configure('tenant-B',{cap:10,stopped:false},'owner-b');
    const f=fixture();f.trust.subject.tenantId='tenant-B';f.trust.resource.tenantId='tenant-B';f.trust.inputReview.tenantId='tenant-B';
    return [reserve(ledger,f).code,ledger.summary('tenant-A').budget.used,ledger.summary('tenant-B').budget.used]});
ledgerCase('Kill switch blocks new work',['pause','reserve'],'STOPPED',({ledger})=>{
  ledger.configure('tenant-A',{cap:100,stopped:true},'owner');return reserve(ledger).code;
});
ledgerCase('Operator can resume after pause',['pause','resume','reserve'],'DISPATCH_RESERVED',({ledger})=>{
  for(const stopped of [true,false])ledger.configure('tenant-A',{cap:100,stopped},'owner');return reserve(ledger).code;
});
ledgerCase('Unprovisioned tenant fails closed',['no B cap','reserve B'],'STOPPED',({ledger})=>{
  const f=fixture();f.trust.subject.tenantId='tenant-B';f.trust.resource.tenantId='tenant-B';f.trust.inputReview.tenantId='tenant-B';return reserve(ledger,f).code;
});
ledgerCase('Budget exhaustion before dispatch',['required 10','remaining 9'],['BUDGET_EXCEEDED',0],
  ({ledger})=>[reserve(ledger).code,ledger.summary('tenant-A').budget.used],{cap:9});
ledgerCase('Exact ceiling accepted',['required 10','remaining 10'],'DISPATCH_RESERVED',({ledger})=>reserve(ledger).code,{cap:10});
ledgerCase('Extra request cannot consume reserved funds',['task A 10','task B 10','limit 10'],
  'BUDGET_EXCEEDED',({ledger})=>{reserve(ledger);const f=fixture();f.command.taskId='T-8';return reserve(ledger,f).code},{cap:10});
ledgerCase('Spent and held funds survive cap edits',['hold 10','lower cap to 5'],10,({ledger})=>{
  reserve(ledger);assert.throws(()=>ledger.configure('tenant-A',{cap:5,stopped:false},'owner'));return ledger.summary('tenant-A').budget.used;
});
ledgerCase('No-effect transient error schedules bounded retry',['reserve','known_not_applied','retry immediately'],
  ['RETRY_SCHEDULED','BACKOFF',0],({ledger})=>{const r=ledger.settle(reserve(ledger).token,'known_not_applied');
    return [r.code,reserve(ledger).code,ledger.summary('tenant-A').budget.used]});
ledgerCase('Retry reacquires authorization',['retry due','approval expired'],'APPROVAL_REQUIRED',({ledger,advance})=>{
  const f=fixture('create_work_order');ledger.settle(reserve(ledger,f).token,'known_not_applied');advance(3600000);return reserve(ledger,f).code;
});
ledgerCase('Kill switch blocks retries',['retry due','pause'],'STOPPED',({ledger,advance})=>{
  ledger.settle(reserve(ledger).token,'known_not_applied');advance(1000);ledger.configure('tenant-A',{cap:100,stopped:true},'owner');
  return reserve(ledger).code;
});
ledgerCase('Retry terms cannot silently change',['same digest','estimate increases to 11'],'TERMS_CHANGED',({ledger,advance})=>{
  ledger.settle(reserve(ledger).token,'known_not_applied');advance(1000);const f=fixture();f.trust.maxCostMinor=11;
  return reserve(ledger,f).code;
});
ledgerCase('Capped retries dead-letter the third confirmed failure',['transient x3','1s + 2s virtual clock'],
  ['RETRY_SCHEDULED','RETRY_SCHEDULED','DEAD_LETTER','EXISTING_DEAD_LETTER',0],({ledger,advance})=>{
    const statuses=[];
    for(const ms of [1000,2000,4000]){statuses.push(ledger.settle(reserve(ledger).token,'known_not_applied').code);advance(ms)}
    return [...statuses,reserve(ledger).code,ledger.summary('tenant-A').budget.used];
});
ledgerCase('Permanent no-effect failure does not retry',['expired connector credentials confirmed before dispatch'],
  ['DEAD_LETTER','EXISTING_DEAD_LETTER'],({ledger})=>[ledger.settle(reserve(ledger).token,'permanent_not_applied').code,reserve(ledger).code]);
ledgerCase('Timeout after possible execution never auto-retries',['vendor timeout','retry attempt'],
  ['RECONCILE_REQUIRED','EXISTING_RECONCILE',10],({ledger})=>{const failed=ledger.settle(reserve(ledger).token,'timeout');
  return [failed.code,reserve(ledger).code,ledger.summary('tenant-A').budget.used]});
ledgerCase('Recovery checks existing destination effect',['response lost','later fetch matching receipt'],
  ['RECONCILE_REQUIRED','VERIFIED_COMPLETE',3],({ledger})=>{
    const r=reserve(ledger);return [ledger.settle(r.token,'timeout').code,ledger.settle(r.token,'verify').code,ledger.summary('tenant-A').budget.used];
});
ledgerCase('Stale response cannot settle next retry',['first attempt refused','new token','old response'],
  ['UNRECOGNIZED_ATTEMPT','VERIFIED_COMPLETE'],({ledger,advance})=>{
    const first=reserve(ledger);ledger.settle(first.token,'known_not_applied');advance(1100);
    const second=reserve(ledger);return [ledger.settle(first.token,'verify').code,ledger.settle(second.token,'verify').code];
});
for(const [field,value] of [['tenantId','tenant-B'],['taskId','missing-task'],['targetId','other-asset'],
  ['digest','different-input'],['type','model-opinion'],['id',''],['chargedMinor',-1],['chargedMinor',11],['chargedMinor',null]])
  ledgerCase('Unbound or invalid destination receipt: '+field+' '+value,{field,value},['RECONCILE_REQUIRED',10],({ledger})=>{
    return [ledger.settle(reserve(ledger).token,'verify').code,ledger.summary('tenant-A').budget.used];
  },{verify:b=>({...b,id:'R-1',chargedMinor:3,[field]:value})});
ledgerCase('Independent verifier unavailable',['source read unavailable'],'RECONCILE_REQUIRED',({ledger})=>ledger.settle(reserve(ledger).token,'verify').code,
  {verify(){throw new Error('synthetic provider unavailable')}});
ledgerCase('Receipt reused for different task',['complete A','same receipt ID for B'],'RECONCILE_REQUIRED',({ledger})=>{
  ledger.settle(reserve(ledger).token,'verify');const f=fixture();f.command.taskId='T-8';return ledger.settle(reserve(ledger,f).token,'verify').code;
},{verify:b=>({...b,id:'shared-receipt',chargedMinor:0})});
ledgerCase('Duplicate delivery acknowledgement does not double bill',['verify','verify again'],['EXISTING_COMPLETED',3],({ledger})=>{
  const r=reserve(ledger);ledger.settle(r.token,'verify');return [ledger.settle(r.token,'verify').code,ledger.summary('tenant-A').budget.used];
});
ledgerCase('Recovery after worker restart retains dispatch reservation',['new SQLite connection same file','same request'],
  ['EXISTING_DISPATCHING',10],({ledger,newLedger})=>{
    reserve(ledger);const restarted=newLedger();return [reserve(restarted).code,restarted.summary('tenant-A').budget.used];
});
ledgerCase('Confirmed retry survives process boundary',['decline before apply','new connection','advance backoff'],
  2,({ledger,newLedger,advance})=>{ledger.settle(reserve(ledger).token,'known_not_applied');advance(1200);return reserve(newLedger()).attempt});
ledgerCase('Synthetic SQLite snapshot restored with replay protection',['completed request','snapshot','open restored copy'],
  ['EXISTING_COMPLETED',3,1],({ledger,dir,database,newLedger})=>{
    ledger.settle(reserve(ledger).token,'verify');
    const snapshot=path.join(dir,'snapshot.sqlite'), start=performance.now();
    const db=new DatabaseSync(database);try{db.prepare('VACUUM INTO ?').run(snapshot)}finally{db.close()}
    const restored=newLedger(snapshot);
    const result=[reserve(restored).code,restored.summary('tenant-A').budget.used,restored.summary('tenant-A').states.completed];
    metrics.syntheticSnapshotAndVerifyMs=Number((performance.now()-start).toFixed(3));return result;
});
ledgerCase('Incompatible schema version update rolls back locally',['SQLite transaction','invalid change to staging schema'],
  ['EXISTING_COMPLETED',3],({ledger,database})=>{
    ledger.settle(reserve(ledger).token,'verify');const db=new DatabaseSync(database);
    try{db.exec('BEGIN');db.exec('ALTER TABLE events ADD COLUMN sandbox_data TEXT');
      assert.throws(()=>db.exec('ALTER TABLE missing_stage_table ADD COLUMN v TEXT'));db.exec('ROLLBACK');
      assert.equal(db.prepare("SELECT count(*) AS n FROM pragma_table_info('events') WHERE name='sandbox_data'").get().n,0);
    }finally{db.close()}
    return [reserve(ledger).code,ledger.summary('tenant-A').budget.used];
});
ledgerCase('Sandbox improvement produces only a verified review artifact',['L5','sandbox-only','independent receipt'],
  ['DISPATCH_RESERVED','VERIFIED_COMPLETE'],({ledger})=>{const r=reserve(ledger,fixture('propose_improvement'));return [r.code,ledger.settle(r.token,'verify').code]});
ledgerCase('Synthetic serial burst benchmark',['1000 distinct tasks','1000 replay requests','single host & worker'],
  [1000,1000,1000,3000],({ledger})=>{
    const times=[],start=performance.now();let accepted=0,replays=0;
    for(let i=0;i<1000;i++){
      const f=fixture();f.command.taskId='bench-'+i;const began=performance.now();
      const r=reserve(ledger,f);times.push(performance.now()-began);
      if(r.code==='DISPATCH_RESERVED')accepted++;
      ledger.settle(r.token,'verify');if(reserve(ledger,f).code==='EXISTING_COMPLETED')replays++;
    }
    const elapsed=performance.now()-start;times.sort((a,b)=>a-b);
    metrics.serialBurst={distinctTasks:1000,replayRequests:1000,localReservationP95Ms:Number(times[949].toFixed(3)),
      elapsedMs:Number(elapsed.toFixed(3)),verifiedTasksPerSecond:Number((1000000/elapsed).toFixed(2)),
      scope:'serial single-process SQLite, synthetic immediate verifier, no network or model latency'};
    return [accepted,replays,ledger.summary('tenant-A').states.completed,ledger.summary('tenant-A').budget.used];
},{cap:10000});

// Each worker opens its own SQLite connection. The barrier allows competing
// admissions to begin together, independently of the main event loop.
const workerCode = `
  const {parentPort,workerData}=require('node:worker_threads');
  (async()=>{
    const {ControlLedger}=await import(workerData.module);
    const store=new ControlLedger(workerData.db,{now:()=>workerData.now,verifyReceipt:()=>null});
    parentPort.postMessage('ready');
    parentPort.once('message',()=>{
      try { parentPort.postMessage(store.reserve(workerData.command,workerData.trust).code) }
      finally {store.close();parentPort.close()}
    });
  })().catch(e=>{throw e});
`;
for (const sameTask of [true,false]) {
  scenario('concurrency',sameTask?'Concurrent redeliveries reserve exactly once':'Concurrent different tasks respect the shared budget',
    {connections:8,sameTask,limitMinor:30,eachBoundMinor:10},
    sameTask?[1,7,0,10]:[3,0,5,30],async()=>{
      const dir=mkdtempSync(path.join(tmpdir(),'draqon-concurrent-')), db=path.join(dir,'ledger.sqlite');
      const main=new ControlLedger(db,{now:()=>NOW,verifyReceipt:()=>null});
      main.configure('tenant-A',{cap:30,stopped:false},'control-owner');
      const workers=[];
      try {
        const readiness=[];
        for(let i=0;i<8;i++){
          const {command,trust}=fixture();if(!sameTask)command.taskId='T-concurrent-'+i;
          const worker=new Worker(workerCode,{eval:true,workerData:{db,command,trust,now:NOW,
            module:new URL('../enterprise/control-ledger.mjs',import.meta.url).href}});
          workers.push(worker);readiness.push(once(worker,'message'));
        }
        await Promise.all(readiness);
        const completions=workers.map(w=>once(w,'message'));
        workers.forEach(w=>w.postMessage('dispatch'));
        const codes=(await Promise.all(completions)).flat();
        return [...['DISPATCH_RESERVED','EXISTING_DISPATCHING','BUDGET_EXCEEDED'].map(x=>codes.filter(c=>c===x).length),
          main.summary('tenant-A').budget.used];
      } finally {
        await Promise.all(workers.map(w=>w.terminate()));main.close();rmSync(dir,{recursive:true,force:true});
      }
    });
}

after(()=>{
  if(!evidenceDirectory)return;
  mkdirSync(evidenceDirectory,{recursive:true});
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),node:process.version,
    scope:'Local policy and SQLite dispatch ledger; all persons, approvals, resource records and destination receipts synthetic.',
    monetaryUnits:'integer minor currency units in fixtures; external API cost is zero; local compute cost unmetered',
    benchmark:metrics,planned:recordsPlanned-1,executed:records.length,passed:records.filter(r=>r.status==='PASS').length,
    failed:records.filter(r=>r.status!=='PASS').length,cases:records};
  writeFileSync(path.join(evidenceDirectory,'execution.json'),JSON.stringify(report,null,2)+'\n');
});

