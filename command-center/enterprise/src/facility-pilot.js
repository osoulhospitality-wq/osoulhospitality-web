import {uiText as t} from "./locale.js";
import {elem,select,table,detail} from "./client-reports.js";

const numbers=new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:2});
const labels={
  documented:t("مسعّر في سجل المصدر","Priced in source"),
  simulated:t("عقد افتراضي","Scenario agreement"),
  reference:t("خدمة دون سعر موثّق","Service without a recorded price"),
  planned:t("مخططة","Planned"),submitted:t("بانتظار المراجعة","Awaiting review"),
  accepted:t("مقبولة في التجربة","Accepted in pilot"),returned:t("معادة للاستكمال","Returned for completion")
};
const tr=value=>typeof value==="object"&&value!==null?t(value.ar??value.en,value.en??value.ar):value;
const money=value=>Number.isFinite(value)?numbers.format(value)+" "+t("ر.س","SAR"):"—";
const count=value=>Number.isFinite(value)?numbers.format(value):"—";
const text=(...parts)=>parts.map(tr).filter(x=>x!==undefined&&x!==null&&x!=="").join(" · ");
function act(label,fn,cls){const b=elem("button",label,cls);b.type="button";b.onclick=fn;return b;}
function badge(value){return elem("span",labels[value]||tr(value),"pilot-tag pilot-tag-"+value);}
function drillButton(label,onClick,cls){
  const button=act(label,onClick,cls);
  button.type="button";
  return button;
}
function localDay(iso,abbreviated=false){
  const date=new Date(String(iso)+"T12:00:00+03:00");
  if(Number.isNaN(date.valueOf()))return iso||"—";
  const locale=document.documentElement.lang==="en"?"en-GB":"ar-SA-u-ca-gregory";
  return new Intl.DateTimeFormat(locale,abbreviated?{weekday:"short",timeZone:"Asia/Riyadh"}:
    {day:"numeric",month:"short",timeZone:"Asia/Riyadh"}).format(date);
}
const classes=["documented","simulated","reference"];
const shortType={
  documented:t("مسعّر في المصدر","Source-priced"),
  simulated:t("افتراضي","Simulated"),
  reference:t("دون تسعير","Unpriced")
};
export function serviceMix(contracts){
  const mix={documented:0,simulated:0,reference:0};
  for(const c of contracts){
    mix[classify(c)]++;
  }
  return mix;
}
function siteCoverage(site){
  if(Array.isArray(site.coverage))return site.coverage;
  return site.contracts.map(c=>({key:c.id,name:c.name,status:classify(c),source:c.source,contractIds:[c.id]}));
}
export function coverageMix(site){
  const counts={documented:0,simulated:0,reference:0};
  for(const row of siteCoverage(site))counts[classes.includes(row.status)?row.status:"reference"]++;
  return counts;
}
function classify(c){
  return (c.status==="documented"||c.status==="simulated")&&Number.isFinite(c.annualCost)?c.status:"reference";
}
function dues(contracts,status) {
  const priced=contracts.filter(c=>c.status===status&&Number.isFinite(c.annualCost));
  return priced.length?priced.reduce((sum,c)=>sum+Math.round(c.annualCost*100),0)/100:null;
}
function chartCard(title,className){
  const card=elem("section",null,"pilot-widget "+className);
  card.append(elem("h5",title));return card;
}
function metric(title,number,onClick,primary=false){
  const card=drillButton(null,onClick,"pilot-stat"+(primary?" is-primary":""));
  card.append(elem("span",title),elem("strong",number));return card;
}
export function pilotScope(pilot,facilities,code="") {
  const allowed=new Map(facilities.map(site=>[site.code,site.name]));
  return (pilot?.sites||[]).filter(s=>allowed.has(s.code)&&(!code||s.code===code)).map(s=>({
    ...s,name:tr(s.name)||tr(allowed.get(s.code)),contracts:s.contracts||[],facts:s.facts||[],
    visits:s.visits||[],decisions:s.decisions||[]
  }));
}
function rowList(sites,field){
  return sites.flatMap(site=>site[field].map(record=>({site,record})));
}
function scopeChart(sites,openTab,onSiteSelect){
  const card=chartCard(t("تغطية كشف الخدمات حسب المنشأة","Service coverage by facility"),"pilot-scope-chart");
  const legend=elem("div",null,"pilot-legend");
  for(const type of classes){
    const b=drillButton(shortType[type],()=>openTab("contracts",{type,catalog:true}),"pilot-key key-"+type);
    legend.append(b);
  }
  card.append(legend);
  for(const site of sites){
    const mix=coverageMix(site),total=siteCoverage(site).length;
    const line=drillButton(null,()=>onSiteSelect&&sites.length>1?onSiteSelect(site.code):openTab("contracts",{site:site.code,catalog:true}),"pilot-compare");
    const title=elem("span",null,"pilot-compare-title");
    title.append(elem("strong",site.name));
    if(site.clientName)title.append(elem("small",tr(site.clientName)));
    const track=elem("span",null,"pilot-track");
    for(const type of classes){
      const bar=elem("i",null,type);bar.style.width=(total?100*mix[type]/total:0)+"%";track.append(bar);
    }
    track.setAttribute("aria-hidden","true");
    const values=elem("span",null,"pilot-compare-values");
    values.append(elem("b",count(mix.documented+mix.simulated)),document.createTextNode(t(" من "," of ")+count(total)));
    line.append(title,track,values);
    line.setAttribute("aria-description",text(...classes.map(k=>shortType[k]+" "+count(mix[k])),t("فتح التفاصيل","Open details")));
    card.append(line);
  }
  card.append(elem("small",t("المؤشر: البنود المرتبطة بخدمة موثّقة أو افتراضية من إجمالي الكشف","Scale: linked source or scenario items / total checklist items"),"pilot-footnote"));
  return card;
}
function weekDates(pilot,visits){
  const first=Date.parse(pilot.start+"T12:00:00Z"),last=Date.parse(pilot.end+"T12:00:00Z");
  if(!Number.isFinite(first)||!Number.isFinite(last)||last<first||last-first>13*86400000)
    return [...new Set(visits.map(x=>x.record.date))].sort();
  const dates=[];
  for(let day=first;day<=last;day+=86400000)dates.push(new Date(day).toISOString().slice(0,10));
  return dates;
}
function workload(sites,pilot,openTab){
  const card=chartCard(t("جدول الزيارات الأسبوعي","Weekly visit schedule"),"pilot-workload");
  const visits=rowList(sites,"visits").filter(x=>x.record.phase==="week"),dates=weekDates(pilot,visits);
  const daily=dates.map(date=>visits.filter(x=>x.record.date===date).length);
  const max=Math.max(1,...daily),chart=elem("div",null,"pilot-histogram");
  for(const [index,date] of dates.entries()){
    const n=daily[index],b=drillButton(null,()=>openTab("visits",{date}),"pilot-day");
    const stem=elem("span",null,"pilot-stem");const fill=elem("i");fill.style.height=(100*n/max)+"%";stem.append(fill);
    b.append(elem("strong",count(n)),stem,elem("span",localDay(date,true)),elem("small",localDay(date)));
    b.setAttribute("aria-description",text(date,count(n)+" "+t("زيارات","visits")));
    chart.append(b);
  }
  if(dates.length)card.append(chart);
  return card;
}
function dashboardOverview(sites,pilot,openTab,session,onSiteSelect){
  const box=elem("div",null,"pilot-overview"),contracts=sites.flatMap(s=>s.contracts),mix=serviceMix(contracts);
  const week=rowList(sites,"visits").filter(x=>x.record.phase==="week")
    .sort((a,b)=>(a.record.date+a.record.time).localeCompare(b.record.date+b.record.time));
  const priority={high:0,medium:1,normal:2,low:3};
  const pending=rowList(sites,"decisions").filter(x=>!session.has(JSON.stringify(["decision",x.site.code,x.record.id||tr(x.record.title)])))
    .sort((a,b)=>(priority[a.record.priority]??4)-(priority[b.record.priority]??4)||String(a.record.due).localeCompare(String(b.record.due)));
  const cards=elem("div",null,"pilot-metrics");
  if(mix.documented){
    cards.append(metric(t("التكلفة السنوية الموثّقة بالسجل","Source-priced annual cost"),money(dues(contracts,"documented")),()=>openTab("contracts",{type:"documented"}),true));
  }else{
    const listed=new Set(sites.flatMap(s=>siteCoverage(s).map(row=>row.key)));
    cards.append(metric(t("نطاق الكشف المعتمد","Approved service scope"),count(listed.size)+" "+t("بندًا","items"),()=>openTab("contracts",{catalog:true}),true));
  }
  cards.append(metric(t("الميزانية السنوية الافتراضية","Scenario annual budget"),money(dues(contracts,"simulated")),()=>openTab("contracts",{type:"simulated"})),
    metric(t("زيارات أسبوع التجربة","Visits this pilot week"),count(week.length),()=>openTab("visits")),
    metric(t("قرارات تنتظر المراجعة","Decisions awaiting review"),count(pending.length),()=>openTab("decisions")));
  box.append(cards);
  const charts=elem("div",null,"pilot-analytics");
  charts.append(scopeChart(sites,openTab,onSiteSelect),workload(sites,pilot,openTab));box.append(charts);
  const ops=elem("div",null,"pilot-operations");
  const queue=chartCard(t("قرارات ذات أولوية","Priority decisions"),"pilot-queue");
  for(const {site,record:d} of pending.slice(0,3)){
    const b=drillButton(null,()=>openTab("decisions",{site:site.code,id:d.id}),"pilot-queue-row");
    const info=elem("span");info.append(elem("strong",tr(d.title)),elem("small",text(site.name,d.role)));
    b.append(info,elem("time",localDay(d.due)));queue.append(b);
  }
  if(!pending.length)queue.append(elem("p",t("لا توجد قرارات معلّقة لهذا النطاق.","No pending decisions in this scope.")));
  const glance=chartCard(t("الزيارة الأولى لكل منشأة","First visit by facility"),"pilot-glance");
  for(const site of sites){
    const match=week.find(x=>x.site===site);if(!match)continue;
    const v=match.record,b=drillButton(null,()=>openTab("visits",{site:site.code,id:v.id}),"pilot-agenda-row");
    const info=elem("span");info.append(elem("strong",tr(v.title||site.contracts.find(c=>c.id===v.contractId)?.name)),elem("small",text(site.name,localDay(v.date))));
    b.append(elem("time",v.time),info);glance.append(b);
  }
  ops.append(queue,glance);box.append(ops);
  const facts=sites.flatMap(s=>s.facts.map(f=>[s.name,tr(f.label),text(tr(f.value)??"—",f.unit),tr(f.source)]));
  if(facts.length)box.append(detail(t("بيانات المباني ومراجعها","Building facts and sources"),[table([t("المبنى","Building"),t("البند","Measure"),t("القيمة","Value"),t("المصدر","Source")],facts)]));
  if(pilot.source?.notes||pilot.source?.name){
    const notes=Array.isArray(pilot.source.notes)?pilot.source.notes:[pilot.source.notes];
    box.append(detail(t("مصدر السجل وحدود العرض","Source and coverage"),[elem("p",tr(pilot.source.name)),...notes.filter(Boolean).map(n=>elem("p",tr(n)))]));
  }
  return box;
}
function coverageCatalog(sites,classification,search){
  const groups=new Map();
  for(const site of sites){
    for(const row of siteCoverage(site)){
      if(classification!=="all"&&classification!==row.status)continue;
      const local=site.contracts.filter(c=>row.contractIds?.includes(c.id));
      if(search&&!text(site.name,row.name,row.key,...local.map(c=>c.vendor)).toLocaleLowerCase().includes(search))continue;
      if(!groups.has(row.key))groups.set(row.key,[]);
      groups.get(row.key).push({site,row,local});
    }
  }
  const section=elem("div",null,"pilot-list pilot-catalog");
  for(const group of groups.values()){
    const {row}=group[0];
    const title=elem("summary");title.append(elem("strong",tr(row.name)),elem("small",count(group.length)+" "+t("منشآت","facilities")));
    const block=elem("details");block.append(title);
    for(const {site,row:entry,local} of group){
      const part=elem("div",null,"pilot-catalog-site"),heading=elem("div",null,"pilot-catalog-head");
      heading.append(elem("strong",site.name),badge(entry.status));part.append(heading);
      part.append(elem("small",tr(entry.source),"pilot-footnote"));
      if(entry.benchmark&&Number.isFinite(entry.benchmark.annualCost))
        part.append(elem("p",t("مرجع التسعير في الكشف","Checklist price reference")+" · "+t("سنويًا ","Annual ")+money(entry.benchmark.annualCost)+" · "+t("شهريًا ","Monthly ")+money(entry.benchmark.monthlyCost)));
      const active=local.filter(c=>c.status==="documented"||c.status==="simulated");
      if(active.length)part.append(table([t("الخدمة المرتبطة","Linked service"),t("الحالة","Classification"),t("تكلفة المنشأة السنوية","Facility annual cost")],
        active.map(c=>[tr(c.name),shortType[c.status],money(c.annualCost)])));
      else part.append(elem("p",t("تغطية هذا البند للمنشأة تحتاج إلى توثيق.","Local coverage for this item requires documentation.")));
      block.append(part);
    }
    section.append(block);
  }
  if(!section.childElementCount)section.append(elem("p",t("لا توجد نتائج بهذا التحديد.","No items match this filter.")));
  return section;
}
function contractsView(sites,openTab,focus){
  const box=elem("div");const rows=rowList(sites,"contracts");
  const all=t("جميع الأنواع","All types");
  const [fl,filter]=select(t("مصدر الخدمة","Service classification"),[["all",all],...["documented","simulated","reference"].map(k=>[k,labels[k]])],draw);
  filter.value=classes.includes(focus.type)?focus.type:"all";
  const search=elem("input");search.type="search";search.placeholder=t("بحث باسم الخدمة أو المورد","Search by service or provider");
  search.setAttribute("aria-label",search.placeholder);
  let catalog=Boolean(focus.catalog);
  const subnav=elem("div",null,"pilot-catalog-switch");
  const assigned=act(t("الخدمات والعقود المحلية","Local contracts & services"),()=>{catalog=false;draw();});
  const scope=act(t("الكشف الموحّد","Service checklist"),()=>{catalog=true;draw();});
  subnav.append(assigned,scope);
  const tools=elem("div",null,"pilot-tools");tools.append(fl,search);box.append(subnav);
  const list=elem("div",null,"pilot-list");box.append(tools,list);search.addEventListener("input",draw);
  const normalize=v=>String(v??"").toLowerCase().normalize("NFKC").trim();
  function draw(){list.replaceChildren();
    assigned.setAttribute("aria-pressed",String(!catalog));scope.setAttribute("aria-pressed",String(catalog));
    if(catalog){list.append(coverageCatalog(sites.filter(s=>!focus.site||s.code===focus.site),filter.value,normalize(search.value)));return;}
    for(const {site,record:c} of rows.filter(x=>(filter.value==="all"||classify(x.record)===filter.value)&&(!focus.site||x.site.code===focus.site)&&normalize(text(x.record.name,x.record.vendor,x.site.name)).includes(normalize(search.value)))){
    const visit=site.visits.find(v=>v.contractId===c.id);
    const wrap=elem("details"),summary=elem("summary");summary.append(elem("span",text(c.name,site.name)),badge(c.status));
    const pairs=[
      [t("مقدم الخدمة","Provider"),tr(c.vendor)],[t("نطاق الخدمة","Scope"),tr(c.scope)],
      [t("تكرار الخدمة","Service cadence"),tr(c.serviceFrequency)],[t("تكرار الدفع","Payment frequency"),tr(c.paymentFrequency)],
      [t("التكلفة لكل فترة","Per-period cost"),money(c.periodCost)],[t("التكلفة الشهرية","Monthly cost"),money(c.monthlyCost)],
      [t("التكلفة السنوية","Annual cost"),money(c.annualCost)],[t("الطلبات السنوية المسجّلة","Recorded annual calls"),count(c.calls)],
      [t("مرجع البند","Source reference"),tr(c.source)]];
    if(c.endDate)pairs.push([t("انتهاء العقد","Agreement expiry"),c.endDate]);
    if(c.noticeDate)pairs.push([t("تاريخ الإشعار","Notice date"),c.noticeDate]);
    if(c.noticeDays!=null)pairs.push([t("مدة الإشعار بالأيام","Notice period in days"),count(c.noticeDays)]);
    if(c.risk)pairs.push([t("مخاطر العقد","Agreement risk"),tr(c.risk)]);
    if(c.exclusions)pairs.push([t("الاستثناءات","Exclusions"),tr(c.exclusions)]);
    wrap.append(summary,table([t("بيانات الخدمة","Service record"),t("القيمة","Value")],pairs));
    if(visit)wrap.append(act(t("فتح الزيارة التجريبية","Open pilot visit"),()=>openTab("visits",{site:site.code,id:visit.id})));
    list.append(wrap);
  }if(!list.childElementCount)list.append(elem("p",t("لا توجد خدمات بهذا التصنيف.","No services in this classification.")));}
  draw();return box;
}
export function sourceRegister(site){
  const src=site?.detail?.supplierServiceRegister;
  if(!src?.contracts?.length)return null;
  const grid=table([t("الخدمة","Service"),t("الحالة","Classification"),t("المرجع السنوي للكشف","Checklist annual reference"),t("المورد","Provider"),t("نطاق الخدمة","Service scope"),
    t("دورية الخدمة","Service cadence"),t("دورية الدفع","Payment cadence"),t("تكلفة الفترة","Period charge"),
    t("الطلبات السنوية","Annual calls"),t("شهريًا","Monthly"),t("سنويًا","Annually"),t("مرجع البند","Source reference")],
    src.contracts.map(c=>[tr(c.name),shortType[c.status]||"—",money(c.benchmark?.annualCost),tr(c.vendor),tr(c.scope),tr(c.serviceFrequency),tr(c.paymentFrequency),money(c.periodCost),
      count(c.calls),money(c.monthlyCost),money(c.annualCost),tr(c.source)]));
  const facts=(src.facts||[]).map(f=>[tr(f.label),text(f.value,f.unit),tr(f.source)]);
  const children=[elem("p",text(site.name,src.source))];
  if(src.scopeTemplate&&Number.isFinite(src.templateTotalAnnual)){
    children.push(elem("p",text(t("مرجع تسعير الكشف المشترك","Shared checklist price reference"),
      t("شهريًا","Monthly")+" "+money(src.templateTotalMonthly),t("سنويًا","Annually")+" "+money(src.templateTotalAnnual),
      t("يُستخدم للمقارنة فقط. قيم المنشأة واردة في أعمدة التكلفة المحلية.","For comparison only. Facility charges appear in the local cost columns."))));
  }
  children.push(grid);
  if(facts.length)children.push(table([t("بيانات المبنى","Building data"),t("القيمة","Value"),t("المرجع","Reference")],facts));
  return detail(t("كشف الخدمات المعتمد وتسعير المنشأة","Service checklist and facility pricing"),children);
}
function visitForm(v,key,session,refresh){
  const box=elem("div",null,"pilot-drill"),state=session.get(key)||{stage:"planned"};
  box.append(elem("strong",t("محاكاة تسليم الزيارة ومراجعتها","Visit handoff and review simulation")),badge(state.stage));
  if(state.review)box.append(elem("p",text(t("ملاحظة المراجعة","Review note"),state.review)));
  if(state.note)box.append(elem("p",text(t("دليل الفني","Technician evidence"),state.note,state.filename)));
  if(state.stage==="accepted")return box;
  const form=elem("form");
  if(state.stage==="submitted"){
    const note=elem("label",t("ملاحظة المشغّل في المحاكاة","Simulated operator review"));const input=elem("textarea");input.required=true;input.maxLength=500;note.append(input);
    const approve=elem("button",t("قبول في المحاكاة","Accept in simulation"));approve.type="submit";approve.value="accepted";
    const reject=elem("button",t("إعادة للاستكمال","Return for completion"));reject.type="submit";reject.value="returned";
    form.append(note,approve,reject);form.onsubmit=e=>{e.preventDefault();if(!input.value.trim()){input.focus();return;}
      session.set(key,{...state,stage:e.submitter?.value==="accepted"?"accepted":"returned",review:input.value.trim()});refresh();};
  }else{
    const field=elem("fieldset");field.append(elem("legend",t("قائمة الفني","Technician checklist")));
    const checks=v.checks?.length?v.checks:[t("مراجعة نطاق الخدمة","Review service scope")];
    checks.forEach((check,index)=>{const lab=elem("label",null,"pilot-check"),input=elem("input");input.type="checkbox";input.required=true;
      input.checked=state.checked?.includes(index)||false;lab.append(input,document.createTextNode(tr(check)));field.append(lab);});
    const note=elem("label",text(t("وصف دليل الإنجاز في المحاكاة","Describe simulated completion evidence"),v.evidence)),input=elem("textarea");
    input.maxLength=500;input.required=true;input.value=state.note||"";note.append(input);
    const attachment=elem("label",t("مرفق اختياري؛ يُعرض اسمه محليًا فقط","Optional attachment; only its name is shown locally")),file=elem("input");
    file.type="file";attachment.append(file);
    const submit=elem("button",t("إحالة للمشغّل التجريبي","Submit to simulated operator"));submit.type="submit";
    form.append(field,note,attachment,submit);
    form.onsubmit=e=>{e.preventDefault();if(!input.value.trim()){input.focus();return;}
      session.set(key,{stage:"submitted",note:input.value.trim(),filename:file.files[0]?.name||state.filename||"",checked:checks.map((_,i)=>i)});refresh();};
  }
  box.append(form);return box;
}
function visitsView(sites,session,focus){
  let focusSite=focus.site,focusId=focus.id;
  const box=elem("div");
  const [lb,phase]=select(t("نطاق الزيارات","Visit window"),[["week",t("الأسبوع التجريبي","Pilot week")],["next",t("الزيارات اللاحقة المقترحة","Proposed follow-up visits")]],draw);
  const entries=rowList(sites,"visits").sort((a,b)=>String(a.record.date+a.record.time).localeCompare(b.record.date+b.record.time));
  const selected=entries.find(x=>x.site.code===focusSite&&x.record.id===focusId);
  if(selected)phase.value=selected.record.phase;
  const list=elem("div",null,"pilot-list");box.append(lb);
  let date=focus.date;
  if(date){const reset=act(text(localDay(date),t("عرض جميع الأيام","Show all dates")),()=>{date="";reset.remove();draw();},"pilot-reset");box.append(reset);}
  phase.addEventListener("change",()=>{date="";box.querySelector(".pilot-reset")?.remove();draw();});
  box.append(list);
  function draw(){
    list.replaceChildren();
    for(const {site,record:v} of entries.filter(x=>x.record.phase===phase.value&&(!date||x.record.date===date))){
      const key=JSON.stringify(["visit",site.code,v.id]);
      const card=elem("details"),summary=elem("summary");
      const contract=site.contracts.find(c=>c.id===v.contractId);
      const title=elem("span");title.append(elem("small",text(v.date,v.time,site.name)),elem("strong",tr(v.title||contract?.name)));
      summary.append(title,badge((session.get(key)||{}).stage||"planned"));card.append(summary,
        elem("p",text(contract?.name,contract?.vendor,v.role)),elem("p",text(v.scope,v.recurrence,v.form)));
      if(phase.value==="week")card.append(visitForm(v,key,session,()=>{focusSite=site.code;focusId=v.id;draw();list.querySelector('details[open] summary')?.focus();}));
      card.open=focusSite===site.code&&focusId===v.id;list.append(card);
    }
    if(!list.childElementCount)list.append(elem("p",t("لا توجد زيارات مقترحة لهذه الفترة.","No visits proposed for this period.")));
  }
  draw();return box;
}
function decisionsView(sites,session,focus){
  const box=elem("div",null,"pilot-decisions");
  const data=rowList(sites,"decisions").sort((a,b)=>Number(b.site.code===focus.site&&b.record.id===focus.id)-Number(a.site.code===focus.site&&a.record.id===focus.id));
  const priorities={high:t("أولوية مرتفعة","High priority"),normal:t("أولوية عادية","Normal priority"),medium:t("أولوية متوسطة","Medium priority"),low:t("أولوية منخفضة","Low priority")};
  for(const {site,record:d} of data){
    const a=elem("article"),key=JSON.stringify(["decision",site.code,d.id||tr(d.title)]);
    a.dataset.priority=d.priority||"normal";
    a.append(elem("small",text(site.name,priorities[d.priority]||d.priority)),elem("h5",tr(d.title)),elem("p",tr(d.why)),elem("p",text(d.role,d.due,site.contracts.find(c=>c.id===d.contractId)?.name)));
    const result=elem("div");result.setAttribute("aria-live","polite");a.append(result);
    function draw(){result.replaceChildren();
      if(session.has(key))result.append(elem("strong",t("رُوجع في المحاكاة","Reviewed in simulation")),act(t("إعادة فتح","Reopen"),()=>{session.delete(key);draw();}));
      else result.append(act(t("تسجيل مراجعة تجريبية","Mark reviewed in simulation"),()=>{session.set(key,true);draw();}));}
    draw();box.append(a);
  }
  if(!data.length)box.append(elem("p",t("لا توجد قرارات تجريبية لهذا النطاق.","No scenario decisions in this scope.")));
  return box;
}
export function renderFacilityPilot(pilot,facilities,code="",session=new Map(),onSiteSelect){
  const sites=pilotScope(pilot,facilities,code);
  if(!sites.length)return null;
  const box=elem("section",null,"facility-pilot");box.id="facility-pilot";box.tabIndex=-1;
  const head=elem("header",null,"pilot-head"),caption=elem("div");
  const when=elem("div",null,"pilot-period");
  when.append(elem("strong",text(localDay(pilot.start),localDay(pilot.end))),elem("small",t("توقيت الرياض","Riyadh time")));
  caption.append(elem("h4",code?sites[0].name:t("لوحة إدارة المحفظة","Portfolio command centre")));
  head.append(caption,when);
  const tabs=elem("nav",null,"pilot-tabs"),body=elem("div");tabs.setAttribute("aria-label",t("أقسام البايلوت","Pilot sections"));
  const buttons=new Map();
  const sections=[["overview",t("لوحة البايلوت","Pilot dashboard")],["contracts",t("العقود والخدمات","Contracts & services")],
    ["visits",t("الزيارات والصيانة","Visits & maintenance")],["decisions",t("القرارات","Decisions")]];
  for(const [id,name] of sections){const b=act(name,()=>openTab(id));buttons.set(id,b);tabs.append(b);}
  function openTab(id,focus={}){
    const moveFocus=body.contains(document.activeElement);
    for(const [key,b] of buttons)b.setAttribute("aria-pressed",String(key===id));
    const view=id==="overview"?dashboardOverview(sites,pilot,openTab,session,onSiteSelect):id==="contracts"?contractsView(sites,openTab,focus):
      id==="visits"?visitsView(sites,session,focus):decisionsView(sites,session,focus);
    body.replaceChildren(view);
    if(moveFocus)buttons.get(id).focus({preventScroll:true});
  }
  box.append(head,tabs,body,elem("small",t("محاكاة تشغيلية. تُحفظ إجراءات المراجعة مؤقتًا في هذه الجلسة.","Operating simulation. Review actions last for this session."),"pilot-disclosure"));openTab("overview");return box;
}
