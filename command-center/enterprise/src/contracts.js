import { uiText as t } from "./locale.js";

import {setupClientPortfolio} from "./client-portfolio.js";

const statuses = {
  draft: t("مسودة", "Draft"), review: t("قيد المراجعة", "In review"),
  active: t("ساري", "Active"), expired: t("منتهي", "Expired"), terminated: t("منهى", "Terminated")
};

export function setupContracts(client) {
  const panel = document.querySelector("#contract-register");
  const records = panel.querySelector("ul");
  const status = panel.querySelector("[role=status]");
  const next = panel.querySelector("button");
  panel.insertBefore(document.createElement("h4"),status).textContent=t("عقود الموردين","Supplier agreements");
  const showClients=setupClientPortfolio(client);
  let organization = "", offset = 0, version = 0;
  async function load() {
    if (!panel.open || !organization) return;
    const request = ++version;
    next.hidden = true;
    status.textContent = t("جارٍ قراءة العقود…", "Loading contracts…");
    try {
      const { data, error } = await client.from("contracts").select("id,name,status,building,end_date")
        .eq("organization_id", organization).order("name").order("id").range(offset, offset + 20);
      if (request !== version) return;
      if (error) throw error;
      const rows = data.slice(0, 20);
      for (const row of rows) {
        const item = document.createElement("li");
        const expiry = row.end_date && (t("ينتهي في ", "Ends ") + row.end_date);
        item.textContent = [row.name, statuses[row.status] || row.status, row.building, expiry].filter(Boolean).join(" · ");
        records.append(item);
      }
      offset += rows.length;
      next.hidden = data.length <= 20;
      status.textContent = offset ? "" : t("لا تظهر عقود موردين لهذه المؤسسة ضمن صلاحيات حسابك.", "No supplier agreements are visible for this organization.");
    } catch {
      if (request !== version) return;
      status.textContent = t("تعذرت قراءة العقود. أعد المحاولة.", "Contracts could not be loaded. Try again.");
      next.hidden = false;
    }
  }
  next.addEventListener("click", load);
  panel.addEventListener("toggle", () => { if (panel.open && !offset) void load(); });
  return (id) => {
    version++;
    panel.open = false;
    organization = id;
    void showClients(id);
    offset = 0;
    records.replaceChildren();
    status.textContent = "";
    next.hidden = true;
  };
}
