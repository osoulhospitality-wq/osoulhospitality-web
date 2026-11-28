import {uiText as t} from "./locale.js";
import {elem,select,table,scopeRows,metricLabel,unitLabel} from "./client-reports.js";

const periodPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
const number=new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:2});
const unavailable=()=>t("غير متحقق","Unverified");
const labels={
  resources:t("تكلفة الموارد","Resource costs"), operations:t("الصيانة والتشغيل","Maintenance & operations"),
  revenue:t("إيرادات الحجوزات","Booking revenue"), experience:t("تجربة النزيل","Guest experience")
};
const monthName=m=>new Intl.DateTimeFormat(document.documentElement.lang,{year:"numeric",month:"long",calendar:"gregory",timeZone:"Asia/Riyadh"}).format(new Date(m+"-15T12:00:00Z"));
function groupOf(key){
  if(key.endsWith("_cost"))return "resources";
  if(/revenue|reservation_fines/.test(key))return "revenue";
  if(/guest_|_rating|_review_count/.test(key))return "experience";
  return "operations";
}
function fullPeriod(r){
  if(!r.range||r.range===r.period)return true;
  const last=new Date(Date.UTC(+r.period.slice(0,4),+r.period.slice(5,7),0)).toISOString().slice(0,10);
  const range=Array.isArray(r.range)?r.range:String(r.range).split("/");
  return range.length===2&&range[0]===r.period+"-01"&&range[1]===last;
}
// Each period must have one identifiable observation of the same measure, basis and scope.
export function compareMonths(rows,metric,base,selected){
  const one=p=>{
    const hits=rows.filter(r=>r.period===p&&r.metric===metric);
    return hits.length===1&&Number.isFinite(hits[0].value)&&hits[0].source&&hits[0].locator?hits[0]:null;
  };
  const a=one(base),b=one(selected);
  const comparable=Boolean(a&&b&&periodPattern.test(base)&&periodPattern.test(selected)&&base<selected
    &&a.building_id===b.building_id&&a.unit===b.unit&&a.source===b.source&&Boolean(a.derived)===Boolean(b.derived)&&fullPeriod(a)&&fullPeriod(b));
  const delta=comparable?Math.round((b.value-a.value)*100)/100:null;
  const percent=comparable&&a.value>0&&!/^out_of_/.test(a.unit)?delta/a.value*100:null;
  return {a,b,delta,percent,comparable};
}
const owners={
  resources:t("مسؤول المرافق والطاقة","Facilities and energy lead"),
  operations:t("مدير التشغيل والصيانة","Operations and maintenance manager"),
  experience:t("مسؤول تجربة النزيل","Guest experience lead"),
  revenue:t("مسؤول إدارة الإيرادات","Revenue manager")
};
function assessment(metric,result){
  const group=groupOf(metric),owner=owners[group];
  if(!result.comparable)return {owner,finding:t("لا تتوفر قراءتان شهريتان متجانستان لإثبات اتجاه.","Two comparable monthly readings are unavailable."),
    action:t("راجع مرجع الشهرين، ونطاق التغطية ووحدة القياس قبل اعتماد استنتاج.","Verify both source periods, coverage and units before drawing a conclusion.")};
  if(result.delta===0)return {owner,finding:t("القيمة المسجلة متساوية في الفترتين.","The recorded measure is unchanged across these periods."),
    action:t("راجع التوزيع داخل الشهر عند توفر سجل يومي قبل تغيير الخطة.","Check the within-month distribution, if daily records are available, before changing the plan.")};
  const up=result.delta>0;
  if(group==="resources")return {owner,finding:up?t("زادت التكلفة المفوترة. يستحق فرق الإنفاق فحصًا.","Billed cost rose and warrants a spending review."):t("انخفضت الفاتورة. حجم الوفر التشغيلي يحتاج إلى قياس.","The billed amount fell. Operational savings still need measurement."),
    action:t("طابق التعرفة وأيام الفوترة والإشغال وقراءة العداد لتحديد أثر السعر والاستهلاك.","Reconcile tariffs, billing days, occupancy and meter readings to distinguish price from usage.")};
  if(group==="revenue")return {owner,finding:metric==="reservation_fines"?t("تغيّرت قيمة الغرامات المسجّلة.","Recorded booking fines changed."):up?t("زادت إيرادات الحجز المسجّلة.","Reported booking revenue increased."):t("انخفضت إيرادات الحجز المسجّلة.","Reported booking revenue decreased."),
    action:t("فكّك التغير إلى ليالٍ مبيعة وسعر محقق وإلغاءات، ثم افحص عمولات القنوات والتكاليف قبل تقييم الربحية.","Separate sold nights, realized rate and cancellations, then check channel fees and costs before assessing profitability.")};
  if(group==="experience")return {owner,finding:/_rating$/.test(metric)?(up?t("ارتفع تقييم المنصة في الفترة المحددة.","The platform rating rose for this period."):t("تراجع تقييم المنصة في الفترة المحددة.","The platform rating declined for this period.")):t("تغيّر عدد الحالات المسجّلة ضمن هذا المؤشر.","The number of recorded cases changed for this measure."),
    action:t("تحقق من حجم العينة والبلاغات المرتبطة بالنظافة والتكييف، ثم تابع الإغلاق مع المشغّل.","Review sample sizes and linked cleaning or cooling complaints, then verify closure with operations.")};
  return {owner,finding:t("تغيّر حجم العمل المسجّل. الإنتاجية وجودة الإغلاق تحتاجان إلى دليل إضافي.","Recorded workload changed. Productivity and closure quality need additional evidence."),
    action:t("طابق الأوامر مع الأولويات وأوقات الإنجاز وإعادة العمل قبل تعديل جدول الفنيين.","Reconcile orders with severity, completion time and rework before revising technician schedules.")};
}
function reference(row,source){
  if(!row)return unavailable();
  const range=Array.isArray(row.range)?row.range.join(" – "):row.range;
  return [source(row.source),row.locator,range||row.period].filter(Boolean).join(" · ");
}
export function managementHistory(client,site,source){
  const rows=scopeRows(client,site).filter(r=>periodPattern.test(r.period)&&typeof r.metric==="string");
  const panel=elem("section",null,"insight-desk");panel.id="fm-management-history";
  panel.append(elem("h4",t("مؤشرات الأداء عبر الأشهر","Monthly performance review")));
  if(!rows.length){panel.append(elem("p",t("لا توجد مشاهدات شهرية مؤرخة لهذا النطاق.","No dated monthly observations exist for this scope.")));return panel;}
  const groupNav=elem("div",null,"insight-groups"),fields=elem("div",null,"insight-controls"),output=elem("div");
  const keys=[...new Set(rows.map(r=>r.metric))],groups=Object.keys(labels).filter(g=>keys.some(k=>groupOf(k)===g));
  let current=groups[0],metric="",selected="",base="";
  const buttons=new Map();panel.append(groupNav,fields,output);
  for(const g of groups){
    const btn=elem("button",labels[g]);btn.type="button";btn.onclick=()=>{current=g;metric="";chooseMetric();};
    groupNav.append(btn);buttons.set(g,btn);
  }
  function chooseMetric(){
    const options=keys.filter(k=>groupOf(k)===current);
    for(const [g,b] of buttons)b.setAttribute("aria-pressed",String(current===g));
    if(!options.includes(metric))metric=options[0];
    const periods=[...new Set(rows.filter(r=>r.metric===metric).map(r=>r.period))].sort().reverse();
    if(!periods.includes(selected))selected=periods[0];
    const earlier=periods.filter(p=>p<selected);
    if(!earlier.includes(base))base=earlier[0]||"";
    const [ml,m]=select(t("المؤشر","Measure"),options.map(k=>[k,metricLabel(k)]),v=>{metric=v;chooseMetric();restore(0);});
    const [pl,p]=select(t("شهر التحليل","Analysis month"),periods.map(k=>[k,monthName(k)]),v=>{selected=v;chooseMetric();restore(1);});
    const [bl,b]=select(t("شهر المقارنة","Comparison month"),earlier.length?earlier.map(k=>[k,monthName(k)]):[["",t("لا يوجد شهر أسبق","No earlier month")]],v=>{base=v;draw();});
    m.value=metric;p.value=selected;b.value=base;b.disabled=!earlier.length;fields.replaceChildren(ml,pl,bl);draw();
  }
  function restore(index){fields.querySelectorAll("select")[index]?.focus({preventScroll:true});}
  function draw(){
    const r=compareMonths(rows,metric,base,selected),qa=assessment(metric,r),summary=elem("div",null,"insight-cards");
    const amount=row=>row?number.format(row.value)+" "+unitLabel(row.unit):unavailable();
    for(const [label,value,reading] of [[monthName(selected),amount(r.b),r.b],[base?monthName(base):t("فترة المقارنة","Baseline"),amount(r.a),r.a],
      [t("التغير بين الفترتين","Change across periods"),r.comparable?(r.delta>0?"+":"")+number.format(r.delta)+" "+unitLabel(r.b.unit)+(r.percent===null?"":" · "+number.format(r.percent)+"%"):unavailable()]]){
      const item=elem("div");item.append(elem("small",label),elem("strong",value));
      if(reading&&r.comparable&&r.a.value>=0&&r.b.value>=0){
        const bar=elem("progress");bar.max=Math.max(1,r.a.value,r.b.value);bar.value=reading.value;bar.setAttribute("aria-hidden","true");item.append(bar);
      }
      summary.append(item);
    }
    const analysis=elem("div",null,"insight-assessment");analysis.append(elem("strong",qa.finding),elem("p",qa.action),elem("small",t("المتابعة المقترحة","Suggested owner")+" · "+qa.owner));
    const sources=[r.b,r.a].filter(Boolean).map(row=>[monthName(row.period),reference(row,source)]);
    output.replaceChildren(summary,analysis);
    if(sources.length)output.append(table([t("الفترة","Period"),t("مرجع القياس","Measurement source")],sources));
  }
  chooseMetric();return panel;
}
