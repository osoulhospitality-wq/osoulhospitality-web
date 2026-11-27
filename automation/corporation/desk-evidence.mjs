import {calculateKpi, kpis} from './kpis.mjs';

const metricById = new Map(kpis.map(metric=>[metric.id, metric]));
export const feeds = ['decisions','tasks','projects','risks','content','integrations','agents','events','alerts'];
const states = new Set(['pending','blocked','in_progress','completed','failed','scheduled','paused','measured','unverified']);
const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const isTime = x=>typeof x==='string' && iso.test(x) && Number.isFinite(Date.parse(x));
const str=(v,max=160)=>typeof v==='string' && v.trim().length>0 && v.length<=max;
const collection=v=>Array.isArray(v) && v.length<=1000;
function fail(code){throw new Error(code)}
// Offline owner-selected aggregates carry provenance, not an independent verification signature.
// All evidence rows and feed entries carry their own explicit tenant scope.
export function readSnapshot(input, tenant, now=new Date()) {
  if(!str(tenant,100)||input?.version!==1||input.tenant!==tenant)fail('scope');
  if(!['local-ledger','operational-export','synthetic'].includes(input.origin))fail('origin');
  const {from,to,asOf}=input;
  if(![from,to,asOf].every(isTime)||Date.parse(from)>Date.parse(to)||Date.parse(to)>Date.parse(asOf)||Date.parse(asOf)>now.getTime())fail('time');
  if(!collection(input.metrics)||!collection(input.items))fail('shape');
  const metrics=new Map(), items=[], seen=new Set();
  function evidence(row) {
    if(row?.tenant!==tenant)fail('scope');
    if(!str(row.sourceRef)||!isTime(row.observedAt)||Date.parse(row.observedAt)>Date.parse(asOf)||Date.parse(row.observedAt)<Date.parse(to))fail('evidence');
  }
  for(const row of input.metrics) {
    evidence(row);
    const metric=metricById.get(row.id);
    if(!metric||metrics.has(row.id))fail('metric');
    if(!['complete','partial'].includes(row.coverage))fail('coverage');
    const value=row.coverage==='complete'?calculateKpi(metric,row.inputs):null;
    metrics.set(row.id,{value,sourceRef:row.sourceRef,observedAt:row.observedAt,coverage:row.coverage});
  }
  for(const item of input.items) {
    evidence(item);
    if(!feeds.includes(item.feed)||!str(item.key,100)||!str(item.title)||!str(item.owner,100)||!states.has(item.status))fail('item');
    const key=item.feed+'/'+item.key;
    if(seen.has(key))fail('duplicate');
    seen.add(key);
    if(item.due!=null&&!isTime(item.due))fail('time');
    if(item.progress!=null&&(!Number.isFinite(item.progress)||item.progress<0||item.progress>100||item.feed!=='projects'))fail('item');
    items.push({feed:item.feed,key:item.key,title:item.title,owner:item.owner,status:item.status,sourceRef:item.sourceRef,observedAt:item.observedAt,due:item.due,progress:item.progress});
  }
  return {tenant,from,to,asOf,origin:input.origin,metrics,items};
}
