#!/usr/bin/env node
import { createHash,randomUUID } from 'node:crypto';
import { readFile,rename,unlink,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { councilMetrics } from '../../command-center/enterprise/src/facility-council.mjs';

const columns=['organization_id','facility_id','metric','month','value','source_system','source_export_id','retrieved_on','approval_ref'];
const metrics=new Map(councilMetrics.map(m=>[m.id,m.unit[1]]));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest=text=>createHash('sha256').update(text).digest('hex');
const fail=code=>{throw new Error(code);};
const daysInMonth=(year,month)=>new Date(Date.UTC(year,month,0)).getUTCDate();
const riyadhDate=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
function validDate(text) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;
  const [y,m,d]=text.split('-').map(Number);
  return y>=1000 && m>=1 && m<=12 && d>=1 && d<=daysInMonth(y,m);
}
function csvLine(line) {
  // Every accepted field is a typed scalar. Embedded newlines/free text are never part of this format.
  const cells=[];
  for(let i=0; i<=line.length;) {
    let value='';
    if(line[i]==='"'){
      i++;let closed=false;
      while(i<line.length){
        const c=line[i++];
        if(c!=='"'){value+=c;continue;}
        if(line[i]==='"'){value+='"';i++;continue;}
        closed=true;break;
      }
      if(!closed || (i<line.length && line[i]!==','))fail('malformed_csv');
    }else{
      const end=line.indexOf(',',i);
      value=line.slice(i,end===-1?line.length:end);
      if(value.includes('"'))fail('malformed_csv');
      i=end===-1?line.length:end;
    }
    cells.push(value.trim());
    if(i>=line.length)break;
    i++;
  }
  return cells;
}
function decimal(raw,metric){
  if(!/^-?\d{1,64}(?:\.\d{1,64})?$/.test(raw))fail('not_a_decimal');
  const negative=raw.startsWith('-');
  let [integer,fraction='']=raw.replace(/^-/,'').split('.');
  integer=integer.replace(/^0+(?=\d)/,'');fraction=fraction.replace(/0+$/,'');
  const unsigned=integer+(fraction?'.'+fraction:'');const sign=negative&&unsigned!=='0';
  const unit=metrics.get(metric);
  if(!unit)fail('unknown_metric');
  const signed=metric==='cash_balance_sar'||metric==='capex_variance_sar';
  if(sign&&!signed)fail('negative_value');
  if(unit==='count'&&fraction)fail('fractional_count');
  if(unit==='SAR'&&fraction.length>2)fail('invalid_money_precision');
  if(unit==='%'&&(BigInt(integer)>100n||(integer==='100'&&fraction)))fail('percent_out_of_range');
  return (sign?'-':'')+unsigned;
}
function deterministicId(parts){
  const h=digest(JSON.stringify(['draqon-council-import-v1',...parts]));
  return [h.slice(0,8),h.slice(8,12),'8'+h.slice(13,16),((parseInt(h[16],16)&3)|8).toString(16)+h.slice(17,20),h.slice(20,32)].join('-');
}
export function stageCouncilImport(text,{org,facility,now=new Date()}){
  org=org?.toLowerCase();facility=facility?.toLowerCase();
  if(!uuid.test(org)||!uuid.test(facility))fail('invalid_expected_scope');
  const lines=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\n+$/,'').split('\n');
  const head=csvLine(lines[0]);
  if(head.length!==new Set(head).size || columns.some(c=>!head.includes(c)) || head.some(c=>!columns.includes(c)&&c!=='request_id'))fail('invalid_or_extra_columns');
  if(lines.length<2)fail('empty_batch');
  const seen=new Map(),groups=new Map(),today=riyadhDate(now),rows=[];
  for(let j=1;j<lines.length;j++){
    try{
      const cells=csvLine(lines[j]);if(cells.length!==head.length)fail('wrong_column_count');
      const r=Object.fromEntries(head.map((name,i)=>[name,cells[i]]));
      if(r.organization_id.toLowerCase()!==org||r.facility_id.toLowerCase()!==facility)fail('scope_mismatch');
      if(!validDate(r.month)||!r.month.endsWith('-01')||r.month.slice(0,7)>=today.slice(0,7))fail('month_not_closed');
      const [year,month]=r.month.split('-').map(Number);
      const lastDay=r.month.slice(0,8)+daysInMonth(year,month);
      if(!validDate(r.retrieved_on)||r.retrieved_on<lastDay||r.retrieved_on>today)fail('invalid_retrieval_date');
      const system=r.source_system.toUpperCase(),source=r.source_export_id.toLowerCase(),approval=r.approval_ref.toLowerCase();
      if(!['CRM','PMS','CMMS','LEDGER'].includes(system)||!uuid.test(source)||!uuid.test(approval))fail('invalid_aggregate_provenance');
      const metric=r.metric,value=decimal(r.value,metric),sourceRef=system+'/'+source+'/approval/'+approval;
      const ref=deterministicId([org,facility,metric,r.month,value,sourceRef,r.retrieved_on]);
      const id=r.request_id?r.request_id.toLowerCase():ref;
      if(!uuid.test(id))fail('invalid_request_id');
      if(seen.has(id)&&seen.get(id)!==ref)fail('request_id_payload_conflict');
      seen.set(id,ref);
      const group=metric+'/'+r.month;
      if(!groups.has(group))groups.set(group,new Set());groups.get(group).add(value);
      rows.push({line:j+1,id,payload:{p_org:org,p_facility:facility,p_id:id,p_metric:metric,p_month:r.month,p_value:value,p_source:sourceRef,p_retrieved:r.retrieved_on}});
    }catch(e){throw new Error('line_'+(j+1)+':'+e.message);}
  }
  return {org,facility,fileDigest:digest(text),rows,disagreements:[...groups].filter(([,values])=>values.size>1).map(([key])=>key)};
}
function projectOrigin(url){
  let u;try{u=new URL(url);}catch{fail('invalid_project_url');}
  if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))))fail('invalid_project_url');
  return u.origin;
}
function jwtClaims(token){
  const pieces=token?.split('.');
  if(pieces?.length!==3||!pieces.every(s=>/^[\w-]+$/.test(s)))fail('invalid_credential_type');
  try{return JSON.parse(Buffer.from(pieces[1],'base64url').toString());}catch{fail('invalid_credential_type');}
}
function clientSettings(url,env,now){
  const target=projectOrigin(url);
  if(target!==projectOrigin(env.DRAQON_APPROVED_PROJECT_URL))fail('unapproved_project');
  const key=env.DRAQON_PUBLISHABLE_KEY,token=env.DRAQON_USER_ACCESS_TOKEN;
  if(!key||(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)&&jwtClaims(key)?.role!=='anon'))fail('public_api_key_required');
  const c=jwtClaims(token);
  if(c.role!=='authenticated'||c.aal!=='aal2'||c.is_anonymous===true||!uuid.test(c.sub)||
     !Number.isFinite(c.exp)||c.exp<=now.getTime()/1000||![c.aud].flat().includes('authenticated'))fail('current_aal2_user_required');
  // Do not transmit a user token minted for a different project, even to a second approved host.
  let issuer;try{issuer=new URL(c.iss);}catch{fail('token_project_mismatch');}
  const host=new URL(target);
  const loopbackHosts=new Set(['127.0.0.1','localhost','[::1]']);
  const sameLocal=loopbackHosts.has(host.hostname)&&loopbackHosts.has(issuer.hostname)&&host.protocol===issuer.protocol&&host.port===issuer.port;
  if((issuer.origin!==target&&!sameLocal)||issuer.pathname.replace(/\/$/,'')!=='/auth/v1'||issuer.username||issuer.password||issuer.search||issuer.hash)fail('token_project_mismatch');
  return {target,subject:c.sub,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'}};
}
export async function importCouncil(stage,{apply=false,url,env=process.env,now=new Date(),request=fetch,persist=async()=>{},resume}={}){
  const report={schema:1,mode:apply?'apply':'dry_run',org:stage.org,facility:stage.facility,fileDigest:stage.fileDigest,
    target:apply?projectOrigin(url):null,disagreements:stage.disagreements,rows:stage.rows.map(r=>({line:r.line,id:r.id,state:'unprocessed'}))};
  if(!apply){report.rows.forEach(r=>r.state='validated');await persist(report);return report;}
  const settings=clientSettings(url,env,now);
  if(resume&&(resume.schema!==1||resume.mode!=='apply'||resume.org!==report.org||resume.facility!==report.facility||resume.fileDigest!==report.fileDigest||resume.target!==report.target))fail('resume_manifest_mismatch');
  const opts={headers:settings.headers,redirect:'error'};
  // The server verifies the signature and identity. The RPC checks active approval authority and tenant/site at every write.
  let auth;try{auth=await request(settings.target+'/auth/v1/user',{...opts,signal:AbortSignal.timeout(20000)});}catch{fail('auth_verification_unavailable');}
  if(!auth.ok)fail('server_rejected_user');
  const user=await auth.json().catch(()=>null);
  if(!user||user.id!==settings.subject||user.is_anonymous===true)fail('server_user_mismatch');
  await persist(report);
  for(const [i,input] of stage.rows.entries()){
    const row=report.rows[i];
    // Re-submit acknowledged rows on resume: the database verifies their immutable receipts;
    // a local manifest alone never proves that an earlier write reached this database.
    try{
      const res=await request(settings.target+'/rest/v1/rpc/facility_council_record',{...opts,method:'POST',body:JSON.stringify(input.payload),signal:AbortSignal.timeout(20000)});
      if(res.ok){
        const receipt=await res.json();
        if(typeof receipt!=='string'||!uuid.test(receipt))throw new Error('invalid_receipt');
        row.state='acknowledged';row.receipt=receipt;
      }else{
        row.state=res.status>=500?'unknown':'rejected';row.http=res.status;
        const body=await res.json().catch(()=>null);
        if(typeof body?.code==='string'&&/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(body.code))row.code=body.code;
      }
    }catch{row.state='unknown';}
    await persist(report);
    if(row.state!=='acknowledged')break;
  }
  return report;
}
async function saveReport(path,report){
  const temp=path+'.'+randomUUID()+'.tmp';
  try{await writeFile(temp,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);}
  finally{await unlink(temp).catch(()=>{});}
}
const help=`Usage: node automation/enterprise/council-import.mjs --input aggregate.csv --org UUID --facility UUID [--report report.json]
Apply: append --apply --project-url https://approved-project.example --report report.json. Resume: also add --resume previous-report.json.
Environment for apply only: DRAQON_APPROVED_PROJECT_URL, DRAQON_PUBLISHABLE_KEY, DRAQON_USER_ACCESS_TOKEN (logged-in verified AAL2 approver).
CSV header: ${columns.join(',')}[,request_id]. Month = YYYY-MM-01, closed in Riyadh; retrieved_on = YYYY-MM-DD.
Source system = CRM/PMS/CMMS/LEDGER. Source export ID and owner approval reference are opaque UUIDs pointing to private aggregate evidence.
A different value/source revision creates separate evidence, never selects a winner. Default dry run is offline. Resume uses the identical original file
and rechecks previously acknowledged rows by idempotent RPC. Report statuses acknowledge, reject, or mark uncertain delivery; later rows remain unprocessed.`;
async function main(){
  const {values:v}=parseArgs({options:{input:{type:'string'},org:{type:'string'},facility:{type:'string'},report:{type:'string'},resume:{type:'string'},
    apply:{type:'boolean'},help:{type:'boolean'},'project-url':{type:'string'}}});
  if(v.help){console.log(help);return;}
  if(!v.input||!v.org||!v.facility||(v.apply&&(!v.report||!v['project-url']))||(v.resume&&!v.apply))fail('missing_or_incompatible_arguments');
  if(v.report&&resolve(v.input)===resolve(v.report))fail('report_must_not_replace_input');
  const stage=stageCouncilImport(await readFile(v.input,'utf8'),{org:v.org,facility:v.facility});
  const resume=v.resume?JSON.parse(await readFile(v.resume,'utf8')):null;
  const report=await importCouncil(stage,{apply:v.apply,url:v['project-url'],resume,persist:v.report?r=>saveReport(v.report,r):async()=>{}});
  console.log(JSON.stringify({mode:report.mode,total:report.rows.length,states:report.rows.reduce((c,row)=>(c[row.state]=(c[row.state]??0)+1,c),{}),conflictingMetricMonths:report.disagreements.length}));
  if(v.apply&&report.rows.some(row=>row.state!=='acknowledged'))process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{console.error('Council import failed:',/^(?:line_\d+:)?[a-z_]+$/.test(e.message)?e.message:'invalid_arguments_file_or_configuration');process.exitCode=1;});
}
