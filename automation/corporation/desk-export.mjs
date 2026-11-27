// Export one scoped job from the trusted local ledger. Caller controls OS file access.
// This adapter intentionally omits contact data, raw inputs, approval notes and job output.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {readSnapshot} from './desk-evidence.mjs';

const stages={planned:'pending',produced:'in_progress',reviewed:'in_progress',blocked:'blocked',closed:'completed'};
export function snapshotFromLedgerReport(report, tenant, now=new Date()){
  if(!tenant || report?.tenant!==tenant || !Object.hasOwn(stages,report.stage) || typeof report.task!=='string' ||
     !['work_orders','sar_budget'].includes(report.kind) || !Array.isArray(report.events) || !report.events.length ||
     report.events.length>995 || !Number.isSafeInteger(report.version) || report.version<1)throw Error('Invalid scoped job report');
  const actor=report.kind==='sar_budget'?'CFO':'COO',date=now.toISOString();
  const items=report.events.map((event,i)=>{
    if(!['COS','COO','CFO','CQO'].includes(event.actor)|| typeof event.at!=='string' ||
       !Number.isFinite(Date.parse(event.at)) || Date.parse(event.at)>now.getTime())throw Error('Invalid ledger event');
    return {tenant,feed:'events',key:String(i+1),title:event.action+' · '+report.task,owner:event.actor,
      status:'measured',sourceRef:'op_events/'+report.task+'#'+(i+1),observedAt:date};
  });
  if(report.stage==='closed' && (!report.proof?.accepted || !report.events.some(e=>e.action==='verified' && e.actor==='CQO') ||
     !report.events.some(e=>e.action==='close' && e.actor==='COS')))throw Error('Verified closure evidence required');
  items.push({tenant,feed:'tasks',key:report.task,title:report.task,owner:report.stage==='produced'?'CQO':actor,
    status:stages[report.stage],sourceRef:'op_jobs/'+report.task+'/v'+report.version,observedAt:date});
  const times=report.events.map(e=>Date.parse(e.at));
  const snapshot={version:1,origin:'local-ledger',tenant,from:new Date(Math.min(...times)).toISOString(),
    to:new Date(Math.max(...times)).toISOString(),asOf:date,metrics:[],items};
  readSnapshot(snapshot,tenant,now);
  return snapshot;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [tenant]=process.argv.slice(2);
    const input=readFileSync(0,'utf8');
    if(Buffer.byteLength(input)>1024*1024)throw Error('Input too large');
    console.log(JSON.stringify(snapshotFromLedgerReport(JSON.parse(input),tenant)));
  }catch(error){console.error(error.message);process.exitCode=1}
}
