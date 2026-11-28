import {uiText as t} from "./locale.js";
import {elem,select,table,detail,monthlyChart} from "./client-reports.js";
import {renderFacilityPilot,sourceRegister} from "./facility-pilot.js";
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
  let pilotState=new Map(),periodKey="";
  // Facility UUIDs stay distinct even when two clients use the same building code.
  function reportingPeriods() {
    const groups=new Map();
    for(const client of clients){
      const pilot=client.detail?.pilot;
      if(!pilot?.sites?.length)continue;
      const key=JSON.stringify([pilot.start,pilot.end,pilot.timezone]);
      let group=groups.get(key);
      if(!group){
        group={key,pilot:{start:pilot.start,end:pilot.end,timezone:pilot.timezone,sites:[]},places:[]};
        groups.set(key,group);
      }
      for(const record of pilot.sites){
        const site=client.facilities?.find(f=>f.code===record.code);
        if(!site)continue;
        group.places.push({code:site.id,name:site.name});
        group.pilot.sites.push({...record,code:site.id,clientName:client.name});
      }
    }
    return [...groups.values()].filter(g=>g.places.length).sort((a,b)=>String(b.pilot.start).localeCompare(String(a.pilot.start)));
  }
  function focusPilot(){
    const section=panel.querySelector("#facility-pilot");
    if(section){section.focus({preventScroll:true});panel.scrollIntoView({block:"start"});}
  }
  const building=()=>document.getElementById("fm-building-select");
  function showClient(id,facilityCode="",move=false){

    clientId=id;code=facilityCode;render();
    if(move){panel.tabIndex=-1;panel.focus({preventScroll:true});panel.scrollIntoView({block:"start"});}
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
      if(client.detail?.pilot?.sites?.length){
        el.append(action(t("بنود خدمات المباني المسعّرة وغير المسعّرة والزيارات التجريبية","Building service prices, unpriced scope and pilot visits"),()=>{
          showClient(client.id,"");location.hash="facility-pilot";focusPilot();
        }));
      }
      for(const site of client.facilities||[]){
        const source=sourceRegister(site);
        if(source){source.querySelector("summary").append(document.createTextNode(" · "+site.name));el.append(source);}
      }
      contractSection.append(el);
    }
    contractSection.hidden=!clients.length;
  }
  function selectSite(id){
    const owner=clients.find(c=>c.facilities?.some(f=>f.id===id));
    const site=owner?.facilities.find(f=>f.id===id);
    if(!site)return;
    const base=building();
    if(base && [...base.options].some(o=>o.value===id) && base.value!==id){
      base.value=id;
      base.dispatchEvent(new Event("change"));
    }else{
      showClient(owner.id,site.code);
    }
  }
  function render(){
    panel.replaceChildren();
    if(!clients.length){panel.hidden=true;return;}
    panel.hidden=false;
    const client=clients.find(c=>c.id===clientId);
    const places=client?.facilities||clients.flatMap(c=>c.facilities||[]);
    const site=client?.facilities?.find(f=>f.code===code);
    const picker=elem("div",null,"client-filters dossier-scope");
    const clientChoices=clients.map(c=>[c.id,c.name]);
    if(clients.length>1)clientChoices.unshift(["",t("محفظة أصول · كل العملاء","Osoul portfolio · All clients")]);
    const [clientLabel,clientSelect]=select(t("نطاق العميل","Client scope"),clientChoices,id=>showClient(id));
    clientSelect.value=clientId;
    const siteChoices=places.map(f=>[client?f.code:f.id,f.name]);
    const [siteLabel,siteSelect]=select(t("المنشأة","Facility"),[["",t("جميع منشآت النطاق","All facilities in scope")],...siteChoices],key=>{
      if(!key){showClient(clientId);return;}
      const selected=client?places.find(f=>f.code===key):places.find(f=>f.id===key);
      if(selected)selectSite(selected.id);
    });
    siteSelect.value=site?.code||"";
    picker.append(clientLabel,siteLabel);
    panel.append(picker);
    if(!client){
      const periods=reportingPeriods(),group=periods.find(g=>g.key===periodKey)||periods[0];
      if(group){
        periodKey=group.key;
        if(periods.length>1){
          const [periodLabel,periodSelect]=select(t("أسبوع الخطة","Planning week"),periods.map(g=>[g.key,[g.pilot.start,g.pilot.end,g.pilot.timezone].join(" · ")]),next=>{periodKey=next;render();});
          periodSelect.value=periodKey;picker.append(periodLabel);
        }
        const board=renderFacilityPilot(group.pilot,group.places,"",pilotState,selectSite);
        if(board)panel.append(board);
      }else{
        panel.append(elem("p",t("اختر عميلًا لاستعراض عقده وسجلات منشآته.","Choose a client to see its agreement and facility records.")));
      }
      return;
    }
    const source=id=>sourceName(client.sources||[],id);
    const clientPilot=client.detail?.pilot;
    if(clientPilot){
      const group=reportingPeriods().find(g=>g.key===JSON.stringify([clientPilot.start,clientPilot.end,clientPilot.timezone]));
      if(group){
        const ids=new Set(places.map(f=>f.id));
        const scoped={...clientPilot,sites:group.pilot.sites.filter(f=>ids.has(f.code))};
        const board=renderFacilityPilot(scoped,group.places.filter(f=>ids.has(f.code)),site?.id||"",pilotState,selectSite);
        if(board)panel.append(board);
      }
    }
    const contract=client.contract||{};
    const heading=elem("h3",site?.name||client.name);heading.tabIndex=-1;
    const links=elem("nav",null,"fm-shortcuts");
    const contractLink=elem("a",t("عقد العميل","Client agreement"));contractLink.href="#contract-register";
    contractLink.onclick=()=>{contractPanel.open=true;};links.append(contractLink);
    const forms=elem("a",t("اختيار المبنى المسند ونموذج الفني","Choose an assigned building and field form"));forms.href=(document.documentElement.lang.startsWith("en")?"/en":"")+"/field-forms/#form-picker";links.append(forms);
    panel.append(heading,elem("p",[contract.name,statusLabel(contract.status||client.status),contract.evidence_note].filter(Boolean).join(" · ")),links);
    const register=sourceRegister(site);
    if(register)panel.append(register);
    if(client.observations?.length||client.detail?.totals||site?.detail?.metrics?.length){
      panel.append(facts(client,site,source),monthlyChart(client,site,source));
    }
    panel.append(...records(client,site,source));
  }
  document.getElementById("fm-building-select")?.addEventListener("change",()=>{
    const id=building()?.value;
    for(const c of clients){const site=c.facilities?.find(f=>f.id===id);if(site){showClient(c.id,site.code);return;}}
    if(clients.length&&code)showClient(clientId,"");
  });
  return async function load(id){
    const token=++sequence;
    read?.abort();pilotState=new Map();periodKey="";organization=id;clients=[];clientId="";code="";
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
      const initial=matched || clients.find(c=>c.observations?.length) || clients[0];
      const allClients=clients.length>1 && location.hash!=="#client-portfolio";
      const pilotEntry=location.hash==="#facility-pilot" && !allClients;
      showClient(allClients?"":initial.id,allClients||pilotEntry?"":matched?.facilities.find(f=>f.id===initialSite)?.code||"");
      renderContracts();
      if(location.hash==="#facility-pilot"){
        requestAnimationFrame(()=>{if(sequence===token)focusPilot();});
      }else if(location.hash==="#client-portfolio") {
        requestAnimationFrame(()=>{if(sequence===token){panel.querySelector("select")?.focus({preventScroll:true});panel.scrollIntoView({block:"start"});}});
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
