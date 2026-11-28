function updateWorkspaceTitle() {
  const english = document.documentElement.lang === "en";
  const title = location.hash === "#decisions"
    ? (english ? "Operator decision desk" : "واجهة المشغّل – قرارات المنشأة")
    : (english ? "Technician workspace" : "نماذج الفني");
  document.querySelector("#workspace-title").textContent = title;
  document.title = title + (english ? " | Osoul Facilities Management" : " | أصول لإدارة المرافق");
}
updateWorkspaceTitle();
window.addEventListener("hashchange", updateWorkspaceTitle);

const picker = document.querySelector("#form-shortcut");
const search = document.querySelector("#search");
function chooseForm(code) {
  picker.value = code;
  search.value = code;
  search.dispatchEvent(new Event("input"));
}
picker.addEventListener("change", () => chooseForm(picker.value));
search.addEventListener("input", () => {
  picker.value = Array.from(picker.options).some(option => option.value === search.value) ? search.value : "";
});
const templates = document.querySelector("#template");
const requested = new URLSearchParams(location.search).get("form");
if (requested && Array.from(picker.options).some(option => option.value === requested)) {
  // The field app populates the list after authentication and facility selection.
  const observer = new MutationObserver(() => {
    if (!Array.from(templates.options).some(option => option.value === requested)) return;
    observer.disconnect();
    chooseForm(requested);
  });
  observer.observe(templates, { childList: true });
}

new MutationObserver(() => {
  if (!search.value) picker.value = "";
}).observe(templates, { childList: true });

document.querySelector("#field-shortcuts").addEventListener("click", event => {
  const button = event.target.closest("button[data-section]");
  if (!button) return;
  const section = document.getElementById(button.dataset.section);
  if (!section || section.closest("[hidden]")) return;
  const heading = section.querySelector("summary,h2");
  // The existing summary click loads the authorized records on demand.
  if (section.tagName === "DETAILS" && !section.open) heading.click();
  heading.tabIndex = -1;
  heading.focus();
  heading.scrollIntoView({ block: "start" });
});

document.querySelector("[data-field-language]").addEventListener("click", event => {
  const current = new URL(location.href);
  const target = new URL(event.currentTarget.href);
  target.search = "";
  for (const key of ["site", "asset", "form"]) {
    const values = current.searchParams.getAll(key);
    if (values.length === 1) target.searchParams.set(key, values[0]);
  }
  target.hash = current.hash;
  event.currentTarget.href = target.href;
});
