import { setupReputation } from "./reputation.js";
import { setupReportHistory } from "./report-history.js";
import { setupExecutiveOverview } from "./executive-overview.js";
import { setupEngineeringIntelligence } from "./engineering-intelligence.js";
import { setupEvidenceCenter } from "./evidence-center.js";
import { setupResourceFinance } from "./resource-finance.js";
import { uiText as t } from "./locale.js";

const facts = [
  ["floors_above","الطوابق فوق الأرض","Above-ground floors"], ["basements","الأقبية","Basements"],
  ["built_area_m2","المسطح المبني (م²)","Built area (m²)"], ["land_area_m2","مساحة الأرض (م²)","Land area (m²)"],
  ["units","الوحدات","Units"], ["lifts","المصاعد","Lifts"], ["staff_total","العاملون","Staff"]
];
const dimensions = [["C10","الجودة","Quality"],["C11","الالتزام","Compliance"],["C12","السلامة","Safety"],["C13","الوثائق","Documentation"]];
const stages = [["open","مفتوحة","Open"],["in_progress","قيد التنفيذ","In progress"],["completed","مكتملة","Completed"]];
const unavailable = () => t("غير متاح","Unavailable");

function node(tag, text) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}

export function rating(raw) {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const normalized = String(raw).trim().replace(/[٠-٩]/g, x => x.charCodeAt(0)-1632).replace(/[۰-۹]/g, x => x.charCodeAt(0)-1776).replace("٫",".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value >= 0 && value <= 100 ? value : null;
}

export function approvedFact(rows, key) {
  const approved = (rows || []).filter(row => row.key === key && row.approved && row.day);
  const day = approved.reduce((latest,row)=>row.day>latest ? row.day : latest,"");
  const latest = approved.filter(row=>row.day===day);
  if (!latest.length) return unavailable();
  const values = new Set(latest.map(row=>row.value));
  return values.size === 1 ? String(latest[0].value) + " · " + day : t("تعارض بين المصادر","Conflicting sources");
}

function meter(label, value, max) {
  const row = node("div");
  row.className = "performance-meter";
  row.append(node("span", label));
  if (Number.isFinite(value) && max > 0) {
    const bar = node("progress");
    bar.max = max;
    bar.value = value;
    bar.setAttribute("aria-label", label);
    row.append(bar);
  }
  row.append(node("strong", Number.isFinite(value) ? String(value) : unavailable()));
  return row;
}

function card(heading) {
  const section = node("section");
  section.append(node("h4",heading));
  return section;
}

async function exact(query) {
  const { error, count } = await query;
  return !error && Number.isSafeInteger(count) ? count : null;
}

export function setupPerformance(client) {
  const root = node("section");
  root.className = "facility-performance";
  const label = node("label", t("المبنى","Building"));
  const select = node("select");
  label.append(select);
  const status = node("p");
  status.setAttribute("role","status");
  const grid = node("div");
  grid.className = "performance-cards";
  root.append(node("h3", t("أداء المنشأة وجودة خدمة المورد","Facility performance and supplier quality")), label, status, grid);
  document.querySelector("#kpi-grid").after(root);
  const showReputation=setupReputation(client,root);
  const showReports=setupReportHistory(client,root);
  const showExecutive = setupExecutiveOverview(client,root);
  const showEngineering = setupEngineeringIntelligence(client,root);
  const showEvidence = setupEvidenceCenter(client,root);
  const showResourceFinance = setupResourceFinance(client,root);
  let sequence = 0, currentOrg = "";
  async function showSite() {
    const token = ++sequence, org = currentOrg, site = select.value;
    void showReputation(org,site);
    void showReports(org,site);
    void showExecutive(org,site);
    void showEngineering(org,site);
    void showEvidence(org,site);
    void showResourceFinance(org,site);
    grid.replaceChildren();
    if (!org || !site) return;
    status.textContent = t("جارٍ قراءة سجلات المبنى…","Reading building records…");
    const ids = { count:"exact", head:true };
    const orderCount = state => exact(client.from("facility_work_orders").select("id,facility_assets!inner(facility_id)",ids)
      .eq("organization_id",org).eq("facility_assets.facility_id",site).eq("status",state));
    try {
      const [assets, visits, plans, states, building, ratings] = await Promise.all([
        exact(client.from("facility_assets").select("id",ids).eq("organization_id",org).eq("facility_id",site)),
        exact(client.from("facility_visits").select("id,facility_work_orders!inner(facility_assets!inner(facility_id))",ids)
          .eq("organization_id",org).eq("facility_work_orders.facility_assets.facility_id",site)),
        exact(client.from("facility_pm_plans").select("id",ids).eq("organization_id",org).eq("facility_id",site).is("paused_at",null)),
        Promise.all(stages.map(([id])=>orderCount(id))),
        client.rpc("field_building_read",{p_site:site}),
        client.from("field_form_records").select("answers,field_form_reviews!field_form_reviews_record_id_fkey!inner(decision,reviewed_at)")
          .eq("organization_id",org).eq("facility_id",site).eq("code","F17").eq("field_form_reviews.decision","accepted")
          .order("submitted_at",{ascending:false}).order("id").limit(10)
      ]);
      if (token!==sequence) return;
      const profile = card(t("حقائق المبنى المعتمدة","Verified building facts"));
      const dl = node("dl");
      for(const [key,ar,en] of facts) dl.append(node("dt",t(ar,en)),node("dd",building.error ? unavailable() : approvedFact(building.data,key)));
      profile.append(dl);
      const work = card(t("أوامر العمل حسب الحالة","Work orders by current status"));
      const max = Math.max(...states.filter(Number.isFinite),0);
      stages.forEach(([,ar,en],i)=>work.append(meter(t(ar,en),states[i],max)));
      work.append(node("p",t("كل الفترات · الأصول المسجلة","All time · registered assets")+" "+(assets??unavailable())+" · "+t("الزيارات","visits")+" "+(visits??unavailable())+" · "+t("خطط الصيانة الدورية غير الموقوفة","unpaused maintenance plans")+" "+(plans??unavailable())));
      const vendors = card(t("تقييمات الموردين المعتمدة","Accepted supplier assessments"));
      vendors.append(node("p",t("آخر عشرة تقييمات معتمدة حسب تاريخ تقديم النموذج F17. لكل تقييم فترة مستقلة ودرجات من 100.","Up to ten accepted F17 assessments by submission date. Each has its own period and scores out of 100.")));
      if (ratings.error) vendors.append(node("p",unavailable()));
      else if (!ratings.data.length) vendors.append(node("p",t("لا يوجد تقييم معتمد لهذه المنشأة.","No accepted assessment for this facility.")));
      else for (const record of ratings.data) {
        const answers = record.answers || {};
        const details = node("details");
        details.append(node("summary",(answers.C8 || unavailable())+" · "+(answers.C9 || unavailable())));
        for(const [key,ar,en] of dimensions) details.append(meter(t(ar,en),rating(answers[key]),100));
        vendors.append(details);
      }
      grid.replaceChildren(profile,work,vendors);
      status.textContent = t("وقت القراءة بتوقيت الرياض","Read at Riyadh time")+" · "+new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}).format(new Date());
    } catch {
      if(token===sequence) status.textContent=t("تعذرت قراءة مؤشرات المبنى.","Building metrics could not be read.");
    }
  }
  select.addEventListener("change",showSite);
  return async function setOrganization(org) {
    const token = ++sequence;
    currentOrg = org;
    void showReputation("","");
    void showReports("","");
    void showExecutive("","");
    void showEngineering("","");
    void showEvidence("","");
    void showResourceFinance("","");
    select.replaceChildren();
    grid.replaceChildren();
    status.textContent = "";
    if(!org) return;
    try {
      const all=[];
      for(let page=0;;page++) {
        const {data,error}=await client.from("facilities").select("id,name").eq("organization_id",org).order("name").order("id").range(page*100,page*100+99);
        if(token!==sequence) return;
        if(error) throw error;
        all.push(...data);
        if(data.length<100) break;
      }
      select.replaceChildren(...all.map(site=>new Option(site.name,site.id)));
      if(all.length) await showSite();
      else status.textContent=t("لا توجد مبانٍ ظاهرة لهذه المؤسسة.","No buildings visible for this organization.");
    } catch {
      if(token===sequence) status.textContent=t("تعذرت قراءة قائمة المباني.","The building list could not be read.");
    }
  };
}
