import { uiText as t } from "./locale.js";

const pageSize = 10;
const unknown = () => t("غير متحقق", "Unverified");
const locale = () => document.documentElement.lang;
const number = value => Number.isFinite(value) ? new Intl.NumberFormat(locale()).format(value) : unknown();
const days = 86_400_000;
const reviewRelation = "field_form_reviews!field_form_reviews_record_id_fkey";
const workRelation = "facility_work_orders!facility_pm_occurrences_organization_id_work_order_id_fkey";
const assetRelation = "facility_assets!facility_pm_plans_organization_id_facility_id_asset_id_fkey";
const riyadhClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit"
});

export function periodInRiyadh(now = new Date(), horizon = 30) {
  const parts = Object.fromEntries(riyadhClock.formatToParts(now).map(item => [item.type, item.value]));
  const today = [parts.year, parts.month, parts.day].join("-");
  const end = new Date(Date.parse(today + "T00:00:00Z") + (horizon - 1) * days).toISOString().slice(0, 10);
  return {today, first: today.slice(0, 8) + "01", end};
}

export function completionRatio(issued, known, completed) {
  if (![issued, known, completed].every(n => Number.isSafeInteger(n) && n >= 0)
    || issued === 0 || known !== issued || completed > known) return null;
  return completed / issued;
}

function node(tag, text) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}

function line(list, title, value) {
  list.append(node("dt", title), node("dd", value));
}

function exact(result) {
  return !result?.error && Number.isSafeInteger(result?.count) && result.count >= 0 ? result.count : null;
}

function safe(request) {
  return Promise.resolve(request).catch(() => ({error: true}));
}

function table(client, name, org, site, columns, head = false) {
  return client.from(name).select(columns, {count: "exact", head})
    .eq("organization_id", org).eq("facility_id", site);
}

export async function readExecutiveOverview(client, org, site, period) {
  const {first, today} = period;
  const issued = (columns) => table(client, "facility_pm_occurrences", org, site, columns, true)
    .gte("due_on", first).lte("due_on", today);
  const openOrders = table(client, "facility_pm_occurrences", org, site,
    "due_on,work_order_id," + workRelation + "!inner(summary,status)")
    .lt("due_on", today).in("facility_work_orders.status", ["open","in_progress"])
    .order("due_on").order("plan_id").limit(pageSize);
  const pendingReviews = table(client, "field_form_records", org, site,
    "id,code,submitted_at," + reviewRelation + "(record_id)")
    .eq("status", "submitted").is("field_form_reviews",null)
    .order("submitted_at").order("id").limit(pageSize);
  const duePlans = table(client, "facility_pm_plans", org, site, "id", true)
    .is("paused_at",null).lt("next_due_on", today);
  const [all, visible, finished, overdue, pending, waiting] = await Promise.all([
    issued("plan_id"), issued("plan_id," + workRelation + "!inner(id)"),
    issued("plan_id," + workRelation + "!inner(id)").eq("facility_work_orders.status","completed"),
    openOrders, pendingReviews, duePlans
  ].map(safe));
  return {issued: exact(all), known: exact(visible), completed: exact(finished), overdue, pending, waiting: exact(waiting)};
}

function listPanel(title, result, rowText, empty, id) {
  const panel = node("details");
  if (id) panel.id = id;
  const count = exact(result);
  panel.append(node("summary", title + " · " + number(count)));
  if (count === null || !Array.isArray(result.data)) panel.append(node("p", unknown()));
  else if (!result.data.length) panel.append(node("p", empty));
  else {
    const list = node("ul");
    for (const row of result.data) list.append(node("li", rowText(row)));
    panel.append(list);
    if (count > result.data.length)
      panel.append(node("p", t("تظهر أقدم البنود بعدد ", "Showing the oldest records: ") + number(result.data.length)));
  }
  return panel;
}

// Each source is read separately: null means unverified, zero means read and clear.
function decisionSources(result) {
  return [
    {label: t("أوامر وقائية متأخرة", "Overdue preventive orders"), count: exact(result.overdue), anchor: "fm-overdue-orders",
      reason: t("أوامر صادرة تاريخ استحقاقها قبل اليوم ولم تُغلق.", "Issued orders due before today that are not closed."),
      owner: t("مسؤول الصيانة في المنشأة، أو مقدم الخدمة وفق اتفاقه", "Facility maintenance lead, or the provider under its agreement"),
      action: t("تحديد موعد تنفيذ جديد أو تصعيد التأخير لمقدم الخدمة.", "Set a new completion date or escalate the delay to the provider.")},
    {label: t("نماذج تنتظر المراجعة", "Forms awaiting review"), count: exact(result.pending), anchor: "fm-pending-reviews",
      reason: t("نماذج أُرسلت ولم يُسجَّل لها قرار مراجعة.", "Submitted forms with no recorded review decision."),
      owner: t("المالك أو المعتمد المصرَّح له بالمراجعة", "Owner or authorized approver"),
      action: t("اعتماد النموذج أو إعادته مع سبب مسجَّل.", "Accept the form or return it with a recorded reason.")},
    {label: t("خطط تجاوزت موعد إصدارها", "Plans past their issue date"), count: exact(result.waiting), anchor: "fm-calendar",
      reason: t("خطط نشطة تجاوز موعد إصدارها التالي.", "Active plans past their next issue date."),
      owner: t("المالك أو المعتمد المصرَّح له بإصدار الخطة أو إيقافها", "Owner or approver authorized to issue or pause the plan"),
      action: t("إصدار الأمر الوقائي أو توثيق سبب التأجيل.", "Issue the preventive order or record the reason for deferral.")}
  ];
}

export function decisionItems(result) {
  return decisionSources(result).map(item => ({...item,
    state: item.count === null ? "unverified" : item.count > 0 ? "decision" : "clear"}));
}

function openEvidence(id) {
  const target = document.getElementById(id);
  if (!target) return;
  for (let p = target; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
  if (!target.hasAttribute("tabindex") && target.tagName !== "DETAILS") target.tabIndex = -1;
  (target.querySelector(":scope > summary") || target).focus({preventScroll: true});
  target.scrollIntoView({block: "start"});
}

function decisionCard(result, period) {
  const items = decisionItems(result);
  const section = node("section");
  section.id = "fm-decision-today";
  section.className = "decision-today";
  const heading = node("h4", t("قرار مطلوب اليوم", "Decisions needed today"));
  heading.id = "fm-decision-title";
  section.setAttribute("aria-labelledby", heading.id);
  const summary = node("p");
  summary.setAttribute("role", "status");
  const needing = items.filter(item => item.state === "decision");
  const unverified = items.filter(item => item.state === "unverified");
  const unreadNote = unverified.length
    ? " " + t("بعض المصادر لم تُقرأ، فلا يُعد غياب بنودها دليلًا على عدم وجودها.", "Some sources were not read, so the absence of their items is not evidence that none exist.")
    : "";
  summary.textContent = (needing.length
    ? t("بنود تحتاج قرارًا حتى ", "Items needing a decision as of ") + period.today + t(" بتوقيت الرياض.", " (Riyadh).")
    : t("لا توجد بنود تحتاج قرارًا في المصادر المقروءة اليوم.", "No items need a decision in the sources read today.")) + unreadNote;
  const list = node("ol");
  for (const item of items) {
    const li = node("li");
    const head = node("strong", item.label + " · " + (item.count === null ? unknown() : number(item.count)));
    li.append(head);
    if (item.state === "decision") {
      const details = node("dl");
      line(details, t("السبب", "Why"), item.reason);
      line(details, t("المسؤول المصرَّح له", "Authorized to act"), item.owner);
      line(details, t("الإجراء", "Action"), item.action);
      const link = node("a", t("عرض الدليل والسجل", "Open evidence and register"));
      link.href = "#" + item.anchor;
      link.addEventListener("click", event => { event.preventDefault(); openEvidence(item.anchor); });
      li.append(details, link);
    } else if (item.state === "clear") {
      li.append(node("span", " · " + t("لا يتطلب قرارًا في المصدر المقروء", "No decision required in the source read")));
    } else {
      li.append(node("span", " · " + t("تعذرت قراءة المصدر؛ لا يعني ذلك صفرًا", "Source not read; this is not a zero")));
    }
    list.append(li);
  }
  section.append(heading, summary, list);
  section.append(node("p", t("لا يسجّل النظام حاليًا اسم مسؤول لكل بند؛ الدور المذكور هو الجهة المصرّح لها بالإجراء.",
    "The system does not yet record a named assignee for each item; the role shown is the party authorized to act.")));
  return section;
}

function metrics(result, period) {
  const container = node("section");
  container.append(node("h4",t("أولويات الصيانة والمراجعة", "Maintenance and review priorities")));
  container.append(decisionCard(result, period));
  const data = node("dl");
  const percentage = completionRatio(result.issued,result.known,result.completed);
  const value = percentage === null
    ? (result.issued === 0 ? t("لا استحقاقات صادرة خلال الفترة", "No issued occurrences in this period") : unknown())
    : new Intl.NumberFormat(locale(),{style:"percent",maximumFractionDigits:1}).format(percentage)
      + " (" + number(result.completed) + "/" + number(result.issued) + ")";
  line(data, t("إنجاز أوامر الصيانة الوقائية الصادرة", "Completion of issued preventive work"), value);
  line(data, t("خطط نشطة تجاوزت موعد الإصدار التالي", "Active plans past their next issue date"), number(result.waiting));
  container.append(data, node("p", t("المقام هو الاستحقاقات التي صدر لها أمر وتاريخها ضمن الفترة، من ", "Denominator: issued occurrences with due dates from ")
    + period.first + t(" إلى ", " to ") + period.today + t(" بتوقيت الرياض.", " (Riyadh).")));
  container.append(listPanel(t("أوامر وقائية صادرة تجاوزت تاريخ الاستحقاق", "Issued preventive orders past due"),result.overdue,
    row => [row.due_on, row.facility_work_orders?.summary || unknown(), row.work_order_id].join(" · "),
    t("لا تظهر أوامر وقائية متأخرة.", "No overdue preventive orders are visible."), "fm-overdue-orders"));
  container.append(listPanel(t("نماذج مرسلة تنتظر المراجعة", "Submitted forms awaiting review"),result.pending,
    row => [row.code, row.submitted_at ? riyadhClock.format(new Date(row.submitted_at)) : unknown(), row.id].join(" · "),
    t("لا تظهر نماذج مرسلة تنتظر المراجعة.", "No submitted forms awaiting review are visible."), "fm-pending-reviews"));
  return container;
}

export function setupExecutiveOverview(client, parent) {
  const root = node("section");
  root.className = "facility-performance";
  root.hidden = true;
  const resultBox = node("div");
  const schedule = node("section");
  schedule.id="fm-calendar";
  const label = node("label", t("فترة الاستحقاقات القادمة", "Upcoming due dates"));
  const horizon = node("select");
  for (const n of [7,30,365]) horizon.add(new Option(t(n === 7 ? "٧ أيام" : n === 30 ? "٣٠ يومًا" : "٣٦٥ يومًا", n + " days"), String(n)));
  horizon.value = "30";
  label.append(horizon);
  const scheduleStatus = node("p");
  scheduleStatus.setAttribute("role","status");
  const scheduleList = node("ol");
  const history = node("details");
  history.append(node("summary",t("آخر تحديث مسجّل في مصادر المتابعة", "Latest recorded activity by source")));
  const timestamps = node("dl");
  history.append(timestamps);
  const more = node("button", t("تحميل المزيد من الخطط", "Load more plans"));
  more.type = "button";
  schedule.append(node("h4",t("تقويم الصيانة الوقائية", "Preventive maintenance calendar")),label,scheduleStatus,scheduleList,more);
  root.append(node("h3",t("مركز متابعة المالك", "Owner follow-up desk")),resultBox,schedule,history);
  parent.append(root);
  let current = null;
  let revision = 0, pageRequest = 0, offset = 0;

  history.addEventListener("toggle", async () => {
    if (!history.open || !current) return;
    const token = revision;
    const {org,site} = current;
    const sources = [
      ["facility_pm_plans","verified_at",t("التحقق من خطة الصيانة", "Plan verification")],
      ["facility_pm_occurrences","issued_at",t("إصدار أمر وقائي", "Preventive work issued")],
      ["field_form_records","updated_at",t("تحديث نموذج ميداني", "Field record update")]
    ];
    timestamps.replaceChildren();
    const results = await Promise.all(sources.map(([name,column]) => safe(
      client.from(name).select(column).eq("organization_id",org).eq("facility_id",site)
        .order(column,{ascending:false,nullsFirst:false}).limit(1)
    )));
    if (token !== revision || !history.open) return;
    const clock = new Intl.DateTimeFormat(locale(),{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short",calendar:"gregory"});
    const rows = document.createDocumentFragment();
    sources.forEach(([,field,label],index) => {
      const result = results[index];
      const date = result.data?.[0]?.[field];
      const value = result.error || !Array.isArray(result.data) ? unknown() : date
        ? clock.format(new Date(date)) : t("لا يوجد تاريخ مسجّل", "No recorded date");
      line(rows,label,value);
    });
    timestamps.replaceChildren(rows);
  });
  async function loadCalendar(reset) {
    if (!current) return;
    const request = ++pageRequest;
    const {org,site,date} = current;
    const period = periodInRiyadh(date,Number(horizon.value));
    if (reset) { offset = 0; scheduleList.replaceChildren(); }
    more.hidden = true;
    scheduleStatus.textContent = t("جارٍ قراءة الخطط…", "Loading plans…");
    const result = await safe(table(client,"facility_pm_plans",org,site,
      "id,task,next_due_on,source_reference,source_date,verified_at," + assetRelation + "(asset_code,name)")
      .is("paused_at",null).gte("next_due_on",period.today).lte("next_due_on",period.end)
      .order("next_due_on").order("id").range(offset,offset + pageSize - 1));
    if (request !== pageRequest) return;
    if (exact(result) === null || !Array.isArray(result.data)) {
      scheduleStatus.textContent = t("تعذرت قراءة الاستحقاقات.", "Due dates could not be read.");
      more.textContent = t("إعادة المحاولة", "Retry");
      more.hidden = false;
      return;
    }
    for (const plan of result.data) {
      const item = node("li"), details = node("details"), evidence = node("dl");
      details.append(node("summary", [plan.next_due_on,plan.task,plan.facility_assets?.name].filter(Boolean).join(" · ")));
      line(evidence, t("رمز الأصل", "Asset code"), plan.facility_assets?.asset_code || unknown());
      line(evidence, t("مرجع خطة الصيانة", "Maintenance plan source"), plan.source_reference || unknown());
      line(evidence, t("تاريخ المستند", "Source date"), plan.source_date || unknown());
      line(evidence, t("تاريخ التحقق", "Verified on"), plan.verified_at ? riyadhClock.format(new Date(plan.verified_at)) : unknown());
      item.append(details); details.append(evidence); scheduleList.append(item);
    }
    offset += result.data.length;
    scheduleStatus.textContent = period.today + " – " + period.end + " · "
      + t("الاستحقاق التالي لكل خطة نشطة: ", "Next occurrence per active plan: ") + number(exact(result));
    more.textContent = t("تحميل المزيد من الخطط", "Load more plans");
    more.hidden = !result.data.length || offset >= exact(result);
  }
  horizon.addEventListener("change", () => void loadCalendar(true));
  more.addEventListener("click", () => void loadCalendar(false));
  return async (org, site) => {
    const token = ++revision;
    pageRequest++;
    current = null;
    root.hidden = !org || !site;
    history.open = false; timestamps.replaceChildren();
    resultBox.replaceChildren(); scheduleList.replaceChildren();
    scheduleStatus.textContent = ""; more.hidden = true; horizon.value = "30";
    if (root.hidden) return;
    current = {org,site,date:new Date()};
    const period = periodInRiyadh(current.date);
    resultBox.textContent = t("جارٍ قراءة أوامر المنشأة…", "Loading facility work…");
    const [result] = await Promise.all([readExecutiveOverview(client,org,site,period),loadCalendar(true)]);
    if (token === revision) resultBox.replaceChildren(metrics(result,period));
  };
}
