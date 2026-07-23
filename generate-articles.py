#!/usr/bin/env python3
"""Generate article HTML pages from articles.json.
v3: strips anchorIdentity duplication from body, adds related articles, GA4, font preload.
"""
import json, re, html, os, sys

SITE = os.path.dirname(os.path.abspath(__file__))
articles = json.load(open(f"{SITE}/articles.json"))
by_id = {a["id"]: a for a in articles}

CAT_LABELS = {
    "pre-open": "الجاهزية",
    "operate-better": "التشغيل",
    "trust": "الحوكمة والثقة",
}

GA4_ID = "G-HY8WJ4SDCM"
FONT_PRELOAD = '<link rel="preload" href="fonts/tajawal-ar-400.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="fonts/tajawal-ar-700.woff2" as="font" type="font/woff2" crossorigin>'
GA4_SCRIPT = f'<script async src="https://www.googletagmanager.com/gtag/js?id={GA4_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag("js",new Date());gtag("config","{GA4_ID}");</script>'

def build_article_page(a):
    slug = a["slug"]
    title = a["title"]
    cat_label = CAT_LABELS.get(a["category"], a["category"])
    date = a["date"]
    read_time = f"~{a['readingTime']} دقائق قراءة"
    body = a["body"]
    summary = a["summary"]
    cta = a["cta"]
    cta_text = cta["text"]
    cta_link = cta["link"].lstrip("/")
    cover = a.get("cover", {})
    seo = a.get("seo", {})
    og_title = seo.get("ogTitle", title + " | أصول الضيافة")
    og_desc = seo.get("ogDescription", summary)
    og_image = seo.get("ogImage", cover.get("src", ""))
    meta_desc = summary[:160]
    author = a.get("author", {})
    author_name = author.get("name", "أصول الضيافة")
    anchor_identity = a.get("anchorIdentity", "")
    disclaimer = a.get("disclaimer", "")

    # Strip duplicated anchorIdentity from body (first <p><em>...</em></p> if it matches anchorIdentity)
    if anchor_identity:
        body = re.sub(r'^<p><em>' + re.escape(anchor_identity) + r'</em></p>', '', body, count=1)

    # Extract h2 headings for TOC
    h2s = re.findall(r'<h2[^>]*>(.*?)</h2>', body, re.DOTALL)
    toc_items = "".join(f'<li><a href="#section-{i+1}">{html.escape(h)}</a></li>' for i, h in enumerate(h2s))

    # Add ids to h2s in body for TOC anchors
    def add_h2_id(m, counter=[0]):
        counter[0] += 1
        return f'<h2 id="section-{counter[0]}">{m.group(1)}</h2>'
    body_with_ids = re.sub(r'<h2[^>]*>(.*?)</h2>', add_h2_id, body, flags=re.DOTALL)

    # Cover image (render if src present)
    cover_html = ""
    if cover.get("src"):
        cover_html = f'<img class="article-cover" src="{cover["src"]}" alt="{html.escape(cover.get("alt", title))}" width="{cover.get("width",1200)}" height="{cover.get("height",630)}">'

    # anchorIdentity slot (render if present)
    anchor_html = f'<div class="anchor-identity">{html.escape(anchor_identity)}</div>' if anchor_identity else ""

    # disclaimer slot (render if present)
    disclaimer_html = ""
    if disclaimer:
        disclaimer_html = f'<div class="disclaimer-block"><h4>ما لا يجب توقعه</h4><p>{html.escape(disclaimer)}</p></div>'

    # Related articles — resolve id refs from manifest
    related_html = ""
    related_ids = a.get("related", [])
    if related_ids:
        related_items = ""
        for rid in related_ids:
            r = by_id.get(rid)
            if r:
                r_cat = CAT_LABELS.get(r["category"], r["category"])
                related_items += f'<li><a href="{r["slug"]}.html"><span class="kicker">{html.escape(r_cat)}</span><span class="related-title">{html.escape(r["title"])}</span></a></li>'
        if related_items:
            related_html = f'<div class="related-articles"><h4>مقالات ذات صلة</h4><ul>{related_items}</ul></div>'

    # CTA variant class
    cta_btn_class = "btn-primary" if cta.get("variant", "primary") == "primary" else "btn-secondary"

    page = f'''<!doctype html><html lang="ar-SA" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} | أصول الضيافة</title><meta name="description" content="{html.escape(meta_desc)}"><meta name="theme-color" content="#103B34"><meta property="og:type" content="article"><meta property="og:title" content="{html.escape(og_title)}"><meta property="og:description" content="{html.escape(og_desc)}"><meta property="og:image" content="https://osoulhospitality.com{og_image}"><meta property="og:url" content="https://osoulhospitality.com/{slug}.html"><link rel="alternate" hreflang="ar-SA" href="https://osoulhospitality.com/{slug}.html"><link rel="alternate" hreflang="x-default" href="https://osoulhospitality.com/{slug}.html"><link rel="canonical" href="https://osoulhospitality.com/{slug}.html"><link rel="icon" href="assets/favicon.png" type="image/png"><link rel="apple-touch-icon" href="assets/apple-touch-icon.png"><link rel="stylesheet" href="css/styles.css">{FONT_PRELOAD}{GA4_SCRIPT}<script type="application/ld+json">{{"@context":"https://schema.org","@type":"Article","headline":"{html.escape(title)}","description":"{html.escape(meta_desc)}","datePublished":"{date}","dateModified":"{a.get("updatedDate", date)}","image":{{"@type":"ImageObject","url":"https://osoulhospitality.com{og_image}","width":1200,"height":630}},"mainEntityOfPage":{{"@type":"WebPage","@id":"https://osoulhospitality.com/{slug}.html"}},"author":{{"@type":"Organization","name":"{html.escape(author_name)}"}},"publisher":{{"@type":"Organization","name":"أصول الضيافة","logo":{{"@type":"ImageObject","url":"https://osoulhospitality.com/assets/logo-mark-final.png"}}}}}}</script></head><body><header class="site-header"><div class="container head-wrap"><a class="brand" href="index.html" aria-label="أصول الضيافة"><img src="assets/logo-horizontal-final.png" alt="أصول الضيافة"></a><button class="menu-toggle" aria-label="القائمة" aria-expanded="false">☰</button><nav class="main-nav"><a class="" href="index.html">الرئيسية</a><a class="" href="services.html">الحلول</a><a class="" href="sectors.html">القطاعات</a><a class="" href="case-studies.html">دراسات الحالة</a><a class="" href="credentials-public.html">الفريق والاعتمادات</a><a class="active" href="insights.html">الرؤى</a><a class="" href="contact.html">تواصل معنا</a><a class="btn btn-primary nav-cta" href="request-technical-review.html">احجز مكالمة تشخيصية</a></nav></div></header><main>
<section class="page-hero article-hero"><div class="container">
<a href="insights.html" style="color:rgba(255,255,255,.8);font-size:14px;font-weight:700">← رجوع إلى الرؤى</a>
<span class="eyebrow" style="margin-top:14px">{html.escape(cat_label)}</span>
<h1>{html.escape(title)}</h1>
<div class="article-meta"><span class="cat">{html.escape(cat_label)}</span><span class="date">{date}</span><span class="date">{read_time}</span><span class="author">{html.escape(author_name)}</span></div>
{cover_html}
</div></section>

<section class="section"><div class="container"><div class="article-layout">
<article class="article-body">
<p class="lead">{html.escape(summary)}</p>
{anchor_html}
{body_with_ids}
{disclaimer_html}
<div class="article-cta">
<h3>{html.escape(cta_text)}</h3>
<p>جاهز للخطوة التالية؟ ابدأ بالمسار المناسب لموقفك.</p>
<div class="cta-row">
<a class="btn {cta_btn_class}" href="{cta_link}">{html.escape(cta_text)}</a>
<a class="btn btn-secondary" href="https://calendly.com/osoulhospitality/30min" target="_blank" rel="noopener">حجز مكالمة (Calendly)</a>
</div>
</div>
{related_html}
</article>
<aside class="article-toc">
<h3>في هذا المقال</h3>
<ul>
{toc_items}
</ul>
</aside>
</div></div></section>
</main><footer class="site-footer"><div class="container footer-grid"><div><img class="footer-logo" src="assets/logo-horizontal-final.png" alt="أصول الضيافة"><p>شركة استشارية سعودية متخصصة في جاهزية الفنادق والشقق المخدومة قبل الافتتاح، وتحسين استقرارها التشغيلي بعد الافتتاح.</p></div><div><h3>نطاقات العمل</h3><ul><li>جاهزية الافتتاح والترخيص</li><li>التدقيق التشغيلي وتحسين الأداء</li><li>شريك التنفيذ المحلي</li></ul></div><div><h3>روابط مهمة</h3><ul><li><a href="services.html">استعرض نطاقات العمل</a></li><li><a href="case-studies.html">دراسات الحالة</a></li><li><a href="request-technical-review.html">احجز مكالمة تشخيصية</a></li><li><a href="request-turnkey-scope.html">اطلب نطاق خدمة</a></li><li><a href="partner-enablement.html">شريك التنفيذ المحلي</a></li><li><a href="insights.html">الرؤى</a></li><li><a href="privacy.html">سياسة الخصوصية</a></li><li><a href="terms.html">الشروط والأحكام</a></li></ul></div><div><h3>التواصل</h3><ul><li><a class="ltr" href="tel:+966544384132">0544384132</a></li><li><a class="ltr" href="mailto:info@osoulhospitality.com">info@osoulhospitality.com</a></li><li>الرياض، المملكة العربية السعودية</li><li><a href="https://wa.me/966544384132" target="_blank" rel="noopener">واتساب الأعمال</a></li></ul><p class="small-note">المحتوى المنشور تعريفي ومهني عام، ويُستكمل تحديد نطاق كل مهمة ومخرجاتها عند دراسة الحاجة الفعلية للمشروع.</p></div></div><div class="container footer-bottom"><p>© 2026 أصول الضيافة. جميع الحقوق محفوظة.</p><p>نخدم الملاك والمطورين والمشغلين والشركاء الاستشاريين ضمن مشاريع الضيافة والإيواء في المملكة.</p></div></footer><a class="wa-float" href="https://wa.me/966544384132" target="_blank" rel="noopener">واتساب الأعمال</a><script src="js/main.js"></script></body></html>'''

    return page, slug

# Generate all article pages
generated = []
for a in articles:
    page, slug = build_article_page(a)
    outpath = f"{SITE}/{slug}.html"
    with open(outpath, "w") as f:
        f.write(page)
    generated.append((slug, len(page)))
    print(f"  generated: {slug}.html ({len(page)} bytes)")

# Place manifest at /insights/insights.json per Tech Lead
insights_dir = f"{SITE}/insights"
os.makedirs(insights_dir, exist_ok=True)
with open(f"{insights_dir}/insights.json", "w") as f:
    json.dump(articles, f, ensure_ascii=False, indent=2)
print(f"  manifest: insights/insights.json ({os.path.getsize(f'{insights_dir}/insights.json')} bytes)")

print(f"\nTotal: {len(generated)} article pages + 1 manifest")
