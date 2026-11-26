// Keep displayed spreadsheet values as text even when a source label looks like a formula.
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

const factLabels = {
  floors_above:"الأدوار فوق الأرض / Above-ground floors", basements:"أدوار البدروم / Basements",
  built_area_m2:"المساحة المبنية / Built area m²",land_area_m2:"مساحة الأرض / Land area m²",
  lifts:"المصاعد / Lifts",units:"الوحدات / Units",staff_total:"إجمالي العاملين / Staff count",
  staff_breakdown:"توزيع العاملين / Staff breakdown",address:"العنوان / Address",property_type:"نوع المنشأة / Property type",
  inspection_note:"ملاحظة معاينة / Survey note",category:"الفئة / Category",location:"الموقع / Location",
  manufacturer:"المصنع / Manufacturer",model:"الطراز / Model",serial:"الرقم التسلسلي / Serial",condition:"الحالة / Condition"
};

// Each value retains every independently verified source on the most recent observation date.
// Inspection notes are distinct dated observations, even when they have the same date.
function currentFacts(records) {
  const groups = new Map();
  for (const record of records) {
    const key = JSON.stringify([record.asset_id, record.fact_key, record.fact_key === "inspection_note" ? record.id : null]);
    const group = groups.get(key);
    if (!group || record.observed_on > group[0].observed_on) groups.set(key, [record]);
    else if (record.observed_on === group[0].observed_on) group.push(record);
  }
  return [...groups.values()];
}

export async function exportFacilityDossier(client, orgId, facilityId, brief, isCurrent) {
  if (!brief || !orgId || !facilityId || !isCurrent()) return;
  const scoped = (table, fields) => client.from(table).select("organization_id,facility_id," + fields)
    .eq("organization_id", orgId).eq("facility_id", facilityId);
  async function pages(query, hasScope = true) {
    const result = [];
    for (let start = 0; isCurrent(); start += 100) {
      const {data, error} = await query().range(start, start + 99);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Invalid dossier response");
      if (hasScope && data.some(row => row.organization_id !== orgId || row.facility_id !== facilityId)) {
        throw new Error("Dossier scope mismatch");
      }
      result.push(...data);
      if (data.length < 100) break;
    }
    return result;
  }
  const {data: site, error} = await client.from("facilities").select("id,name,organization_id")
    .eq("organization_id", orgId).eq("id", facilityId).single();
  if (error) throw error;
  if (!isCurrent()) return;
  if (!site || site.id !== facilityId || site.organization_id !== orgId) throw new Error("Dossier site mismatch");
  const [facts, assets, plans, followups, active] = await Promise.all([
    pages(() => scoped("facility_memory_records","id,asset_id,fact_key,fact_value,source_ref,observed_on,verified_at")
      .not("verified_at","is",null).order("id")),
    pages(() => scoped("facility_assets","id,name,asset_code,scan_token").order("id")),
    pages(() => scoped("facility_pm_plans","id,asset_id,task,period_count,period_unit,next_due_on,source_reference,source_date")
      .is("paused_at",null).order("id")),
    pages(() => client.rpc("facility_review_followups",{p_org:orgId,p_facility:facilityId})
      .order("due_on").order("round_id").order("topic"),false),
    pages(() => scoped("facility_review_items","round_id,topic,decision_note,follow_up_on,facility_review_rounds!inner(closed_at)")
      .eq("state","follow_up").is("facility_review_rounds.closed_at",null).order("round_id").order("topic"))
  ]);
  if (!isCurrent()) return;
  const rows = [["المنشأة / Property","معرف المنشأة / Facility ID","الفئة / Section","نوع السجل / Field","معرّف السجل / Record ID",
    "معرّف الأصل / Asset ID","رمز الأصل / Asset code","رمز المسح / Scan token","القيمة / Value",
    "المصدر / Source","تاريخ المصدر / As of","الدورية / Interval","الاستحقاق / Due","الحالة / Status"]];
  const add = (...values) => rows.push([site.name,facilityId,...values]);
  add("المنشأة / Facility","الاسم / Name",facilityId,"","","",site.name,"facilities","","","","مسجل / Registered");
  for (const group of currentFacts(facts)) {
    const conflict = new Set(group.map(row=>row.fact_value)).size > 1;
    for (const row of group) add("ملف المعاينة / Survey",factLabels[row.fact_key] ?? row.fact_key,row.id,row.asset_id,"","",row.fact_value,
      row.source_ref,row.observed_on,"","",conflict?"مصادر متعارضة / Conflicting sources":"مصدر متحقق / Verified source");
  }
  for (const asset of assets) add("الأصول / Assets","أصل مسجل / Registered asset",asset.id,asset.id,asset.asset_code,asset.scan_token,asset.name,"facility_assets","","","","مسجل / Registered");
  for (const plan of plans) add("الصيانة الوقائية / PM","مهمة / Task",plan.id,plan.asset_id,"","",plan.task,plan.source_reference,
    plan.source_date,plan.period_count+" "+plan.period_unit,plan.next_due_on,"نشطة / Active");
  for (const row of followups) add("متابعة / Follow-up",row.topic,row.round_id,"","","",row.note,"facility_review_followups","","",row.due_on,"مفتوحة / Open");
  for (const row of active) add("متابعة / Follow-up",row.topic,row.round_id,"","","",row.decision_note,"facility_review_items","","",row.follow_up_on,"جولة جارية / Active round");
  const csv = rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
  if (!isCurrent()) return;
  const url = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "Osoul-Facility-"+facilityId.replace(/[^a-z0-9-]/gi,"_")+".csv";
    if (isCurrent()) link.click();
  } finally {
    setTimeout(()=>URL.revokeObjectURL(url),0);
  }
}
