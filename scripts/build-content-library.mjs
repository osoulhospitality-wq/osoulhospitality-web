import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../content/articles-ar-en.mjs";
import { examples } from "../content/insight-examples-ar-en.mjs";

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
  revised = revised.replace(/Start with a non-confidential brief, then define the decision, evidence and right-sized scope\./u,
    "Tell us what your property needs so we can agree on the scope of work.");
  return refreshCards(refreshDeck(revised, article, lang, file), lang);
}

function refreshIndex(html, lang, file) {
  const ar = lang === "ar";
  const title = ar ? "أدلة لمُلّاك ومشغّلي منشآت الضيافة" : "Guides for hospitality owners and operators";
  const deck = ar
    ? "ابحث عن أدلة للترخيص والافتتاح، والتشغيل والربحية، والمبيعات، والحوكمة والتقنية. يضم كل دليل مثالًا وخطوات عمل ومؤشرات للمتابعة."
    : "Find guides on licensing and opening, operations and profitability, sales, governance and technology. Each guide includes an example, steps to take and measures to track.";
  const hero = `<section class="osoul-library-hero"><div class="shell"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(deck)}</p></div></section>`;
  return refreshCards(replaceRequired(html, /<section class="osoul-library-hero">[\s\S]*?<\/section>/u, hero, file), lang);
}

function update(relative, refresh) {
  const file = path.join(root, relative);
  const html = fs.readFileSync(file, "utf8");
  const revised = refresh(html, relative);
  if (revised !== html) fs.writeFileSync(file, revised, "utf8");
}

// The checked-in site owns the page layout, navigation, metadata and language
// links. Refresh only the editorial blocks on the Insights pages.
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
