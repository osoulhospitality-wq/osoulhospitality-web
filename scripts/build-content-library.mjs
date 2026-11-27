import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../content/articles-ar-en.mjs";
import { examples } from "../content/insight-examples-ar-en.mjs";

import { facilityEvidence } from "../content/facility-evidence-ar-en.mjs";

const revisedOn = "2026-11-27";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const articlesBySlug = new Map(articles.map((article) => [article.slug, article]));

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function list(items, ordered = false) {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
}

function renderArticleBody(article, lang) {
  const ar = lang === "ar";
  const suffix = ar ? "Ar" : "En";
  const example = examples[article.slug]?.[ar ? 0 : 1];
  if (!example) throw new Error(`Missing ${lang} example for ${article.slug}`);

  const evidence = facilityEvidence[article.slug]?.[ar ? 0 : 1];
  if (!evidence) throw new Error(`Missing facilities evidence for ${article.slug}`);
  return [
    "<article class=\"osoul-article-body\">",
    `    <h2>${ar ? "مثال تطبيقي" : "Worked example"}</h2>`,
    `    <p class="lead">${escapeHtml(example)}</p>`,
    `    <h2>${ar ? "ما الذي تراجعه؟" : "What to check"}</h2>`,
    `    ${list(article[`diagnosis${suffix}`])}`,
    `    <h2>${ar ? "خطوات العمل" : "Steps to take"}</h2>`,
    `    ${list(article[`actions${suffix}`], true)}`,
    `    <h2>${ar ? "ما الذي تقيسه؟" : "What to measure"}</h2>`,
    `    ${list(article[`metrics${suffix}`])}`,
    `    <h2>${ar ? "اختبار عملي للمالك" : "An evidence check for the owner"}</h2>`,
    `    <p>${escapeHtml(evidence)}</p>`,
    `    <h2>${ar ? "أخطاء تتجنبها" : "Mistakes to avoid"}</h2>`,
    `    ${list(article[`mistakes${suffix}`])}`,
    `    <h2>${ar ? "المصادر والمراجع" : "Sources and references"}</h2>`,
    "",
  ].join("\n");
}

function replaceRequired(html, pattern, replacement, file) {
  if (!pattern.test(html)) throw new Error(`Expected content block missing in ${file}`);
  return html.replace(pattern, () => replacement);
}

function refreshCards(html, lang) {
  const suffix = lang === "ar" ? "Ar" : "En";
  return html.replace(/<article class="osoul-article-card"[\s\S]*?<\/article>/gu, (card) => {
    const slug = card.match(/href="\/(?:en\/)?insights\/([^/]+)\//u)?.[1];
    const article = articlesBySlug.get(slug);
    if (!article) throw new Error(`Unknown insight card: ${slug}`);
    const excerpt = escapeHtml(article[`excerpt${suffix}`]);
    const track = card.match(/<span class="category">([^<]*)<\/span>/u)?.[1] ?? "";
    const searchText = `${escapeHtml(article[`title${suffix}`])} ${excerpt} ${track}`;
    return card
      .replace(/data-search="[^"]*"/u, () => `data-search="${searchText}"`)
      .replace(/<p>[^<]*<\/p>/u, () => `<p>${excerpt}</p>`)
      .replace(/(<div class="card-meta">)<span>[^<]*<\/span>/u, "$1");
  });
}

function refreshDeck(html, article, lang, file) {
  const excerpt = article[lang === "ar" ? "excerptAr" : "excerptEn"];
  const escaped = escapeHtml(excerpt);
  const deck = replaceRequired(html, /<p class="osoul-article-deck">[^<]*<\/p>/u, `<p class="osoul-article-deck">${escaped}</p>`, file);
  return deck
    .replace(/(<meta (?:name|property)="(?:og:)?description" content=")[^"]*/gu, (_, prefix) => prefix + escaped)
    .replace(/<script type="application\/ld\+json">([^<]*)<\/script>/gu, (original, json) => {
      const data = JSON.parse(json);
      if (data["@type"] !== "Article") return original;
      data.description = excerpt;
      data.dateModified = revisedOn;
      return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
    });
}

function refreshArticle(html, article, lang, file) {
  const ar = lang === "ar";
  const body = renderArticleBody(article, lang);
  const words = body.replace(/<[^>]+>/g, " ").trim().split(/\s+/u).length;
  const minutes = Math.max(1, Math.ceil(words / (ar ? 160 : 190)));
  const readTime = ar ? (minutes === 1 ? "دقيقة قراءة" : minutes === 2 ? "دقيقتا قراءة" : `${minutes} دقائق قراءة`) : `${minutes} min read`;
  const byline = /(<div class="osoul-article-byline">[\s\S]*?<\/time><span>)[^<]*(<\/span><\/div>)/u;
  const sources = article.sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source[lang])}</a></li>`).join("");
  const withBody = replaceRequired(
    html,
    /<article class="osoul-article-body">[\s\S]*?<ol class="osoul-source-list">[\s\S]*?<\/ol>/u,
    `${body}<ol class="osoul-source-list">${sources}</ol>`,
    file,
  );
  if (!byline.test(withBody)) throw new Error(`Expected article byline missing in ${file}`);
  let revised = withBody.replace(byline, (_, start, end) => `${start}${readTime}${end}`);
  const aside = ar
    ? '<aside class="osoul-article-aside"><div class="osoul-aside-card"><h2>ما الذي يحتاج إلى متابعة في منشأتك؟</h2><p>اذكر الخدمة المتأثرة والمبنى المعني حتى نحدد نطاق العمل وطريقة التحقق من التنفيذ.</p><a href="/contact/">اطلب عرض خدمة</a></div></aside>'
    : '<aside class="osoul-article-aside"><div class="osoul-aside-card"><h2>Which service needs attention?</h2><p>Tell us which property and service are affected so we can define the work and agree how to verify delivery.</p><a href="/en/contact/">Request a service quote</a></div></aside>';
  revised = replaceRequired(revised, /<aside class="osoul-article-aside">[\s\S]*?<\/aside>/u, aside, file);
  revised = revised.replace(/(<div class="osoul-article-byline">[\s\S]*?<time datetime=")[^"]+">[^<]+/u, (_, start) =>
    start + revisedOn + '">' + (ar ? 'تحديث 27 نوفمبر 2026' : 'Updated 27 November 2026'));
  return refreshCards(refreshDeck(revised, article, lang, file), lang);
}

function refreshIndex(html, lang, file) {
  const ar = lang === "ar";
  const title = ar ? "أدلة لمُلّاك ومشغّلي منشآت الضيافة" : "Guides for hospitality owners and operators";
  const deck = ar
    ? "اختر القرار الذي تعمل عليه، من تجديد عقد خدمة إلى تفسير زيادة المصروفات. ستجد في كل دليل اختبارًا يمكنك تطبيقه على سجلات منشأتك لتقييم الأداء وتحديد ما يحتاج إلى تصحيح."
    : "Choose a decision, from renewing a service contract to explaining a rise in operating costs. Each guide includes an evidence check you can apply to your own property records.";
  const hero = `<section class="osoul-library-hero"><div class="shell"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(deck)}</p></div></section>`;
  return refreshCards(replaceRequired(html, /<section class="osoul-library-hero">[\s\S]*?<\/section>/u, hero, file), lang);
}

function update(relative, refresh) {
  const file = path.join(root, relative);
  const html = fs.readFileSync(file, "utf8");
  const revised = refresh(html, relative);
  const branded = revised.replaceAll("Osool Hospitality", "Osoul Hospitality")
    .replaceAll("Last updated: 8 August 2026", "Last updated: 27 November 2026")
    .replaceAll("آخر تحديث: 8 أغسطس 2026", "آخر تحديث: 27 نوفمبر 2026");
  if (branded !== html) fs.writeFileSync(file, branded, "utf8");
}

// The checked-in site owns the page layout, navigation, metadata and language
// links. Refresh only the editorial blocks on the Insights pages.
for (const language of [0, 1]) {
  const checks = articles.map(article => facilityEvidence[article.slug]?.[language]);
  if (checks.some(check => !check) || new Set(checks).size !== articles.length)
    throw new Error("Every guide requires a distinct, bilingual facility evidence check.");
}
if (Object.keys(examples).length !== articles.length) {
  throw new Error("Each insight requires exactly one bilingual example");
}
for (const lang of ["ar", "en"]) {
  const base = lang === "ar" ? "insights" : "en/insights";
  update(`${base}/index.html`, (html, file) => refreshIndex(html, lang, file));
  for (const article of articles) {
    update(`${base}/${article.slug}/index.html`, (html, file) => refreshArticle(html, article, lang, file));
  }
}

console.log(`Refreshed ${articles.length} bilingual Insights articles and two indexes.`);
