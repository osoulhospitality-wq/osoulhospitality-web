// Browser check for the owner decision card and its evidence register.
// Run manually: node automation/browser/decision-card.check.mjs
// Uses synthetic rows only and a local Chromium. Prints the screenshot folder.
import { build } from "esbuild";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const dir = await mkdtemp(path.join(tmpdir(), "decision-card-"));
const entry = path.join(dir, "entry.mjs");

const plansFor = (site, count) => Array.from({length: count}, (_, i) => ({
  id: `${site}-plan-${String(i + 1).padStart(2, "0")}`, organization_id: "org-a", facility_id: site,
  task: `Filter service ${i + 1}`, next_due_on: `2026-11-${String(1 + (i % 20)).padStart(2, "0")}`, paused_at: null,
  source_reference: "SRC", facility_assets: {asset_code: "HVAC-3", name: "Chiller 3"}
}));

await writeFile(entry, `
import { setupExecutiveOverview } from ${JSON.stringify(path.join(repo, "command-center/enterprise/src/executive-overview.js"))};
import { fakeSupabase } from ${JSON.stringify(path.join(repo, "automation/tests/support/fake-supabase.mjs"))};
const plansFor = ${plansFor.toString()};
const scenario = new URLSearchParams(location.search).get("scenario") || "mixed";
const quiet = scenario === "zero";
const tables = {
  facility_pm_plans: quiet ? [] : [...plansFor("site-a", 12), ...plansFor("site-b", 1)],
  facility_pm_occurrences: quiet ? [] : [{organization_id:"org-a",facility_id:"site-a",due_on:"2026-11-02",work_order_id:"wo-1",plan_id:"p",facility_work_orders:{summary:"Chiller service",status:"open"}}],
  field_form_records: quiet ? [] : [{id:"rec-7",organization_id:"org-a",facility_id:"site-a",status:"submitted",code:"F17",submitted_at:"2026-11-27T10:00:00Z",field_form_reviews:[]}]
};
const failTables = scenario === "all-failed" ? ["facility_pm_plans","facility_pm_occurrences","field_form_records"]
  : scenario === "partial" ? ["facility_pm_plans"] : [];
const render = setupExecutiveOverview(fakeSupabase(tables, {failTables}), document.querySelector("#host"));
window.__select = site => render("org-a", site);
render("org-a", "site-a").then(() => { document.body.dataset.ready = "1"; });
`, "utf8");
await build({entryPoints: [entry], bundle: true, format: "iife", platform: "browser", target: "es2020",
  outfile: path.join(dir, "harness.js"), logLevel: "warning"});

const css = pathToFileURL(path.join(repo, "command-center/enterprise/app.css")).href;
const pageFor = lang => `<!doctype html><html lang="${lang}" dir="${lang.startsWith("en") ? "ltr" : "rtl"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${css}"></head>
<body style="margin:0;padding:16px"><div id="host"></div><script src="harness.js"></script></body></html>`;

let playwright;
try { playwright = await import("playwright"); } catch { playwright = createRequire(import.meta.url)("playwright"); }
const browser = await playwright.chromium.launch();
const failures = [];
const expect = (ok, message) => { if (!ok) failures.push(message); };

async function open(lang, scenario, width) {
  const file = path.join(dir, `${lang}-${scenario}-${width}.html`);
  await writeFile(file, pageFor(lang), "utf8");
  const page = await browser.newPage({viewport: {width, height: 900}});
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(pathToFileURL(file).href + `?scenario=${scenario}`);
  await page.waitForSelector("body[data-ready='1']", {timeout: 10000});
  return {page, errors};
}

for (const lang of ["ar-SA", "en-SA"]) {
  for (const width of [390, 1280]) {
    for (const scenario of ["mixed", "zero", "all-failed", "partial"]) {
      const {page, errors} = await open(lang, scenario, width);
      const card = await page.textContent("#fm-decision-today");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const tag = `${lang} ${scenario} ${width}`;
      expect(!overflow, `${tag}: horizontal overflow`);
      expect(errors.length === 0, `${tag}: page errors ${errors.join("; ")}`);
      if (scenario === "all-failed") expect(/تعذر تحديد القرارات|Decisions could not be determined/.test(card), `${tag}: all-failed summary`);
      if (scenario === "partial") expect(/لا تُعد بنوده|are not zero/.test(card), `${tag}: partial summary`);
      if (scenario === "zero") expect(/لا توجد بنود|No items need/.test(card), `${tag}: zero summary`);
      if (scenario === "mixed") {
        expect(/تعذر|Unverified/.test(card) === false, `${tag}: mixed scenario should have no unverified source`);
      }
      if (scenario === "mixed" && width === 390) {
        // Keyboard only: Tab to the plans action, Enter opens and loads the register.
        const plansButton = page.locator("#fm-decision-today button[aria-controls='fm-overdue-plans']");
        await plansButton.focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.getElementById("fm-overdue-plans").open);
        await page.waitForFunction(() => document.querySelectorAll("#fm-overdue-plans li").length === 10);
        const status = await page.textContent("#fm-overdue-plans [role=status]");
        expect(/(١٠|10) (من أصل|of) (١٢|12)/.test(status), `${tag}: register total text: ${status}`);
        const more = page.locator("#fm-overdue-plans button");
        await more.focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelectorAll("#fm-overdue-plans li").length === 12);
        // Facility selection: switching to site-b must replace the register and card, not keep site-a rows.
        await page.evaluate(() => window.__select("site-b"));
        await page.waitForFunction(() => document.querySelectorAll("#fm-overdue-plans li").length === 0
          && !document.getElementById("fm-overdue-plans").open);
        const register = await page.evaluate(() => ({open: document.getElementById("fm-overdue-plans").open,
          rows: document.querySelectorAll("#fm-overdue-plans li").length}));
        expect(register.open === false && register.rows === 0, `${tag}: register not reset after facility switch`);
        await page.locator("#fm-decision-today button[aria-controls='fm-overdue-plans']").focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelectorAll("#fm-overdue-plans li").length === 1);
        const siteBRow = await page.textContent("#fm-overdue-plans li");
        expect(siteBRow.includes("site-b-plan-01") && !siteBRow.includes("site-a-plan"), `${tag}: site-b register row missing or wrong site`);
      }
      await page.screenshot({path: path.join(dir, `${lang}-${scenario}-${width}.png`), fullPage: true});
      await page.close();
    }
  }
}
await browser.close();
console.log(`screenshots: ${dir}`);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("decision card browser check: PASS");
