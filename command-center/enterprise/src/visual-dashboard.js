import {uiText as t} from "./locale.js";
import {periodInRiyadh} from "./executive-overview.js";

const n = (tag, text, css) => {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (css) el.className = css;
  return el;
};
const format = value => Number.isSafeInteger(value) && value >= 0
  ? new Intl.NumberFormat(document.documentElement.lang).format(value) : t("غير متاح","Unavailable");
const statuses = () => [t("مفتوحة","Open"),t("قيد التنفيذ","In progress"),t("مكتملة","Completed")];

export function goToPanel(id) {
  const target = document.getElementById(id);
  if (!target || target.hidden) return;
  for (let p = target; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
  const focus = target.querySelector(":scope > summary, :scope > h3, :scope > h4") || target;
  if (!focus.hasAttribute("tabindex") && focus.tagName !== "SUMMARY") focus.tabIndex = -1;
  focus.focus({preventScroll:true});
  target.scrollIntoView({block:"start"});
}
function shortcut(text, id) {
  const link = n("a",text);
  link.href = "#" + id;
  link.addEventListener("click", event => {event.preventDefault(); goToPanel(id);});
  return link;
}

export function visualNavigation() {
  const nav = n("nav",null,"fm-shortcuts");
  nav.setAttribute("aria-label", t("أقسام المنشأة","Facility sections"));
  const destinations = [
    ["fm-engineering","الأنظمة والأصول","Systems & assets"],["fm-calendar","جدول الصيانة","Maintenance calendar"],
    ["contract-register","العقود","Contracts"],["fm-vendor-quality","جودة الموردين","Supplier quality"],
    ["fm-evidence","المخاطر والامتثال","Risk & compliance"],["fm-resource","المالية والموارد","Finance & utilities"],
    ["fm-reputation","تقييمات النزلاء","Guest reviews"],["fm-reports","التقارير","Reports"],["facility-shortcuts","النماذج والخدمات","Forms & services"]
  ];
  for (const [id,ar,en] of destinations) nav.append(shortcut(t(ar,en),id));
  return nav;
}
function card(label,value,id) {
  const item = shortcut(label,id);
  item.className = "fm-metric";
  item.replaceChildren(n("span",label),n("strong",format(value)),n("small",t("عرض السجل","View register")));
  return item;
}
function chart(title) {
  const figure = n("figure",null,"fm-chart-card");
  figure.append(n("figcaption",title));
  return figure;
}
function statusChart(states) {
  const figure = chart(t("توزيع أوامر العمل","Work order mix"));
  const complete = states.every(v => Number.isSafeInteger(v) && v >= 0);
  const total = complete ? states.reduce((a,b)=>a+b,0) : null;
  const body = n("div",null,"fm-ring-layout"), ring = n("div",null,"fm-ring");
  if (total > 0) {
    const a = 100 * states[0] / total, b = 100 * (states[0]+states[1]) / total;
    ring.style.backgroundImage = 'conic-gradient(#b47719 0 '+a+'%, #397aa5 '+a+'% '+b+'%, #197960 '+b+'% 100%)';
  }
  const center=n("div",null,"fm-ring-inner");
  center.append(n("strong",format(total)), n("span",t("أمر عمل","work orders")));
  ring.append(center);
  const legend=n("ul",null,"fm-chart-legend");
  statuses().forEach((label,i)=>{
    const row=n("li"); row.append(n("i",null,"fm-dot fm-s"+i),n("span",label),n("b",format(states[i])));
    legend.append(row);
  });
  body.append(ring,legend);figure.append(body,n("small",t("جميع الفترات · سجل أوامر العمل للمنشأة","All time · facility work order register")));
  return figure;
}
export function weekWindows(now = new Date()) {
  const today = periodInRiyadh(now).today;
  const todayStart = Date.parse(today + "T00:00:00+03:00");
  const day = 86400000;
  return Array.from({length:4},(_,i)=>{
    const start = todayStart - (27-i*7)*day;
    const end = start + 7*day;
    return {start:new Date(start).toISOString(),end:new Date(end).toISOString(),
      label:new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:"Asia/Riyadh",day:"numeric",month:"short",calendar:"gregory"}).format(start)};
  });
}
export function monthWindows(now) {
  const [year,month] = periodInRiyadh(now).today.split("-").map(Number);
  const cutoff=now.toISOString();
  const label=new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:"Asia/Riyadh",month:"short",year:"2-digit",calendar:"gregory"});
  return Array.from({length:6},(_,i)=>{
    const boundary=(offset)=>new Date(Date.UTC(year,month-1+i-5+offset,1)-3*3600000).toISOString();
    const start=boundary(0);
    return {start,end:i===5?cutoff:boundary(1),label:label.format(new Date(start))};
  });
}
export function weeklyIntake(client,org,site,signal,now=new Date(),firstRecord) {
  const weeks=weekWindows(now);
  weeks[weeks.length-1].end=now.toISOString();
  return coveredIntake(client,org,site,signal,weeks,firstRecord);
}
async function countWindows(client,org,site,signal,windows) {
  return Promise.all(windows.map(async week=>{
    try {
      const q=client.from("facility_work_orders").select("id,facility_assets!inner(facility_id)",{count:"exact",head:true})
        .eq("organization_id",org).eq("facility_assets.facility_id",site)
        .gte("created_at",week.start).lt("created_at",week.end).abortSignal(signal);
      const r=await q;
      return {...week,count:r.error ? null : r.count};
    } catch {return {...week,count:null};}
  }));
}
export async function firstOrderDate(client,org,site,signal) {
  try {
    const oldest=await client.from("facility_work_orders").select("created_at,facility_assets!inner(facility_id)")
    .eq("organization_id",org).eq("facility_assets.facility_id",site).order("created_at",{ascending:true}).limit(1).abortSignal(signal);
    return oldest?.error ? NaN : Date.parse(oldest?.data?.[0]?.created_at);
  } catch {return NaN;}
}
export const monthlyIntake=(client,org,site,signal,now,firstRecord)=>coveredIntake(client,org,site,signal,monthWindows(now),firstRecord);
async function coveredIntake(client,org,site,signal,windows,firstRecord) {
  const first=await (firstRecord ?? firstOrderDate(client,org,site,signal));
  if (!Number.isFinite(first)) return windows.map(w=>({...w,count:null}));
  const covered=windows.filter(w=>Date.parse(w.end)>first);
  const counts=await countWindows(client,org,site,signal,covered);
  return windows.map(w=>counts.find(c=>c.start===w.start) || {...w,count:null});
}
function plotIntake(weeks) {
  const plot=n("div",null,"fm-week-plot"), max=Math.max(1,...weeks.map(w=>w.count??0));
  plot.style.gridTemplateColumns="repeat("+weeks.length+",minmax(0,1fr))";
  for(const week of weeks) {
    const col=n("div",null,"fm-week-column"), bar=n("div",null,"fm-week-rail");
    const value=n("strong",format(week.count));
    const fill=n("i");
    if(Number.isSafeInteger(week.count) && week.count>0) fill.style.height=String(100*week.count/max)+"%";
    bar.append(fill); col.append(value,bar,n("span",week.label));plot.append(col);
  }
  return plot;
}
function intakeChart(weeks,readMonthly,cutoff) {
  const figure=chart(t("أوامر العمل الجديدة","New work orders"));
  const range=n("select");
  range.setAttribute("aria-label",t("فترة الرسم","Chart period"));
  range.append(new Option(t("آخر أربعة أسابيع","Last four weeks"),"weeks"),new Option(t("آخر ستة أشهر","Last six months"),"months"));
  const body=n("div"),note=n("small");
  const stamp=new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Riyadh",calendar:"gregory"}).format(cutoff);
  const source=t("المصدر: سجل أوامر العمل · تاريخ الإنشاء · الرياض","Source: work order register · creation date · Riyadh")+" · "+stamp;
  const coverage=t("تبدأ التغطية من أول أمر مسجل. تنتهي الفترة الحالية عند وقت القراءة.","Coverage starts with the first recorded order. The current period ends at the read time.");
  body.append(plotIntake(weeks));note.textContent=source+" · "+coverage;
  let pending;
  range.onchange=async()=>{
    if (range.value==="weeks") {body.replaceChildren(plotIntake(weeks));note.textContent=source+" · "+coverage;return;}
    body.replaceChildren(n("p",t("جارٍ قراءة السجل الشهري…","Reading monthly history…")));
    try {
      pending ??= readMonthly();
      const months=await pending;
      if(range.value!=="months") return;
      body.replaceChildren(plotIntake(months));
      note.textContent=source+" · "+coverage;
    } catch {
      pending=null;
      if(range.value==="months") {body.replaceChildren(n("p",t("تعذرت قراءة السجل الشهري.","Monthly history unavailable.")));note.textContent=source;}
    }
  };
  figure.append(range,body,note);
  return figure;
}
export function facilityVisuals({name,states,assets,visits,plans,weeks,readMonthly,cutoff}) {
  const wrap=n("section",null,"fm-visual-overview");
  const head=n("div",null,"fm-context-title");head.append(n("h3",name),n("span",t("نظرة تشغيلية","Operational overview")));
  const tiles = n("div",null,"fm-metrics");
  const outstanding = states.slice(0,2).every(Number.isSafeInteger) ? states[0]+states[1]:null;
  tiles.append(card(t("الأصول المسجلة","Registered assets"),assets,"fm-engineering"),
    card(t("أوامر بانتظار الإكمال","Outstanding orders"),outstanding,"fm-facility-orders"),
    card(t("زيارات موثقة","Recorded visits"),visits,"fm-facility-visits"),
    card(t("خطط وقائية نشطة","Active PPM plans"),plans,"fm-calendar"));
  const charts=n("div",null,"fm-chart-grid");charts.append(statusChart(states),intakeChart(weeks,readMonthly,cutoff));
  wrap.append(head,tiles,charts);return wrap;
}
export function portfolioVisuals(rows, onSelect) {
  const wrap=n("section",null,"fm-portfolio-overview");
  const title=chart(t("عبء العمل بحسب المبنى","Workload by building"));
  const labels=[t("قيد المتابعة","Outstanding"),t("مكتمل","Completed")];
  const list=n("div",null,"fm-buildings");
  const max=Math.max(1,...rows.filter(r=>Number.isSafeInteger(r.done)&&Number.isSafeInteger(r.outstanding)).map(r=>r.done+r.outstanding));
  if (!rows.length) list.append(n("p",t("تظهر المقارنة بعد تسجيل مبنى ضمن المحفظة.","Register a building in this portfolio to start comparing workload.")));
  for(const r of rows) {
    const button=n("button",null,"fm-building-row");button.type="button";
    button.append(n("b",r.name));
    const counts=n("span",null,"fm-site-numbers");
    counts.textContent=labels[0]+" "+format(r.outstanding)+" · "+labels[1]+" "+format(r.done);
    const track=n("span",null,"fm-stack-track");
    if(Number.isSafeInteger(r.done)&&Number.isSafeInteger(r.outstanding)) {
      for(const [key,color] of [["outstanding","#b47719"],["done","#197960"]]) {
        const bar=n("i");bar.style.width=(100*r[key]/max)+"%";bar.style.backgroundColor=color;track.append(bar);
      }
    }
    button.append(counts,track);button.addEventListener("click",()=>onSelect(r.id));list.append(button);
  }
  title.append(list,n("small",t("أوامر العمل · المنشآت المعروضة في هذه الصفحة · اختر مبنى للتفاصيل","Work orders · facilities on this page · select a building for details")));
  wrap.append(title);return wrap;
}
