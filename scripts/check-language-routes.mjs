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
  const portalRoutes = ["/command-center/enterprise/", "/en/command-center/enterprise/"];
  const portalLinks = [...html.matchAll(/<a\b[^>]*?\bhref=["']([^"']+)["']/gi)]
    .map(match => new URL(match[1], base + route))
    .filter(url => url.origin === base && portalRoutes.includes(url.pathname));
  if (route === "/" || route === "/en/") check(portalLinks.length > 0, "missing client sign-in link");
  const expectedPortal = portalRoutes[english ? 1 : 0];
  check(portalLinks.every(url => url.pathname === expectedPortal), "client sign-in should open " + expectedPortal);
  const switches = html.match(/<a\b[^>]+>\s*(?:EN|English|العربية)\s*<\/a>/g) || [];
  check(switches.length > 0 && switches.every(tag => tag.includes('href="' + counterpart + '"')), "language switch changes the page");
}
for (const prefix of ["", "/en"]) {
  const login = fs.readFileSync(path.join(root, prefix, "login/index.html"), "utf8");
  const owner = fs.readFileSync(path.join(root, prefix, "command-center/enterprise/index.html"), "utf8");
  for (const href of [prefix + "/command-center/enterprise/", prefix + "/field-forms/", prefix + "/field-forms/#decisions"]) {
    if (!login.includes('href="' + href + '"')) failures.push(prefix + "/login/ missing " + href);
  }
  if (!owner.includes('href="' + prefix + '/field-forms/"')) failures.push(prefix + " owner portal missing field link");
  if (/https?:\/\/[^"\s]*(?:chatgpt\.site|chatgpt\.com)/i.test(login + owner)) {
    failures.push(prefix + " workspace redirects off the Osoul domain");
  }
}
if (failures.length) throw new Error(failures.join("\n"));
console.log("Verified language direction, reciprocal metadata and client sign-in and language links on " + urls.size + " sitemap pages.");
