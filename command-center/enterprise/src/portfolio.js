import {portfolioVisuals, goToPanel} from "./visual-dashboard.js";
import {mountAgentActivity} from "./agent-activity.js";
import {uiText as t} from "./locale.js";

const PAGE_SIZE = 8;
const meta = () => t("لقطة تراكمية حتى وقت القراءة من سجلات المنشآت والأصول وأوامر العمل وخطط الصيانة. الأوامر المفتوحة تشمل قيد التنفيذ. تاريخ آخر أمر هو تاريخ إنشائه بتوقيت الرياض.",
  "Cumulative snapshot at read time from facilities, assets, work orders and maintenance plans. Outstanding orders include work in progress. The latest order date is its creation date in Riyadh time.");

export async function hasPortfolioAccess(client, organization, signal) {
  if (!organization || signal.aborted) return false;
  const user = await client.auth.getUser();
  if (user.error || !user.data?.user?.id || signal.aborted) return false;
  const userId = user.data.user.id;
  const {data,error} = await client.from("organization_members").select("organization_id,user_id,role,active")
    .eq("organization_id",organization).eq("user_id",userId).eq("active",true)
    .abortSignal(signal).maybeSingle();
  if (error) throw new Error("Membership read failed");
  return !signal.aborted && data?.organization_id === organization && data.user_id === userId
    && data.active === true && ["owner","approver"].includes(data.role);
}

export function orderDensity(outstanding, assets) {
  if (!Number.isSafeInteger(outstanding) || outstanding < 0 || !Number.isSafeInteger(assets) || assets <= 0) return null;
  return Math.round(1000 * outstanding / assets) / 10;
}

function cell(tag, text) {
  const el=document.createElement(tag);
  if (text !== undefined) el.textContent=text;
  return el;
}

function headers() {
  return [t("المنشأة","Facility"),t("الأصول","Assets"),t("الأوامر المفتوحة","Outstanding orders"),
    t("أوامر لكل ١٠٠ أصل","Orders per 100 assets"),t("الأوامر المكتملة","Completed orders"),
    t("الخطط غير الموقوفة","Unpaused plans"),t("آخر إنشاء لأمر عمل","Most recent order creation")];
}

function columns(row) {
  return [row.name,row.assets,row.outstanding,orderDensity(row.outstanding,row.assets),row.done,row.plans,row.latest];
}

async function collectSite(client,organization,site,signal) {
  const build=(table,fields,options)=>client.from(table).select(fields,options).eq("organization_id",organization);
  const head={count:"exact",head:true};
  const orders=options=>build("facility_work_orders","id,facility_assets!inner(facility_id)"+(options?"":",created_at"),options)
    .eq("facility_assets.facility_id",site.id);
  const settled=await Promise.allSettled([
    build("facility_assets","id",head).eq("facility_id",site.id).abortSignal(signal),
    orders(head).in("status",["open","in_progress"]).abortSignal(signal),
    orders(head).eq("status","completed").abortSignal(signal),
    build("facility_pm_plans","id",head).eq("facility_id",site.id).is("paused_at",null).abortSignal(signal),
    orders().order("created_at",{ascending:false}).limit(1).abortSignal(signal)
  ]);
  const count=i=>{
    const result=settled[i].value;
    return result && !result.error && Number.isSafeInteger(result.count) ? result.count : null;
  };
  const latest=settled[4].value;
  const stamp=latest?.data?.[0]?.created_at;
  const latestDay=stamp && !Number.isNaN(Date.parse(stamp)) ? new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh"}).format(new Date(stamp)) : null;
  return {id:site.id,name:site.name,assets:count(0),outstanding:count(1),done:count(2),plans:count(3),
    latest:latest && !latest.error && Array.isArray(latest.data) && !latest.data.length ? t("لا أوامر ظاهرة","No visible orders") : latestDay};
}

export async function portfolioPage(client,organization,cursor,signal) {
  const data=[];
  let last=cursor;
  while(data.length<PAGE_SIZE+1) {
    let q=client.from("facilities").select("id,name").eq("organization_id",organization).order("id").limit(PAGE_SIZE+1-data.length);
    if (last) q=q.gt("id",last);
    const page=await q.abortSignal(signal);
    if (signal.aborted || page.error || !Array.isArray(page.data)) throw new Error("Portfolio read unavailable");
    if (!page.data.length) break;
    const end=page.data.at(-1).id;
    if (!end || (last && end<=last)) throw new Error("Invalid facility cursor");
    data.push(...page.data);
    last=end;
  }
  const sites=data.slice(0,PAGE_SIZE);
  const rows=[];
  // Limit each batch to two facilities to avoid overwhelming the database.
  for (let i=0;i<sites.length;i+=2) {
    if (signal.aborted) throw new Error("Portfolio scope changed");
    rows.push(...await Promise.all(sites.slice(i,i+2).map(site=>collectSite(client,organization,site,signal))));
  }
  if (signal.aborted) throw new Error("Portfolio scope changed");
  return {rows,next:data.length>PAGE_SIZE?sites.at(-1).id:null};
}

function xmlText(value) {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu,"")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

export function portfolioWorkbook(values) {
  // SpreadsheetML cells are explicitly typed, so user-supplied names cannot become formulas.
  return '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n'
    +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Portfolio"><Table>'
    +values.map(row=>"<Row>"+row.map(value=>{
      if(value===null || value===undefined) return "<Cell/>";
      return '<Cell><Data ss:Type="'+(typeof value==="number" && Number.isFinite(value)?"Number":"String")+'">'+xmlText(value)+'</Data></Cell>';
    }).join("")+"</Row>").join("")+"</Table></Worksheet></Workbook>";
}

function renderTable(values) {
  const table=cell("table");
  const head=table.createTHead().insertRow();
  for (const text of values[0]) { const th=cell("th",text); th.scope="col"; head.append(th); }
  const body=table.createTBody();
  for (const row of values.slice(1)) {
    const tr=body.insertRow();
    for (const value of row) tr.append(cell("td",value ?? t("غير متاح","Unavailable")));
  }
  return table;
}

function printReport(values,title,notes) {
  const frame=cell("iframe");
  frame.title=title;
  frame.style.cssText="position:fixed;inline-size:1px;block-size:1px;inset-inline-start:-100vw;border:0";
  document.body.append(frame);
  const doc=frame.contentDocument,win=frame.contentWindow;
  if (!doc || !win) {frame.remove();throw new Error("Print view unavailable");}
  doc.documentElement.dir=document.documentElement.dir || "rtl";
  doc.documentElement.lang=document.documentElement.lang;
  doc.title=title;
  const style=cell("style","@page{size:A4 landscape;margin:14mm}body{font:14px/1.6 system-ui;color:#173a32}table{width:100%;border-collapse:collapse}th,td{border:1px solid #abc;padding:6px;text-align:start}thead{display:table-header-group}tr{break-inside:avoid}");
  doc.head.append(style);
  doc.body.append(cell("h1",title),...notes.map(note=>cell("p",note)),renderTable(values));
  win.addEventListener("afterprint",()=>frame.remove(),{once:true});
  try { win.focus();win.print(); } catch (error) { frame.remove();throw error; }
  // Some mobile browsers do not emit afterprint.
  window.setTimeout(()=>frame.remove(),120000);
}

export function setupPortfolio(client, dashboardFirst=false) {
  const panel=cell("details"), title=t("محفظة منشآت المؤسسة","Organization facility portfolio");
  const info=cell("p",meta()), status=cell("p"), data=cell("div");
  const button=text=>{const b=cell("button",text);b.type="button";return b;};
  const previous=button(t("السابق","Previous")),next=button(t("التالي","Next")),refresh=button(t("تحديث الصفحة","Refresh page"));
  const sheet=button(t("تنزيل جدول Excel (XML)","Download Excel workbook (XML)")),print=button(t("طباعة / حفظ PDF","Print / save PDF"));
  const controls=cell("div");
  controls.append(previous,next,refresh,print,sheet);
  data.style.overflowX="auto";
  panel.id="portfolio-desk";
  panel.hidden=true;
  status.setAttribute("role","status");
  const history=cell("div");
  history.dataset.osoulHistory="portfolio";
  history.hidden=!dashboardFirst;
  panel.append(cell("summary",title),history,info,status,data,controls);
  const resetCouncil = mountAgentActivity(panel, () => refresh.click());
  if (dashboardFirst) document.querySelector("#fm-facility").before(panel);
  else document.querySelector("#contract-register").after(panel);
  let organization="",epoch=0,request=null,cursors=[""],page=0,following=null,output=null;
  function resetOutput() {
    output=null;following=null;data.replaceChildren();status.textContent="";
    print.disabled=sheet.disabled=next.disabled=previous.disabled=true;
  }
  async function load() {
    request?.abort();
    resetOutput();
    if (!panel.open || !organization) return;
    const signal=(request=new AbortController()).signal;
    const org=organization,plannedPage=page;
    status.textContent=t("جارٍ التحقق من الصلاحية وقراءة منشآت الصفحة…","Checking access and loading this page of facilities…");
    refresh.disabled=true;
    try {
      if (!await hasPortfolioAccess(client,org,signal)) throw new Error("Access unavailable");
      const result=await portfolioPage(client,org,cursors[plannedPage],signal);
      if (signal.aborted) return;
      following=result.next;
      const stamp=new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}).format(new Date());
      const orgName=document.querySelector("#organization-select")?.selectedOptions[0]?.textContent || org;
      const notes=[orgName,t("تاريخ القراءة بتوقيت الرياض","Read at Riyadh time")+" · "+stamp,
        t("صفحة المنشآت","Facility page")+" "+(plannedPage+1)+" · "+result.rows.length+" "+t("منشآت معروضة","facilities shown"),meta(),
        t("تقارن كثافة الأوامر المفتوحة على أساس الأصول المسجلة. تتطلب مقارنة الجودة أو الربحية بيانات نوع المنشأة ومساحتها وعمرها وإيراداتها وتكاليفها.","Outstanding order density is normalized by registered assets. Comparisons of quality or profitability require facility use, area, age, revenue and expense data.")];
      const values=[headers(),...result.rows.map(columns)];
      output={notes,values};
      const comparison=portfolioVisuals(result.rows, siteId=>{
        const picker=document.querySelector("#fm-building-select");
        if (!Array.from(picker.options).some(option=>option.value===siteId)) {
          status.textContent=t("لم تكتمل قراءة قائمة المباني. حدّث البيانات وأعد المحاولة.","The building list is not available yet. Refresh and try again.");
          return;
        }
        picker.value=siteId;picker.dispatchEvent(new Event("change"));
        goToPanel("fm-facility");
      });
      data.replaceChildren(comparison,renderTable(values));
      status.textContent=result.rows.length?notes.slice(1,3).join(" · "):t("لا تظهر منشآت لهذه المؤسسة.","No facilities are visible for this organization.");
      previous.disabled=plannedPage===0;next.disabled=!following;
      print.disabled=sheet.disabled=!result.rows.length;
    } catch {
      if (!signal.aborted) {
        status.textContent=t("تعذرت قراءة المحفظة أو التحقق من صلاحية الإدارة. أعد المحاولة.","Portfolio or management access could not be verified. Try again.");
        previous.disabled=plannedPage===0;
      }
    } finally { if (!signal.aborted) refresh.disabled=false; }
  }
  async function exportPage(kind) {
    const report=output,scope=epoch,signal=request?.signal;
    if (!report || !signal || signal.aborted) return;
    try {
      if (!await hasPortfolioAccess(client,organization,signal)) throw new Error("Access unavailable");
      if (scope!==epoch || output!==report || signal.aborted) return;
      if (kind==="print") { printReport(report.values,title,report.notes);return; }
      const body=portfolioWorkbook([[title],...report.notes.map(note=>[note]),[],...report.values]);
      const url=URL.createObjectURL(new Blob([body],{type:"application/xml;charset=utf-8"}));
      const a=cell("a");
      a.href=url;a.download="osoul-facility-portfolio.xml";
      document.body.append(a);a.click();a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),10000);
    } catch { if (scope===epoch && !signal.aborted) {resetOutput();status.textContent=t("تعذّر تصدير التقرير. حدّث الصفحة للتحقق من صلاحية الحساب.","Export unavailable. Refresh the page to verify access.");} }
  }
  next.onclick=()=>{ if(following){cursors[++page]=following;void load();} };
  previous.onclick=()=>{ if(page){page--;void load();} };
  refresh.onclick=load;panel.addEventListener("toggle",load);
  print.onclick=()=>exportPage("print");sheet.onclick=()=>exportPage("excel");
  return async id=>{
    const version=++epoch;
    history.dispatchEvent(new Event("osoul:report-scope-reset"));
    request?.abort();resetOutput();resetCouncil();panel.open=false;panel.hidden=true;
    organization=id;page=0;cursors=[""];
    if (!id) return;
    // Keep this preliminary visibility check separate from cancellable page reads.
    try {
      const allowed=await hasPortfolioAccess(client,id,new AbortController().signal);
      if(version===epoch) {panel.hidden=!allowed; if(allowed && dashboardFirst) panel.open=true;}
    } catch {if(version===epoch) panel.hidden=true;}
  };
}
