import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = "https://osoulhospitality.com";
const urls = new Set([...fs.readFileSync(path.join(root, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname));
const failures = [];
for (const route of urls) {
  const english = route.startsWith("/en/");
  const arabicRoute = english ? route.slice(3) : route;
  const englishRoute = "/en" + arabicRoute;
  const counterpart = english ? arabicRoute : englishRoute;
  const html = fs.readFileSync(path.join(root, route, "index.html"), "utf8");
  const check = (ok, message) => { if (!ok) failures.push(route + " " + message); };
  check(urls.has(counterpart), "missing sitemap counterpart " + counterpart);
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || "";
  check(htmlTag.includes('dir="' + (english ? "ltr" : "rtl") + '"'), "wrong reading direction");
  const tags = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]);
  for (const [lang, target] of [["ar-SA", arabicRoute], ["en-SA", englishRoute], ["x-default", arabicRoute]]) {
    const matching = tags.filter(tag => tag.includes('hreflang="' + lang + '"'));
    check(matching.length === 1 && matching[0].includes('href="' + base + target + '"'), "incorrect " + lang + " alternate");
  }
  const switches = html.match(/<a\b[^>]+>\s*(?:EN|English|العربية)\s*<\/a>/g) || [];
  check(switches.length > 0 && switches.every(tag => tag.includes('href="' + counterpart + '"')), "language switch changes the page");
}
if (failures.length) throw new Error(failures.join("\n"));
console.log("Verified language direction, reciprocal metadata and language switches on " + urls.size + " sitemap pages.");
