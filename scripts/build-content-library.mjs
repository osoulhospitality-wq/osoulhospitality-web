import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { articles, categories, UPDATED } from "../content/articles-ar-en.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const domain = "https://osoulhospitality.com";

const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const write = (relative, value) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim() + "\n", "utf8");
};
const category = (id) => categories.find((item) => item.id === id);
const wordCount = (text) => text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;

function head({ lang, title, description, pathname, alternate, type = "website", jsonLd = [] }) {
  const locale = lang === "ar" ? "ar_SA" : "en_US";
  const otherLocale = lang === "ar" ? "en_US" : "ar_SA";
  return `<!DOCTYPE html>
<html lang="${lang === "ar" ? "ar-SA" : "en-SA"}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta property="og:type" content="${type}">
  <meta property="og:locale" content="${locale}">
  <meta property="og:locale:alternate" content="${otherLocale}">
  <meta property="og:site_name" content="${lang === "ar" ? "أصول الضيافة" : "Osool Hospitality"}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${domain}${pathname}">
  <meta property="og:image" content="${domain}/images/hero-riyadh-v8.webp">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${domain}${pathname}">
  <link rel="alternate" hreflang="ar-SA" href="${domain}${lang === "ar" ? pathname : alternate}">
  <link rel="alternate" hreflang="en-SA" href="${domain}${lang === "en" ? pathname : alternate}">
  <link rel="alternate" hreflang="x-default" href="${domain}${lang === "ar" ? pathname : alternate}">
  <link rel="icon" href="/brand/osool-mark-v8.svg">
  <link rel="apple-touch-icon" href="/apple-touch-icon-v2.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="stylesheet" href="/assets/index-5F7A2-v8.css">
  <link rel="stylesheet" href="/site-v13.css">
  <link rel="stylesheet" href="/site-v15.css">
  <meta name="theme-color" content="#0b3b34">
  ${jsonLd.map((data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`).join("\n  ")}
</head>`;
}

function header(lang, current = "", languageHref = "") {
  const ar = lang === "ar";
  const prefix = ar ? "" : "/en";
  const items = ar
    ? [["solutions", "الخدمات"], ["outputs", "نماذج المخرجات"], ["about", "عن أصول"], ["scenarios", "مكتبة القرار"], ["insights", "الرؤى"], ["contact", "تواصل"]]
    : [["solutions", "Services"], ["outputs", "Outputs"], ["about", "About"], ["scenarios", "Decision library"], ["insights", "Insights"], ["contact", "Contact"]];
  const switchHref = languageHref || (ar ? "/en/" : "/");
  return `<a class="skip-link" href="#content">${ar ? "انتقل إلى المحتوى" : "Skip to content"}</a>
<header class="site-header osoul-v13-header"><div class="shell header-inner">
  <a href="${prefix || "/"}" class="brand-lockup" aria-label="${ar ? "أصول الضيافة — الرئيسية" : "Osool Hospitality — home"}"><img src="/brand/osool-mark-v8.svg" alt="" width="56" height="56"><span><strong>${ar ? "أصول الضيافة" : "Osool Hospitality"}</strong><small>${ar ? "استراتيجية • تنفيذ • نمو" : "Strategy • Execution • Growth"}</small></span></a>
  <nav class="desktop-nav" aria-label="${ar ? "التنقل الرئيسي" : "Main navigation"}">${items.map(([slug, label]) => `<a href="${prefix}/${slug}/"${current === slug ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
  <div class="header-actions"><a class="language-link" href="${switchHref}" lang="${ar ? "en" : "ar"}" dir="${ar ? "ltr" : "rtl"}">${ar ? "EN" : "العربية"}</a><a class="button button-small" href="${prefix}/contact/">${ar ? "ابدأ مشروعك" : "Start a project"}</a></div>
  <details class="mobile-menu"><summary aria-label="${ar ? "فتح قائمة التنقل" : "Open navigation"}"><span></span><span></span><span></span></summary><nav aria-label="${ar ? "تنقل الهاتف" : "Mobile navigation"}">${items.map(([slug, label]) => `<a href="${prefix}/${slug}/">${label}</a>`).join("")}<a class="language-link" href="${switchHref}">${ar ? "English" : "العربية"}</a><a class="mobile-cta" href="${prefix}/contact/">${ar ? "ابدأ مشروعك" : "Start a project"}</a></nav></details>
</div></header>`;
}

function footer(lang) {
  const ar = lang === "ar";
  const p = ar ? "" : "/en";
  return `<footer class="site-footer"><div class="shell footer-grid">
  <div class="footer-brand"><a href="${p || "/"}" class="brand-lockup brand-lockup-inverse"><img src="/brand/osool-mark-v8.svg" alt="" width="56" height="56"><span><strong>${ar ? "أصول الضيافة" : "Osool Hospitality"}</strong><small>${ar ? "استراتيجية • تنفيذ • نمو" : "Strategy • Execution • Growth"}</small></span></a><p>${ar ? "بيت خبرة سعودي متخصص في الاستشارات السياحية، يجمع الاستراتيجية والتنفيذ وذكاء الأداء ضمن مسؤولية واضحة." : "A Saudi hospitality advisory house connecting strategy, execution and performance intelligence under clear accountability."}</p></div>
  <div><h2>${ar ? "استكشف" : "Explore"}</h2><nav aria-label="${ar ? "روابط الاستكشاف في التذييل" : "Footer explore links"}"><a href="${p}/solutions/">${ar ? "الخدمات" : "Services"}</a><a href="${p}/outputs/">${ar ? "المخرجات" : "Outputs"}</a><a href="${p}/insights/">${ar ? "الرؤى" : "Insights"}</a><a href="${p}/contact/">${ar ? "تواصل" : "Contact"}</a></nav></div>
  <div><h2>${ar ? "الحوكمة" : "Governance"}</h2><nav aria-label="${ar ? "روابط الحوكمة في التذييل" : "Footer governance links"}"><a href="${p}/privacy/">${ar ? "الخصوصية" : "Privacy"}</a><a href="${p}/terms/">${ar ? "الشروط" : "Terms"}</a><a href="${p}/accessibility/">${ar ? "إتاحة الاستخدام" : "Accessibility"}</a></nav></div>
  <div class="footer-contact"><h2>${ar ? "الرياض، المملكة العربية السعودية" : "Riyadh, Saudi Arabia"}</h2><a href="mailto:info@osoulhospitality.com">info@osoulhospitality.com</a><a href="https://wa.me/966544384132" target="_blank" rel="noreferrer">+966 54 438 4132</a><small>${ar ? "زمن الاستجابة المستهدف: خلال يومي عمل." : "Target response time: within two business days."}</small></div>
</div><div class="shell footer-bottom"><span>© 2026 ${ar ? "أصول الضيافة. جميع الحقوق محفوظة." : "Osool Hospitality. All rights reserved."}</span><span>${ar ? "آخر تحديث: 8 أغسطس 2026." : "Last updated: 8 August 2026."}</span></div></footer>`;
}

const scripts = (library = false) => `${library ? '<script defer src="/insights-v14.js"></script>' : ""}<script defer src="/site-hostinger-v15.js"></script>`;

function list(items) { return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`; }

function articleCopy(article, lang) {
  const ar = lang === "ar";
  const title = article[ar ? "titleAr" : "titleEn"];
  const excerpt = article[ar ? "excerptAr" : "excerptEn"];
  const diagnosis = article[ar ? "diagnosisAr" : "diagnosisEn"];
  const actions = article[ar ? "actionsAr" : "actionsEn"];
  const metrics = article[ar ? "metricsAr" : "metricsEn"];
  const mistakes = article[ar ? "mistakesAr" : "mistakesEn"];
  if (ar) return `
    <p class="lead">${esc(excerpt)} هذه القضية لا تُحسم بانطباع سريع أو قائمة عامة؛ بل بتعريف قرار واضح، وخط أساس يمكن الرجوع إليه، وأدلة تحمل تاريخًا ومالكًا وحدودًا معروفة.</p>
    <div class="osoul-callout"><strong>الخلاصة التنفيذية:</strong> افصل الحقيقة عن الافتراض، واربط كل توصية بمسؤول وموعد ومؤشر ودليل إغلاق. بهذه الطريقة تتحول المناقشة من وصف المشكلة إلى إدارة قرار قابل للتدقيق.</div>
    <h2>ما الذي يجب تشخيصه أولًا؟</h2>
    <p>يبدأ العمل بفهم السياق الفعلي للأصل أو المنشأة، لا بنسخ ممارسة من مشروع آخر. ويشمل الحد الأدنى للمراجعة المحاور التالية:</p>
    ${list(diagnosis)}
    <p>لا تكفي الإجابة اللفظية عن هذه النقاط. الأفضل توثيق مصدر كل معلومة، وفترة القياس، وأي نقص أو تعارض، ثم تحديد ما إذا كان النقص يمنع القرار أو يمكن التعامل معه بافتراض معلن.</p>
    <h2>منهج تنفيذ عملي</h2>
    ${actions.map((item, i) => `<h3>${i + 1}. ${esc(item)}</h3><p>حوّل هذه الخطوة إلى مهمة محددة لها مسؤول تنفيذي وموعد ودليل إغلاق. ابدأ بعينة صغيرة للتحقق من جودة البيانات، ثم وسّع التطبيق بعد معالجة الاستثناءات. عند ظهور تعارض، سجّل القرار وسببه بدل تعديل الرقم أو الوثيقة بصمت.</p>`).join("")}
    <h2>كيف نقيس التقدم؟</h2>
    <p>يجب أن تجمع لوحة المتابعة بين النتيجة وسلامة التنفيذ. المؤشرات المقترحة لهذا الموضوع هي:</p>
    <ul class="osoul-key-list">${metrics.map((item) => `<li><strong>${esc(item)}:</strong> يُعرّف بمعادلة ومصدر وتواتر ومالك، ويُعرض مع خط أساس وهدف واتجاه لا كرقم منفرد.</li>`).join("")}</ul>
    <h2>إشارات تحذير</h2>
    <div class="osoul-callout osoul-warning">${list(mistakes)}<p>ظهور إحدى هذه الإشارات لا يعني إيقاف المشروع تلقائيًا، لكنه يستدعي تحققًا مستقلًا وخطة احتواء قبل توسيع الالتزام أو إعلان الجاهزية.</p></div>
    <h2>خطة أول 30 يومًا</h2>
    <p><strong>الأسبوع الأول:</strong> تثبيت سؤال القرار، وجمع المصادر، وبناء سجل الحقائق والافتراضات. <strong>الأسبوع الثاني:</strong> تحليل الفجوات واختبار عينة من الأدلة. <strong>الأسبوع الثالث:</strong> تنفيذ الإجراءات الأعلى أثرًا ووضع ضوابط تمنع التكرار. <strong>الأسبوع الرابع:</strong> مراجعة مستقلة للنتيجة، وتحديث المؤشرات، واعتماد خطة 60 و90 يومًا.</p>
    <p>تنجح الخطة عندما يستطيع شخص آخر مراجعة الأدلة والوصول إلى النتيجة نفسها تقريبًا. أما إذا كانت المعرفة محصورة في رسائل أو ذاكرة فرد، فالعمل لم يتحول بعد إلى قدرة مؤسسية.</p>`;
  return `
    <p class="lead">${esc(excerpt)} This decision should not rest on a quick impression or a generic checklist. It requires a defined decision, a retrievable baseline, dated evidence, named ownership and explicit boundaries.</p>
    <div class="osoul-callout"><strong>Executive takeaway:</strong> separate fact from assumption, then attach every recommendation to an owner, date, measure and closure record. That turns discussion into an auditable decision process.</div>
    <h2>What should be diagnosed first?</h2>
    <p>Start with the asset's real context rather than copying practice from another property. At minimum, examine the following:</p>
    ${list(diagnosis)}
    <p>Verbal answers are not enough. Record each information source, measurement period, gap and contradiction. Then decide whether missing information blocks the decision or can be handled through a visible, bounded assumption.</p>
    <h2>A practical execution method</h2>
    ${actions.map((item, i) => `<h3>${i + 1}. ${esc(item)}</h3><p>Convert this step into a defined task with an accountable owner, due date and closure evidence. Begin with a small sample to test data quality, then scale after handling exceptions. When evidence conflicts, record the decision and rationale instead of silently changing a number or document.</p>`).join("")}
    <h2>How should progress be measured?</h2>
    <p>The dashboard should combine outcome and execution integrity. Recommended measures for this topic include:</p>
    <ul class="osoul-key-list">${metrics.map((item) => `<li><strong>${esc(item)}:</strong> define its formula, source, frequency and owner, then show a baseline, target and trend rather than an isolated number.</li>`).join("")}</ul>
    <h2>Warning signs</h2>
    <div class="osoul-callout osoul-warning">${list(mistakes)}<p>One warning sign does not automatically stop a project, but it should trigger independent verification and a containment plan before commitment expands or readiness is declared.</p></div>
    <h2>The first 30 days</h2>
    <p><strong>Week one:</strong> confirm the decision question, collect sources and build the fact-and-assumption register. <strong>Week two:</strong> analyse gaps and test an evidence sample. <strong>Week three:</strong> implement the highest-impact actions and controls that prevent recurrence. <strong>Week four:</strong> independently review the result, refresh measures and approve the 60- and 90-day plan.</p>
    <p>The work is institutionalised when another reviewer can inspect the evidence and reach a broadly similar conclusion. If knowledge remains trapped in messages or one person's memory, the capability is not yet ready.</p>`;
}

function articlePage(article, lang) {
  const ar = lang === "ar";
  const title = article[ar ? "titleAr" : "titleEn"];
  const excerpt = article[ar ? "excerptAr" : "excerptEn"];
  const cat = category(article.category)[ar ? "ar" : "en"];
  const pathname = ar ? `/insights/${article.slug}/` : `/en/insights/${article.slug}/`;
  const alternate = ar ? `/en/insights/${article.slug}/` : `/insights/${article.slug}/`;
  const body = articleCopy(article, lang);
  const reading = Math.max(5, Math.ceil(wordCount(body) / (ar ? 180 : 220)));
  const indexPath = ar ? "/insights/" : "/en/insights/";
  const related = articles.filter((x) => x.category === article.category && x.slug !== article.slug).slice(0, 3);
  const json = {
    "@context": "https://schema.org", "@type": "Article", headline: title, description: excerpt,
    datePublished: UPDATED, dateModified: UPDATED, inLanguage: ar ? "ar-SA" : "en-SA",
    author: { "@type": "Person", name: ar ? "يزيد الجهني" : "Yazeed Aljuhani" },
    publisher: { "@type": "Organization", name: ar ? "أصول الضيافة" : "Osool Hospitality", url: domain },
    mainEntityOfPage: `${domain}${pathname}`
  };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: ar ? "الرئيسية" : "Home", item: `${domain}${ar ? "/" : "/en/"}` },
    { "@type": "ListItem", position: 2, name: ar ? "الرؤى" : "Insights", item: `${domain}${indexPath}` },
    { "@type": "ListItem", position: 3, name: title, item: `${domain}${pathname}` }
  ] };
  const fullTitle = `${title} | ${ar ? "أصول الضيافة" : "Osool Hospitality"}`;
  let seoTitle = fullTitle.length <= 70 ? fullTitle : title.length <= 70 ? title : `${title.slice(0, 66).replace(/\s+\S*$/, "")}…`;
  if (esc(seoTitle).length > 70) seoTitle = title;
  return `${head({ lang, title: seoTitle, description: excerpt, pathname, alternate, type: "article", jsonLd: [json, crumbs] })}
<body>${header(lang, "insights", alternate)}<main id="content">
  <section class="osoul-article-hero"><div class="shell"><nav class="osoul-breadcrumbs" aria-label="${ar ? "مسار الصفحة" : "Breadcrumb"}"><a href="${ar ? "/" : "/en/"}">${ar ? "الرئيسية" : "Home"}</a><span>›</span><a href="${indexPath}">${ar ? "الرؤى" : "Insights"}</a><span>›</span><span>${esc(cat)}</span></nav><span class="category">${esc(cat)}</span><h1>${esc(title)}</h1><p class="osoul-article-deck">${esc(excerpt)}</p><div class="osoul-article-byline"><span>${ar ? "بقلم يزيد الجهني — أصول الضيافة" : "By Yazeed Aljuhani — Osool Hospitality"}</span><time datetime="${UPDATED}">${ar ? "8 أغسطس 2026" : "8 August 2026"}</time><span>${reading} ${ar ? "دقائق قراءة" : "min read"}</span></div></div></section>
  <div class="shell osoul-article-shell osoul-article-layout"><article class="osoul-article-body">${body}<h2>${ar ? "المصادر والمراجع" : "Sources and references"}</h2><ol class="osoul-source-list">${article.sources.map((source) => `<li><a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source[ar ? "ar" : "en"])}</a></li>`).join("")}</ol><p class="osoul-article-disclaimer">${ar ? "محتوى مهني عام للتوعية ودعم القرار، ولا يُعد رأيًا قانونيًا أو هندسيًا أو محاسبيًا. يجب التحقق من النسخة الأحدث للأنظمة والاستعانة بمختص مرخص عند الحاجة." : "General professional content for education and decision support; it is not legal, engineering or accounting advice. Verify the latest applicable requirements and engage licensed specialists where needed."}</p></article><aside class="osoul-article-aside"><div class="osoul-aside-card"><h2>${ar ? "هل تحتاج تطبيق المنهج على أصلك؟" : "Need to apply this method to your asset?"}</h2><p>${ar ? "نبدأ بموجز غير سري، ثم نحدد سؤال القرار والأدلة والنطاق المناسب." : "Start with a non-confidential brief, then define the decision, evidence and right-sized scope."}</p><a href="${ar ? "/contact/" : "/en/contact/"}">${ar ? "ابدأ مشروعك ←" : "Start your project →"}</a></div></aside></div>
  <section class="osoul-related"><div class="shell"><h2>${ar ? "اقرأ أيضًا" : "Related reading"}</h2><div class="osoul-article-grid">${related.map((item) => card(item, lang)).join("")}</div></div></section>
</main>${footer(lang)}${scripts()}</body></html>`;
}

function card(article, lang) {
  const ar = lang === "ar";
  const title = article[ar ? "titleAr" : "titleEn"];
  const excerpt = article[ar ? "excerptAr" : "excerptEn"];
  const cat = category(article.category)[ar ? "ar" : "en"];
  const href = `${ar ? "/insights" : "/en/insights"}/${article.slug}/`;
  const search = [title, excerpt, cat].join(" ");
  return `<article class="osoul-article-card" data-article-card data-category="${article.category}" data-search="${esc(search)}"><a href="${href}"><span class="category">${esc(cat)}</span><h2>${esc(title)}</h2><p>${esc(excerpt)}</p></a><div class="card-meta"><span>${ar ? "منهج تنفيذي" : "Execution guide"}</span><time datetime="${UPDATED}">${ar ? "أغسطس 2026" : "Aug 2026"}</time></div><a class="read-link" href="${href}" aria-label="${ar ? "اقرأ" : "Read"}: ${esc(title)}">${ar ? "اقرأ المقال ←" : "Read article →"}</a></article>`;
}

function libraryPage(lang) {
  const ar = lang === "ar";
  const pathname = ar ? "/insights/" : "/en/insights/";
  const alternate = ar ? "/en/insights/" : "/insights/";
  const title = ar ? "مكتبة أصول الضيافة | 40 دليلًا للمستثمر والمالك والمشغّل" : "Osool Hospitality Insights | 40 Guides for Owners and Operators";
  const description = ar ? "مكتبة عربية متخصصة تضم 40 مقالًا عمليًا في الترخيص والتطوير والتشغيل والربحية والإيرادات وتمثيل المالك والتقنية." : "A bilingual library of 40 practical guides covering licensing, development, operations, profitability, revenue, owner representation and technology.";
  const json = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, inLanguage: ar ? "ar-SA" : "en-SA", url: `${domain}${pathname}`, mainEntity: { "@type": "ItemList", numberOfItems: 40, itemListElement: articles.map((item, index) => ({ "@type": "ListItem", position: index + 1, url: `${domain}${ar ? "/insights" : "/en/insights"}/${item.slug}/`, name: item[ar ? "titleAr" : "titleEn"] })) } };
  return `${head({ lang, title, description, pathname, alternate, jsonLd: [json] })}<body>${header(lang, "insights", alternate)}<main id="content">
  <section class="osoul-library-hero"><div class="shell"><span class="eyebrow">${ar ? "مكتبة القرار والتنفيذ" : "Decision and execution library"}</span><h1>${ar ? "40 دليلًا عمليًا لأصل ضيافي أقوى." : "40 practical guides for a stronger hospitality asset."}</h1><p>${ar ? "محتوى تحليلي واضح للمستثمر والمالك والمشغّل في المملكة: من الترخيص والافتتاح إلى الربحية والإيرادات والحوكمة والتقنية." : "Clear, practical thinking for investors, owners and operators in Saudi Arabia—from licensing and opening to profitability, revenue, governance and technology."}</p><div class="osoul-library-hero-meta"><span>${ar ? "40 مقالًا" : "40 articles"}</span><span>${ar ? "5 مسارات" : "5 tracks"}</span><span>${ar ? "عربي + English" : "English + العربية"}</span><span>${ar ? "مصادر رسمية" : "Official sources"}</span></div></div></section>
  <section class="osoul-library-main"><div class="shell"><div class="osoul-library-tools"><label class="osoul-search"><span class="sr-only">${ar ? "ابحث في المقالات" : "Search articles"}</span><input type="search" data-library-search placeholder="${ar ? "ابحث بالموضوع أو القرار..." : "Search by topic or decision..."}" autocomplete="off"></label><span class="osoul-library-count" data-library-count aria-live="polite"></span></div><div class="osoul-filter-row" role="group" aria-label="${ar ? "تصفية حسب المسار" : "Filter by track"}"><button type="button" class="osoul-filter" data-category-filter="all" aria-pressed="true">${ar ? "الكل" : "All"}</button>${categories.map((item) => `<button type="button" class="osoul-filter" data-category-filter="${item.id}" aria-pressed="false">${esc(item[ar ? "ar" : "en"])}</button>`).join("")}</div><div class="osoul-article-grid">${articles.map((item) => card(item, lang)).join("")}<p class="osoul-empty" data-library-empty hidden>${ar ? "لا توجد نتائج مطابقة. جرّب كلمة أخرى أو اعرض جميع المسارات." : "No matching results. Try another term or show all tracks."}</p></div></div></section>
</main>${footer(lang)}${scripts(true)}</body></html>`;
}

const corePages = {
  solutions: {
    title: "Services | Osool Hospitality",
    description: "Integrated tourism and hospitality advisory services across strategy, licensing, development, operations, revenue and owner representation.",
    eyebrow: "Integrated service portfolio", h1: "One accountable partner across the hospitality asset lifecycle.", intro: "Start with the smallest scope that can reveal the truth, then expand only when evidence supports the next decision.",
    cards: [["Strategy & feasibility", "Market, demand, concept, feasibility and entry decisions."], ["Licensing & compliance", "Requirement registers, classification, renewal and audit readiness."], ["Development & design", "Operating concept, unit mix, BOH, procurement and handover."], ["Pre-opening & operations", "Critical path, readiness gates, SOPs, training and stabilisation."], ["Performance & profitability", "P&L diagnostics, contracts, suppliers, productivity and turnaround."], ["Revenue & sales", "Pricing, forecasting, channels, corporate accounts and direct demand."], ["Owner representation", "Operator review, budgets, HMA questions, CapEx and governance."], ["Technology & intelligence", "Data architecture, dashboards, automation and responsible AI."]]
  },
  outputs: {
    title: "Sample Outputs | Osool Hospitality", description: "Examples of decision-grade hospitality advisory outputs for owners, investors and operators.", eyebrow: "Decision-grade deliverables", h1: "Outputs designed to move a decision, not decorate a meeting.", intro: "Every engagement defines the decision, evidence, owner, timing and closure test before production begins.",
    cards: [["Executive decision memo", "A concise record of facts, assumptions, options, recommendation and conditions."], ["Readiness dashboard", "Gate status, evidence, critical gaps, owners and recovery dates."], ["Profit-leakage diagnostic", "Revenue and cost bridges with quantified opportunities and controls."], ["Owner reporting pack", "A reconciled view of commercial, operating, cash and asset performance."], ["90-day execution plan", "Prioritised actions with accountability, dependencies and measures."], ["Contract and supplier matrix", "Comparable scope, price, SLA, risk and renewal evidence."]]
  },
  about: {
    title: "About Osool Hospitality", description: "A Saudi tourism advisory house connecting decision quality with disciplined execution.", eyebrow: "About Osool", h1: "Field experience translated into stronger owner decisions.", intro: "Osool Hospitality was built to close the gap between advisory reports and operating reality in Saudi tourism and hospitality.",
    cards: [["Diagnosis before recommendation", "We establish the decision and evidence before prescribing a solution."], ["Clear boundaries", "Facts, assumptions, licensed opinions and partner responsibilities remain distinct."], ["Execution accountability", "Recommendations become owners, dates, measures and closure evidence."], ["Saudi context", "Local regulation, demand, talent and supplier reality shape the answer."], ["Independent owner view", "We challenge narratives without replacing the operator's role."], ["Responsible technology", "Tools accelerate analysis while people retain judgment and accountability."]]
  },
  scenarios: {
    title: "Decision Library | Osool Hospitality", description: "Common hospitality owner and investor scenarios, the decision required and the first evidence to request.", eyebrow: "Decision library", h1: "Start from the decision you need to make.", intro: "Each scenario below identifies a practical entry point. Scope is confirmed only after a non-confidential brief and evidence review.",
    cards: [["A new project before lease or acquisition", "Test demand, total cost, licensability and downside before commitment."], ["A project approaching handover", "Connect defects, licences, systems, people and opening gates."], ["An operating asset missing budget", "Separate rate, volume, mix, cost and one-off effects."], ["High occupancy but weak cash", "Measure net channel economics, cost to serve and working capital."], ["An owner dissatisfied with operator reporting", "Reconcile definitions, rights, decisions and evidence."], ["An international operator entering Saudi Arabia", "Localise regulation, supply, talent, demand and decision rights."]]
  }
};

function englishCorePage(slug, data) {
  const pathname = `/en/${slug}/`;
  return `${head({ lang: "en", title: data.title, description: data.description, pathname, alternate: `/${slug}/` })}<body>${header("en", slug, `/${slug}/`)}<main id="content"><section class="osoul-static-hero"><div class="shell"><span>${esc(data.eyebrow)}</span><h1>${esc(data.h1)}</h1><p>${esc(data.intro)}</p></div></section><section class="osoul-static-section"><div class="shell"><div class="osoul-static-grid">${data.cards.map(([name, copy]) => `<article class="osoul-static-card"><h2>${esc(name)}</h2><p>${esc(copy)}</p></article>`).join("")}</div></div></section><section class="simple-cta"><div class="shell"><div><span>Have a live decision?</span><h2>Share a non-confidential brief.</h2></div><a class="button" href="/en/contact/">Start your project →</a></div></section></main>${footer("en")}${scripts()}</body></html>`;
}

function englishHome() {
  const description = "Saudi tourism and hospitality advisory across strategy, licensing, development, operations, revenue and owner representation.";
  return `${head({ lang: "en", title: "Osool Hospitality | Saudi Tourism Advisory and Execution", description, pathname: "/en/", alternate: "/" })}<body>${header("en")}<main id="content"><section class="osoul-static-hero english-hero"><div class="shell"><span>Saudi tourism advisory, execution and intelligence</span><h1>From opportunity and complexity<br><span class="osoul-v13-accent">to a hospitality asset that performs.</span></h1><p>Osool Hospitality connects strategy, feasibility, licensing, development, operations, profitability improvement and owner representation under one accountable Saudi-led platform.</p><div class="hero-actions"><a class="button" href="/en/contact/">Start your project →</a><a class="text-button text-button-light" href="/en/solutions/">Explore services →</a></div></div></section><section class="osoul-static-section"><div class="shell"><div class="section-heading"><span class="kicker">Three entry points</span><h2>Begin with the decision—not a generic package.</h2></div><div class="osoul-static-grid"><article class="osoul-static-card"><h2>New investment</h2><p>Market, feasibility, concept, licensing and development before commitment.</p></article><article class="osoul-static-card"><h2>Operating improvement</h2><p>Profit leakage, revenue, quality, contracts and a measurable 90-day plan.</p></article><article class="osoul-static-card"><h2>Owner oversight</h2><p>Operator reporting, budgets, governance, CapEx and asset value.</p></article></div></div></section><section class="osoul-static-section alt"><div class="shell"><div class="section-heading"><span class="kicker">Knowledge library</span><h2>40 bilingual execution guides.</h2><p>Practical content grounded in official sources and field-tested decision disciplines.</p></div><a class="button" href="/en/insights/">Open the insights library →</a></div></section></main>${footer("en")}${scripts()}</body></html>`;
}

function englishContact() {
  return `${head({ lang: "en", title: "Start a Project | Osool Hospitality", description: "Share a non-confidential hospitality project brief with Osool Hospitality.", pathname: "/en/contact/", alternate: "/contact/" })}<body>${header("en", "contact", "/contact/")}<main id="content"><section class="osoul-static-hero"><div class="shell"><span>Start a project</span><h1>Tell us the decision, opportunity or operating gap.</h1><p>Share a non-confidential brief. We target an initial response within two business days.</p></div></section><section class="osoul-static-section"><div class="shell"><form id="project-brief" action="/submit.php" method="post" class="project-brief-form"><input type="hidden" name="form_name" value="hospitality_readiness_brief"><input type="hidden" name="language" value="en"><div class="form-grid"><label>Asset type<input type="text" name="asset_type" required maxlength="120" placeholder="Hotel, serviced apartments, resort..."></label><label>City<input type="text" name="city" required maxlength="120"></label><label>Project stage<select name="stage" required><option value="">Select</option><option>Concept / feasibility</option><option>Design / development</option><option>Pre-opening</option><option>Operating asset</option></select></label><label>Opening or decision target<input type="text" name="opening_target" required maxlength="160" placeholder="Month / year or decision date"></label><label>Rooms or units<input type="text" name="units" required inputmode="numeric" maxlength="40"></label><label>Primary gap<input type="text" name="primary_gap" required maxlength="220" placeholder="The main decision or problem"></label><label>Urgency<select name="urgency" required><option value="">Select</option><option>Immediate — under 30 days</option><option>1–3 months</option><option>3–6 months</option><option>Exploratory</option></select></label><label>Documents available<select name="documents" required><option value="">Select</option><option>Available for later secure review</option><option>Partially available</option><option>Not yet organised</option></select></label><label>Requested support<select name="requested_support" required><option value="">Select</option><option>Strategy / feasibility</option><option>Licensing / compliance</option><option>Development / opening</option><option>Performance / revenue</option><option>Owner representation</option><option>Not sure yet</option></select></label><label>Name<input type="text" name="name" required maxlength="120" autocomplete="name"></label><label>Organisation<input type="text" name="organization" required maxlength="180" autocomplete="organization"></label><label>Email<input name="email" type="email" maxlength="180" autocomplete="email"></label><label>Phone / WhatsApp<input type="tel" name="phone" maxlength="60" autocomplete="tel"></label></div><label class="form-wide">Optional context<textarea name="description" rows="5" maxlength="2000" placeholder="Do not include confidential or sensitive information."></textarea></label><label class="honeypot" aria-hidden="true">Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label><label class="form-consent"><input type="checkbox" name="consent" value="yes" required> I have read the <a href="/en/privacy/">privacy notice</a> and consent to processing this enquiry.</label><button class="button" type="submit">Send project brief</button></form></div></section></main>${footer("en")}${scripts()}</body></html>`;
}

const legal = {
  privacy: ["Privacy Notice | Osool Hospitality", "Privacy notice", "How we handle enquiry information", `<h2>Information we receive</h2><p>When you submit a project brief, we receive the contact and project information you choose to provide. Please do not send confidential, sensitive or identity documents through the public form.</p><h2>Purpose and retention</h2><p>We use the information to assess and respond to the enquiry, prevent abuse and maintain a business record. Access is limited to authorised personnel and service providers needed for delivery. Retention is reviewed against business, legal and security needs.</p><h2>Your choices</h2><p>You may request access, correction or deletion where applicable by emailing <a href="mailto:info@osoulhospitality.com">info@osoulhospitality.com</a>. Requests are verified before action. External links and later secure workspaces have their own terms and controls.</p><h2>International processing</h2><p>Where a service could involve processing outside Saudi Arabia, we evaluate the applicable requirements and safeguards before using it.</p>`],
  terms: ["Website Terms | Osool Hospitality", "Website terms", "Clear boundaries for using this website", `<h2>General information</h2><p>The website provides general professional information and does not create an advisory engagement, legal opinion, engineering certification or investment recommendation.</p><h2>No reliance without scope</h2><p>Regulations, market conditions and project facts change. Verify current official requirements and obtain appropriately licensed advice before acting. An engagement starts only after both parties approve a written scope and commercial terms.</p><h2>Intellectual property</h2><p>Original website content belongs to Osool Hospitality unless a source is identified. You may link to pages and quote brief passages with attribution, but may not republish the library as a competing product.</p><h2>External sources</h2><p>Links are provided for context. Osool Hospitality does not control third-party availability, content or security.</p>`],
  accessibility: ["Accessibility | Osool Hospitality", "Accessibility", "A readable, keyboard-friendly bilingual experience", `<h2>Our approach</h2><p>We aim for semantic headings, visible keyboard focus, sufficient contrast, responsive layouts, descriptive labels and reduced-motion support across Arabic and English pages.</p><h2>Known limits</h2><p>Some externally hosted documents may have accessibility limitations beyond our control. Contact us if you need a reasonable alternative format for an Osool-created output.</p><h2>Feedback</h2><p>If you encounter a barrier, email <a href="mailto:info@osoulhospitality.com">info@osoulhospitality.com</a> with the page, device and issue. We will assess and prioritise a fix.</p>`]
};

function englishProsePage(slug, data) {
  const [title, eyebrow, h1, copy] = data;
  return `${head({ lang: "en", title, description: h1, pathname: `/en/${slug}/`, alternate: `/${slug}/` })}<body>${header("en", "", `/${slug}/`)}<main id="content"><section class="osoul-static-hero"><div class="shell"><span>${eyebrow}</span><h1>${h1}</h1><p>Last updated: 8 August 2026.</p></div></section><section class="osoul-static-section"><div class="shell osoul-prose">${copy}</div></section></main>${footer("en")}${scripts()}</body></html>`;
}

function thankYou() {
  return `${head({ lang: "en", title: "Brief Received | Osool Hospitality", description: "Your project brief has been received.", pathname: "/en/thank-you/", alternate: "/thank-you/" })}<body>${header("en", "", "/thank-you/")}<main id="content"><section class="osoul-static-hero"><div class="shell"><span>Brief received</span><h1>Thank you. Your project brief has been sent.</h1><p>We target an initial response within two business days. Do not email confidential documents until a secure route and scope are agreed.</p><a class="button" href="/en/insights/">Explore the insights library →</a></div></section></main>${footer("en")}${scripts()}</body></html>`;
}

write("insights/index.html", libraryPage("ar"));
write("en/insights/index.html", libraryPage("en"));
for (const item of articles) {
  write(`insights/${item.slug}/index.html`, articlePage(item, "ar"));
  write(`en/insights/${item.slug}/index.html`, articlePage(item, "en"));
}
write("en/index.html", englishHome());
for (const [slug, data] of Object.entries(corePages)) write(`en/${slug}/index.html`, englishCorePage(slug, data));
write("en/contact/index.html", englishContact());
for (const [slug, data] of Object.entries(legal)) write(`en/${slug}/index.html`, englishProsePage(slug, data));
write("en/thank-you/index.html", thankYou());

const staticRoutes = ["/", "/solutions/", "/outputs/", "/about/", "/scenarios/", "/insights/", "/contact/", "/privacy/", "/terms/", "/accessibility/", "/en/", "/en/solutions/", "/en/outputs/", "/en/about/", "/en/scenarios/", "/en/insights/", "/en/contact/", "/en/privacy/", "/en/terms/", "/en/accessibility/", "/command-center/"];
const articleRoutes = articles.flatMap((item) => [`/insights/${item.slug}/`, `/en/insights/${item.slug}/`]);
const urls = [...staticRoutes, ...articleRoutes].map((route) => `  <url><loc>${domain}${route}</loc><lastmod>${UPDATED}</lastmod><changefreq>${route.includes("/insights/") ? "monthly" : "monthly"}</changefreq><priority>${route === "/" ? "1.0" : route.includes("insights") ? "0.7" : "0.8"}</priority></url>`).join("\n");
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);

console.log(`Generated ${articles.length} Arabic and ${articles.length} English articles, two library indexes, nine English routes, and sitemap.xml.`);
