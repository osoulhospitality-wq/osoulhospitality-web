import {uiText as t} from "./locale.js";
import {periodInRiyadh} from "./executive-overview.js";

// Labels map to the versioned field catalog. Keep the keys per form, never across templates.
const forms = {
  F04:["حالة وحرجية الأصل","Asset condition and criticality",[
    ["C8","الأصل","Asset"],["C9","الاحتمال (1–5)","Likelihood (1–5)"],["C10","الأثر (1–5)","Impact (1–5)"],["C11","حالة الأصل (1–5)","Asset condition (1–5)"],["C12","خطر سلامة مباشر","Immediate safety risk"],["C15","الإجراء","Action"],["C16","دليل التقييم","Assessment evidence"]]],
  F09:["تحليل سبب العطل","Root cause analysis",[
    ["C9","الأصل","Asset"],["C10","العطل المرصود","Observed failure"],["C12","الدليل","Evidence"],["C13","السبب المباشر المسجّل","Recorded direct cause"],["C14","السبب المثبت بحسب النموذج","Confirmed cause recorded in form"],["C15","الإجراء","Action"],["C17","اختبار الفاعلية","Effectiveness test"]]],
  F11:["تفتيش التشغيل والسلامة","Operational safety inspection",[
    ["C8","الموقع","Location"],["C9","البند","Item"],["C10","الحالة","Condition"],["C11","الخطر","Hazard"],["C12","الإجراء الفوري","Immediate action"],["C14","موعد الإغلاق","Closure deadline"],["C15","الدليل","Evidence"],["C16","حالة الإغلاق","Closure status"]]],
  F13:["مخاطر المهمة","Task risk assessment",[
    ["C8","المهمة","Task"],["C10","الخطر","Hazard"],["C12","الاحتمال","Likelihood"],["C13","الأثر","Impact"],["C14","الضبط المقترح","Proposed control"],["C15","الخطر المتبقي","Residual risk"]]],
  F17:["تقييم مقدم الخدمة","Supplier assessment",[
    ["C8","مقدم الخدمة","Supplier"],["C9","فترة القياس","Period"],["C10","الجودة من 100","Quality out of 100"],["C11","الالتزام من 100","Compliance out of 100"],["C15","مخالفة سلامة حرجة","Critical safety breach"],["C16","القرار المسجّل","Recorded decision"],["C17","الدليل","Evidence"]]],
  F21:["مبادرة كفاءة ووفورات","Efficiency and savings initiative",[
    ["C8","المبادرة","Initiative"],["C22","فترة القياس","Measurement period"],["C9","خط الأساس المعدّل (ريال)","Adjusted baseline (SAR)"],["C10","التكلفة الفعلية (ريال)","Actual cost (SAR)"],["C15","ضبط خط الأساس","Baseline adjustment"],["C16","دليل التحقق","Evidence"],["C17","اعتماد المالية","Finance sign-off"]]],
  F22:["شكوى ميدانية","Facility complaint",[
    ["C8","رقم الشكوى","Complaint reference"],["C9","الموقع","Location"],["C11","الوصف","Description"],["C12","الأولوية","Priority"],["C14","الحل","Resolution"],["C15","تأكيد المستفيد","Customer confirmation"],["C16","الحالة","Status"],["C17","مرجع العمل","Work reference"]]],
  F23:["إجراء تصحيحي","Corrective action",[
    ["C8","رقم الحالة","Case"],["C9","المصدر","Source"],["C10","عدم المطابقة","Nonconformance"],["C11","السبب المسجّل","Recorded cause"],["C13","منع التكرار","Recurrence prevention"],["C14","المسؤول","Owner"],["C15","الموعد","Deadline"],["C16","اختبار الفاعلية","Effectiveness test"],["C17","قرار الإغلاق","Closure decision"]]],
  F24:["تقرير المالك","Owner report",[
    ["C8","فترة التقرير","Reporting period"],["C9","تجاوز الميزانية (ريال)","Budget overrun (SAR)"],["C11","مخاطر السلامة","Safety risks"],["C12","الوحدات خارج الخدمة","Units out of service"],["C13","القرارات المطلوبة","Decisions required"],["C14","المسؤول","Owner"],["C15","الموعد","Deadline"],["C16","أدلة التقرير","Report evidence"]]],
  F26:["سجل الامتثال","Compliance register",[
    ["C8","النشاط والموقع","Activity and site"],["C9","الجهة","Authority"],["C10","المتطلب المسجّل","Recorded requirement"],["C11","أساس الانطباق","Applicability basis"],["C12","مستند الإثبات","Evidence document"],["C13","تاريخ الانتهاء","Expiry date"],["C14","المسؤول","Owner"],["C15","حالة التحقق","Verification status"],["C16","الإجراء التصحيحي","Action"],["C17","دليل الإغلاق","Closure evidence"]]],
  F28:["حادث أو طارئ","Incident or emergency",[
    ["C8","رقم الحدث","Event"],["C9","الموقع والوقت","Place and time"],["C10","نوع الحدث","Event type"],["C11","الإجراء الفوري","Immediate action"],["C13","المسؤول","Owner"],["C14","الأثر","Impact"],["C15","تسلسل الاستجابة","Response sequence"],["C16","دليل التحقيق","Investigation evidence"],["C17","خطة منع التكرار","Recurrence prevention"]]]
};
const topics = {
  owner:[["F24"],"قرارات المالك واستمرارية التشغيل","Owner decisions and continuity", /قرار|اعتماد|وضع منش|وضع المنش|توقف|decision|continuity|out of service|facility status/i],
  compliance:[["F26"],"الامتثال والتراخيص","Compliance and licences", /امتثال|ترخيص|تراخيص|رخص|انتهاء|compliance|licen[cs]|expir/i],
  safety:[["F11","F13","F28"],"السلامة والحوادث والمخاطر","Safety, incidents and risks", /سلامة|حوادث|حادث|مخاطر|سلامه|safety|incident|hazard|risk/i],
  asset:[["F04","F09"],"حرجية الأصول وأسباب الأعطال","Asset criticality and root causes", /عطل|أعطال|اعطال|اصل|أصل|الأصول|جذر|asset|failure|root cause/i],
  resources:[["F21"],"كفاءة الموارد ومبادرات الوفورات","Resource efficiency initiatives", /طاق[ةه]|كهرباء|مياه|وفر|وفورات|هدر|savings|energy|water|resource/i],
  feedback:[["F22","F23"],"تجربة المستفيد والتحسين","Customer experience and improvement", /شكاو|شكوى|شكاوى|سمع[ةه]|تقييمات المنش|تقيي?م منش|تقييم منش|complaint|guest|reputation|swot|rating/i],
  vendor:[["F17"],"جودة مقدمي الخدمات","Service provider quality", /مورد|المورد|مقدم|vendor|supplier|provider/i]
};
const pageSize = 10;
const missing = () => t("غير متحقق","Unverified");
function el(tag,text) {
  const n=document.createElement(tag);
  if (text !== undefined) n.textContent=text;
  return n;
}
function term(dl,label,value) {dl.append(el("dt",label),el("dd",value));}
function digits(text) {return String(text ?? "").replace(/[٠-٩]/g, c => c.charCodeAt(0)-1632).replace(/[۰-۹]/g, c => c.charCodeAt(0)-1776);}
function answer(answers,key) {
  const x=answers?.[key];
  return typeof x==="string" ? x.trim() : Number.isFinite(x) ? String(x) : "";
}

export function expiryDistance(raw,today) {
  const parse = value => {
    const iso=digits(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const ms=Date.parse(iso+"T00:00:00Z");
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10)===iso ? ms : null;
  };
  const date=parse(raw), now=parse(today);
  return date===null || now===null ? null : (date-now)/86400000;
}

export function interpretQuestion(raw) {
  const text=String(raw||"").trim().slice(0,300);
  // Forecast probabilities, measured utilities and platform ratings require other input data.
  if (/تنب|تتنب|متوقع|توقع|تتعطل|احتمال تعطل|predict|forecast|probability|google|booking|airbnb|agoda|expedia|tripadvisor|قوقل|جوجل|بوكينج|بوكنج|كيلوواط|kwh|meter reading|استهلاك|revenue|profit|ارباح|أرباح|خسار|أخسر|اخسر|ارتفاع اسعار|أسعار|اسعار|price/i.test(text)) return null;
  return Object.entries(topics).find(([,topic]) => topic[3].test(text))?.[0] || null;
}

export async function loadAcceptedPage(client,org,site,topic,page=0) {
  if (!org || !site || !Object.hasOwn(topics,topic) || !Number.isSafeInteger(page) || page < 0) return {error:true};
  const source = "field_form_reviews!field_form_reviews_record_id_fkey!inner(decision,reviewed_at)";
  try {
    return await client.from("field_form_records")
      .select("id,code,template_version,submitted_at,answers,"+source,{count:"exact"})
      .eq("organization_id",org).eq("facility_id",site).eq("status","submitted")
      .in("code",topics[topic][0]).eq("field_form_reviews.decision","accepted")
      .order("submitted_at",{ascending:false,nullsFirst:false}).order("id").range(page*pageSize,(page+1)*pageSize-1);
  } catch {return {error:true};}
}

const themes=[
  ["التكييف","HVAC",/تكييف|مكيف|تبريد|hvac|air.condition|cooling/i],
  ["المياه والسباكة","Water and plumbing",/تسرب|مياه|سباكة|ماء|plumb|leak|water/i],
  ["النظافة","Cleaning",/نظاف|نظافة|تنظيف|clean|dirty/i],
  ["الضوضاء","Noise",/ضوضاء|إزعاج|ازعاج|noise|noisy/i],
  ["راحة السرير","Bed comfort",/مراتب|مرتبة|سرير|mattress|bed comfort/i],
  ["الستائر والإضاءة","Curtains and light",/ستائر|ستارة|إضاءة|curtain|sunlight/i]
];
export function feedbackSummary(rows) {
  const complaints=rows.filter(r=>r.code==="F22" && r.template_version === 1);
  const counts=themes.map(([ar,en,re])=>({ar,en,count:complaints.filter(row=>re.test(answer(row.answers,"C11"))).length}));
  const leading=counts.filter(item=>item.count>0).sort((a,b)=>b.count-a.count);
  const confirmed=complaints.filter(row=>/^(نعم|yes|confirmed|تم التأكيد|مؤكد)$/i.test(answer(row.answers,"C15"))).length;
  return {complaints:complaints.length,confirmed,leading};
}

function feedbackInsights(rows) {
  const box=el("section"),dl=el("dl");
  const {complaints,confirmed,leading}=feedbackSummary(rows);
  box.append(el("h4",t("تحليل تشغيلي للعينة المعروضة","Operational SWOT for the displayed sample")));
  if(!complaints){box.append(el("p",t("لا توجد شكوى معتمدة في هذه الصفحة لتحليل الموضوعات.","No accepted complaint in this page to analyse.")));return box;}
  const matches=leading.map(r=>t(r.ar,r.en)+" ("+r.count+")").join(" · ");
  term(dl,t("قوة موثقة","Documented strength"),confirmed ? t("تأكيد صريح من المستفيد على المعالجة في ","Explicit customer confirmation in ")+confirmed+t(" من "," of ")+complaints : missing());
  term(dl,t("نقاط الضعف المرصودة","Reported weaknesses"),matches || t("يلزم تصنيف الأوصاف يدويًا.","Descriptions require manual classification."));
  term(dl,t("فرصة تحسين مقترحة","Improvement opportunity"),t("اربط كل شكوى بأمر العمل واختبار الفاعلية، وتابع نسبة الشكاوى التي أكد المستفيد حلها.","Link each complaint to the work order and effectiveness check. Track customer-confirmed resolutions."));
  term(dl,t("تهديد محتمل","Potential threat"),leading.some(x=>x.count>1) ? t("تكرار وصف الموضوع يستدعي فحص سجل الأصل؛ أثره على السمعة غير مقاس.","A recurring topic warrants an asset history check; its reputation impact is unmeasured.") : missing());
  box.append(dl,el("p",t("المسؤول المقترح: مدير المنشأة وتجربة العميل. التكلفة والموعد يتطلبان اعتماد نطاق المعالجة. قد تتضمن الشكوى أكثر من موضوع.","Suggested owners: facility and customer experience leads. Cost and due date require an approved scope. A complaint may have more than one topic.")));
  return box;
}

function rowPanel(row) {
  const form=forms[row.code];
  const panel=el("details"), fields=el("dl");
  const answers=row.answers || {};
  const supported=row.template_version === 1;
  const first=supported ? answer(answers,form[2][0][0]) : "";
  const review=Array.isArray(row.field_form_reviews) ? row.field_form_reviews[0] : row.field_form_reviews;
  panel.append(el("summary",[row.code,t(form[0],form[1]),first].filter(Boolean).join(" · ")));
  if(!supported)panel.append(el("p",t("يلزم التحقق من تعريف حقول إصدار القالب قبل عرض الإجابات.","The field mapping for this template version needs verification.")));
  for (const [key,ar,en] of supported ? form[2] : []) term(fields,t(ar,en),answer(answers,key)||missing());
  if (supported && row.code==="F26") {
    const remaining=expiryDistance(answer(answers,"C13"),periodInRiyadh().today);
    term(fields,t("المتبقي حتى الانتهاء بالأيام (تقويم ميلادي)","Days to recorded expiry (Gregorian)"),remaining===null ? missing() : String(remaining));
  }
  term(fields,t("مرجع النموذج","Form record"),row.id);
  term(fields,t("إصدار القالب","Template version"),String(row.template_version ?? missing()));
  term(fields,t("تاريخ مراجعة الدليل","Evidence review date"),review?.reviewed_at ?
    new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short",calendar:"gregory"}).format(new Date(review.reviewed_at)) : missing());
  panel.append(fields);return panel;
}

export function setupEvidenceCenter(client,parent) {
  const root=el("details");
  root.className="facility-performance";root.hidden=true;
  root.append(el("summary",t("مساعد دراقون وسجل أدلة المنشأة","DRAQON evidence assistant and facility register")));
  const form=el("form"), label=el("label",t("اسأل عن سجلات المنشأة أو اختر الموضوع","Ask about facility records or select a topic"));
  const input=el("input");input.type="search";input.maxLength=300;
  input.placeholder=t("مثل: ما حالة التراخيص؟","For example: what is the licence status?");
  label.append(input);const ask=el("button",t("البحث في الأدلة","Search evidence"));ask.type="submit";form.append(label,ask);
  const topicLabel=el("label",t("مجال المتابعة","Evidence topic")), selector=el("select");topicLabel.append(selector);
  for (const [key,[,ar,en]] of Object.entries(topics)) selector.add(new Option(t(ar,en),key));
  const status=el("p");status.setAttribute("role","status");
  const results=el("div"),nav=el("nav");
  const previous=el("button",t("السابق","Previous")), next=el("button",t("التالي","Next"));
  previous.type=next.type="button";nav.append(previous,next);nav.hidden=true;
  const context=el("p",t("يبحث المساعد بالقواعد في النماذج المعتمدة لهذه المنشأة. يعرض مرجع السجل وتاريخ المراجعة.","This rules-based assistant searches accepted facility forms and shows their source and review date."));
  root.append(context,form,topicLabel,status,results,nav);parent.append(root);
  let scope=null,rev=0,page=0;
  function clear(){++rev;results.replaceChildren();status.textContent="";nav.hidden=true;}
  async function read(target=0) {
    clear();if(!scope||!root.open)return;
    const token=rev,kind=selector.value;page=target;
    status.textContent=t("جارٍ قراءة الأدلة…","Reading evidence…");
    const response=await loadAcceptedPage(client,scope.org,scope.site,kind,target);
    if(token!==rev)return;
    if(response.error || !Array.isArray(response.data) || !Number.isSafeInteger(response.count)){
      status.textContent=t("تعذرت قراءة سجلات هذا المجال.","This evidence source could not be read.");return;
    }
    const rows=response.data;
    status.textContent=rows.length ? t("النماذج المعتمدة الظاهرة ","Visible accepted forms ")+(target*pageSize+1)+"–"+(target*pageSize+rows.length)+"/"+response.count
      : t("لا تظهر نماذج معتمدة لهذا المجال ضمن صلاحيات الحساب.","No accepted forms for this topic are visible to this account.");
    if(kind==="resources")results.append(el("p",t("تعرض المبادرات المالية المسجّلة. تحتاج قراءات المياه والطاقة إلى سجل عدادات وفترة قياس.","Recorded financial initiatives are shown. Water and energy consumption require meter readings and a defined period.")));
    if(kind==="feedback"){
      results.append(el("p",t("المصدر شكاوى المنشأة وإجراءاتها التصحيحية. تحتاج تقييمات منصات الحجز إلى مصدر مصرح به لكل منصة.","Sources are facility complaints and corrective actions. Booking-platform ratings require authorized platform data.")));
      if(rows.length)results.append(feedbackInsights(rows));
    }
    if(kind==="compliance")results.append(el("p",t("تعكس السجلات أساس الانطباق والمستند المقدّم لكل متطلب. تُراجع المتطلبات السارية مع الجهة المختصة.","Each record identifies the stated applicability and supporting document. Verify current requirements with the responsible authority.")));
    if(kind==="compliance"){
      const links=el("ul");
      for(const [ar,en,url] of [
        ["وزارة السياحة","Ministry of Tourism","https://mt.gov.sa/"],
        ["إصدار الرخصة البلدية التجارية","Municipal business licensing","https://scbc.gov.sa/eservices/details/3bad7cc9-e6c1-4753-08d2-08dbf015747a"],
        ["الدفاع المدني – بوابة سلامة","Civil Defense – Salamah","https://998.gov.sa/halhal/Page/Services/1/"]
      ]){
        const item=el("li"),link=el("a",t(ar,en));link.href=url;link.rel="noreferrer";item.append(link);links.append(item);
      }
      results.append(links);
    }
    for(const row of rows) if(forms[row.code])results.append(rowPanel(row));
    previous.disabled=target===0;next.disabled=(target+1)*pageSize>=response.count;
    nav.hidden=previous.disabled&&next.disabled;
  }
  selector.addEventListener("change",()=>{input.value="";void read();});
  form.addEventListener("submit",event=>{
    event.preventDefault();const topic=interpretQuestion(input.value);
    if(!topic){clear();status.textContent=t("الإجابة غير متحققة من المصادر المتاحة. اختر مجالًا لعرض الأدلة المسجّلة.","The available sources do not establish that answer. Select a topic to inspect its evidence.");return;}
    selector.value=topic;void read();
  });
  previous.addEventListener("click",()=>void read(page-1));next.addEventListener("click",()=>void read(page+1));
  root.addEventListener("toggle",()=>{if(root.open)void read();else clear();});
  return (org,site)=>{
    clear();root.open=false;root.hidden=!org||!site;
    scope=org&&site?{org,site}:null;
    input.value="";selector.value="owner";page=0;
  };
}
