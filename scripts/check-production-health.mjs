import fs from "node:fs";

const baseUrl = (process.env.OSOUL_BASE_URL || "https://osoulhospitality.com").replace(/\/$/, "");
const supabaseUrl = (process.env.SUPABASE_URL || "https://fdkfxlvsluiqrgedokdm.supabase.co").replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_hX1nbly1AzEtBhCUWoyrgw_9EU2Bxwr";
const timeoutMs = Number(process.env.HEALTH_TIMEOUT_MS || 15_000);
const startedAt = new Date().toISOString();
const checks = [];

async function request(path, options = {}) {
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const response = await fetch(url, {
    redirect: options.redirect || "follow",
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = options.readBody === false ? "" : await response.text();
  return { response, body, url };
}

async function check(name, fn) {
  const began = Date.now();
  try {
    const detail = await fn();
    checks.push({ name, status: "pass", durationMs: Date.now() - began, detail: detail || "OK" });
  } catch (error) {
    checks.push({ name, status: "fail", durationMs: Date.now() - began, detail: error instanceof Error ? error.message : String(error) });
  }
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

await check("critical pages", async () => {
  const paths = ["/", "/solutions/", "/outputs/", "/about/", "/scenarios/", "/insights/", "/contact/", "/privacy/", "/en/", "/en/contact/", "/en/privacy/"];
  const results = await Promise.all(paths.map(async (path) => {
    const { response, body } = await request(path);
    requireCondition(response.status === 200, `${path} returned ${response.status}`);
    requireCondition(/<title>[^<]+<\/title>/.test(body), `${path} has no title`);
    requireCondition(/<h1(?:\s[^>]*)?>/.test(body), `${path} has no H1`);
    return path;
  }));
  return `${results.length} critical routes returned complete HTML`;
});

await check("security headers", async () => {
  const { response } = await request("/", { readBody: false });
  const required = [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "x-frame-options",
  ];
  const missing = required.filter((header) => !response.headers.get(header));
  requireCondition(missing.length === 0, `missing: ${missing.join(", ")}`);
  return `${required.length} required headers present`;
});

await check("lead endpoint contract", async () => {
  const getResult = await request("/submit.php", { redirect: "manual" });
  requireCondition(getResult.response.status === 405, `GET returned ${getResult.response.status}, expected 405`);
  requireCondition(getResult.response.headers.get("allow") === "POST", "Allow: POST header missing");

  const body = new URLSearchParams({ form_name: "hospitality_readiness_brief", started_at: String(Date.now()) });
  const postResult = await request("/submit.php", {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: baseUrl,
      referer: `${baseUrl}/contact/`,
    },
    body,
  });
  requireCondition(postResult.response.status === 303, `invalid POST returned ${postResult.response.status}, expected 303`);
  const location = postResult.response.headers.get("location") || "";
  requireCondition(location.includes("status=security"), `invalid POST did not take the protected path: ${location}`);
  return "GET is rejected and a non-writing invalid POST follows the protected redirect";
});

await check("analytics runtime", async () => {
  const { response, body } = await request("/site-hostinger-v16.js");
  requireCondition(response.status === 200, `runtime returned ${response.status}`);
  requireCondition(body.includes('window.gtag("event", "generate_lead"'), "generate_lead event missing");
  requireCondition(body.includes("osoul_generate_lead_"), "lead-event deduplication missing");
  requireCondition(body.includes("navigator.globalPrivacyControl"), "GPC handling missing");
  return "consented lead measurement, deduplication, and GPC controls present";
});

await check("privacy notice", async () => {
  const { body } = await request("/privacy/");
  for (const expected of ["الإصدار 3.0", "Supabase", "HubSpot", "Google Analytics 4", "24 شهرًا"]) {
    requireCondition(body.includes(expected), `privacy notice missing ${expected}`);
  }
  return "version, processors, analytics, and retention are disclosed";
});

await check("indexing controls", async () => {
  const [sitemap, robots, thankYou, commandCenter, notFound] = await Promise.all([
    request("/sitemap.xml"),
    request("/robots.txt"),
    request("/thank-you/"),
    request("/command-center/"),
    request("/__osoul_health_missing__"),
  ]);
  const urlCount = (sitemap.body.match(/<url>/g) || []).length;
  requireCondition(urlCount === 100, `sitemap contains ${urlCount} URLs, expected 100`);
  requireCondition(!sitemap.body.includes("/command-center/"), "Command Center is exposed in sitemap");
  requireCondition(!/Disallow:\s*\/(?:en\/)?thank-you\//.test(robots.body), "robots.txt blocks a thank-you noindex page");
  requireCondition(/name="robots" content="noindex,\s*nofollow"/.test(thankYou.body), "thank-you noindex missing");
  requireCondition(commandCenter.body.includes('name="robots" content="noindex,nofollow,noarchive"'), "Command Center noindex missing");
  requireCondition(notFound.response.status === 404, `missing page returned ${notFound.response.status}`);
  requireCondition((notFound.body.match(/name="robots" content="noindex, follow"/g) || []).length === 1, "404 robots directive is missing or duplicated");
  return "sitemap, robots, private routes, thank-you pages, and 404 behavior are consistent";
});

await check("Supabase public-read isolation", async () => {
  const { response, body } = await request(`${supabaseUrl}/rest/v1/website_leads?select=id&limit=1`, {
    headers: { apikey: supabaseKey, authorization: `Bearer ${supabaseKey}` },
  });
  if (response.status === 200) {
    const rows = JSON.parse(body);
    requireCondition(Array.isArray(rows) && rows.length === 0, "anonymous role can read website lead rows");
    return "anonymous query returns zero rows under RLS";
  }
  requireCondition([401, 403].includes(response.status), `unexpected Data API status ${response.status}`);
  return `anonymous read rejected with ${response.status}`;
});

const finishedAt = new Date().toISOString();
const failed = checks.filter((item) => item.status === "fail");
const report = {
  status: failed.length === 0 ? "healthy" : "unhealthy",
  baseUrl,
  startedAt,
  finishedAt,
  checks,
};

const reportPath = process.env.HEALTH_REPORT_PATH;
if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const summary = [
  `## Production health: ${report.status === "healthy" ? "✅ healthy" : "❌ unhealthy"}`,
  "",
  `Target: ${baseUrl}`,
  "",
  "| Check | Result | Time | Detail |",
  "|---|---:|---:|---|",
  ...checks.map((item) => `| ${item.name} | ${item.status === "pass" ? "✅" : "❌"} | ${item.durationMs} ms | ${item.detail.replace(/\|/g, "\\|")} |`),
  "",
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);

if (failed.length > 0) process.exit(1);

