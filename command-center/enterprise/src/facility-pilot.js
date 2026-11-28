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
function kpi(title,number){const box=elem("div");box.append(elem("small",title),elem("strong",number));return box;}
function dues(contracts,status) {
  const priced=contracts.filter(c=>c.status===status&&Number.isFinite(c.annualCost));
  return priced.length?priced.reduce((sum,c)=>sum+Math.round(c.annualCost*100),0)/100:null;
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
function dashboardOverview(sites,pilot,openTab){
  const box=elem("div",null,"pilot-overview"),contracts=sites.flatMap(s=>s.contracts);
  const cards=elem("div",null,"pilot-metrics");
  cards.append(kpi(t("سنوي مسعّر في المصدر","Annual value in source"),money(dues(contracts,"documented"))),
    kpi(t("ميزانية سنوية افتراضية","Simulated annual budget"),money(dues(contracts,"simulated"))),
    kpi(t("زيارات الأسبوع الافتراضية","Weekly pilot visits"),count(rowList(sites,"visits").filter(x=>x.record.phase==="week").length)),
    kpi(t("قرارات السيناريو","Scenario decisions"),count(rowList(sites,"decisions").length)));
  box.append(cards);
  const comparison=elem("figure",null,"pilot-figure");
  comparison.append(elem("figcaption",t("بنود الخدمات المسعّرة حسب المبنى","Priced service lines by building")));
  const legend=elem("div",null,"pilot-legend");legend.append(badge("documented"),badge("simulated"));comparison.append(legend);
  const groups=sites.map(s=>({site:s,a:s.contracts.filter(c=>c.status==="documented"&&Number.isFinite(c.annualCost)).length,
    b:s.contracts.filter(c=>c.status==="simulated"&&Number.isFinite(c.annualCost)).length}));
  const max=Math.max(1,...groups.map(g=>g.a+g.b));
  for(const g of groups){
    const line=elem("div",null,"pilot-compare"),track=elem("span",null,"pilot-track");
    for(const [type,n] of [["documented",g.a],["simulated",g.b]]){const bar=elem("i",null,type);bar.style.width=(100*n/max)+"%";track.append(bar);}
    track.setAttribute("aria-hidden","true");line.append(elem("span",g.site.name),track,elem("small",t("موثّق ","Source ")+count(g.a)+" · "+t("افتراضي ","Scenario ")+count(g.b)));comparison.append(line);
  }
  box.append(comparison);
  const glance=elem("section",null,"pilot-glance");glance.append(elem("h5",t("الزيارة الأولى لكل مبنى","First visit by building")));
  for(const site of sites){
    const v=site.visits.filter(v=>v.phase==="week").sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
    if(v)glance.append(act(text(site.name,v.title||site.contracts.find(c=>c.id===v.contractId)?.name,v.date,v.time),()=>openTab("visits",site.code,v.id)));
  }
  box.append(glance);
  const facts=sites.flatMap(s=>s.facts.map(f=>[s.name,tr(f.label),text(tr(f.value)??"—",f.unit),tr(f.source)]));
  if(facts.length)box.append(detail(t("بيانات المباني ومراجعها","Building facts and sources"),[table([t("المبنى","Building"),t("البند","Item"),t("القيمة","Value"),t("المصدر","Source")],facts)]));
  if(pilot.source?.notes||pilot.source?.name){
    const notes=Array.isArray(pilot.source.notes)?pilot.source.notes:[pilot.source.notes];
    box.append(detail(t("مصدر السجل وحدود العرض","Source and coverage"),[elem("p",tr(pilot.source.name)),...notes.filter(Boolean).map(n=>elem("p",tr(n)))]));
  }
  return box;
}
function contractsView(sites,openTab){
  const box=elem("div");const rows=rowList(sites,"contracts");
  const all=t("جميع الأنواع","All types");
  const [fl,filter]=select(t("مصدر الخدمة","Service classification"),[["all",all],...["documented","simulated","reference"].map(k=>[k,labels[k]])],draw);
  const list=elem("div",null,"pilot-list");box.append(fl,list);
  function draw(){list.replaceChildren();for(const {site,record:c} of rows.filter(x=>filter.value==="all"||x.record.status===filter.value)){
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
    if(visit)wrap.append(act(t("فتح الزيارة التجريبية","Open pilot visit"),()=>openTab("visits",site.code,visit.id)));
    list.append(wrap);
  }if(!list.childElementCount)list.append(elem("p",t("لا توجد خدمات بهذا التصنيف.","No services in this classification.")));}
  draw();return box;
}
export function sourceRegister(site){
  const src=site?.detail?.supplierServiceRegister;
  if(!src?.contracts?.length)return null;
  const grid=table([t("الخدمة","Service"),t("المورد","Provider"),t("نطاق الخدمة","Service scope"),
    t("دورية الخدمة","Service cadence"),t("دورية الدفع","Payment cadence"),t("تكلفة الفترة","Period charge"),
    t("الطلبات السنوية","Annual calls"),t("شهريًا","Monthly"),t("سنويًا","Annually"),t("مرجع البند","Source reference")],
    src.contracts.map(c=>[tr(c.name),tr(c.vendor),tr(c.scope),tr(c.serviceFrequency),tr(c.paymentFrequency),money(c.periodCost),
      count(c.calls),money(c.monthlyCost),money(c.annualCost),tr(c.source)]));
  const facts=(src.facts||[]).map(f=>[tr(f.label),text(f.value,f.unit),tr(f.source)]);
  const children=[elem("p",text(site.name,src.source)),grid];
  if(facts.length)children.push(table([t("بيانات المبنى","Building data"),t("القيمة","Value"),t("المرجع","Reference")],facts));
  return detail(t("سجل خدمات الموردين من ملف المبنى","Supplier services from the building record"),children);
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
function visitsView(sites,session,focusSite,focusId){
  const box=elem("div");
  const [lb,phase]=select(t("نطاق الزيارات","Visit window"),[["week",t("الأسبوع التجريبي","Pilot week")],["next",t("الزيارات اللاحقة المقترحة","Proposed follow-up visits")]],draw);
  const entries=rowList(sites,"visits").sort((a,b)=>String(a.record.date+a.record.time).localeCompare(b.record.date+b.record.time));
  const selected=entries.find(x=>x.site.code===focusSite&&x.record.id===focusId);
  if(selected)phase.value=selected.record.phase;
  const list=elem("div",null,"pilot-list");box.append(lb,list);
  function draw(){
    list.replaceChildren();
    for(const {site,record:v} of entries.filter(x=>x.record.phase===phase.value)){
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
function decisionsView(sites,session){
  const box=elem("div",null,"pilot-decisions");
  const data=rowList(sites,"decisions");
  const priorities={high:t("أولوية مرتفعة","High priority"),normal:t("أولوية عادية","Normal priority"),medium:t("أولوية متوسطة","Medium priority"),low:t("أولوية منخفضة","Low priority")};
  for(const {site,record:d} of data){
    const a=elem("article"),key=JSON.stringify(["decision",site.code,d.id||tr(d.title)]);
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
export function renderFacilityPilot(pilot,facilities,code="",session=new Map()){
  const sites=pilotScope(pilot,facilities,code);
  if(!sites.length)return null;
  const box=elem("section",null,"facility-pilot");box.id="facility-pilot";box.tabIndex=-1;
  const head=elem("header",null,"pilot-head"),caption=elem("div");
  head.append(caption,elem("small",text(pilot.start,pilot.end,pilot.timezone)));
  caption.append(elem("h4",t("تجربة تشغيل المرافق","Facilities operations pilot")),
    elem("p",t("مواعيد وتمارين تجريبية. تبقى إجراءات التجربة في هذه الجلسة ولا تُرسَل للفني أو المورد.","Scenario visits and exercises. Actions stay in this session and are never dispatched to providers or technicians.")));
  const tabs=elem("nav",null,"pilot-tabs"),body=elem("div");tabs.setAttribute("aria-label",t("أقسام البايلوت","Pilot sections"));
  const buttons=new Map();
  const sections=[["overview",t("لوحة البايلوت","Pilot dashboard")],["contracts",t("العقود والخدمات","Contracts & services")],
    ["visits",t("الزيارات والصيانة","Visits & maintenance")],["decisions",t("القرارات","Decisions")]];
  for(const [id,name] of sections){const b=act(name,()=>openTab(id));buttons.set(id,b);tabs.append(b);}
  function openTab(id,focusSite,focusId){
    for(const [key,b] of buttons)b.setAttribute("aria-pressed",String(key===id));
    const view=id==="overview"?dashboardOverview(sites,pilot,openTab):id==="contracts"?contractsView(sites,openTab):
      id==="visits"?visitsView(sites,session,focusSite,focusId):decisionsView(sites,session);
    body.replaceChildren(view);
  }
  box.append(head,tabs,body);openTab("overview");return box;
}
