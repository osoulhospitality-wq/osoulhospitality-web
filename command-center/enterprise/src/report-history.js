import {uiText as t} from "./locale.js";

const cadenceNames={daily:t("يومي","Daily"),weekly:t("أسبوعي","Weekly"),monthly:t("شهري","Monthly")};
function node(tag,text) { const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el; }
function button(text,fn) { const el=node("button",text);el.type="button";el.onclick=fn;return el; }
function riyadh(iso) {
  const stamp=Date.parse(iso);
  return Number.isFinite(stamp)?new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}).format(stamp):t("غير متاح","Unavailable");
}
const statuses={
  generated:t("تقرير متاح","Report available"),
  no_activity:t("لا حركة مسجلة في مصادر الفترة","No activity in the sources for this period"),
  owner_inactive:t("توقفت الجدولة لنهاية صلاحية المالك المفعِّل","Schedule stopped because its authorizing owner is no longer active"),
  read_failed:t("تعذرت قراءة المصادر، ستعاد المحاولة تلقائيًا","Source read failed; a retry is scheduled")
};
export function setupReportHistory(client,parent) {
  const panel=node("details");panel.id="facility-report-history";panel.hidden=true;
  const status=node("p");status.setAttribute("role","status");
  const controls=node("div"),list=node("div"),select=node("select");
  const label=node("label",t("دورية التقرير","Report cadence"));
  for(const [key,text] of Object.entries(cadenceNames))select.add(new Option(text,key));label.append(select);
  const settings=node("p"),toggle=button("",changeSetting);
  controls.append(label,settings,toggle);
  const more=button(t("التقارير الأقدم","Older reports"),()=>load(true));
  more.hidden=true;
  const refresh=button(t("تحديث سجل التقارير","Refresh report history"),()=>load(false));
  panel.append(node("summary",t("التقارير الدورية والتنبيهات الداخلية","Periodic reports and internal alerts")),
    node("p",t("يبدأ التسجيل بأول فترة كاملة بعد التفعيل. الأسبوع من الأحد إلى السبت، والشهر ميلادي. تُنشأ اللقطة بعد الثامنة صباحًا بتوقيت الرياض عقب انتهاء الفترة.",
    "Collection begins with the first full period after opt-in. Weeks run Sunday through Saturday; months are Gregorian. Snapshots are prepared after 08:00 Riyadh time following period end.")),
    status,refresh,controls,list,more);
  parent.append(panel);
  let currentSite="",scope=0,read=null,cursor=null,schedules=[],canConfigure=false,changing=false;
  function clear() {
    cursor=null;schedules=[];canConfigure=false;changing=false;
    controls.hidden=true;more.hidden=true;list.replaceChildren();settings.textContent="";status.textContent="";
    toggle.disabled=true;refresh.disabled=false;
  }
  function setting() {
    const s=schedules.find(item=>item.cadence===select.value);
    settings.textContent=s?.enabled?t("بداية الفترة المقبلة","Next reporting period starts")+" · "+s.next_start:t("الجدولة غير مفعلة","Schedule off");
    if (s?.state && statuses[s.state]) settings.textContent+=" · "+statuses[s.state];
    toggle.textContent=s?.enabled?t("إيقاف هذه الدورية","Turn off this cadence"):t("تفعيل هذه الدورية","Enable this cadence");
    toggle.hidden=!canConfigure;toggle.disabled=changing || !canConfigure;
  }
  const stale=(v,signal)=>v!==scope || signal.aborted || !panel.open;
  async function changeSetting() {
    if (!currentSite || !canConfigure || changing) return;
    const v=scope, site=currentSite, cadence=select.value, enabled=!schedules.find(s=>s.cadence===cadence)?.enabled;
    changing=true;toggle.disabled=true;select.disabled=true;
    try {
      const {data,error}=await client.rpc("fm_report_schedule",{p_site:site,p_cadence:cadence,p_enabled:enabled});
      if(v!==scope)return;
      if(error || data!==enabled)throw new Error();
      await load(false);
    } catch { if(v===scope)status.textContent=t("تعذر تغيير الجدولة. أعد قراءة إعدادات المنشأة.","Could not change the schedule. Refresh the facility settings."); }
    finally {if(v===scope){changing=false;select.disabled=false;setting();}}
  }
  async function acknowledge(id,control) {
    const v=scope,site=currentSite;control.disabled=true;
    try {
      const {error,data}=await client.rpc("fm_report_acknowledge",{p_site:site,p_report:id});
      if (v!==scope || !panel.open)return;
      if(error || data!==true)throw new Error();
      await load(false);
    } catch {if(v===scope){control.disabled=false;status.textContent=t("تعذر تسجيل استلام التنبيه.","Could not acknowledge the alert.");}}
  }
  function render(row) {
    const card=node("details");
    card.append(node("summary",[cadenceNames[row.cadence],row.period_start+" – "+row.period_end,statuses[row.status]].join(" · ")));
    card.append(node("p",t("وقت إنشاء التقرير","Report generated")+" · "+riyadh(row.recorded_at)));
    if(row.last_evidence_at)card.append(node("p",t("آخر دليل مستخدم","Latest source event used")+" · "+riyadh(row.last_evidence_at)));
    if(row.status==="no_activity")card.append(node("p",t("لم تسجل المصادر أوامر جديدة أو مكتملة أو زيارات أو استحقاقات وقائية صادرة تخص هذه الفترة.",
      "The sources contain no newly created or completed orders, recorded visits, or issued preventive occurrences due in this period.")));
    const items=node("dl");
    for(const [label,value] of [[t("أوامر أُنشئت","Orders created"),row.opened],[t("أوامر اكتملت","Orders completed"),row.completed],
      [t("زيارات مسجلة","Recorded visits"),row.visits],[t("استحقاقات وقائية صادرة","Issued preventive occurrences due"),row.ppm_due],
      [t("دون إغلاق مسجّل بحلول تاريخ الاستحقاق","Without recorded closure by the due date"),row.ppm_unconfirmed]])
      items.append(node("dt",label),node("dd",String(value)));
    card.append(items,node("small",t("المصادر: أوامر العمل المرتبطة بالأصول، الزيارات المسجلة، والاستحقاقات الوقائية الصادرة. لا يشمل المقام الخطط التي لم يصدر لها استحقاق.",
      "Sources: asset work orders, recorded visits and issued preventive occurrences. Plans without an issued occurrence are outside the denominator.")));
    if(row.ppm_unconfirmed>0) {
      if(row.acknowledged_at)card.append(node("p",t("تم استلام التنبيه","Alert acknowledged")+" · "+riyadh(row.acknowledged_at)));
      else {const ack=button(t("تسجيل استلام تنبيه الاستحقاق","Acknowledge due-date alert"),()=>acknowledge(row.id,ack));card.append(ack);}
    }
    return card;
  }
  async function load(append) {
    read?.abort();
    if(!panel.open || !currentSite)return;
    const v=scope,signal=(read=new AbortController()).signal;
    if(!append){cursor=null;more.hidden=true;controls.hidden=true;list.replaceChildren();canConfigure=false;}
    refresh.disabled=more.disabled=true;
    status.textContent=t("جارٍ قراءة تقارير المنشأة…","Reading facility reports…");
    try{
      const {data,error}=await client.rpc("fm_report_history",{p_site:currentSite,p_before:append?cursor:null}).abortSignal(signal);
      if(stale(v,signal))return;
      if(error || !Array.isArray(data?.reports) || !Array.isArray(data.schedules))throw new Error();
      schedules=data.schedules;canConfigure=data.can_configure===true;setting();controls.hidden=false;
      const page=data.reports.slice(0,20);list.append(...page.map(render));
      cursor=page.at(-1)?.id || null;more.hidden=data.reports.length<=20;
      status.textContent=!append && !page.length?t("لا توجد تقارير محفوظة لهذه المنشأة بعد.","No reports have been recorded for this facility yet."):"";
    }catch{
      if(!stale(v,signal)){
        if(!append)clear();
        status.textContent=t("تعذر التحقق من صلاحية التقارير أو قراءة السجل.","Report access or report history could not be verified.");
      }
    }finally{if(!stale(v,signal)){refresh.disabled=more.disabled=false;}}
  }
  select.onchange=setting;
  panel.addEventListener("toggle",()=>{if(panel.open)void load(false);else{read?.abort();clear();}});
  return (org,site)=>{
    scope++;read?.abort();currentSite=org&&site?site:"";panel.open=false;panel.hidden=!currentSite;
    select.disabled=false;clear();
  };
}
