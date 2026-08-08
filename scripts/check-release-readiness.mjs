import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { articles, categories } from "../content/articles-ar-en.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const checks = [];
const assert = (condition, message) => {
  checks.push(message);
  if (!condition) failures.push(message);
};
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

const releaseTextFiles = [];
const collectTextFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "assets", "command-center", "docs", "node_modules", "outputs", "scripts"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collectTextFiles(absolute);
    else if (/\.(?:html|js|mjs|json|md)$/i.test(entry.name)) releaseTextFiles.push(absolute);
  }
};
collectTextFiles(root);
const unevidencedLicenceClaim = /بيت خبرة سعودي مرخص|مرخص للاستشارات السياحية|Saudi-licensed tourism advisory house|licensed Saudi tourism advisory house/i;
assert(!releaseTextFiles.some((file) => unevidencedLicenceClaim.test(fs.readFileSync(file, "utf8"))), "Public release contains no unevidenced licensing claim");

assert(articles.length === 40, "Content data contains exactly 40 articles");
assert(new Set(articles.map((x) => x.slug)).size === 40, "All article slugs are unique");
assert(new Set(articles.map((x) => x.titleAr)).size === 40, "All Arabic titles are unique");
assert(new Set(articles.map((x) => x.titleEn)).size === 40, "All English titles are unique");
for (const cat of categories) assert(articles.filter((x) => x.category === cat.id).length === 8, `Category ${cat.id} contains 8 articles`);

const blocked = /\b(?:lorem|ipsum|todo|tbd|fixme|coming soon)\b/i;
for (const article of articles) {
  for (const lang of ["ar", "en"]) {
    const relative = `${lang === "ar" ? "" : "en/"}insights/${article.slug}/index.html`;
    assert(exists(relative), `${relative} exists`);
    if (!exists(relative)) continue;
    const html = read(relative);
    const text = visible(html);
    assert(text.split(/\s+/).length >= 650, `${relative} has substantial editorial depth`);
    assert(!blocked.test(text), `${relative} contains no placeholder language`);
    assert(html.includes('type="application/ld+json"'), `${relative} includes structured data`);
    assert(html.includes('rel="canonical"'), `${relative} includes a canonical URL`);
    assert((html.match(/hreflang=/g) || []).length === 3, `${relative} includes bilingual hreflang links`);
    assert(html.includes('class="osoul-source-list"'), `${relative} includes source references`);
    assert(html.includes('/site-hostinger-v14.js'), `${relative} loads the v14 site runtime`);
    if (lang === "en") {
      const arabicChars = (text.match(/[\u0600-\u06ff]/g) || []).length;
      assert(arabicChars <= 20, `${relative} has no untranslated Arabic copy beyond the language switch`);
    }
  }
}

for (const [relative, lang] of [["insights/index.html", "ar"], ["en/insights/index.html", "en"]]) {
  const html = read(relative);
  assert((html.match(/data-article-card/g) || []).length === 40, `${relative} displays exactly 40 cards`);
  assert((html.match(/data-category-filter=/g) || []).length === 6, `${relative} exposes all five filters plus All`);
  assert(html.includes("/insights-v14.js"), `${relative} loads search and filtering`);
  assert(html.includes(`lang="${lang === "ar" ? "ar-SA" : "en-SA"}"`), `${relative} declares the correct language`);
}

const englishCore = ["en/index.html", "en/solutions/index.html", "en/outputs/index.html", "en/about/index.html", "en/scenarios/index.html", "en/contact/index.html", "en/privacy/index.html", "en/terms/index.html", "en/accessibility/index.html", "en/thank-you/index.html"];
for (const relative of englishCore) {
  assert(exists(relative), `${relative} exists`);
  const html = read(relative);
  assert(html.includes('lang="en-SA"'), `${relative} declares English`);
  assert(html.includes('hreflang="ar-SA"'), `${relative} links to an Arabic alternate`);
  const arabicChars = (visible(html).match(/[\u0600-\u06ff]/g) || []).length;
  assert(arabicChars <= 20, `${relative} contains no untranslated Arabic copy beyond the switch`);
}

const form = read("en/contact/index.html");
const formNames = ["form_name", "language", "asset_type", "city", "stage", "opening_target", "units", "primary_gap", "urgency", "documents", "requested_support", "name", "organization", "email", "phone", "consent", "website"];
for (const field of formNames) assert(form.includes(`name="${field}"`), `English form includes ${field}`);
assert(form.includes('name="language" value="en"'), "English form identifies its return language");

const handler = read("submit.php");
assert(handler.includes("$contactPath = $isEnglish ? '/en/contact/' : '/contact/';"), "Form handler supports English validation redirects");
assert(handler.includes("$thankYouPath = $isEnglish ? '/en/thank-you/' : '/thank-you/';"), "Form handler supports English success redirects");
assert(handler.includes("$description = post_value('description', 2000);"), "Form handler includes the optional project context in the email");

const sitemap = read("sitemap.xml");
assert((sitemap.match(/<url>/g) || []).length === 101, "Sitemap contains 101 public URLs");
assert((sitemap.match(/\/insights\//g) || []).length === 82, "Sitemap contains both library indexes and 80 article URLs");

for (const asset of ["site-v14.css", "site-hostinger-v14.js", "site-hostinger-v13.js", "insights-v14.js", "brand/osool-mark-v8.svg", "images/hero-riyadh-v8.webp"]) assert(exists(asset), `${asset} exists`);
const css = read("site-v14.css");
assert((css.match(/{/g) || []).length === (css.match(/}/g) || []).length, "site-v14.css has balanced braces");
assert(css.includes("prefers-reduced-motion"), "site-v14.css supports reduced motion");
assert(css.includes(":focus-visible"), "site-v14.css provides visible keyboard focus");
assert(css.includes("--osoul-font-ar"), "site-v14.css defines an Arabic font stack");

if (failures.length) {
  console.error(`FAIL: ${failures.length} of ${checks.length} checks failed`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`PASS: ${checks.length} release-readiness assertions succeeded.`);
