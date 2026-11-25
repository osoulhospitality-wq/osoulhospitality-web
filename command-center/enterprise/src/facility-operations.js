const stages = { open: "مفتوح", in_progress: "قيد التنفيذ", completed: "مكتمل" };

function optionList(select, rows, label) {
  const previous = select.value;
  const options = rows.map((row) => new Option(label(row), row.id));
  select.replaceChildren(new Option("اختر", ""), ...options);
  if (rows.some((row) => row.id === previous)) select.value = previous;
}

export function setupFacilityOperations(client) {
  const panel = document.querySelector("#facility-operations");
  const organization = document.querySelector("#organization-select");
  const status = document.querySelector("#facility-status");
  const list = document.querySelector("#facility-work-orders");
  const forms = [
    ["facility-form", "facilities", ["name"]],
    ["asset-form", "facility_assets", ["facility_id", "asset_code", "name"]],
    ["work-order-form", "facility_work_orders", ["asset_id", "summary"]],
    ["visit-form", "facility_visits", ["work_order_id", "findings"]]
  ].map(([id, table, keys]) => ({ form: document.getElementById(id), table, keys }));
  let generation = 0;

  async function read(table, fields, organizationId) {
    const { data, error } = await client.from(table).select(fields)
      .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  }

  async function refresh() {
    if (!panel.open || !organization.value) return;
    const request = ++generation;
    const organizationId = organization.value;
    try {
      const [facilities, assets, orders, visits] = await Promise.all([
        read("facilities", "id,name", organizationId),
        read("facility_assets", "id,name,asset_code", organizationId),
        read("facility_work_orders", "id,summary,status,completed_at", organizationId),
        read("facility_visits", "id,work_order_id,findings", organizationId)
      ]);
      if (request !== generation || organizationId !== organization.value) return;
      optionList(forms[1].form.elements.facility_id, facilities, (row) => row.name);
      optionList(forms[2].form.elements.asset_id, assets, (row) => row.asset_code + " • " + row.name);
      optionList(forms[3].form.elements.work_order_id, orders.filter((row) => row.status === "in_progress"), (row) => row.summary);
      list.replaceChildren(...orders.map((order) => {
        const item = document.createElement("li");
        item.textContent = order.summary + " — " + stages[order.status];
        for (const visit of visits.filter((row) => row.work_order_id === order.id)) {
          const details = document.createElement("p");
          details.textContent = visit.findings;
          item.append(details);
        }
        if (order.status !== "completed") {
          const advance = document.createElement("button");
          advance.type = "button";
          advance.textContent = order.status === "open" ? "بدء التنفيذ" : "اعتماد الإغلاق";
          advance.addEventListener("click", async () => {
            advance.disabled = true;
            const { data, error } = await client.from("facility_work_orders")
              .update({ status: order.status === "open" ? "in_progress" : "completed" })
              .eq("organization_id", organizationId).eq("id", order.id).eq("status", order.status)
              .select("id").maybeSingle();
            if (organizationId === organization.value) {
              status.textContent = error || !data ? "تعذر تحديث الأمر. تحقّق من الصلاحية وحالة الأمر والزيارة." : "تم تحديث أمر العمل.";
              await refresh();
            }
            advance.disabled = false;
          });
          item.append(advance);
        }
        return item;
      }));
    } catch {
      if (request === generation) status.textContent = "تعذر تحميل بيانات إدارة المرافق.";
    }
  }

  for (const { form, table, keys } of forms) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!panel.open || !organization.value) return;
      const organizationId = organization.value;
      const values = new FormData(form);
      const payload = Object.fromEntries(keys.map((key) => [key, String(values.get(key) ?? "").trim()]));
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const { error } = await client.from(table).insert({ organization_id: organizationId, ...payload });
        if (error) throw error;
        if (organizationId === organization.value) {
          form.reset();
          status.textContent = "تم الحفظ.";
          await refresh();
        }
      } catch {
        if (organizationId === organization.value) status.textContent = "تعذر الحفظ. تحقّق من الصلاحية والبيانات المدخلة.";
      } finally {
        button.disabled = false;
      }
    });
  }
  organization.addEventListener("change", () => {
    panel.open = false;
    list.replaceChildren();
    for (const { form } of forms) {
      form.reset();
      for (const select of form.querySelectorAll("select")) select.replaceChildren(new Option("اختر", ""));
    }
    status.textContent = "";
  });
  panel.addEventListener("toggle", refresh);
}
