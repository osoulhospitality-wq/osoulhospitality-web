import { uiText as t } from "./locale.js";
const isoMonth=(year,month)=>new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
function offset(period, n) {return isoMonth(Number(period.slice(0,4)),Number(period.slice(5,7))-1+n);}
function days(period){return new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).getUTCDate();}
const cutoff=period=>Date.parse(period+"T00:00:00+03:00");
const avg=values=>values.reduce((sum,n)=>sum+n,0)/values.length;

// One-month reporting lag. Inputs for a target month use at most month t-2.
// Choose the simpler model on calibration months, then independently score it on later months.
export function forecastMeter(rows, selectedMonth, kind, subject, now=Date.now()) {
  const target=offset(selectedMonth+"-01",1),asOf=Math.min(now,cutoff(target));
  if(rows.length>250) return {reason:"limit"};
  const data=rows.filter(r=>r.kind===kind&&r.subject===subject);
  function measured(period, time) {
    const latest=data.filter(r=>r.period_month===period&&Date.parse(r.recorded_at)<=time)
      .reduce((best,r)=>!best||r.revision>best.revision?r:best,null);
    if(!latest||!(Date.parse(latest.verified_at)<=time)||latest.covered_days!==days(period)
      || latest.consumption===null||latest.consumption===""||!Number.isFinite(Number(latest.consumption))||Number(latest.consumption)<0) return null;
    return Number(latest.consumption);
  }
  function estimates(origin) {
    const time=Math.min(cutoff(origin),asOf);
    const rate=n=>{const period=offset(origin,n), value=measured(period,time);return value===null?null:value/days(period);};
    const recent=[-2,-3,-4].map(rate),seasonal=rate(-12);
    if(recent.includes(null)||seasonal===null)return null;
    return {rolling:avg(recent)*days(origin),seasonal:seasonal*days(origin)};
  }
  for(let n=-25;n<=-2;n++)if(measured(offset(target,n),asOf)===null)return {reason:"coverage"};
  const checks=[];
  for(const n of [-10,-9,-8,-7,-5,-4,-3,-2]){
    const month=offset(target,n),models=estimates(month);
    // Freeze method selection before the first independent holdout.
    const actual=measured(month,n<=-6 ? Math.min(asOf,cutoff(offset(target,-5))) : asOf);
    if(!models||actual===null)return {reason:"origins"};
    checks.push({month,actual,...models});
  }
  const evaluate=(checks,method)=>avg(checks.map(c=>Math.abs(c[method]-c.actual)));
  const calibration=checks.slice(0,4),holdout=checks.slice(4);
  const method=evaluate(calibration,"rolling")<=evaluate(calibration,"seasonal")?"rolling":"seasonal";
  const mae=evaluate(holdout,method),recent=holdout.slice(-2),mean=avg(holdout.map(c=>c.actual)),recentMean=avg(recent.map(c=>c.actual));
  if(mean<=0||recentMean<=0||mae/mean>0.2||evaluate(recent,method)/recentMean>0.3)return {reason:"fit"};
  const next=estimates(target);
  if(!next)return {reason:"origins"};
  return {target,asOf,method,value:next[method],mae,start:holdout[0].month,end:holdout.at(-1).month};
}

export function meterForecastControls(client, org, site, row, current) {
  const section=document.createElement("section"),note=document.createElement("p");
  note.setAttribute("role","status");
  function button(ar,en,fn){
    const btn=document.createElement("button");btn.type="button";btn.textContent=t(ar,en);
    btn.onclick=async()=>{
      if(!current())return;
      btn.disabled=true;
      try{await fn();}catch{if(current())note.textContent=t("تعذر إكمال الطلب. راجع الصلاحية وحالة السجل.","Request unavailable. Check permissions and record state.");}
      finally{btn.disabled=false;}
    };section.append(btn);
  }
  const args={p_org:org,p_site:site,p_month:row.period_month,p_kind:row.kind,p_subject:row.subject};
  if(row.full){
    button("تحققتُ من مستند هذا الإصدار","I verified this revision against its source", async()=>{
      const {error}=await client.rpc("fm_verify_meter_revision",{...args,p_revision:row.revision});
      if(error)throw error;
      if(current()) note.textContent=t("هذا الإصدار يحمل تحققًا مستقلاً.","This revision has independent verification.");
    });
  }
  button("تقدير استهلاك الشهر التالي","Estimate next month’s usage",async()=>{
    const {data,error}=await client.rpc("fm_meter_forecast_history",args);
    if(!current())return;
    if(error||!Array.isArray(data))throw new Error("Unavailable");
    const f=forecastMeter(data,row.period_month.slice(0,7),row.kind,row.subject);
    if(f.reason){
      const reasons={
        coverage:t("يلزم ٢٤ شهرًا متصلاً بقياسات مكتملة ومتحقق منها بصورة مستقلة للعداد نفسه.","24 continuous, complete, independently verified months for this meter are required."),
        fit:t("لم يجتز النموذج اختبار استقرار الخطأ، أو كان الاستهلاك المرجعي صفرًا.","The model failed the error stability gate or reference usage was zero."),
        origins:t("لا تتوفر قياسات موثقة كانت متاحة فعليًا عند تواريخ الاختبار السابقة.","Verified inputs available at the historical forecast origins are insufficient."),
        limit:t("تجاوز سجل المراجعات حد القراءة؛ يلزم تحليل مخصص.","Revision history exceeded the read limit; a dedicated analysis is required.")
      };note.textContent=reasons[f.reason];return;
    }
    const format=n=>new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:2}).format(n);
    const unit=row.kind==="water_m3"?"m³":"kWh";
    const method=f.method==="rolling"?t("متوسط آخر ثلاثة أشهر متاحة","three-month average"):t("الشهر المناظر من السنة السابقة","same month last year");
    const asof=new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:"Asia/Riyadh",dateStyle:"medium"}).format(f.asOf);
    note.textContent=t("تقدير الاستهلاك لشهر ","Estimated usage for ")+f.target.slice(0,7)+" · "+format(f.value)+" "+unit+
      " · "+method+" · "+t("حتى ","as of ")+asof+" · "+t("متوسط الخطأ المطلق خارج العينة","Out-of-sample mean absolute error")+
      " "+format(f.mae)+" "+unit+" ("+f.start.slice(0,7)+" – "+f.end.slice(0,7)+"). "+
      t("اختير النموذج على أربعة أشهر واختُبر على أربعة أشهر لاحقة بعد فاصل شهر. التوقع يفترض ثبات نطاق العداد والتشغيل؛ لم تُدخل بيانات الطقس والإشغال ولا يوجد نطاق ثقة معاير.",
        "Model selected on four months and tested on four later months after a one-month gap. Assumes unchanged meter scope and operation; weather and occupancy are omitted and no calibrated interval is available.");
  });
  section.append(note);return section;
}
