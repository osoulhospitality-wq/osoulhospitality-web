const box = document.querySelector(".osoul-service-search");
const input = box.querySelector("input");
const groups = document.querySelectorAll(".osoul-service-group");
const jumps = document.querySelector(".osoul-service-jumps");
const english = document.documentElement.lang.startsWith("en");
function normalize(text) {
  return text.toLowerCase().normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").trim();
}
function filterServices() {
  const query = normalize(input.value);
  let count = 0;
  for (const group of groups) {
    let matches = 0;
    for (const card of group.querySelectorAll(".osoul-service-card")) {
      const match = normalize(card.textContent).includes(query);
      // The catalog stylesheet sets display on cards, so use the inline override for filtered items.
      card.style.display = match ? "" : "none";
      if (match) matches++;
    }
    group.style.display = matches ? "" : "none";
    count += matches;
  }
  jumps.style.display = query ? "none" : "";
  box.querySelector("[role=status]").textContent = !query ? "" : count
    ? (english ? "Matching services: " : "عدد الخدمات المطابقة: ") + count
    : (english ? "No services match. Try another term." : "لا توجد خدمة مطابقة. جرّب كلمة أخرى.");
}
box.hidden = false;
input.addEventListener("input", filterServices);
