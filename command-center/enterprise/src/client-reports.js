import {uiText as t} from "./locale.js";

const names = {
  electricity_cost:["فواتير الكهرباء","Electricity charges"],water_cost:["فواتير المياه","Water charges"],
  stc_internet_cost:["إنترنت STC","STC internet charges"],zain_internet_cost:["إنترنت زين","Zain internet charges"],
  total_utilities_cost:["المرافق والإنترنت","Utilities and internet"],nightly_rental_revenue:["إيرادات ليالي الحجز","Nightly rental revenue"],
  reported_reservation_revenue:["إجمالي إيرادات الحجوزات حسب التقرير","Reported booking revenue"],reservation_fines:["غرامات الحجوزات","Booking fines"],
  work_orders:["أوامر العمل","Work orders"],guest_issues_resolved:["بلاغات الضيوف المعالجة","Resolved guest issues"],
  guest_issues_total:["بلاغات الضيوف","Guest issues"],guest_issues_on_hold:["بلاغات الضيوف المعلّقة","Guest issues on hold"],
  ac_outdoor_units_serviced:["وحدات التكييف الخارجية المخدومة","Outdoor AC units serviced"],in_unit_ppm_completed:["الوحدات التي استُكملت صيانتها الوقائية","Units with completed preventive maintenance"],
  guest_reviews:["تقييمات الضيوف","Guest reviews"],guest_reviews_max_score:["التقييمات بالدرجة الكاملة","Top-score reviews"],
  assignments_marked_overdue:["المهام الموسومة متأخرة","Assignments marked overdue"],operational_assignments:["المهام التشغيلية","Operational assignments"],
  google_period_rating:["تقييم Google","Google rating"],airbnb_period_rating:["تقييم Airbnb","Airbnb rating"],booking_period_rating:["تقييم Booking","Booking rating"],
  google_period_review_count:["عدد تقييمات Google","Google review count"],airbnb_period_review_count:["عدد تقييمات Airbnb","Airbnb review count"],booking_period_review_count:["عدد تقييمات Booking","Booking review count"],
  work_duration_minutes:["مدة أعمال الصيانة","Work duration"],trade_administration:["مهام الإدارة","Administration tasks"],trade_carpentry:["مهام النجارة","Carpentry tasks"],
  trade_electrical:["مهام الكهرباء","Electrical tasks"],trade_electronics:["مهام الإلكترونيات","Electronics tasks"],trade_hvac:["مهام التكييف والتهوية","HVAC tasks"],
  trade_inspections:["مهام الفحص","Inspection tasks"],trade_painting:["مهام الدهانات","Painting tasks"],trade_plumbing:["مهام السباكة","Plumbing tasks"],trade_ppm:["مهام الصيانة الوقائية","Preventive tasks"]
};
const units = {
  SAR:["ر.س","SAR"],unit:["وحدة","units"],issue:["بلاغ","issues"],out_of_5:["من ٥","of 5"],out_of_10:["من ١٠","of 10"],
  review:["تقييم","reviews"],assignment:["مهمة","tasks"],minute:["دقيقة","minutes"],order:["أمر","orders"],trade_task:["مهمة تخصصية","trade tasks"]
};
const utilityKeys = new Set(["electricity_cost","water_cost","stc_internet_cost","zain_internet_cost","total_utilities_cost"]);
const human = (dict,key) => dict[key] ? t(...dict[key]) : String(key||"").replaceAll("_"," ");
const number = new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:2});
export const elem = (tag,text,cls) => {
  const e=document.createElement(tag);
  if(text!=null)e.textContent=text;
  if(cls)e.className=cls;
  return e;
};
export function select(label,choices,onChange) {
  const wrap=elem("label",label), input=elem("select");
  for(const [value,text] of choices)input.add(new Option(text,value));
  input.addEventListener("change",()=>onChange(input.value));wrap.append(input);
  return [wrap,input];
}
export function detail(title,children) {
  const section=elem("details");section.append(elem("summary",title),...children);return section;
}
export function table(cols,rows) {
  const wrap=elem("div",null,"client-table"),grid=elem("table"),head=grid.createTHead().insertRow();
  for(const name of cols){const th=elem("th",name);th.scope="col";head.append(th);}
  const body=grid.createTBody();
  for(const vals of rows){const tr=body.insertRow();for(const v of vals)tr.insertCell().textContent=v??"—";}
  wrap.append(grid);return wrap;
}
function period(row) {
  const range=Array.isArray(row.range)?row.range.join(" – "):row.range;
  return range && range!==row.period ? String(range).replace("/"," – ") : row.period;
}
export function scopeRows(client,site) {
  const code=site?.code??client.detail?.portfolioCode;
  if(!code)return [];
  const data=client.observations||[],rows=data.filter(r=>r.building_id===code);
  if(site)return rows;
  // Only sum additive bills for periods where every mapped building has exactly one comparable reading.
  const sites=new Set(client.facilities.map(f=>f.code));
  const groups=new Map(), key=r=>JSON.stringify([r.metric,r.period,r.unit]);
  const printed=new Set(rows.map(key));
  for(const r of data){
    if(!sites.has(r.building_id)||!utilityKeys.has(r.metric)||r.unit!=="SAR"||r.range||!Number.isFinite(r.value))continue;
    const k=key(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);
  }
  for(const [k,group] of groups){
    if(!sites.size||printed.has(k)||group.length!==sites.size||new Set(group.map(r=>r.building_id)).size!==sites.size ||
      new Set(group.map(r=>r.source)).size!==1)continue;
    rows.push({...group[0],building_id:code,value:group.reduce((sum,r)=>sum+Math.round(r.value*100),0)/100,
      locator:group.map(r=>r.locator).join(" · "),derived:true});
  }return rows;
}
export function monthlyChart(client,site,source) {
  const rows=scopeRows(client,site), box=elem("section",null,"client-report");
  box.append(elem("h4",t("المقارنة عبر الفترات","Reporting periods")));
  if(!rows.length){box.append(elem("p",t("لا توجد قياسات مؤرخة لهذا النطاق.","No dated readings for this scope.")));return box;}
  const keys=[...new Set(rows.map(r=>r.metric))];
  const controls=elem("div",null,"client-filters"),result=elem("div");
  const [label,metric]=select(t("المؤشر","Metric"),keys.map(k=>[k,human(names,k)]),draw);
  if(keys.includes("electricity_cost"))metric.value="electricity_cost";
  controls.append(label);box.append(controls,result);
  function draw(){
    result.replaceChildren();
    const records=rows.filter(r=>r.metric===metric.value).sort((a,b)=>String(a.period).localeCompare(String(b.period)));
    const figure=elem("figure",null,"fm-chart-card"),plot=elem("div",null,"client-bars");
    const max=Math.max(1,...records.map(r=>Math.abs(r.value)).filter(Number.isFinite));
    figure.append(elem("figcaption",human(names,metric.value)+" · "+human(units,records[0].unit)),plot);
    const more=elem("div"),choices=records.map((r,i)=>[String(i),period(r)]);
    const [choose,periodInput]=select(t("تفاصيل الفترة","Period details"),choices,showEvidence);
    periodInput.value=String(records.length-1);
    const bars=[];
    for(const [i,r] of records.entries()){
      const bar=elem("button",null,"client-bar");bar.type="button";
      const meter=elem("progress");meter.max=max;meter.value=Math.abs(r.value);meter.setAttribute("aria-hidden","true");
      bar.append(elem("span",r.period),meter,elem("b",number.format(r.value)));
      bar.onclick=()=>{periodInput.value=String(i);showEvidence();};bars.push(bar);plot.append(bar);
    }
    function showEvidence(){
      const i=Number(periodInput.value),r=records[i];
      bars.forEach((b,index)=>b.setAttribute("aria-pressed",String(index===i)));
      more.replaceChildren(elem("strong",period(r)+" · "+number.format(r.value)+" "+human(units,r.unit)),
        elem("p",(r.derived?t("مجموع فواتير المباني","Sum of building bills")+" · ":"")+source(r.source)+" · "+(r.locator||"")),
        elem("p",r.comparability));
    }
    result.append(figure,choose,more);showEvidence();
  }
  draw();return box;
}

export const metricLabel = key => human(names,key);
export const unitLabel = key => human(units,key);
