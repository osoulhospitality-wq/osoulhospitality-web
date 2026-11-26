import {buildCouncilDecisions, buildCouncilStudy, councilMetrics, referenceReviewDate} from "./facility-council.mjs";
import {uiText as t} from "./locale.js";

const decisionState = {
  forecast:["تقدير متاح","Estimate available"],
  insufficient:["البيانات التاريخية غير كافية","Insufficient historical data"],
  stale:["البيانات غير محدّثة","History is stale"],
  invalid:["تحتاج المدخلات إلى تصحيح","Inputs need correction"],
  unreliable:["الأداء التاريخي لا يدعم التقدير","Historical performance does not support an estimate"]
};
const methods = {
  last_value:["آخر قيمة مرصودة","Last observed value"],
  median_drift:["وسيط التغير الشهري","Median monthly change"],
  moving_mean_3:["متوسط متحرك لثلاثة أشهر","Three-month moving mean"]
};
const metrics = new Map(councilMetrics.map(m=>[m.id,m]));
const text = pair => Array.isArray(pair) ? t(...pair) : "";
function el(tag,content){
  const element=document.createElement(tag);
  if(content!==undefined)element.textContent=String(content);
  return element;
}
function line(name,value){
  const p=el("p");
  p.append(el("strong",name+" · "),document.createTextNode(value));
  return p;
}
function labeled(name,input){
  const label=el("label",name);label.append(input);return label;
}
function button(label){const b=el("button",label);b.type="button";return b;}
const today = () => new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function dateOf(year,month,day){const d=new Date(0);d.setUTCFullYear(year,month,day);return d.toISOString().slice(0,10);}
function monthEnd(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return "";
  const [y,m]=month.split("-").map(Number);return dateOf(y,m,0);
}
function numericInput(raw){
  return raw.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/٫/g,".");
}
function formatted(value,unit){
  if(value===null||value===undefined||value===""||!Number.isFinite(Number(value)))return "—";
  return new Intl.NumberFormat(document.documentElement.lang||"ar",{maximumFractionDigits:6}).format(value)+(unit?" "+unit:"");
}
function metricLabel(id){return text(metrics.get(id)?.label)||id;}
function measurement(metric,value){return formatted(value,text(metrics.get(metric)?.unit));}
function cite(reference){
  const candidate=reference?.url;
  if(!candidate)return el("span",reference?.title||"");
  let url;
  try{url=new URL(candidate);}catch{return el("span",reference.title||"");}
  if(url.protocol!=="https:")return el("span",reference.title||"");
  const anchor=el("a",Array.isArray(reference.title)?text(reference.title):reference.title||url.hostname);
  anchor.href=url.href;anchor.target="_blank";anchor.rel="noopener noreferrer";return anchor;
}
function observation(e){
  return [metricLabel(e.metric),measurement(e.metric,e.value),String(e.month||"").slice(0,7),e.source_ref].filter(Boolean).join(" · ");
}
function memoCards(decisions){
  const section=el("section");section.append(el("h4",t("مذكرة القرارات المشتركة","Cross-functional decision memo")));
  if(!decisions.length){section.append(el("p",t("لا توجد مذكرة مدعومة بالبيانات الحالية.","No memo is supported by the current data.")));return section;}
  for(const d of decisions){
    const card=el("article");card.append(el("h5",text(d.title)),el("p",text(d.finding)));
    if(d.evidence?.length){
      const evidence=el("ul");for(const item of d.evidence)evidence.append(el("li",observation(item)));
      card.append(el("strong",t("الأدلة المستخدمة","Evidence used")),evidence);
    }
    if(d.options?.length){
      const list=el("ul");for(const option of d.options)list.append(el("li",text(option)));
      card.append(el("strong",t("الخيارات المطروحة","Options to consider")),list);
    }
    card.append(line(t("صاحب المتابعة","Responsible role"),text(d.owner)),line(t("الخطوة التالية","Next step"),text(d.next)));section.append(card);
  }
  section.append(el("small",t("تُحال القرارات المالية إلى صاحب التفويض قبل أي التزام.","Financial commitments require the designated approver.")));
  return section;
}
function studyCard(card){
  const detail=el("details"),unit=text(card.unit||metrics.get(card.metric)?.unit);
  detail.append(el("summary",text(card.title)),line(t("السؤال التشغيلي","Operating question"),text(card.question)),line(t("المؤشر","Indicator"),text(card.indicator)));
  if(card.latest){
    detail.append(line(t("آخر مشاهدة موثقة","Latest supported observation"),[formatted(card.latest.value,unit),String(card.latest.month).slice(0,7),card.latest.source_ref].filter(Boolean).join(" · ")));
  }else{detail.append(line(t("المشاهدة","Observation"),t("لا توجد قيمة موثقة متاحة.","No supported value available.")));}
  const out=card.outlook||{};
  if(out.status==="forecast" && out.estimate!=null && Number.isFinite(Number(out.estimate))){
    detail.append(line(t("تقدير الشهر التالي لآخر إقفال","Estimate for the month after the latest close"),[out.nextMonth,formatted(out.estimate,unit)].filter(Boolean).join(" · ")));
    if(methods[out.method])detail.append(line(t("طريقة التقدير","Estimation method"),text(methods[out.method])));
  }else{
    detail.append(line(t("التوقع الشهري","Monthly outlook"),text(decisionState[out.status])||t("لم يصدر تقدير.","No estimate issued.")));
  }
  if(out.mae!=null&&Number.isFinite(Number(out.mae))){
    detail.append(line(t("متوسط الخطأ المطلق في الاختبار التاريخي","Historical mean absolute error"),formatted(out.mae,unit)));
    if(out.baselineMae!=null&&Number.isFinite(Number(out.baselineMae)))detail.append(line(t("خطأ المقارنة عند تكرار آخر قيمة","Comparison error using last observed value"),formatted(out.baselineMae,unit)));
  }
  detail.append(line(t("الإشارة","Signal"),text(card.signal)),line(t("الإجراء العملي","Recommended action"),text(card.action)),line(t("مسؤول المتابعة","Responsible role"),text(card.owner)));
  const gaps=text(card.gaps);if(gaps)detail.append(line(t("حدود الدليل","Evidence limitations"),gaps));
  if(card.source?.title||card.source?.url){const p=el("p");p.append(el("strong",t("مرجع المنهجية · ","Method reference · ")),cite(card.source));if(referenceReviewDate)p.append(document.createTextNode(" · "+t("مراجعة المرجع","Reference reviewed")+" "+referenceReviewDate));detail.append(p);}
  return detail;
}

function printStudy(panel,content,property,asOf){
  const frame=el("iframe");frame.title=t("نسخة الدراسة للطباعة","Print version of the study");
  Object.assign(frame.style,{position:"fixed",width:"1px",height:"1px",opacity:"0",pointerEvents:"none",border:"0"});
  panel.querySelector("iframe[data-council-print]")?.remove();frame.dataset.councilPrint="";panel.append(frame);
  const doc=frame.contentDocument;doc.documentElement.dir=document.documentElement.dir;doc.documentElement.lang=document.documentElement.lang;
  doc.title=t("دراسة المنشأة","Property study");const css=doc.createElement("style");
  css.textContent="@page{size:A4;margin:15mm}body{font:12pt/1.65 Arial,Tahoma,sans-serif;color:#173d33}h1,h2,h3,h4,h5,summary{color:#0a5140;break-after:avoid}summary,h5{font-size:14pt;font-weight:700}details{margin-block:10pt;padding-top:7pt;border-top:1px solid #aaa}p{margin:4pt 0}li,p{overflow-wrap:anywhere}a{color:#164b41}article{margin-bottom:12pt}small{display:block}";
  doc.head.append(css);const heading=doc.createElement("h1");heading.textContent=doc.title;
  const context=doc.createElement("p");context.textContent=[property,asOf].filter(Boolean).join(" · ");
  const copy=content.cloneNode(true);copy.querySelectorAll("details").forEach(d=>{d.open=true;});
  doc.body.append(heading,context,doc.importNode(copy,true));
  const target=frame.contentWindow;target.addEventListener("afterprint",()=>frame.remove(),{once:true});
  try{target.focus();target.print();}catch{frame.remove();throw Error("Print unavailable");}
}

export function mountFacilityCouncil(client,orgId,facilityId,brief,isCurrent){
  const panel=el("details");panel.className="memory-editor";panel.dataset.facilityCouncil="";
  panel.append(el("summary",t("دراسة المجلس والتوقع الشهري","Council study and monthly outlook")));
  const message=el("p");message.setAttribute("role","status");
  const output=el("div");panel.append(message,output);
  let generation=0;
  const active=version=>panel.isConnected&&panel.open&&isCurrent()&&generation===version;
  const unavailable=()=>{message.textContent=t("تعذّر استرجاع السجل لهذه الجلسة والمنشأة. تحقّق من الصلاحية والاتصال ثم أعد الفتح.","The record could not be retrieved for this session and property. Check access and connectivity, then reopen.");};
  async function rpc(name,values){const {data,error}=await client.rpc(name,{p_org:orgId,p_facility:facilityId,...values});if(error)throw error;return data;}

  function recordForm(version){
    const box=el("details");box.append(el("summary",t("توثيق قراءة شهرية من مصدر معتمد","Record a sourced monthly observation")));
    const form=el("form"),metric=el("select"),month=el("input"),value=el("input"),source=el("input"),retrieved=el("input"),confirmed=el("input");
    const submit=el("button",t("حفظ القراءة الموثقة","Save verified reading"));submit.type="submit";
    metric.required=true;for(const m of councilMetrics)metric.add(new Option(text(m.label)+" · "+text(m.unit),m.id));
    month.type="month";month.required=true;month.dir="ltr";
    const at=today();const [year,num]=at.slice(0,7).split("-").map(Number);
    month.max=dateOf(year,num-1,0).slice(0,7);
    value.required=true;value.inputMode="decimal";value.dir="ltr";value.autocomplete="off";
    source.required=true;source.minLength=3;source.maxLength=500;
    retrieved.type="date";retrieved.required=true;retrieved.max=at;retrieved.value=at;
    confirmed.type="checkbox";confirmed.required=true;confirmed.style.width="auto";
    const response=el("p");response.setAttribute("role","status");
    const unit=el("span"),valueGuide=el("small");
    function setUnit(){
      const m=metrics.get(metric.value);unit.textContent=text(m?.unit);
      if(m?.unit?.[1]==="count")valueGuide.textContent=t("أدخل عدداً صحيحاً غير سالب.","Enter a whole, nonnegative count.");
      else if(metric.value.endsWith("_pct"))valueGuide.textContent=t("تُسجل النسبة المئوية بين صفر و100.","Enter a percentage from 0 to 100.");
      else if(metric.value.endsWith("_sar"))valueGuide.textContent=t("أدخل الريالات حتى منزلتين عشريتين. يقبل رصيد النقد وفرق الإنفاق القيم السالبة.","Enter SAR to two decimals. Cash balances and spending variances may be negative.");
      else valueGuide.textContent=t("أدخل القياس غير السالب بالوحدة المعروضة.","Enter a nonnegative reading in the displayed unit.");
    }
    setUnit();metric.addEventListener("change",setUnit);
    const amountLabel=el("label",t("القيمة المرصودة","Observed value")+" · ");amountLabel.append(unit,value);
    month.addEventListener("input",()=>{retrieved.min=monthEnd(month.value);});
    const confirmation=el("label");confirmation.append(confirmed,document.createTextNode(t(" تحققت من المصدر ووحدة القياس وفترة المشاهدة."," I verified the source, unit and observation period.")));
    form.append(labeled(t("المؤشر","Metric"),metric),labeled(t("شهر مكتمل","Closed month"),month),amountLabel,valueGuide,labeled(t("مرجع المصدر أو رقم التقرير","Source reference or report ID"),source),labeled(t("تاريخ التحقق من المصدر","Source retrieval date"),retrieved),confirmation,submit,response);
    let receipt=null,signature=null,submitting=false;
    form.addEventListener("submit",async event=>{
      event.preventDefault();if(!active(version)||submitting||!form.reportValidity())return;
      const reportDate=today(),end=monthEnd(month.value),raw=numericInput(value.value);
      if(!end||month.value>=reportDate.slice(0,7)||retrieved.value<end||retrieved.value>reportDate){
        response.textContent=t("اختر شهراً مكتملاً وتاريخ تحقق من آخر يوم فيه حتى اليوم.","Choose a closed month and a retrieval date from month-end through today.");return;
      }
      if(!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)||!Number.isFinite(Number(raw))||!confirmed.checked){
        response.textContent=t("أدخل رقماً صالحاً وأكّد التحقق من المصدر.","Enter a valid number and confirm the source check.");return;
      }
      const n=Number(raw),m=metrics.get(metric.value),signed=["cash_balance_sar","capex_variance_sar"].includes(metric.value);
      if((n<0&&!signed)||(m?.unit?.[1]==="count"&&!Number.isInteger(n))||(metric.value.endsWith("_pct")&&n>100)
           ||(metric.value.endsWith("_sar")&&(raw.split(".")[1]||"").replace(/0+$/,"").length>2)||source.value.trim().length<3){
        response.textContent=t("راجع وحدة المؤشر وحدود القيمة ومرجع المصدر.","Check the metric unit, permitted range and source reference.");return;
      }
      const data={p_metric:metric.value,p_month:month.value+"-01",p_value:raw,p_source:source.value.trim(),p_retrieved:retrieved.value};
      const fingerprint=JSON.stringify(data);if(fingerprint!==signature){receipt=crypto.randomUUID();signature=fingerprint;}
      submitting=true;const controls=[...form.elements];controls.forEach(c=>{c.disabled=true;});
      try{
        const saved=await rpc("facility_council_record",{...data,p_id:receipt});
        if(!active(version))return;
        await load(t("حُفظت القراءة الموثقة.","Verified observation saved.")+(typeof saved==="string"?" · "+saved:""));
      }catch{
        if(active(version))response.textContent=t("تعذّر تأكيد الحفظ. راجع صلاحيتك والقيمة والمصدر؛ أعد المحاولة بنفس البيانات لاستعمال مرجع الإرسال نفسه.","Save could not be confirmed. Check access, value and source. Retrying unchanged inputs reuses this submission reference.");
      }finally{submitting=false;controls.forEach(c=>{c.disabled=false;});}
    });
    box.append(form);return box;
  }

  function conflicts(history,version){
    const box=el("section");
    for(const group of history.filter(row=>row.status==="conflict")){
      const section=el("details");section.append(el("summary",t("تعارض مصادر","Source conflict")+" · "+metricLabel(group.metric)+" · "+String(group.month).slice(0,7)));
      const list=el("ul");for(const e of group.evidence||[])list.append(el("li",observation({...e,metric:group.metric,month:group.month})));
      section.append(list,el("p",t("حُجبت القيمة الموحدة لهذا الشهر إلى أن يراجع المخوّل الشواهد.","A single value is withheld for this month until the evidence is reviewed.")));
      if(brief.canApprove && group.evidence?.length>1){
        const f=el("form"),choice=el("select"),reason=el("input"),ok=el("input"),send=el("button",t("اعتماد الشاهد المختار","Approve selected observation")),result=el("p");
        result.setAttribute("role","status");choice.required=true;choice.add(new Option(t("اختر الشاهد بعد المراجعة","Select after reviewing the evidence"),""));
        for(const e of group.evidence)choice.add(new Option(measurement(group.metric,e.value)+" · "+e.source_ref+" · "+String(e.retrieved_on||"").slice(0,10),e.id));
        reason.required=true;reason.minLength=3;reason.maxLength=1000;ok.type="checkbox";ok.required=true;ok.style.width="auto";send.type="submit";
        const confirmation=el("label");confirmation.append(ok,document.createTextNode(t(" راجعت كامل الشواهد المعروضة لهذا الشهر."," I reviewed all evidence shown for this month.")));
        f.append(labeled(t("القراءة المعتمدة","Preferred reading"),choice),labeled(t("سبب الترجيح","Reason for choosing this evidence"),reason),confirmation,send,result);
        f.addEventListener("submit",async e=>{
          e.preventDefault();if(!active(version)||send.disabled||!f.reportValidity()||!ok.checked)return;
          send.disabled=true;
          try{
            await rpc("facility_council_resolve",{p_observation:choice.value,p_reason:reason.value.trim(),p_evidence_ids:group.evidence.map(item=>item.id)});
            if(active(version))await load(t("حُفظ قرار ترجيح الشاهد.","Evidence selection recorded."));
          }catch{if(active(version))result.textContent=t("تعذّر حسم التعارض. حدّث الدراسة لمراجعة مجموعة الشواهد الحالية.","Resolution could not be confirmed. Refresh the study to review the current evidence set.");}
          finally{send.disabled=false;}
        });section.append(f);
      }
      box.append(section);
    }
    return box;
  }

  function publishedScores(version){
    const box=el("details");box.append(el("summary",t("قياس التوقع المنشور مقابل الفعلي","Published forecast versus actual")));
    const summary=el("p"),rows=el("div");summary.setAttribute("role","status");box.append(summary,rows);
    const status={
      pending:["بانتظار الإقفال الفعلي","Awaiting actual close"],conflict:["الشواهد الفعلية متعارضة","Actual sources conflict"],settled:["قياس فعلي موثّق","Settled against a sourced actual"]
    };
    const deltaUnit=row=>row.unit==="pct"?t("نقطة مئوية","percentage points"):text(metrics.get(row.metric)?.unit);
    let ticket=0;
    box.addEventListener("toggle",async()=>{
      const request=++ticket;rows.replaceChildren();summary.textContent="";
      if(!box.open||!active(version))return;
      summary.textContent=t("جارٍ تحميل التوقعات المنشورة وإقفالاتها…","Loading published forecasts and actual closes…");
      const current=()=>ticket===request&&box.open&&active(version);
      try{
        const scores=[];
        for(let start=0;;start+=100){
          const {data,error}=await client.rpc("facility_council_forecast_scores",{p_org:orgId,p_facility:facilityId}).order("target_month",{ascending:false}).order("metric").range(start,start+99);
          if(!current())return;
          if(error||!Array.isArray(data))throw Error("Scores unavailable");
          scores.push(...data);if(data.length<100)break;
        }
        summary.textContent=scores.length?t("يقارن هذا السجل توقعاً منشوراً مسبقاً بإقفال الشهر المستهدف. فرق الأداء يساوي الفعلي ناقص التوقع.","This record compares a previously published forecast with its target month's close. Signed error is actual minus forecast."):
          t("لا توجد توقعات منشورة مؤهلة للمقارنة لهذا المبنى.","No previously published forecasts are eligible for comparison at this property.");
        for(const s of scores){
          const row=el("details");
          row.append(el("summary",[metricLabel(s.metric),String(s.target_month||"").slice(0,7),text(status[s.status])||t("قيد المراجعة","Under review")].join(" · ")));
          row.append(line(t("التقدير المنشور","Published estimate"),measurement(s.metric,s.estimate)));
          if(s.forecast_at){const date=new Date(s.forecast_at);if(!Number.isNaN(date.getTime()))row.append(line(t("وقت النشر بتوقيت الرياض","Published at, Riyadh time"),date.toLocaleString(document.documentElement.lang,{timeZone:"Asia/Riyadh"})));}
          if(s.method&&methods[s.method])row.append(line(t("الطريقة المنشورة","Published method"),text(methods[s.method])));
          if(s.status==="settled"&&s.actual!=null){
            row.append(line(t("القيمة الفعلية","Observed actual"),measurement(s.metric,s.actual)),line(t("مصدر الإقفال","Actual source"),s.actual_source_ref||"—"),
              line(t("الفعلي ناقص التوقع","Actual minus forecast"),formatted(s.signed_error,deltaUnit(s))),line(t("الخطأ المطلق","Absolute error"),formatted(s.absolute_error,deltaUnit(s))));
            if(s.baseline_estimate!=null)row.append(line(t("تقدير المقارنة","Baseline estimate"),measurement(s.metric,s.baseline_estimate)));
            if(s.baseline_absolute_error!=null)row.append(line(t("الخطأ المطلق لتقدير المقارنة","Baseline absolute error"),formatted(s.baseline_absolute_error,deltaUnit(s))));
          }else if(s.status==="conflict"){row.append(el("p",t("يُعلّق احتساب الخطأ حتى تُحسم مصادر القراءة الفعلية.","Error scoring is withheld until the actual sources are reconciled.")));}
          else{row.append(el("p",t("لم تتأكد قيمة فعلية يمكن القياس عليها.","A verified actual is required to score the forecast.")));}
          rows.append(row);
        }
      }catch{if(current())summary.textContent=t("تعذرت قراءة مقارنة التوقعات المنشورة. أعد فتح القسم للتحقق.","Published forecast comparisons could not be retrieved. Reopen to retry.");}
    });
    return box;
  }

  async function load(feedback=""){
    const version=++generation;if(!active(version))return;
    output.replaceChildren();message.textContent=t("جارٍ استرجاع تاريخ المؤشرات…","Retrieving historical indicators…");
    try{
      const history=[];
      for(let start=0;;start+=100){
        const {data,error}=await client.rpc("facility_council_history",{p_org:orgId,p_facility:facilityId}).order("month",{ascending:false}).order("metric").range(start,start+99);
        if(!active(version))return;
        if(error||!Array.isArray(data))throw Error("History unavailable");
        history.push(...data);if(data.length<100)break;
      }
      const asOf=today(),input={history,brief,asOf};
      const study=buildCouncilStudy(input),decisions=buildCouncilDecisions(input);
      const controls=el("div");controls.className="memory-inline";
      const refresh=button(t("تحديث الدراسة","Refresh study"));
      refresh.addEventListener("click",()=>{if(active(version))void load();});
      const content=el("section");content.append(memoCards(decisions),el("h4",t("رأي كل تخصص","Specialist assessments")));
      for(const card of study)content.append(studyCard(card));
      const print=button(t("طباعة الدراسة","Print study"));
      print.addEventListener("click",()=>{if(active(version))try{printStudy(panel,content,brief.facility,asOf);}catch{message.textContent=t("تعذّر فتح الطباعة.","Print could not be opened.");}});
      controls.append(refresh,print);
      const monitor=document.getElementById("facility-council-monitor");
      if(monitor){const jump=button(t("متابعة الرصد المجدول","View monitoring records"));jump.addEventListener("click",()=>{
        if(!active(version))return;
        document.dispatchEvent(new CustomEvent("draqon:facility-focus",{detail:{orgId,facilityId,panelId:monitor.id}}));monitor.scrollIntoView({block:"start"});
      });controls.append(jump);}
      const ledger=el("details");ledger.append(el("summary",t("مصادر القراءات الشهرية وحالاتها","Monthly sources and verification status")));
      if(!history.length)ledger.append(el("p",t("لم تُسترجع قراءات لهذا المبنى.","No observations were returned for this property.")));
      for(const group of history){
        const item=el("details");
        const state=group.status==="resolved"?t("حُسم تعارض الأدلة","Evidence conflict resolved"):group.status==="verified"?t("موثّق","Verified"):t("متعارض","Conflicting evidence");
        item.append(el("summary",[String(group.month).slice(0,7),metricLabel(group.metric),state].join(" · ")));
        const evidence=el("ul");for(const e of group.evidence||[]){
          const retrieved=String(e.retrieved_on||"").slice(0,10);
          evidence.append(el("li",[measurement(group.metric,e.value),e.source_ref,retrieved].filter(Boolean).join(" · ")));
        }item.append(evidence);
        if(group.status==="resolved")item.append(line(t("الشاهد المختار","Chosen observation"),group.source_ref||"—"),line(t("سبب الترجيح","Decision rationale"),group.resolution_reason||"—"));
        ledger.append(item);
      }
      output.append(controls,conflicts(history,version),content,publishedScores(version),ledger);if(brief.canApprove)output.append(recordForm(version));
      message.textContent=[feedback,t("تاريخ الدراسة","Study date")+" · "+asOf].filter(Boolean).join(" ");
    }catch{if(active(version))unavailable();}
  }
  panel.addEventListener("toggle",()=>{if(panel.open)void load();else{generation++;message.textContent="";output.replaceChildren();}});
  return panel;
}
