import {uiText as t} from "./locale.js";
import {elem,select,table,detail,monthlyChart} from "./client-reports.js";
const fmt=new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:2});
const value=v=>Number.isFinite(v)?fmt.format(v):"—";
const statuses={
  review:["قيد مراجعة المستندات","Document review"],pending_documentation:["قيد مراجعة المستندات","Document review"],
  draft:["مسودة","Draft"],registered:["مسجّل","Registered"],active:["ساري","Active"],expired:["منتهي","Expired"],terminated:["منهى","Terminated"]
};
function statusLabel(key){return statuses[key]?t(...statuses[key]):key||t("غير موثق","Unverified");}
function action(label,fn) {const btn=elem("button",label);btn.type="button";btn.onclick=fn;return btn;}
const sourceName=(sources,id)=>sources.find(s=>s.id===id)?.name||id||"—";

function facts(client,site,source) {
  const scope=site?.detail||client.detail?.totals||{};
  const cards=elem("div",null,"performance-cards");
  for(const [k,ar,en] of [["units","الوحدات المسجلة بالكشف","Units in survey"],["inspected","الوحدات المفحوصة","Inspected units"],["remaining","المتبقي وقت الكشف","Outstanding at survey"]]){
    const item=elem("div",null,"fm-metric");
    item.append(elem("span",t(ar,en)),elem("strong",value(scope[k])));cards.append(item);
  }
  const box=elem("div");
  box.append(cards,elem("small",[client.detail?.snapshotDate,source(scope.inspectionSource||scope.source)].filter(Boolean).join(" · ")));
  return box;
}
function records(client,site,source) {
  const info=client.detail||{}, place=site?.detail||{}, sections=[];
  const readings=site?place.metrics:info.portfolioMetrics;
  if(readings?.length)sections.push(detail(t("سجل الكشوف ومؤشرات التشغيل","Survey and operating measures"),[table(
    [t("المؤشر","Measure"),t("القيمة","Value"),t("الفترة","Period"),t("المصدر","Source")],
    readings.map(r=>[r.label,value(r.value)+" "+(r.unit||""),[r.start,r.end].filter(Boolean).join(" – "),[source(r.source),r.scope,r.note].filter(Boolean).join(" · ")]))]));
  const services=(info.reportedServiceScopes||[]).filter(s=>!site||s.propertyIds?.includes(site.code));
  if(services.length)sections.push(detail(t("نطاقات خدمات الموردين الواردة في التقارير","Supplier services documented in reports"),[table(
    [t("الخدمة","Service"),t("نطاق العمل","Scope"),t("الدورية","Frequency"),t("النتيجة والمصدر","Outcome and source")],
    services.map(s=>[s.service,s.scope,s.frequency,[s.outcome,s.period,source(s.source)].filter(Boolean).join(" · ")]))]));
  if(place.workCases?.length)sections.push(detail(t("حالات الصيانة الموثقة","Documented maintenance cases"),[table(
    [t("الوحدة","Unit"),t("العمل","Work"),t("الحالة","State"),t("المتابعة","Follow-up"),t("سجل المصدر","Evidence")],
    place.workCases.map(r=>[r.unit,r.job,r.state,r.action,[r.ref,r.asOf,source(r.source)].filter(Boolean).join(" · ")]))]));
  if(place.furnitureDetails?.length)sections.push(detail(t("كشف أثاث الوحدات","Unit furniture survey"),[table(
    [t("الوحدة","Unit"),t("كنب","Sofa"),t("كرسي","Chair"),t("ملاحظات","Notes"),t("سجل المصدر","Evidence")],
    place.furnitureDetails.map(r=>[r.room,r.sofa,r.chair,r.note,[r.asOf,source(r.source)].filter(Boolean).join(" · ")]))]));
  const notes=[...(info.scopeNotes||[]),...Object.values(info.coverage||{})];
  if(notes.length)sections.push(detail(t("الفترات وحدود المقارنة","Periods and comparison limits"),notes.map(s=>elem("p",s))));
  return sections;
}
export function setupClientPortfolio(db) {
  const panel=elem("section",null,"client-portfolio");
  panel.id="client-portfolio";panel.hidden=true;
  const contractPanel=document.getElementById("contract-register");
  const contractSection=elem("section",null,"client-contract-list");
  contractSection.hidden=true;
  // Existing register controls keep their original order and listeners.
  contractPanel.append(contractSection);
  document.getElementById("fm-facility").before(panel);
  if(location.hash==="#contract-register")contractPanel.open=true;
  let clients=[],organization="",sequence=0,read,clientId="",code="";
  const building=()=>document.getElementById("fm-building-select");
  function showClient(id,facilityCode="",move=false){
    clientId=id;code=facilityCode;render();
    if(move){const heading=panel.querySelector("h3");heading?.focus({preventScroll:true});panel.scrollIntoView({block:"start"});}
  }
  function renderContracts(){
    contractSection.replaceChildren(elem("h4",t("عقود العملاء والمنشآت","Client and facility agreements")));
    for(const client of clients){
      const c=client.contract||{};
      const el=elem("article",null,"client-agreement");
      el.append(elem("strong",c.name||client.name),elem("p",client.name+" · "+statusLabel(c.status||client.status)));
      el.append(elem("p",c.evidence_note||""));
      const terms=[t("البدء","Start")+" "+(c.start_date||"—"),t("الانتهاء","End")+" "+(c.end_date||"—"),
        t("القيمة السنوية","Annual value")+" "+value(c.annual_value)+(c.currency?" "+c.currency:"")];
      el.append(elem("small",terms.join(" · ")),action(t("عرض العميل والمباني","View client and buildings"),()=>showClient(client.id,"",true)));
      contractSection.append(el);
    }
    contractSection.hidden=!clients.length;
  }
  function render(){
    panel.replaceChildren();
    const client=clients.find(c=>c.id===clientId);if(!client){panel.hidden=true;return;}
    panel.hidden=false;
    const heading=elem("h3",t("العملاء المتعاقدون","Contracted clients"));heading.tabIndex=-1;
    const filters=elem("div",null,"client-filters"),places=client.facilities||[];
    const site=places.find(f=>f.code===code);
    const [cl,ci]=select(t("العميل","Client"),clients.map(c=>[c.id,c.name]),id=>showClient(id));
    ci.value=client.id;
    const [sl,si]=select(t("نطاق التقرير","Report scope"),[["",t("محفظة العميل","Client portfolio")],...places.map(f=>[f.code,f.name])],code=>{
      const selected=places.find(f=>f.code===code),base=building();
      if(selected&&base&&[...base.options].some(o=>o.value===selected.id)&&base.value!==selected.id){
        base.value=selected.id;base.dispatchEvent(new Event("change"));
      }
      showClient(client.id,code);
    });
    si.value=site?.code||"";filters.append(cl,sl);
    const source=id=>sourceName(client.sources||[],id);
    const links=elem("nav",null,"fm-shortcuts");
    const contractLink=elem("a",t("عقد العميل","Client agreement"));contractLink.href="#contract-register";
    contractLink.onclick=()=>{contractPanel.open=true;};links.append(contractLink);
    const forms=elem("a",t("اختيار المبنى المسند ونموذج الفني","Choose an assigned building and field form"));forms.href=(document.documentElement.lang.startsWith("en")?"/en":"")+"/field-forms/#form-picker";links.append(forms);
    const contract=client.contract||{};
    panel.append(heading,filters,elem("h4",site?.name||client.name),
      elem("p",[contract.name,statusLabel(contract.status||client.status),contract.evidence_note].filter(Boolean).join(" · ")),
      links,facts(client,site,source),monthlyChart(client,site,source),...records(client,site,source));
  }
  document.getElementById("fm-building-select")?.addEventListener("change",()=>{
    const id=building()?.value;
    for(const c of clients){const site=c.facilities?.find(f=>f.id===id);if(site){showClient(c.id,site.code);return;}}
    if(clients.length&&code)showClient(clientId,"");
  });
  return async function load(id){
    const token=++sequence;
    read?.abort();organization=id;clients=[];clientId="";code="";
    panel.replaceChildren();contractSection.replaceChildren();panel.hidden=contractSection.hidden=true;
    if(!id)return;
    read=new AbortController();
    try {
      const {data,error}=await db.rpc("fm_client_portfolio",{p_organization:id}).abortSignal(read.signal);
      if(sequence!==token)return;
      if(error){if(error.code==="42501")return;throw error;}
      if(!Array.isArray(data))throw new TypeError("Invalid client portfolio response");
      clients=data;
      if(!clients.length)return;
      const initialSite=building()?.value;
      const matched=clients.find(c=>c.facilities?.some(f=>f.id===initialSite));
      const initial=matched||clients[0];
      showClient(initial.id,matched?.facilities.find(f=>f.id===initialSite)?.code||"");
      renderContracts();
      if(location.hash==="#client-portfolio") {
        requestAnimationFrame(()=>{if(sequence===token){panel.querySelector("h3")?.focus({preventScroll:true});panel.scrollIntoView({block:"start"});}});
      } else if(location.hash==="#contract-register") {
        contractPanel.open=true;
        requestAnimationFrame(()=>{if(sequence===token)contractPanel.scrollIntoView({block:"start"});});
      }
    } catch {
      if(sequence!==token)return;
      panel.hidden=false;const msg=elem("p",t("تعذرت قراءة عقود العملاء وتقاريرهم.","Client contracts and reports could not be read."));
      msg.setAttribute("role","status");panel.append(msg,action(t("إعادة المحاولة","Retry"),()=>load(organization)));
    }
  };
}
