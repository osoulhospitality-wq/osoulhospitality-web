import { uiText as t } from "./locale.js";

const none = () => t("غير موثق", "Not documented");
const cell = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });
const dateOf = (value) => {
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? new Intl.DateTimeFormat(document.documentElement.lang, {
    timeZone: "Asia/Riyadh", dateStyle: "medium"
  }).format(stamp) : none();
};
const str = value => typeof value === "string" ? value.trim() : "";

export function riskAssessment(record) {
  const scale = input => {
    const normalized = String(input ?? "").trim().replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, n => String(n.charCodeAt(0) - 1776));
    return /^[1-5]$/.test(normalized) ? Number(normalized) : null;
  };
  const likelihood = scale(record?.likelihood), impact = scale(record?.impact);
  const direct = str(record?.hazard).toLowerCase();
  return { score: likelihood && impact ? likelihood * impact : null, condition: scale(record?.condition),
    hazard: ["نعم", "yes"].includes(direct) ? true : ["لا", "no"].includes(direct) ? false : null };
}

function latest(rows, code, key) {
  const latestByAsset = new Map();
  for (const row of rows) {
    if (row.code !== code || !str(row[key])) continue;
    const reviews = [].concat(row.review || []).filter(r => r.decision === "accepted" && Number.isFinite(Date.parse(r.reviewed_at)));
    if (!reviews.length || !Number.isFinite(Date.parse(row.submitted_at))) continue;
    const time = Date.parse(row.submitted_at), id = str(row[key]), prior = latestByAsset.get(id);
    if (!prior || prior.time < time) latestByAsset.set(id, { time, row });
    else if (prior.time === time && prior.row?.id !== row.id) latestByAsset.set(id, { time, row: null });
  }
  return latestByAsset;
}

export function engineeringRows(assets, forms, orders, plans = []) {
  const inventory = latest(forms, "F03", "asset"), condition = latest(forms, "F04", "asset");
  const renewal = latest(forms, "F19", "asset"), causes = latest(forms, "F09", "asset");
  const history = new Map();
  for (const order of orders) {
    if (!history.has(order.asset_id)) history.set(order.asset_id, []);
    history.get(order.asset_id).push(order);
  }
  const nextService = new Map();
  for (const plan of plans) {
    if (!plan.verified_at || !/^\d{4}-\d{2}-\d{2}$/.test(plan.next_due_on) || plan.paused_at) continue;
    const next = nextService.get(plan.asset_id);
    if (!next || plan.next_due_on < next.next_due_on) nextService.set(plan.asset_id, plan);
  }
  return assets.map(asset => {
    const key = asset.asset_code;
    const register = inventory.get(key)?.row, inspection = condition.get(key)?.row;
    const orders = history.get(asset.id) || [];
    return { ...asset, system: str(register?.system), location: str(register?.location), register, inspection,
      risk: riskAssessment(inspection), replacement: renewal.get(key)?.row, cause: causes.get(key)?.row,
      nextPlan: nextService.get(asset.id), history: orders, open: orders.filter(o => o.status === "open" || o.status === "in_progress").length };
  });
}

async function readPages(build, current) {
  const rows = [];
  for (let offset = 0; current(); offset += 200) {
    const {data, error} = await build().range(offset, offset + 199);
    if (error || !Array.isArray(data)) throw new Error("Unavailable");
    rows.push(...data);
    if (data.length < 200) break;
  }
  return rows;
}

const formFields = {
  F03: "asset:answers->>C8,system:answers->>C10,location:answers->>C12,model:answers->>C13,serial:answers->>C14,service:answers->>C15,warranty:answers->>C17",
  F04: "asset:answers->>C8,likelihood:answers->>C9,impact:answers->>C10,condition:answers->>C11,hazard:answers->>C12",
  F19: "asset:answers->>C8,years:answers->>C10,replacement_year:answers->>C11,basis:answers->>C13",
  F09: "asset:answers->>C9,description:answers->>C10,evidence:answers->>C12,confirmed:answers->>C14,action:answers->>C15"
};

function describe(list, label, value) {
  list.append(cell("dt", label), cell("dd", value || none()));
}

function assetCard(row, historyAvailable) {
  const box = document.createElement("details");
  box.append(cell("summary", row.asset_code + " · " + row.name));
  box.addEventListener("toggle", () => {
    if (!box.open || box.querySelector("dl")) return;
    const info = document.createElement("dl");
    describe(info, t("النظام · موقع الأصل", "System · asset location"), [row.system, row.location].filter(Boolean).join(" · "));
    describe(info, t("المصنّع والطراز", "Manufacturer and model"), row.register?.model);
    describe(info, t("الرقم التسلسلي", "Serial number"), row.register?.serial);
    describe(info, t("الضمان المسجل", "Recorded warranty"), row.register?.warranty);
    describe(info, t("تاريخ الخدمة بحسب سجل الأصل", "Service date recorded in asset register"), row.register?.service);
    describe(info, t("أقرب استحقاق لخطة صيانة نشطة موثقة", "Earliest due date on a verified active maintenance plan"),
      row.nextPlan && [row.nextPlan.next_due_on, row.nextPlan.task].filter(Boolean).join(" · "));
    describe(info, t("مرجع سجل الأصل", "Asset register source"), row.register && "F03 · " + dateOf(row.register.submitted_at));
    describe(info, t("الحالة الفنية (١ جيد إلى ٥ سيئ)", "Condition (1 good to 5 poor)"), row.risk.condition);
    describe(info, t("الخطر المسجل · الاحتمال × الأثر", "Recorded risk · likelihood × impact"), row.risk.score === null ? null : row.risk.score + "/25");
    describe(info, t("خطر سلامة مباشر بحسب الكشف", "Direct safety hazard reported"), row.risk.hazard === null ? null : row.risk.hazard ? t("نعم", "Yes") : t("لا", "No"));
    describe(info, t("مرجع فحص الحالة", "Condition assessment source"), row.inspection && "F04 · " + dateOf(row.inspection.submitted_at));
    if (row.replacement?.basis) describe(info,t("تقدير الإحلال المسند وأساسه", "Supported replacement estimate and basis"),
      [row.replacement.replacement_year, row.replacement.basis, "F19 · " + dateOf(row.replacement.submitted_at)].filter(Boolean).join(" · "));
    if (row.cause?.confirmed && row.cause?.evidence) describe(info,t("آخر سبب جذري موثّق في نموذج مقبول", "Last root cause documented in an accepted form"),
      [row.cause.description,row.cause.confirmed,row.cause.evidence,"F09 · "+dateOf(row.cause.submitted_at)].filter(Boolean).join(" · "));
    box.append(info, cell("h5", t("أوامر أُنشئت خلال آخر ٩٠ يومًا", "Orders created in the last 90 days")));
    if (!historyAvailable) box.append(cell("p", t("تعذرت قراءة الأوامر.", "Order history unavailable.")));
    else if (!row.history.length) box.append(cell("p", t("لا توجد أوامر ظاهرة في الفترة.", "No visible orders in this period.")));
    else {
      const list = document.createElement("ul");
      const states = {open:t("مفتوح","Open"),in_progress:t("قيد التنفيذ","In progress"), completed:t("مكتمل","Completed")};
      for (const order of row.history) list.append(cell("li", [dateOf(order.created_at), order.summary, states[order.status] || order.status].join(" · ")));
      box.append(list);
    }
  });
  return box;
}

export function setupEngineeringIntelligence(client, root) {
  const panel = document.createElement("details");
  panel.append(cell("summary", t("الأنظمة الهندسية والأصول ومواقع تركز الأعمال", "Engineering systems, assets and work by location")));
  const body = document.createElement("section");
  panel.append(body); root.append(panel);
  let org = "", site = "", version = 0, loaded = false, busy = false;

  async function refresh() {
    if (!org || !site || !panel.open || loaded || busy) return;
    busy = true;
    const revision = version, current = () => revision === version;
    const scoped = (table, fields) => client.from(table).select(fields).eq("organization_id",org).eq("facility_id",site);
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    body.replaceChildren(cell("p", t("جارٍ قراءة سجلات المنشأة…", "Loading facility records…")));
    const queries = [
      () => scoped("facility_assets","id,asset_code,name").order("id"),
      () => client.from("facility_work_orders").select("id,asset_id,summary,status,created_at,facility_assets!inner(facility_id,organization_id)")
        .eq("organization_id",org).eq("facility_assets.organization_id",org).eq("facility_assets.facility_id",site)
        .gte("created_at",cutoff).order("created_at",{ascending:false}).order("id"),
      () => scoped("facility_pm_plans","id,asset_id,task,next_due_on,verified_at,paused_at").is("paused_at",null).order("id"),
      ...Object.entries(formFields).map(([code, fields]) => () =>
        scoped("field_form_records", "id,code,submitted_at,"+fields+",review:field_form_reviews!field_form_reviews_record_id_fkey!inner(decision,reviewed_at)")
          .eq("code",code).eq("template_version",1).eq("status","submitted").eq("review.decision","accepted").order("id"))
    ];
    const results = await Promise.allSettled(queries.map(q => readPages(q,current)));
    if (!current()) return;
    busy = false; loaded = results.every(r => r.status === "fulfilled");
    body.replaceChildren();
    if (!loaded) {
      const retry = cell("button", t("إعادة قراءة السجلات", "Retry data reads")); retry.type = "button";
      retry.onclick = refresh;
      body.append(cell("p",t("تعذرت قراءة بعض المصادر. تفاصيلها غير متاحة.", "Some sources could not be read. Their details are unavailable.")), retry);
    }
    if (results[0].status !== "fulfilled") return;
    const ordersAvailable = results[1].status === "fulfilled";
    const rows = engineeringRows(results[0].value, results.slice(3).flatMap(r => r.value || []), results[1].value || [], results[2].value || []);
    if (!rows.length) { body.append(cell("p",t("لا توجد أصول مسجلة ظاهرة في المنشأة.", "No registered assets are visible for this facility."))); return; }
    const flagged = rows.filter(row => row.risk.hazard === true || row.risk.score >= 15);
    if (flagged.length) body.append(cell("p", t("للمراجعة الهندسية بحسب آخر كشف مقبول", "Engineering review based on latest accepted inspection") + " · " + flagged.map(x => x.asset_code).join("، ")));
    const systems = new Set(rows.map(a => a.system));
    const select = document.createElement("select"), label = cell("label", t("تصفية النظام ", "Filter system "));
    select.append(new Option(t("كل الأنظمة", "All systems"), "all"));
    for (const s of systems) select.append(new Option(s || none(), "system:"+s));
    label.append(select); body.append(label);
    const content = document.createElement("div"); body.append(content);
    function render() {
      const visible = rows.filter(a => select.value === "all" || "system:"+a.system === select.value);
      content.replaceChildren(cell("p",t("الأصول المسجلة", "Registered assets")+" · "+visible.length));
      const areas = new Map();
      for (const a of visible) {
        if (!a.location) continue;
        if (!areas.has(a.location)) areas.set(a.location, { count: 0, assets: [] });
        const area = areas.get(a.location);
        area.count += a.history.length;
        area.assets.push(a);
      }
      if (areas.size && ordersAvailable) {
        const section = document.createElement("details"); section.append(cell("summary",t("تركّز الأوامر حسب موقع الأصل المسجل", "Order concentration by recorded asset location")));
        section.append(cell("p",t("أوامر آخر ٩٠ يومًا بحسب الموقع في نموذج F03 المقبول. يشمل العدد الصيانة المخططة. تظهر الأصول ذات الموقع الموثق فقط.", "Last 90 days of orders grouped by the registered location in accepted F03 forms. Includes planned work. Only documented locations appear.")));
        const max = Array.from(areas.values()).reduce((n,area)=>Math.max(n,area.count),1);
        for (const [name,area] of [...areas].sort((a,b)=>b[1].count-a[1].count)) {
          const count = area.count;
          const entry = document.createElement("details"), title = cell("summary",name+" · "+count);
          const meter = document.createElement("meter"); meter.min=0; meter.max=max; meter.value=count; meter.setAttribute("aria-label",name);
          title.append(" ",meter); entry.append(title);
          for (const asset of area.assets) entry.append(assetCard(asset,ordersAvailable));
          section.append(entry);
        }
        content.append(section);
      }
      for (const row of visible) content.append(assetCard(row,ordersAvailable));
    }
    select.onchange = render; render();
  }
  panel.addEventListener("toggle", refresh);
  return (organization, facility) => {
    version++; org=organization; site=facility; loaded=false; busy=false;
    body.replaceChildren(); panel.hidden=!org||!site;
    if (panel.hidden) panel.open=false;
    else if (panel.open) void refresh();
  };
}
