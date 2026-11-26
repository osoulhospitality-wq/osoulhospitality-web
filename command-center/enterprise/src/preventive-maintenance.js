import { uiText as t } from "./locale.js";

const periodLabels = () => ({
  days: t("يوم", "days"), weeks: t("أسبوع", "weeks"), months: t("شهر", "months"), years: t("سنة", "years")
});

async function pages(makeQuery) {
  const all = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await makeQuery().range(offset, offset + 199);
    if (error) throw error;
    all.push(...data);
    if (data.length < 200) return all;
  }
}

export function setupPreventiveMaintenance(client, panel = document.getElementById("facility-pm")) {
  if (!panel) return;
  const content = panel.querySelector("[data-content]");
  const org = document.getElementById("organization-select");
  const field = (label, control) => '<label>' + label + ' ' + control + '</label>';
  const edit = (name, attrs) => '<input name="' + name + '" required ' + attrs + '>';
  content.innerHTML = [
    field(t("المنشأة", "Facility"), '<select data-site></select>'),
    '<p role="status" data-status></p><form data-register hidden>',
    field(t("الأصل", "Asset"), '<select name="asset" required></select>'),
    field(t("مهمة الصيانة", "Maintenance task"), edit("task",'minlength="2" maxlength="300"')),
    field(t("الفاصل المعتمد", "Approved interval"), edit("count",'type="number" min="1" max="1000" step="1"')),
    field(t("الوحدة", "Unit"), '<select name="unit"></select>'),
    field(t("تاريخ أول استحقاق بحسب المرجع", "First due date from the source"), edit("first",'type="date"')),
    field(t("مرجع الدورية، مع اسم الوثيقة والإصدار أو البند", "Interval source, including document and revision or clause"), edit("source",'minlength="3" maxlength="500"')),
    field(t("تاريخ المرجع", "Source date"), edit("sourceDate",'type="date"')),
    '<button type="submit">' + t("اعتماد الجدول", "Approve schedule") + '</button></form>',
    '<h3>' + t("الجدول حسب الاستحقاق", "Schedule by due date") + '</h3><ul data-due></ul>',
    '<h3>' + t("أحدث ٥٠ أمر صيانة وقائية وزياراتها", "Latest 50 preventive orders and recorded visits") + '</h3><ul data-history></ul>'
  ].join("");
  const el = key => content.querySelector('[data-' + key + ']');
  const site = el('site'), form = el('register'), message = el('status'), list = el('due'), history = el('history');
  const fields = form.elements;
  for (const [unit,label] of Object.entries(periodLabels())) fields.unit.add(new Option(label,unit));
  let generation = 0, actor = null, key = null, activeWrite = false, focusSite = null;
  const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh'}).format(new Date());
  function empty() {
    generation++; key = null; activeWrite = false;
    fields.asset.replaceChildren(); form.reset(); form.hidden = true;
    list.replaceChildren(); history.replaceChildren(); message.textContent = "";
  }
  function choices(select,rows,name,previous = "") {
    select.replaceChildren(new Option(t("اختر", "Select"),""),...rows.map(row=>new Option(name(row),row.id)));
    if (rows.some(row=>row.id===previous)) select.value=previous;
  }
  function addText(container,text) {
    const row = document.createElement("li");row.textContent = text;container.append(row);return row;
  }
  function action(row,label,handler) {
    const button = document.createElement("button");button.type="button";button.textContent=label;
    button.addEventListener("click",handler);row.append(" ",button);
  }
  const failMessage = () => t("تعذر تأكيد العملية. راجع صلاحيتك والبيانات وأمر العمل السابق، ثم حدّث القائمة.", "Could not confirm the operation. Check permissions, inputs and any outstanding order, then refresh.");
  async function loadSites() {
    const rev = ++generation, tenant=org.value;
    if (!panel.open || !tenant) return;
    try {
      const rows = await pages(()=>client.from("facilities").select("id,name").eq("organization_id",tenant).order("name").order("id"));
      if (rev!==generation || !panel.open || tenant!==org.value) return;
      choices(site,rows,row=>row.name,site.value);
      if (focusSite) {
        const requested=focusSite; focusSite=null;
        if (!rows.some(row=>row.id===requested)) {
          site.value="";message.textContent=t("المنشأة غير متاحة.","Facility unavailable.");return;
        }
        site.value=requested;
      } else if (rows.length===1) site.value=rows[0].id;
      if (site.value) await refresh();
      else message.textContent = rows.length ? t("اختر منشأة لعرض جدولها.", "Select a facility to view its schedule.") : t("سجّل منشأة أولًا.", "Register a facility first.");
    } catch { if (rev===generation) message.textContent=failMessage(); }
  }
  async function refresh() {
    const rev=++generation,tenant=org.value,facility=site.value;
    if (!panel.open || !tenant || !facility) return;
    const current=()=>rev===generation && panel.open && tenant===org.value && facility===site.value;
    const scoped=(table,cols)=>client.from(table).select(cols).eq("organization_id",tenant).eq("facility_id",facility);
    try {
      const [assets,plans,log,user] = await Promise.all([
        pages(()=>scoped("facility_assets","id,asset_code,name").order("asset_code").order("id")),
        pages(()=>scoped("facility_pm_plans","id,asset_id,task,period_count,period_unit,first_due_on,next_due_on,source_reference,source_date,paused_at").order("next_due_on").order("id")),
        scoped("facility_pm_occurrences","due_on,plan_id,work_order_id,issued_at,facility_work_orders(summary,status,facility_visits(id,findings,created_at))").order("issued_at",{ascending:false}).order("work_order_id").limit(50),
        client.auth.getUser()
      ]);
      if (!current()) return;
      if (log.error || user.error || !user.data.user) throw new Error("Unverified session");
      const member=await client.from("organization_members").select("role").eq("organization_id",tenant).eq("user_id",user.data.user.id).eq("active",true).maybeSingle();
      if (!current()) return;
      if (member.error) throw member.error;
      const approve=["owner","approver"].includes(member.data?.role);
      const issue=approve || member.data?.role==="analyst";
      choices(fields.asset,assets,row=>row.asset_code+" · "+row.name,fields.asset.value);
      form.hidden=!approve; fields.sourceDate.max=today();
      const names=new Map(assets.map(a=>[a.id,a.asset_code+" · "+a.name]));
      list.replaceChildren();history.replaceChildren();
      const labels=periodLabels(),day=today();
      const dueLabel=d=>d<day?t("متأخر","Overdue"):d===day?t("مستحق اليوم","Due today"):t("قادم","Upcoming");
      for (const plan of plans) {
        const row=addText(list,[plan.paused_at?t("موقوف","Paused"):dueLabel(plan.next_due_on),plan.next_due_on,names.get(plan.asset_id),plan.task,
          plan.period_count+" "+labels[plan.period_unit],plan.source_reference,plan.source_date].join(" · "));
        if (!plan.paused_at && plan.next_due_on<=day && issue)
          action(row,t("إصدار أمر العمل","Issue work order"),()=>write("facility_pm_issue",{p_plan:plan.id,p_due:plan.next_due_on},tenant,facility));
        if (!plan.paused_at && approve)
          action(row,t("إيقاف التكرار","Pause recurrence"),()=>{
            if (window.confirm(t("إيقاف الاستحقاقات الجديدة مع إبقاء أوامر العمل القائمة؟","Pause new occurrences and retain existing work orders?")))
              void write("facility_pm_pause",{p_plan:plan.id},tenant,facility);
          });
      }
      if (!plans.length) addText(list,t("لا توجد جداول مسجلة لهذه المنشأة.","No schedules registered for this facility."));
      const states={open:t("مفتوح","Open"),in_progress:t("قيد التنفيذ","In progress"),completed:t("مكتمل","Completed")};
      for (const event of log.data) {
        const order=event.facility_work_orders;
        const row=addText(history,[event.due_on,order?.summary,states[order?.status],event.work_order_id].filter(Boolean).join(" · "));
        for(const visit of order?.facility_visits || []) {
          const p=document.createElement("p");p.textContent=visit.created_at.slice(0,10)+" · "+visit.findings;row.append(p);
        }
      }
      if(!log.data.length) addText(history,t("لم يصدر أمر وقائي بعد.","No preventive order has been issued."));
      message.textContent=t("تابع تنفيذ الأمر والزيارة واعتماد الإغلاق من عمليات المنشأة.","Use facility operations to start the order, record the visit and approve closure.");
    } catch { if(current()) message.textContent=failMessage(); }
  }
  async function write(rpc,params,tenant,facility) {
    if (activeWrite || !panel.open || tenant!==org.value || facility!==site.value) return;
    const rev=generation;activeWrite=true;
    try {
      const result=await client.rpc(rpc,{p_org:tenant,p_facility:facility,...params});
      if(rev!==generation) return;
      if(result.error) throw result.error;
      if(rpc==="facility_pm_register"){form.reset(); key=null;}
      await refresh();
    } catch { if(rev===generation) message.textContent=failMessage(); }
    finally{if(tenant===org.value && facility===site.value) activeWrite=false;}
  }
  form.addEventListener("input",()=>{key=null;});
  form.addEventListener("submit",e=>{
    e.preventDefault();
    key ??= crypto.randomUUID();
    void write("facility_pm_register",{p_id:key,p_asset:fields.asset.value,p_task:fields.task.value.trim(),
      p_count:Number(fields.count.value),p_unit:fields.unit.value,p_first:fields.first.value,
      p_source:fields.source.value.trim(),p_source_date:fields.sourceDate.value},org.value,site.value);
  });
  site.addEventListener("change",()=>{empty();void refresh();});
  org.addEventListener("change",()=>{focusSite=null;panel.open=false;site.replaceChildren();empty();});
  panel.addEventListener("toggle",()=>{if(panel.open) void loadSites();else {empty();site.replaceChildren();}});
  document.addEventListener("draqon:facility-focus",event=>{
    const {orgId,facilityId,panelId}=event.detail || {};
    if(panelId!=="facility-pm" || orgId!==org.value || !facilityId) return;
    empty();focusSite=facilityId;
    if(panel.open) void loadSites();else panel.open=true;
  });
  client.auth.onAuthStateChange((event,session)=>{
    const uid=session?.user?.id || null;
    if(uid!==actor || event==="SIGNED_OUT"){actor=uid;focusSite=null;panel.open=false;site.replaceChildren();empty();}
  });
}
