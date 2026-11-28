function updateWorkspaceTitle() {
  const title = location.hash === "#decisions" ? "واجهة المشغّل – قرارات المنشأة" : "نماذج الفني";
  document.querySelector("#workspace-title").textContent = title;
  document.title = title + " | أصول لإدارة المرافق";
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
