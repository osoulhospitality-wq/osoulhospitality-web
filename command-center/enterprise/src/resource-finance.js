import { uiText as t } from "./locale.js";

import { meterForecastControls } from "./meter-forecast.js";

function monthLength(month) {
  return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
}
const parsed = value => value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);

// JSON transports SQL numerics as binary floats. Keep currency calculations well below
// the range where cent-level inputs or direct-cost subtraction can lose precision.
const financeLimit = 1_000_000_000_000;
const financialValue = value => {
  const n = parsed(value);
  return n !== null && Math.abs(n) <= financeLimit ? n : null;
};

export function calculateMonthlyEvidence(rows, month) {
  const period = month+"-01";
  const [year,number]=month.split("-").map(Number);
  const previousMonth = new Date(Date.UTC(year,number-2,1)).toISOString().slice(0,10);
  const previous = new Map(rows.filter(row=>row.period_month===previousMonth).map(row=>[JSON.stringify([row.kind,row.subject]),row]));
  return rows.filter(row=>row.period_month===period).map(row=>{
    const full = row.covered_days===monthLength(month);
    const base = previous.get(JSON.stringify([row.kind,row.subject]));
    if (row.kind==="unit_finance_sar") {
      const amounts=[row.net_revenue,row.other_direct_cost,row.maintenance_cost].map(financialValue);
      const [revenue,other,maintenance]=amounts;
      const contribution=full && amounts.every(x=>x!==null) ? (Math.round(revenue*100)-Math.round(other*100)-Math.round(maintenance*100))/100 : null;
      return {...row,full,contribution, maintenanceShare: full && revenue>0 && maintenance!==null ? maintenance/revenue*100 : null };
    }
    const current=parsed(row.consumption), prior=parsed(base?.consumption);
    const dailyChange = full && base?.covered_days===monthLength(previousMonth) && current!==null && prior>0
      ? ((current/row.covered_days)/(prior/base.covered_days)-1)*100 : null;
    return {...row,full,dailyChange};
  });
}

const node = (tag,txt="") => Object.assign(document.createElement(tag), {textContent:txt});
const kinds = {
  electricity_kwh:t("عداد الكهرباء (ك.و.س)", "Electricity meter (kWh)"),
  water_m3:t("عداد المياه (م³)", "Water meter (m³)"),
  unit_finance_sar:t("مالية وحدة (ريال سعودي)", "Unit finances (SAR)")
};
const numberText = v=>parsed(v)===null ? t("غير متاح","Unavailable") : new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:2}).format(Number(v));

export function setupResourceFinance(client, root) {
  const panel = node("details");panel.hidden=true;
  panel.append(node("summary",t("استهلاك الموارد ومساهمة الوحدة المالية", "Resource use and unit contribution")));
  const month = node("input");month.type="month";
  const monthLabel=node("label",t("شهر التقرير ","Reporting month "));monthLabel.append(month);
  const status=node("p");status.setAttribute("role","status");
  const content=node("div");
  panel.append(monthLabel,status,content);root.append(panel);
  let org="",site="",generation=0,rows=[],loaded=false,busy=false;
  const currentMonth=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit"}).format(new Date());

  function openForm(existing) {
    if(content.querySelector("form")) return;
    const token=generation;
    const form=node("form"), inputByKey={};
    function field(key,label,type,initial,required=false) {
      const el=node(type==="select"?"select":"input");
      if(type==="select") for(const [code,name] of Object.entries(kinds))el.append(new Option(name,code));
      else el.type=type;
      if(type==="number") el.step="any";
      el.value=initial??"";el.required=required;
      const wrap=node("label",label+" ");wrap.append(el);form.append(wrap);
      inputByKey[key]=el;return wrap;
    }
    field("kind",t("نوع السجل","Record type"),"select",existing?.kind||"electricity_kwh",true);
    field("subject",t("معرّف العداد أو الوحدة","Meter or unit identifier"),"text",existing?.subject,true);
    inputByKey.subject.maxLength=80;
    if(existing) { inputByKey.kind.disabled=true;inputByKey.subject.readOnly=true; }
    field("days",t("الأيام التي تغطيها الوثيقة","Days covered by the source"),"number",existing?.covered_days,true);
    Object.assign(inputByKey.days,{min:"1",max:String(monthLength(month.value)),step:"1"});
    const measure=field("consumption",t("الاستهلاك خلال الفترة","Consumption during the period"),"number",existing?.consumption);
    const financial=[
      field("revenue",t("صافي إيراد الوحدة (ر.س)","Unit net revenue (SAR)"),"number",existing?.net_revenue),
      field("other",t("مصروفات مباشرة تستثني الصيانة (ر.س)","Other direct expenses excluding maintenance (SAR)"),"number",existing?.other_direct_cost),
      field("maintenance",t("تكلفة الصيانة (ر.س)","Maintenance expense (SAR)"),"number",existing?.maintenance_cost),
      field("downtime",t("أيام التوقف الموثقة","Documented downtime days"),"number",existing?.downtime_days)];
    for (const key of ["revenue","other","maintenance"]) inputByKey[key].max=String(financeLimit);
    inputByKey.revenue.min=String(-financeLimit);
    for(const key of ["other","maintenance","downtime","consumption"])inputByKey[key].min="0";
    field("ref",t("مرجع الفاتورة أو المستند","Invoice or evidence reference"),"text",existing?.source_reference,true);
    inputByKey.ref.minLength=2;inputByKey.ref.maxLength=400;
    function choose(){const fin=inputByKey.kind.value==="unit_finance_sar";measure.hidden=fin;inputByKey.consumption.disabled=fin;inputByKey.consumption.required=!fin;
      for(const item of financial){item.hidden=!fin;item.querySelector("input").disabled=!fin;}}
    inputByKey.kind.onchange=choose;choose();
    const save=node("button",t("حفظ الإصدار مع مرجعه","Save revision with evidence"));save.type="submit";
    const cancel=node("button",t("إلغاء","Cancel"));cancel.type="button";cancel.onclick=()=>form.remove();form.append(save,cancel);
    form.onsubmit=async event=>{
      event.preventDefault();if(token!==generation||save.disabled)return;
      const take=key=>inputByKey[key].disabled?null:parsed(inputByKey[key].value);
      const args={p_org:org,p_site:site,p_month:month.value+"-01",p_kind:inputByKey.kind.value,p_subject:inputByKey.subject.value.trim(),p_expected:existing?.revision??0,p_covered_days:take("days"),p_reference:inputByKey.ref.value.trim(),p_consumption:take("consumption"),p_revenue:take("revenue"),p_other_cost:take("other"),p_maintenance:take("maintenance"),p_downtime:take("downtime")};
      if(args.p_kind==="unit_finance_sar" && [args.p_revenue,args.p_other_cost,args.p_maintenance,args.p_downtime].every(x=>x===null)){
        status.textContent=t("أدخل قيمة مالية موثقة أو أيام التوقف.","Enter a documented financial value or downtime.");return;
      }
      save.disabled=true;cancel.disabled=true;
      try{
        const {error}=await client.rpc("fm_record_monthly_evidence",args);
        if(token!==generation)return;
        if(error){status.textContent=error.code==="40001"?t("تغيّر السجل. أعد قراءته قبل التصحيح.","Record changed. Reload before correcting it."):t("تعذّر الحفظ. راجع الصلاحية والقيم وتغطية الشهر.","Could not save. Check access, values and monthly coverage.");return;}
        await load();
      }catch{if(token===generation)status.textContent=t("تعذّر تأكيد الحفظ. حدّث السجلات للتحقق قبل إعادة المحاولة.","Save unconfirmed. Refresh records before retrying.");}
      finally{save.disabled=false;cancel.disabled=false;}
    };
    content.prepend(form);inputByKey.subject.focus();
  }
  function render(){
    content.replaceChildren();
    const controls=node("p"), add=node("button",t("إضافة قراءة أو بيان مالي","Add reading or financial statement"));
    add.type="button";add.onclick=()=>openForm();controls.append(add);content.append(controls);
    const data=calculateMonthlyEvidence(rows,month.value);
    if(!data.length)content.append(node("p",t("لا توجد سجلات ظاهرة لهذا الشهر.","No visible records for this month.")));
    for(const row of data) {
      const card=node("details");card.append(node("summary",[row.subject,kinds[row.kind],row.full?t("شهر كامل","Full month"):t("تغطية جزئية","Partial coverage")].join(" · ")));
      const dl=node("dl");
      const line=(label,value)=>dl.append(node("dt",label),node("dd",value));
      line(t("تغطية المصدر بالأيام","Days covered"),numberText(row.covered_days));
      if(row.kind==="unit_finance_sar"){
        if ([row.net_revenue,row.maintenance_cost,row.other_direct_cost].some(v=>parsed(v)!==null && financialValue(v)===null))
          card.append(node("p",t("تتجاوز القيمة حد الدقة المعروض؛ راجع المستند المالي.","A value exceeds the display precision limit. Consult the financial source.")));
        line(t("صافي الإيراد (ر.س)","Net revenue (SAR)"),numberText(financialValue(row.net_revenue)));
        line(t("التكلفة المباشرة عدا الصيانة (ر.س)","Direct costs excluding maintenance (SAR)"), numberText(financialValue(row.other_direct_cost)));
        line(t("الصيانة (ر.س)","Maintenance (SAR)"),numberText(financialValue(row.maintenance_cost)));
        line(t("المساهمة بعد التكاليف المباشرة (ر.س)","Contribution after direct expenses (SAR)"),numberText(row.contribution));
        line(t("الصيانة من صافي الإيراد (%)","Maintenance / net revenue (%)"),numberText(row.maintenanceShare));
        line(t("أيام توقف موثقة","Documented downtime days"),numberText(row.downtime_days));
      }else{
        line(kinds[row.kind],numberText(row.consumption));
        line(t("تغير متوسط الاستهلاك اليومي عن الشهر السابق (%)","Daily consumption change from prior month (%)"),numberText(row.dailyChange));
      }
      line(t("مرجع المصدر","Evidence reference"),row.source_reference);
      line(t("تاريخ تسجيل الإصدار · الرياض","Revision recorded · Riyadh"),new Date(row.recorded_at).toLocaleString(document.documentElement.lang,{timeZone:"Asia/Riyadh"}));
      line(t("إصدار السجل","Revision"),numberText(row.revision));card.append(dl);
      if (row.kind !== "unit_finance_sar") {
        const ticket=generation;
        card.append(meterForecastControls(client,org,site,row,()=>ticket===generation));
      }
      const edit=node("button",t("تسجيل تصحيح موثق","Record a documented correction"));edit.type="button";edit.onclick=()=>openForm(row);card.append(edit);content.append(card);
    }
    content.append(node("p",t("تتطلب مقارنة الاستهلاك شهرين كاملين للعداد نفسه. مساهمة الوحدة تستبعد المصروفات العامة والتمويل. يتطلب تقدير الإيراد المفقود دليلًا مستقلًا.","Consumption comparison requires two complete months for the same meter. Unit contribution excludes overhead and financing. Lost revenue requires separate evidence.")));
  }
  const reread=node("button",t("تحديث السجلات","Refresh records"));reread.type="button";reread.hidden=true;panel.insertBefore(reread,status);reread.onclick=()=>load();
  async function load(){
    const ticket=++generation;
    rows=[];loaded=false;busy=true;reread.hidden=true;content.replaceChildren();status.textContent="";
    if(!panel.open||!org||!site||!/^\d{4}-\d{2}$/.test(month.value)){busy=false;return;}
    const input={p_org:org,p_site:site,p_month:month.value+"-01"};
    status.textContent=t("جارٍ التحقق من السجلات…","Checking monthly records…");
    try{
      const result=[];
      for(let offset=0;;offset+=100){
        const {data,error}=await client.rpc("fm_read_monthly_evidence",{...input,p_offset:offset});
        if(ticket!==generation)return;
        if(error||!Array.isArray(data))throw new Error("Unavailable");
        result.push(...data);if(data.length<100)break;
      }
      rows=result;loaded=true;status.textContent="";render();
    }catch{if(ticket===generation)status.textContent=t("سجل الموارد والمالية غير متاح لهذا الحساب أو البيئة.","Resource and financial records are unavailable for this account or environment.");}
    finally{if(ticket===generation){busy=false;reread.hidden=false;}}
  }
  panel.ontoggle=()=>{if(panel.open&&!busy&&!loaded)void load();};month.onchange=load;
  return (organization,facility)=>{
    generation++;busy=false;loaded=false;rows=[];org=organization;site=facility;month.value=currentMonth();month.max=month.value;
    status.textContent="";content.replaceChildren();reread.hidden=true;panel.hidden=!org||!site;
    if(panel.hidden)panel.open=false;else if(panel.open)void load();
  };
}
