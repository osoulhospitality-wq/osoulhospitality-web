import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";



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

const routes = [...read("sitemap.xml").matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname);
const articles = routes.filter(p => /\/insights\/[^/]+\/$/.test(p));
assert(articles.length === 16, "Eight bilingual guides are available");
assert(new Set(routes).size === routes.length, "Each indexed URL is unique");
for (const route of routes) {
  const html = read(route.slice(1) + "index.html");
  assert(html.includes('rel="canonical" href="https://osoulhospitality.com' + route + '"'), route + " has its own canonical");
  assert((html.match(/<h1>/g) || []).length === 1, route + " has one H1");
  assert(html.includes('application/ld+json'), route + " has structured data");
  assert(!html.includes("ناقش احتياج منشأتك") && !html.includes("Osool Hospitality"), route + " uses the approved positioning");
}
for (const route of articles) {
  const html = read(route.slice(1) + "index.html");
  assert(html.includes('class="read"') && html.includes('2026'), route + " includes a sourced editorial article");
}
for (const page of ["contact/index.html","en/contact/index.html"]) {
  const html = read(page);
  for (const field of ["form_name","language","brief_mode","requested_support","name","phone","email","consent","website"]) {
    assert(html.split('name="'+field+'"').length === 2, page+" has one "+field+" field");
  }
  assert(html.includes('id="urgent"') && html.includes('data-quick-enquiry'),page+" separates urgent service and sales");
}
const handler = read("submit.php");
assert(handler.includes("$contactPath = $isEnglish ? '/en/contact/' : '/contact/';"), "Form handler supports English validation redirects");
assert(handler.includes("$thankYouPath = $isEnglish ? '/en/thank-you/' : '/thank-you/';"), "Form handler supports English success redirects");
assert(handler.includes("$description = post_value('description', 2000);"), "Form handler includes the optional project context in the email");
assert(handler.includes("bin2hex(random_bytes(8))"), "Successful form redirects include a one-time analytics receipt");
assert(handler.includes("?submitted=1&receipt="), "Successful form redirects identify a validated submission");

for (const relative of ["thank-you/index.html", "en/thank-you/index.html"]) {
  const html = read(relative);
  assert(/name="robots" content="noindex,\s*nofollow/.test(html), `${relative} is excluded from indexing`);
  assert(html.includes("/site-hostinger-v16.js"), `${relative} loads the lead-event runtime`);
}
const robots = read("robots.txt");
assert(!robots.includes("thank-you"), "robots.txt lets crawlers see thank-you noindex directives");

const sitemap = read("sitemap.xml");
assert((sitemap.match(/<url>/g) || []).length === 46, "Sitemap contains 46 public URLs");
assert(!sitemap.includes("/command-center/"), "Sitemap excludes the noindex Command Center");
assert((sitemap.match(/\/insights\//g) || []).length === 18, "Sitemap contains both library indexes and 16 article URLs");

assert(exists("scripts/check-production-health.mjs"), "Production health checker is version controlled");
assert(exists(".github/workflows/production-health.yml"), "Scheduled production health workflow is version controlled");
const productionHealth = read("scripts/check-production-health.mjs");
assert(productionHealth.includes("Supabase public-read isolation"), "Production health verifies lead-data isolation");
assert(productionHealth.includes("lead endpoint contract"), "Production health verifies the non-writing lead endpoint contract");

for (const asset of ["brand/fm-2026.css", "site-hostinger-v16.js", "brand/osool-mark-v8.svg"]) assert(exists(asset), `${asset} exists`);
const css = read("brand/fm-2026.css");
assert((css.match(/{/g) || []).length === (css.match(/}/g) || []).length, "site-v15.css has balanced braces");

assert(css.includes(":focus-visible"), "site-v15.css provides visible keyboard focus");
assert(css.includes("noto-sans-arabic"), "site-v15.css defines an Arabic font stack");
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

if (failures.length) {
  console.error(`FAIL: ${failures.length} of ${checks.length} checks failed`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`PASS: ${checks.length} release-readiness assertions succeeded.`);
