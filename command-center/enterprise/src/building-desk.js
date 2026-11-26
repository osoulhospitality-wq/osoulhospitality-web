import {mountFacilityCouncil} from "./facility-council-ui.js";
import {mountInvestmentCase} from "./facility-investment-ui.js";
import {uiText as t} from "./locale.js";
import {exportFacilityDossier} from "./facility-dossier-export.js";
import {insightTopics} from "./facility-insights.js";
import {routeFacilityQuestion} from "./facility-desk-intent.mjs";

const topics = {
  building:[["حقائق المبنى","Building facts"],"draqon-building-memory"],
  staff:[["القوى العاملة","Staffing"],"draqon-building-memory"],
  assets:[["حصر الأصول والملصقات","Register and label assets"],"draqon-building-memory"],
  maintenance:[["برنامج الصيانة","Maintenance programme"],"facility-pm"],
  swot:[["الموقع والتقييمات وSWOT","Location, reviews and SWOT"],"facility-insights"],
  prices:[["مقارنة المشتريات","Purchase comparisons"],"facility-benchmark"]
};
const factLabels = {
  floors_above:["طوابق فوق سطح الأرض","Above-ground floors"],basements:["طوابق تحت الأرض","Basements"],
  built_area_m2:["مساحة البناء (م²)","Built area (m²)"],land_area_m2:["مساحة الأرض (م²)","Land area (m²)"],
  lifts:["عدد المصاعد","Lifts"],units:["عدد الوحدات","Units"],staff_total:["عدد العاملين","Staff count"],
  staff_breakdown:["توزيع العاملين","Staff breakdown"],address:["العنوان","Address"],property_type:["نوع المنشأة","Property type"]
};
const stateName = s => ({
  pending:t("بانتظار المراجعة","Pending review"),checked:t("تم التحقق","Checked"),follow_up:t("متابعة","Follow-up"),
  reviewed:t("مكتمل التحقق","Reviewed"),follow_up_required:t("مغلق بمتابعات قائمة","Closed with follow-ups")
})[s] || s;
function el(tag,text) {
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  return node;
}
function button(text,fn) {
  const b=el("button",text); b.type="button"; b.addEventListener("click",fn); return b;
}
function labeled(label,control) {
  const wrap=el("label",label);wrap.append(control);return wrap;
}
async function read(request) {const {data,error}=await request;if(error)throw error;return data;}
function today() {return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function answer(key,b) {
  if(factLabels[key]){
    const f=b.facts[key], label=t(...factLabels[key]);
    if(!f)return label+" — "+t("لم يُعتمد لهذا المبنى حتى الآن.","No verified value for this property.");
    if(f.conflict)return label+" — "+t("تعارض في أحدث المصادر بتاريخ ","Latest sources disagree on ")+f.asOf+" · "+f.sources.map(s=>s.value+" ("+s.source+")").join(" / ");
    return label+" — "+f.value+" · "+f.source+" · "+f.asOf;
  }
  switch(key){
    case "area_ambiguous":return t("أي مساحة تقصد، مساحة البناء أم مساحة الأرض؟","Which area do you mean, built area or land area?");
    case "assets":return t("الأصول المسجلة في هذا المبنى","Registered assets at this property")+" — "+b.assets.count;
    case "maintenance":return t("خطط الصيانة النشطة","Active maintenance plans")+" — "+b.maintenance.count+" · "+t("المستحقة حتى اليوم","Due through today")+" — "+b.maintenance.due+(b.maintenance.next?" · "+t("أقرب استحقاق","First due")+" "+b.maintenance.next:"");
    case "swot":return t("اعتماد تحليل الموقع والتقييمات","Location and review analysis")+" — "+(b.swot.status==="approved"?t("معتمد","Approved"):t("مسودة","Draft"))+" · "+t("شواهد مسندة","Sourced observations")+" "+b.swot.evidence.length+
      (b.swot.evidence.length?" · "+b.swot.evidence.slice(0,4).map(e=>{
        const item=insightTopics[e.topic];return (item?t(item[1],item[2]):e.topic)+" ("+e.observed_to+")";
      }).join(" / "):"");
    case "prices":{
      const p=b.prices,s=p.sample;
      return t("ضمن أحدث 200 بند، عدد البنود المفحوصة","Lines examined within the latest 200")+" "+p.count+" · "+t("ذات مرجع سعر قابل للمقارنة","With comparable approved pricing")+" "+p.matched+
        (s?" · "+s.invoice_ref+" / "+s.invoice_line+" · "+t("الفعلي","Actual")+" "+s.net_delivered_unit+" · "+t("المرجع","Reference")+" "+s.approved_unit+" "+s.currency+"/"+s.base_unit+" · "+s.difference_pct+"%":"");
    }
    case "round":{
      const r=b.round||b.lastRound;
      if(!r)return t("لا يوجد كشف مسجل. ابدأ كشفاً من ملف المبنى.","No survey on file. Start one from the property desk.");
      const open=r.items.filter(i=>i.state!=="checked").map(i=>t(...topics[i.topic][0])+(i.followUpOn?" ("+i.followUpOn+")":""));
      return (b.round?t("كشف جارٍ","Active survey"):stateName(r.outcome))+" · "+(open.join("، ")||t("تم التحقق من كل المحاور","All topics checked"));
    }
    default:return "";
  }
}

export function setupBuildingDesk(client){
  const panel=document.getElementById("draqon-building-desk"),org=document.getElementById("organization-select");
  if(!panel||!org)return;
  const root=panel.querySelector("[data-content]"),site=el("select"),message=el("p"),body=el("div");
  site.id="desk-site";message.setAttribute("role","status");root.append(labeled(t("اختر المبنى","Choose a property"),site),message,body);
  let version=0,userId=null,currentBrief=null;
  const valid=(v,o,s)=>version===v&&org.value===o&&site.value===s&&panel.open;
  const reset=()=>{version++;body.replaceChildren();message.textContent="";currentBrief=null;};
  async function listSites(){
    reset();site.replaceChildren(new Option(t("اختر المبنى","Choose a property"),""));
    const o=org.value,v=version;if(!o)return;
    try{
      for(let start=0;;start+=100){
        const rows=await read(client.from("facilities").select("id,name").eq("organization_id",o).order("name").order("id").range(start,start+99));
        if(!valid(v,o,""))return;
        rows.forEach(r=>site.add(new Option(r.name,r.id)));if(rows.length<100)break;
      }
      if(site.options.length===2){site.selectedIndex=1;await refresh();}
    }catch{if(valid(v,o,""))message.textContent=t("تعذرت قراءة قائمة المباني.","Could not read the property list.");}
  }
  async function refresh(){
    reset();const o=org.value,s=site.value,v=version;if(!s||!o||!panel.open)return;
    try{
      const b=await read(client.rpc("facility_review_brief",{p_org:o,p_facility:s}));
      if(!valid(v,o,s))return;currentBrief=b;render(b,o,s,v);
    }catch{if(valid(v,o,s))message.textContent=t("تعذر استرجاع الملف. تحقق من الاتصال والصلاحية.","Could not retrieve this file. Check access and connection.");}
  }
  function render(b,o,s,v){
    body.replaceChildren(el("h3",b.facility));
    const jump=topic=>button(t(...topics[topic][0]),()=>{
      if(!valid(v,o,s))return;
      const panelId=topics[topic][1];
      document.dispatchEvent(new CustomEvent("draqon:facility-focus",{detail:{orgId:o,facilityId:s,panelId}}));
      document.getElementById(panelId)?.scrollIntoView({block:"start"});
    });
    const output=el("ul"),form=el("form"),input=el("input"),submit=el("button",t("استرجع من السجل","Look up in file"));
    input.required=true;input.maxLength=320;input.placeholder=t("كم دور وكم مصعد؟ وش باقي بالكشف؟","How many floors and lifts? What is outstanding?");
    form.append(labeled(t("سؤالك عن المبنى المحدد","Your question about this property"),input),submit);
    let previousKeys=[];
    function respond(keys){
      previousKeys=keys;
      output.replaceChildren(...keys.map(k=>el("li",answer(k,b))));
      if(!keys.length)output.append(el("li",t("حدّد المعلومة المطلوبة، مثل عدد المصاعد أو موعد الصيانة أو البنود المفتوحة.","Name a property detail such as lifts, maintenance dates or open items.")));
    }
    form.addEventListener("submit",e=>{e.preventDefault();const q=input.value.trim(),direct=routeFacilityQuestion(q);
      if(/(?:استبدال|إصلاح أم|اصلاح ام|دراسة استثمار|repair or replace|repair vs|investment case|lifecycle cost)/iu.test(q)){
        investment.open=true;investment.scrollIntoView({block:"start"});return;
      }
      if(/(?:تنب[ؤئوي]|توق[عّ]|مجلس|اللجن[ةه]|دراسة المنشأة|دراسه المنشاه|مخاطر المنشأة|forecast|outlook|committee|council|property study)/iu.test(q)){
        council.open=true;council.scrollIntoView({block:"start"});return;
      }
      if(direct.length){respond(direct);return;}
      if(previousKeys.includes("area_ambiguous")){
        if(/^(?:ال)?(?:أرض|ارض|قطعة الأرض)|^(?:the )?(?:land|plot|lot)$/i.test(q)){respond(["land_area_m2"]);return;}
        if(/^(?:ال)?(?:مبنى|مبني|بناء)|^(?:the )?(?:building|construction)$/i.test(q)){respond(["built_area_m2"]);return;}
      }
      if(previousKeys.length && /(?:المصدر|مصدرها|مرجعها|مرجعه|تاريخها|تاريخه|من وين|source|as of|verified when|where did)/iu.test(q)){
        respond(previousKeys);return;
      }
      respond([]);});
    output.setAttribute("aria-live","polite");
    const controls=el("div");controls.className="memory-inline";
    controls.append(button(t("ملخص المبنى","Property summary"),()=>respond(["floors_above","basements","built_area_m2","land_area_m2","lifts","units","staff_total"])),
      button(t("المتبقي من الكشف","Survey outstanding"),()=>respond(["round"])),button(t("تحديث الملف","Refresh file"),refresh));
    const download=button(t("تنزيل ملف الكشف","Download survey file"),async()=>{
      if(download.disabled||!valid(v,o,s))return;
      download.disabled=true;
      try {
        const fresh=await read(client.rpc("facility_review_brief",{p_org:o,p_facility:s}));
        if(valid(v,o,s))await exportFacilityDossier(client,o,s,fresh,()=>valid(v,o,s));
      }catch{
        if(valid(v,o,s))message.textContent=t("تعذر تنزيل ملف الكشف كاملاً. حدّث الملف وحاول مجدداً.","Could not download the complete survey. Refresh the file and retry.");
      }finally{download.disabled=false;}
    });
    controls.append(download);
    body.append(form,controls,output,el("p",t("ملاحظات تنتظر التحقق","Observations awaiting verification")+" · "+b.unverified));
    const nav=el("div");nav.className="memory-inline";for(const k of Object.keys(topics))nav.append(jump(k));body.append(nav);
    const council=mountFacilityCouncil(client,o,s,b,()=>valid(v,o,s));
    const investment=mountInvestmentCase();
    body.append(council,investment);
    async function mutate(btn,rpc,extra){
      if(btn.disabled||!valid(v,o,s)||currentBrief!==b)return;
      btn.disabled=true;
      try{
        await read(client.rpc(rpc,{p_org:o,p_facility:s,...extra}));
        if(valid(v,o,s))await refresh();
      }catch{if(valid(v,o,s))message.textContent=t("لم تُحفظ العملية. راجع مصدر البيانات والصلاحية وتاريخ المتابعة، ثم أعد المحاولة.","Action not saved. Check supporting evidence, permissions and the follow-up date, then retry.");}
      finally{btn.disabled=false;}
    }
    if(b.round){
      const r=b.round;body.append(el("h4",t("الكشف الجاري","Active survey")+" · "+r.target));
      for(const key of Object.keys(topics)){
        const i=r.items.find(item=>item.topic===key);if(!i)continue;
        const row=el("details"),summ=el("summary",t(...topics[key][0])+" · "+stateName(i.state)+(i.followUpOn?" · "+i.followUpOn:""));
        row.append(summ);if(i.note)row.append(el("p",i.note));
        const f=el("form"),note=el("input"),date=el("input"),state=el("select"),save=el("button",t("حفظ القرار","Save decision"));
        note.required=true;note.minLength=3;note.maxLength=1000;note.value=i.note||"";
        state.add(new Option(t("متابعة بتاريخ محدد","Dated follow-up"),"follow_up"));
        if(b.canApprove)state.add(new Option(t("تم التحقق من السجل","Checked against file"),"checked"));
        state.value=i.state==="checked"&&b.canApprove?"checked":"follow_up";
        date.type="date";date.min=today();date.value=i.followUpOn||"";
        const dateLabel=labeled(t("تاريخ المتابعة","Follow-up date"),date);
        const mode=()=>{dateLabel.hidden=state.value!=="follow_up";date.required=!dateLabel.hidden;};
        mode();state.addEventListener("change",mode);
        f.append(labeled(t("حالة المحور","Topic state"),state),labeled(t("نطاق التحقق أو سبب المتابعة والمسؤول عنها","Scope checked or follow-up reason and owner"),note),dateLabel,save);
        f.addEventListener("submit",e=>{e.preventDefault();void mutate(save,"facility_review_decide",{p_round:r.id,p_topic:key,p_state:state.value,p_note:note.value.trim(),p_follow_up_on:state.value==="follow_up"?date.value:null});});
        row.append(f);body.append(row);
      }
      if(b.canApprove){const close=button(t("إغلاق الكشف وتسجيل النتيجة","Close survey and record outcome"),()=>mutate(close,"facility_review_close",{p_round:r.id}));close.disabled=r.items.some(i=>i.state==="pending");body.append(close);}
    }else{
      const f=el("form"),date=el("input"),start=el("button",t("فتح كشف","Open survey"));date.type="date";date.required=true;date.value=today();
      f.append(labeled(t("تاريخ الكشف المستهدف","Survey target date"),date),start);
      f.addEventListener("submit",e=>{e.preventDefault();void mutate(start,"facility_review_open",{p_target:date.value});});body.append(f);
    }
    const history=el("details");history.append(el("summary",t("متابعات الكشوف السابقة","Open follow-ups from previous surveys")));
    const historyItems=el("div");history.append(historyItems);body.append(history);
    history.addEventListener("toggle",async()=>{
      if(!history.open||!valid(v,o,s))return;
      historyItems.replaceChildren();
      try{
        const rows=[];
        for(let offset=0;;offset+=100){
          const page=await read(client.rpc("facility_review_followups",{p_org:o,p_facility:s}).range(offset,offset+99));
          if(!valid(v,o,s)||!history.open)return;
          rows.push(...page);if(page.length<100)break;
        }
        if(!rows.length)historyItems.append(el("p",t("لا توجد متابعات مفتوحة من كشف سابق.","No open follow-ups from previous surveys.")));
        for(const i of rows){
          const line=el("div");line.append(el("p",t(...topics[i.topic][0])+" · "+i.due_on+" · "+i.note));
          if(b.canApprove && b.lastRound && b.lastRound.id!==i.round_id && b.lastRound.items.some(x=>x.topic===i.topic&&x.state==="checked")){
            const resolve=button(t("إقفال المتابعة بشاهد آخر كشف","Resolve using the last survey’s checked evidence"),()=>mutate(resolve,"facility_review_resolve_followup",{
              p_round:i.round_id,p_topic:i.topic,p_checked_round:b.lastRound.id}));
            line.append(resolve);
          }
          historyItems.append(line);
        }
      }catch{if(valid(v,o,s))historyItems.textContent=t("تعذرت قراءة المتابعات.","Could not load follow-ups.");}
    });
    if(b.lastRound){
      const r=b.lastRound,past=el("details");past.append(el("summary",t("آخر كشف مغلق","Last closed survey")+" · "+stateName(r.outcome)+" · "+r.target));
      for(const i of r.items)past.append(el("p",t(...topics[i.topic][0])+" · "+stateName(i.state)+(i.note?" · "+i.note:"")+(i.followUpOn?" · "+i.followUpOn:"")));
      body.append(past);
    }
  }
  site.addEventListener("change",refresh);
  panel.addEventListener("toggle",()=>{if(panel.open)void listSites();else {reset();site.replaceChildren();}});
  org.addEventListener("change",()=>{reset();site.replaceChildren();if(panel.open)void listSites();});
  client.auth.onAuthStateChange((event,session)=>{const id=session?.user?.id??null;if(id!==userId||event==="SIGNED_OUT"){reset();site.replaceChildren();panel.open=false;}userId=id;});
}
