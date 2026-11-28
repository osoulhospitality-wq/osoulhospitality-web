import {uiText as t} from "./locale.js";
import {elem,select,table,detail} from "./client-reports.js";

const unavailable=()=>t("غير متحقق","Unverified");
const number=new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:2});
function dated(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const ms=Date.parse(value+"T00:00:00Z");return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;
}
const price=value=>Number.isFinite(value)&&value>=0;
const amount=value=>price(value)?number.format(value)+" "+t("ر.س","SAR"):unavailable();
const dateText=value=>dated(value)?new Intl.DateTimeFormat(document.documentElement.lang,{calendar:"gregory",day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Riyadh"}).format(new Date(value+"T12:00:00Z")):unavailable();
function localized(value){
  return typeof value==="string"?value:value&&typeof value==="object"?t(value.ar??value.en,value.en??value.ar):"";
}
const demandLabels={unknown:t("غير متحقق","Unverified"),low:t("منخفض","Low"),steady:t("مستقر","Steady"),high:t("مرتفع","High")};
function range(lo,hi){
  if(!price(lo)||!price(hi)||lo>hi)return unavailable();
  return lo===hi?amount(lo):number.format(lo)+" – "+amount(hi);
}
// Quote and recommendation ranges may only use evidenced, comparable all-in rates.
export function rateEvidence(day,report){
  const sourceIds=new Set(Array.isArray(day.source_ids)?day.source_ids:[]);
  const sources=(Array.isArray(report.sources)?report.sources:[]).filter(s=>sourceIds.has(s.id)&&dated(s.observed_on)&&s.reference
    &&(!s.valid_from||s.valid_from<=day.date)&&(!s.valid_to||s.valid_to>=day.date));
  const comparable=s=>day.basis==="all_in_comparable"&&s.stay_total_sar==null&&s.price_sar>0&&price(s.price_sar)
    &&s.valid_from===day.date&&s.valid_to===day.date&&typeof s.terms==="string"&&s.terms===day.terms;
  const ownSource=sources.find(s=>s.kind==="facility"&&comparable(s)&&s.price_sar===day.own_rate_sar);
  const own=ownSource?.price_sar??null;
  const key=value=>String(value||"").normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,"");
  const ownKeys=new Set((report.sources||[]).filter(s=>s.kind==="facility").flatMap(s=>[key(s.property_key),key(localized(s.label))]).filter(Boolean));
  const peerKeys=new Set(sources.filter(s=>s.kind==="competitor"&&comparable(s)
    &&!ownKeys.has(key(s.property_key))&&!ownKeys.has(key(localized(s.label)))).map(s=>key(s.property_key||localized(s.label))).filter(Boolean));
  const capacity=day.available_nights,pace=bookingPace(day,sources);
  let blocker="";
  if(own===null)blocker=t("يلزم سعر إجمالي موثّق لليلة واحدة في المنشأة.","A verified all-in single-night facility rate is needed.");
  else if(peerKeys.size<3)blocker=t("يلزم توثيق أسعار ثلاث منشآت منافسة مختلفة بشروط مماثلة.","Quotes from three distinct comparable properties are needed.");
  else if(pace.sold===null||!Number.isSafeInteger(capacity)||capacity<0)blocker=t("يلزم سجل للحجوزات القائمة والسعة القابلة للبيع.","Verified on-books nights and sellable capacity are needed.");
  else if(pace.sold>=capacity)blocker=t("لا تتوفر ليلة قابلة للبيع ضمن السعة المسجّلة.","No unsold capacity is available for this night.");
  else if(!price(day.recommended_low_sar)||!price(day.recommended_high_sar)||day.recommended_low_sar>day.recommended_high_sar)
    blocker=t("لم يُسجّل نطاق مقترح في هذا الإصدار.","This edition contains no suggested range.");
  return {sources,own,peerCount:peerKeys.size,market:peerKeys.size?range(day.market_low_sar,day.market_high_sar):unavailable(),
    suggested:blocker?unavailable():range(day.recommended_low_sar,day.recommended_high_sar),blocker};
}
// These are as-of, on-the-books measures. They do not represent settled revenue.
export function bookingPace(day,sources){
  const sales=sources.some(s=>s.kind==="sales");
  const sold=day.on_books_nights,capacity=day.available_nights,revenue=day.on_books_room_revenue_sar;
  const whole=n=>Number.isSafeInteger(n)&&n>=0;
  const any=sales&&whole(sold);
  const sensible=any&&(capacity==null||whole(capacity)&&sold<=capacity);
  return {
    sold:sensible?sold:null,
    occupancy:sensible&&whole(capacity)&&capacity>0?sold/capacity*100:null,
    adr:sensible&&sold>0&&price(revenue)?revenue/sold:null,
    revpar:sensible&&whole(capacity)&&capacity>0&&price(revenue)&&(sold>0||revenue===0)?revenue/capacity:null
  };
}
export function publicEvidenceUrl(value){
  if(typeof value!=="string"||!/^https:\/\//i.test(value)||/[\s\\]/.test(value))return null;
  try{
    const url=new URL(value),host=url.hostname.toLowerCase();
    if(url.username||url.password||!host.includes(".")||host.includes(":")||/^\d+\.\d+\.\d+\.\d+$/.test(host)
      ||/\.(localhost|local|internal|test|invalid)\.?$/.test(host)||[...url.searchParams.keys()].some(k=>/token|password|secret|api.?key|email|signature|credential/i.test(k)))return null;
    return url.href;
  }catch{return null;}
}
function evidenceTable(sources){
  const panel=table([t("المصدر","Source"),t("تاريخ الرصد","Observed"),t("ملاحظة الرصد","Observation note"),t("المرجع","Reference")],
    sources.map(s=>[localized(s.label),dateText(s.observed_on),localized(s.retrieval_note)||"—",/^internal:[a-z0-9_./:-]+$/i.test(s.reference)?s.reference:"—"]));
  const rows=panel.querySelector("tbody").rows;
  sources.forEach((s,i)=>{
    const href=publicEvidenceUrl(s.reference);if(!href)return;
    const anchor=elem("a",t("فتح مصدر ","Open source for ")+(localized(s.label)||new URL(href).hostname));
    anchor.href=href;anchor.target="_blank";anchor.rel="noopener noreferrer";rows[i].cells[3].replaceChildren(anchor);
  });
  return panel;
}
export function verifiedForecast(day,sources,asOf){
  const cap=day.available_nights,sold=bookingPace(day,sources).sold,projected=day.forecast_booked_nights;
  if(sold===null||!Number.isSafeInteger(cap)||cap<0||!Number.isSafeInteger(projected)||!dated(asOf)||!dated(day.date)||day.date<asOf)return null;
  const utc=d=>Date.parse(d+"T00:00:00Z"),lead=utc(day.date)-utc(asOf);
  const history=sources.filter(s=>s.kind==="historical_pickup");
  const dates=new Set(history.map(s=>s.historical_stay_date));
  if(dates.size<6||dates.size!==history.length||history.some(s=>!dated(s.historical_as_of)||!dated(s.historical_stay_date)
    ||!dated(s.observed_on)||s.historical_stay_date>=asOf||s.observed_on<s.historical_stay_date||s.observed_on>asOf
    ||!s.match_note||!Number.isSafeInteger(s.matched_pickup_nights)||utc(s.historical_stay_date)-utc(s.historical_as_of)!==lead
    ||new Date(utc(s.historical_stay_date)).getUTCDay()!==new Date(utc(day.date)).getUTCDay()))return null;
  const ordered=history.map(s=>s.matched_pickup_nights).sort((a,b)=>a-b),i=Math.floor(ordered.length/2);
  const median=ordered.length%2?ordered[i]:(ordered[i-1]+ordered[i])/2;
  return projected===Math.min(cap,Math.max(0,Math.round(sold+median)))?{projected,history}:null;
}
const cadenceKey=record=>record.cadence==="weekly"?"weekly":"daily";
const cadenceText=key=>key==="weekly"?t("أسبوعي","Weekly"):t("صباحي","Morning");
function reportBody(entry){
  const data=entry.report||{},body=elem("section",null,"rate-report");
  const when=typeof entry.observed_at==="string"?new Date(entry.observed_at):null;
  const stamp=when&&Number.isFinite(when.valueOf())?new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:"medium",timeStyle:"short",calendar:"gregory",timeZone:"Asia/Riyadh"}).format(when):unavailable();
  body.append(elem("small",[dateText(entry.period_start),dateText(entry.period_end),t("رصد بتوقيت الرياض","Observed in Riyadh time")+" · "+stamp].join(" — ")));
  if(data.currency!=="SAR"||!Array.isArray(data.days)){body.append(elem("p",unavailable()));return body;}
  const days=data.days.filter(day=>dated(day.date)).sort((a,b)=>a.date.localeCompare(b.date));
  for(const day of days){
    const article=elem("article",null,"rate-day"),facts=rateEvidence(day,data);
    const title=elem("h5",dateText(day.date));article.append(title);
    const kpis=elem("div",null,"insight-cards");
    for(const [key,val] of [[t("سعر المنشأة لليلة","Facility nightly rate"),amount(facts.own)],
      [t("نطاق أسعار المنافسين","Comparable market range"),facts.market],[t("النطاق المقترح للمراجعة","Suggested range for review"),facts.suggested]]){
      const tile=elem("div");tile.append(elem("small",key),elem("strong",val));kpis.append(tile);
    }
    if(facts.blocker)kpis.lastElementChild.append(elem("small",facts.blocker));
    const reason=localized(day.reason),action=localized(day.action);
    article.append(kpis,elem("p",t("مؤشر الطلب","Demand signal")+" · "+(facts.sources.length?demandLabels[day.demand]||unavailable():unavailable())));
    for(const [tag,line] of [["p",reason],["strong",action]])if(line){const copy=elem(tag,line);copy.dir="auto";article.append(copy);}
    const pace=bookingPace(day,facts.sources);
    if(pace.sold!==null){
      const asOf=elem("div",null,"rate-pace");
      asOf.append(elem("h6",t("الحجوزات القائمة وقت الرصد","On-the-books at observation")),
        table([t("الليالي المحجوزة","Booked nights"),t("الإشغال المسجّل","On-books occupancy"),t("متوسط السعر المحجوز ADR","Booked ADR"),t("الإيراد المحجوز لكل ليلة متاحة RevPAR","On-books RevPAR")],
          [[number.format(pace.sold),pace.occupancy===null?unavailable():number.format(pace.occupancy)+"%",amount(pace.adr),amount(pace.revpar)]]));
      article.append(asOf);
    }
    const stays=facts.sources.filter(s=>price(s.stay_total_sar)&&dated(s.valid_from)&&dated(s.check_out));
    if(stays.length)article.append(table([t("عرض الإقامة كاملة","Full stay quote"),t("الوصول والمغادرة","Check-in / check-out"),t("إجمالي الإقامة","Full stay total"),t("ملاحظة الرصد","Observation note")],
      stays.map(s=>[localized(s.label),dateText(s.valid_from)+" – "+dateText(s.check_out),amount(s.stay_total_sar),localized(s.retrieval_note)||unavailable()])));
    const quotes=facts.sources.filter(s=>s.kind==="competitor"&&price(s.price_sar)&&s.stay_total_sar==null);
    if(quotes.length)article.append(table([t("المنافس المرصود","Observed competitor"),t("السعر المعلن","Quoted rate"),t("شروط المقارنة","Rate terms"),t("تاريخ الرصد","Observed")],
      quotes.map(s=>[localized(s.label),amount(s.price_sar),localized(s.terms)||unavailable(),dateText(s.observed_on)])));
    if(facts.sources.some(s=>s.kind==="sales")&&(Number.isInteger(day.pickup_nights)||Number.isInteger(day.cancellations_nights))){
      const flow=table([t("تغير الليالي المحجوزة","Booking pickup"),t("الليالي الملغاة","Cancelled nights")],
        [[Number.isInteger(day.pickup_nights)?number.format(day.pickup_nights):unavailable(),Number.isInteger(day.cancellations_nights)?number.format(day.cancellations_nights):unavailable()]]);
      article.append(flow);
    }
    const forecast=verifiedForecast(day,facts.sources,entry.as_of);
    if(forecast){
      const group=elem("section",null,"rate-pace");
      group.append(elem("h6",t("توقع الليالي المحجوزة عند الوصول","Forecast booked nights at arrival")),
        elem("strong",number.format(forecast.projected)+" / "+number.format(day.available_nights)+" "+t("ليلة قابلة للبيع","sellable nights")),
        elem("p",t("الحجوزات القائمة مضافًا إليها وسيط التغير التاريخي، مع التقيد بالسعة.","On-the-books nights plus median historical pickup, capped at sellable capacity.")),
        detail(t("فترات المقارنة التاريخية","Matched historical dates"),[table([t("تاريخ الإقامة","Past stay"),t("تاريخ المقارنة","As of"),t("تاريخ الرصد","Observed"),
          t("صافي التغير في الليالي","Net pickup"),t("أساس المطابقة","Matching basis")],forecast.history.map(s=>[dateText(s.historical_stay_date),dateText(s.historical_as_of),dateText(s.observed_on),number.format(s.matched_pickup_nights),localized(s.match_note)]))]));
      article.append(group);
    }else article.append(elem("small",t("توقع الليالي غير متحقق. يتطلب جردًا مؤرخًا وست فترات تاريخية مماثلة على الأقل.","Booked-night forecast is unverified. It requires dated inventory and at least six matched historical periods.")));
    if(facts.sources.length)article.append(detail(t("مصادر هذا التقدير","Evidence for this estimate"),[evidenceTable(facts.sources)]));
    body.append(article);
  }
  if(!days.length)body.append(elem("p",t("لم تسجّل ليالٍ ضمن هذا التقرير.","No nights were recorded in this report.")));
  return body;
}
export function setupFacilityPricing(client,root,id="fm-pricing"){
  const panel=elem("details",null,"insight-desk rate-desk"),summary=elem("summary",t("تسعير الليالي ومقارنة السوق","Nightly pricing & market comparison"));
  panel.id=id;panel.hidden=true;
  const state=elem("p"),controls=elem("div",null,"insight-controls"),content=elem("div"),retry=elem("button",t("تحديث السجل","Refresh history"));
  state.setAttribute("role","status");retry.type="button";retry.hidden=true;
  panel.append(summary,state,controls,content,retry);root.append(panel);
  let org="",facility="",request=0,loading=false,loaded=false,reports=[];
  function display(){
    const cadenceTypes=[...new Set(reports.map(cadenceKey))];
    const [cLabel,cSelect]=select(t("نوع الإصدار","Report cadence"),cadenceTypes.map(k=>[k,cadenceText(k)]),()=>showPeriods(true));
    function showPeriods(move=false){
      const subset=reports.filter(r=>cadenceKey(r)===cSelect.value);
      const [rLabel,rSelect]=select(t("تاريخ التقرير","Report date"),subset.map((r,i)=>[String(i),dateText(r.as_of||r.period_start)+(r.revision?" · "+t("إصدار ","v")+number.format(r.revision):"")]),draw);
      function draw(){content.replaceChildren(reportBody(subset[Number(rSelect.value)]));}
      controls.replaceChildren(cLabel,rLabel);draw();if(move)cSelect.focus({preventScroll:true});
    }
    showPeriods();
  }
  async function load(){
    if(!org||!facility||!panel.open)return;
    const ticket=++request;loading=true;loaded=false;retry.hidden=true;controls.replaceChildren();content.replaceChildren();
    state.textContent=t("جارٍ قراءة سجل التسعير…","Loading pricing history…");
    try{
      const {data,error}=await client.rpc("fm_facility_revenue_history",{p_organization:org,p_facility:facility,p_limit:30});
      if(ticket!==request)return;
      if(error||!Array.isArray(data?.reports))throw new Error("unavailable");
      reports=data.reports.filter(r=>r&&["daily","weekly"].includes(r.cadence)).sort((a,b)=>String(b.as_of||b.period_start).localeCompare(String(a.as_of||a.period_start))||Number(b.revision||0)-Number(a.revision||0));
      loaded=true;
      state.textContent=reports.length?t("توصيات للمراجعة. يحتفظ كل إصدار بمصادر الرصد وتاريخه.","Recommendations for review. Each edition retains its evidence and observation date."):
        t("لا توجد تقارير تسعير مسجّلة لهذه المنشأة.","No pricing reports are recorded for this facility.");
      if(reports.length)display();
    }catch{if(ticket===request)state.textContent=t("تعذّرت قراءة سجل التسعير لهذا النطاق. حالة البيانات غير متحققة.","Pricing history could not be read for this scope. Data status is unverified.");}
    finally{if(ticket===request){loading=false;retry.hidden=false;}}
  }
  retry.onclick=load;panel.ontoggle=()=>{if(panel.open&&!loading&&!loaded)void load();};
  return (organization,site)=>{
    ++request;org=organization;facility=site;loading=false;loaded=false;reports=[];controls.replaceChildren();content.replaceChildren();state.textContent="";retry.hidden=true;
    panel.hidden=!org||!facility;if(panel.hidden)panel.open=false;else if(panel.open)void load();
  };
}
