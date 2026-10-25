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
const unevidencedLicenceClaim = /بيت خبرة سعودي[^\n<]{0,80}مرخ[ّ]?ص|مرخ[ّ]?ص[^\n<]{0,60}للاستشارات السياحية|Saudi[^\n<]{0,80}licensed[^\n<]{0,80}(?:tourism|hospitality) advisory|licensed Saudi[^\n<]{0,80}(?:tourism|hospitality) advisory/i;
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
    assert(html.includes('/site-hostinger-v16.js'), `${relative} loads the v16 site runtime`);
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

const arabicCore = ["solutions", "outputs", "about", "scenarios", "contact", "privacy", "terms", "accessibility"];
for (const slug of arabicCore) {
  const relative = `${slug}/index.html`;
  const html = read(relative);
  const canonical = `https://osoulhospitality.com/${slug}/`;
  assert(html.includes(`<meta property="og:url" content="${canonical}"/>`), `${relative} has its own Open Graph URL`);
  assert(html.includes(`<link rel="canonical" href="${canonical}"/>`), `${relative} uses the final slash canonical`);
  assert((html.match(/hreflang=/g) || []).length === 3, `${relative} has reciprocal bilingual hreflang`);
  assert(html.includes(`hreflang="en-SA" href="https://osoulhospitality.com/en/${slug}/"`), `${relative} links to its English alternate`);
}

const form = read("en/contact/index.html");
const formNames = ["form_name", "language", "asset_type", "city", "stage", "opening_target", "units", "primary_gap", "urgency", "documents", "requested_support", "name", "organization", "email", "phone", "consent", "website"];
for (const field of formNames) assert(form.includes(`name="${field}"`), `English form includes ${field}`);
assert(form.includes('name="language" value="en"'), "English form identifies its return language");

const handler = read("submit.php");
assert(handler.includes("$contactPath = $isEnglish ? '/en/contact/' : '/contact/';"), "Form handler supports English validation redirects");
assert(handler.includes("$thankYouPath = $isEnglish ? '/en/thank-you/' : '/thank-you/';"), "Form handler supports English success redirects");
assert(handler.includes("$description = post_value('description', 2000);"), "Form handler includes the optional project context in the email");
assert(read("server/intake-pipeline.php").includes("bin2hex(random_bytes(8))") && handler.includes("$result[\'receipt\']"), "Successful form redirects reuse the stored one-time analytics receipt");
assert(handler.includes("?submitted=1&receipt="), "Successful form redirects identify a validated submission");

for (const relative of ["thank-you/index.html", "en/thank-you/index.html"]) {
  const html = read(relative);
  assert(/name="robots" content="noindex,\s*nofollow/.test(html), `${relative} is excluded from indexing`);
  assert(html.includes("/site-hostinger-v16.js"), `${relative} loads the lead-event runtime`);
}
const robots = read("robots.txt");
assert(!robots.includes("thank-you"), "robots.txt lets crawlers see thank-you noindex directives");

const sitemap = read("sitemap.xml");
assert((sitemap.match(/<url>/g) || []).length === 100, "Sitemap contains 100 public URLs");
assert(!sitemap.includes("/command-center/"), "Sitemap excludes the noindex Command Center");
assert((sitemap.match(/\/insights\//g) || []).length === 82, "Sitemap contains both library indexes and 80 article URLs");

assert(exists("scripts/check-production-health.mjs"), "Production health checker is version controlled");
assert(exists(".github/workflows/production-health.yml"), "Scheduled production health workflow is version controlled");
const productionHealth = read("scripts/check-production-health.mjs");
assert(productionHealth.includes("Supabase public-read isolation"), "Production health verifies lead-data isolation");
assert(productionHealth.includes("lead endpoint contract"), "Production health verifies the non-writing lead endpoint contract");

for (const asset of ["site-v15.css", "site-hostinger-v16.js", "site-hostinger-v13.js", "insights-v14.js", "brand/osool-mark-v8.svg", "images/hero-riyadh-v8.webp"]) assert(exists(asset), `${asset} exists`);
const css = read("site-v15.css");
assert((css.match(/{/g) || []).length === (css.match(/}/g) || []).length, "site-v15.css has balanced braces");
assert(css.includes("prefers-reduced-motion"), "site-v15.css supports reduced motion");
assert(css.includes(":focus-visible"), "site-v15.css provides visible keyboard focus");
assert(css.includes("--osoul-font-ar"), "site-v15.css defines an Arabic font stack");
const runtime = read("site-hostinger-v16.js");
assert(runtime.includes('HUBSPOT_PORTAL_ID = "149059794"'), "HubSpot analytics uses the verified portal ID");
assert(runtime.includes("hubspot-opt-in"), "HubSpot tracking is explicitly opt-in");
assert(runtime.includes("navigator.globalPrivacyControl"), "Analytics honors Global Privacy Control");
assert(runtime.includes('["doNotTrack"]'), "Analytics exposes a durable opt-out path");
assert(runtime.includes('["revokeCookieConsent"]'), "Analytics revokes HubSpot consent cookies");
assert(runtime.includes('window.gtag("event", "generate_lead"'), "GA4 receives the recommended generate_lead event");
assert(runtime.includes('window["ga-disable-" + GA4_MEASUREMENT_ID] = false'), "GA4 resumes immediately after renewed consent");
assert(css.includes(".osoul-consent-panel"), "Consent panel is styled responsively");
const headers = read(".htaccess");
assert(headers.includes("https://js-eu1.hs-scripts.com"), "CSP permits only the configured HubSpot tracking region");
assert(headers.includes("https://js-eu1.hs-analytics.net"), "CSP permits HubSpot analytics in the configured EU1 region");
assert(headers.includes("https://js-eu1.hscollectedforms.net"), "CSP permits consented HubSpot collected-forms code in EU1");
assert(headers.includes("https://js-eu1.hs-banner.com"), "CSP permits HubSpot consent-banner support code in EU1");
assert(headers.includes("https://*.hscollectedforms.net"), "CSP permits consented non-HubSpot form capture");
assert(headers.includes("https://fdkfxlvsluiqrgedokdm.supabase.co"), "CSP permits only the configured Supabase project");

for (const asset of [
  "command-center/enterprise/index.html",
  "command-center/enterprise/app.css",
  "command-center/enterprise/app.bundle.js",
  "command-center/enterprise/config.js",
  "command-center/enterprise/schema.sql"
]) assert(exists(asset), `${asset} exists`);
const commandCenterHtml = read("command-center/index.html");
const enterpriseHtml = read("command-center/enterprise/index.html");
const enterpriseBundle = read("command-center/enterprise/app.bundle.js");
const enterpriseConfig = read("command-center/enterprise/config.js");
const enterpriseSchema = read("command-center/enterprise/schema.sql");
assert(commandCenterHtml.includes('name="robots" content="noindex,nofollow,noarchive"'), "Command Center landing route is excluded from indexing");
assert(enterpriseHtml.includes('name="robots" content="noindex,nofollow,noarchive"'), "Enterprise route is excluded from indexing");
assert(enterpriseBundle.includes("challengeAndVerify"), "Enterprise client performs the MFA challenge");
assert(enterpriseBundle.includes("getAuthenticatorAssuranceLevel"), "Enterprise client verifies the AAL level");
assert(enterpriseSchema.includes("as restrictive for all to authenticated"), "Database MFA policy is restrictive");
assert(enterpriseSchema.includes("organization_owner_bootstrap"), "Tenant creation bootstraps an owner membership");
assert(enterpriseSchema.includes("prevent_org_reassignment"), "Tenant reassignment is blocked by database triggers");
assert(enterpriseSchema.includes("command-center-documents"), "Private document bucket is declared");
assert(!/service[_-]?role|secret[_-]?key/i.test(enterpriseConfig + enterpriseBundle), "Browser assets contain no service-role or secret key");

// Public pages are static HTML; stale React bootstrap must never overwrite releases.
for (const page of ["index.html", "contact/index.html", "solutions/index.html", "en/index.html", "en/contact/index.html", "en/solutions/index.html"]) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  assert(!html.includes('id="_R_"'), page + ": no stale hydration bootstrap");
  assert(!html.includes('__VINEXT_RSC'), page + ": no stale RSC payload");
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} of ${checks.length} checks failed`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`PASS: ${checks.length} release-readiness assertions succeeded.`);

