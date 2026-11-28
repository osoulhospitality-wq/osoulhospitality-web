const localized = (ar, en) => document.documentElement.lang === "en" ? en : ar;
const panel = document.querySelector("#asset-scan");
const message = panel.querySelector("[role=status]");
const link = panel.querySelector("a");
const siteSelect = document.querySelector("#site");
const assignedDesk = document.querySelector("#desk");
const idPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
let scanVersion = 0;

function reset() {
  scanVersion++;
  link.hidden = true;
  link.removeAttribute("href");
  link.removeAttribute("data-site");
  message.textContent = "";
  for (const input of panel.querySelectorAll("input")) input.value = "";
}
function permittedSite(id) {
  return !assignedDesk.hidden && Array.from(siteSelect.options).find(option => option.value === id);
}
function target(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.origin !== location.origin || !["/field-forms/", "/en/field-forms/"].includes(url.pathname) || url.username || url.password) return null;
  const sites = url.searchParams.getAll("site"), assets = url.searchParams.getAll("asset");
  if (sites.length !== 1 || assets.length !== 1 || !idPattern.test(sites[0]) || !idPattern.test(assets[0])) return null;
  const site = permittedSite(sites[0]);
  if (!site) return null;
  const next = new URL(document.documentElement.lang === "en" ? "/en/field-forms/" : "/field-forms/", location.origin);
  next.searchParams.set("site", site.value);
  next.searchParams.set("asset", assets[0]);
  return { next, site };
}
async function readLabel(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const edge = Math.max(image.naturalWidth, image.naturalHeight);
    if (!edge) return null;
    const scale = Math.min(1, 1600 / edge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { default: decode } = await import("./vendor/jsqr-1.4.0.js");
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decode(pixels.data, pixels.width, pixels.height)?.data;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

for (const input of panel.querySelectorAll('input[type=file]')) {
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    reset();
    if (!file || assignedDesk.hidden) return;
    const version = scanVersion;
    if (file.size > 16 * 1024 * 1024) {
      message.textContent = localized("اختر صورة أصغر من ١٦ ميغابايت.", "Select an image up to 16 MB.");
      return;
    }
    message.textContent = localized("جارٍ قراءة الملصق…", "Reading label…");
    try {
      const value = await readLabel(file);
      if (scanVersion !== version || assignedDesk.hidden) return;
      const result = value && target(value);
      if (!result) {
        message.textContent = localized("تعذّر قراءة ملصق أصل لمنشأة مسندة إليك. صوّر الرمز كاملًا أو ابحث برمز الأصل.", "No assigned facility label found. Capture the whole code or search by asset code.");
        return;
      }
      link.href = result.next.href;
      link.dataset.site = result.site.value;
      link.hidden = false;
      message.textContent = result.site.textContent;
    } catch {
      if (scanVersion === version) message.textContent = localized("تعذرت قراءة الصورة. جرّب صورة JPEG أو PNG واضحة.", "Try a clear JPEG or PNG image.");
    }
  });
}
link.addEventListener("click", event => {
  if (!permittedSite(link.dataset.site)) { event.preventDefault(); reset(); }
});
siteSelect.addEventListener("change", reset);
new MutationObserver(() => { if (assignedDesk.hidden) reset(); }).observe(assignedDesk, { attributes: true, attributeFilter: ["hidden"] });
