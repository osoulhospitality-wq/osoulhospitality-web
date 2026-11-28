import {facilityCouncil} from "../../../automation/corporation/facility-council.mjs";
import names from "./council-names.json" with {type:"json"};
import {uiText as t} from "./locale.js";

export function mountAgentActivity(portfolio, refreshPortfolio) {
  const panel = document.createElement("details");
  const caption = document.createElement("summary");
  caption.textContent = t("مجلس دراقون واختصاصات المراجعة", "DRAQON mandates and independent reviewers");
  const select = document.createElement("select");
  const label = document.createElement("label");
  label.append(t("الاختصاص ", "Mandate "), select);
  for (const entry of facilityCouncil) {
    const agent = names[entry.lead];
    select.add(new Option(t(agent.nameAr, agent.name), entry.topic));
  }
  const status = document.createElement("p");
  const action = document.createElement("button");
  action.type = "button";
  function render() {
    const entry = facilityCouncil.find(row => row.topic === select.value);
    if (!entry) return;
    const reviewer = names[entry.reviewer];
    const hasReport = ["operations", "finance"].includes(entry.topic);
    status.textContent = t("المراجع المستقل ", "Independent reviewer ") + t(reviewer.nameAr, reviewer.name) + " · " +
      (hasReport ? t("يتاح تحليل سجلات المؤسسة عند الطلب.", "An on-demand analysis of organization records is available.")
                 : t("التكليف متاح للإعداد والمراجعة. التشغيل الذاتي المستمر غير متحقق.", "Available for preparation and review. Continuous autonomous execution is unverified."));
    action.hidden = !hasReport;
    action.textContent = entry.topic === "finance" ? t("فتح قراءة العقود والأسعار", "Open contract and price analysis")
                                                  : t("تحديث قراءة أوامر العمل", "Refresh work-order analysis");
  }
  action.onclick = () => {
    if (portfolio.hidden || !portfolio.open) return;
    if (select.value === "operations") { refreshPortfolio(); return; }
    if (select.value === "finance") {
      const target = document.getElementById("commercial-intelligence");
      if (target) { target.open = true; target.scrollIntoView({block:"start"}); }
    }
  };
  select.onchange = render;
  panel.append(caption,label,status,action);
  portfolio.append(panel);
  render();
  return () => { panel.open = false; select.selectedIndex = 0; render(); };
}
