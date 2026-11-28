import {uiText as t} from "./locale.js";

const node=(tag,text)=>{
  const el=document.createElement(tag);
  if(text!==undefined) el.textContent=text;
  return el;
};

export function setupFacilityActivity(client,root,visits) {
  const panel=node("details"), list=node("ul"),status=node("p");
  const title=visits?t("سجل زيارات المبنى","Building visit register"):t("الأوامر المفتوحة وقيد التنفيذ","Open and in-progress orders");
  const next=node("button",t("عرض المزيد","Show more"));
  next.type="button";status.setAttribute("role","status");next.hidden=true;
  panel.id=visits?"fm-facility-visits":"fm-facility-orders";
  panel.className="fm-activity";
  panel.append(node("summary",title),list,status,next);
  root.append(panel);
  let scope=null,request=null,offset=0;
  async function read() {
    if (!scope || !panel.open || request) return;
    const {org,site}=scope,signal=(request=new AbortController()).signal;
    next.disabled=true;status.textContent=t("جارٍ القراءة…","Loading…");
    try {
      const fields=visits?"id,created_at,findings,facility_work_orders!inner(summary,facility_assets!inner(facility_id))":"id,created_at,summary,status,facility_assets!inner(facility_id)";
      let query=client.from(visits?"facility_visits":"facility_work_orders").select(fields)
        .eq("organization_id",org).eq(visits?"facility_work_orders.facility_assets.facility_id":"facility_assets.facility_id",site);
      if(!visits) query=query.in("status",["open","in_progress"]);
      const {data,error}=await query.order("created_at",{ascending:false}).order("id").range(offset,offset+10).abortSignal(signal);
      if(signal.aborted) return;
      if(error || !Array.isArray(data)) throw new Error();
      const page=data.slice(0,10);offset+=page.length;
      for(const row of page) {
        const item=node("li");
        const stamp=new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:"Asia/Riyadh",calendar:"gregory",dateStyle:"medium"}).format(new Date(row.created_at));
        item.append(node("strong",visits?row.facility_work_orders?.summary:row.summary),node("small",stamp+" · "+(visits?t("زيارة","Visit"):row.status==="open"?t("مفتوح","Open"):t("قيد التنفيذ","In progress"))));
        if(visits) item.append(node("p",row.findings));
        list.append(item);
      }
      next.hidden=data.length<=10;
      status.textContent=offset?"":t("لا توجد سجلات ظاهرة للمبنى.","No visible records for this building.");
    } catch {
      if(!signal.aborted) {status.textContent=t("تعذرت قراءة السجل. أعد المحاولة.","Register unavailable. Try again.");next.hidden=false;}
    } finally {if(!signal.aborted){request=null;next.disabled=false;}}
  }
  panel.addEventListener("toggle",()=>{if(!offset) void read();});
  next.addEventListener("click",read);
  return (org,site)=>{
    request?.abort();request=null;scope=org && site?{org,site}:null;
    panel.open=false;panel.hidden=!scope;list.replaceChildren();offset=0;status.textContent="";next.hidden=true;
  };
}
