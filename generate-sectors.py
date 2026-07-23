#!/usr/bin/env python3
"""Generate 4 sector HTML pages from sectors.json."""
import json, html, os, sys

SITE = os.path.dirname(os.path.abspath(__file__))
sectors = json.load(open(f"{SITE}/sectors.json"))

GA4_ID = "G-HY8WJ4SDCM"
FONT_PRELOAD = '<link rel="preload" href="fonts/tajawal-ar-400.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="fonts/tajawal-ar-700.woff2" as="font" type="font/woff2" crossorigin>'
GA4_SCRIPT = f'<script async src="https://www.googletagmanager.com/gtag/js?id={GA4_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag("js",new Date());gtag("config","{GA4_ID}");</script>'

HEADER = '<header class="site-header"><div class="container head-wrap"><a class="brand" href="index.html" aria-label="أصول الضيافة"><img src="assets/logo-horizontal-final.png" alt="أصول الضيافة"></a><button class="menu-toggle" aria-label="القائمة" aria-expanded="false">☰</button><nav class="main-nav"><a class="" href="index.html">الرئيسية</a><a class="" href="services.html">الحلول</a><a class="active" href="sectors.html">القطاعات</a><a class="" href="case-studies.html">دراسات الحالة</a><a class="" href="credentials-public.html">الفريق والاعتمادات</a><a class="" href="insights.html">الرؤى</a><a class="" href="contact.html">تواصل معنا</a><a class="btn btn-primary nav-cta" href="request-technical-review.html">احجز مكالمة تشخيصية</a></nav></div></header>'
FOOTER = '<footer class="site-footer"><div class="container footer-grid"><div><img class="footer-logo" src="assets/logo-horizontal-final.png" alt="أصول الضيافة"><p>شركة استشارية سعودية متخصصة في جاهزية الفنادق والشقق المخدومة قبل الافتتاح، وتحسين استقرارها التشغيلي بعد الافتتاح.</p></div><div><h3>نطاقات العمل</h3><ul><li>جاهزية الافتتاح والترخيص</li><li>التدقيق التشغيلي وتحسين الأداء</li><li>شريك التنفيذ المحلي</li></ul></div><div><h3>روابط مهمة</h3><ul><li><a href="services.html">استعرض نطاقات العمل</a></li><li><a href="case-studies.html">دراسات الحالة</a></li><li><a href="request-technical-review.html">احجز مكالمة تشخيصية</a></li><li><a href="request-turnkey-scope.html">اطلب نطاق خدمة</a></li><li><a href="partner-enablement.html">شريك التنفيذ المحلي</a></li><li><a href="insights.html">الرؤى</a></li><li><a href="privacy.html">سياسة الخصوصية</a></li><li><a href="terms.html">الشروط والأحكام</a></li></ul></div><div><h3>التواصل</h3><ul><li><a class="ltr" href="tel:+966544384132">0544384132</a></li><li><a class="ltr" href="mailto:info@osoulhospitality.com">info@osoulhospitality.com</a></li><li>الرياض، المملكة العربية السعودية</li><li><a href="https://wa.me/966544384132" target="_blank" rel="noopener">واتساب الأعمال</a></li></ul><p class="small-note">المحتوى المنشور تعريفي ومهني عام، ويُستكمل تحديد نطاق كل مهمة ومخرجاتها عند دراسة الحاجة الفعلية للمشروع.</p></div></div><div class="container footer-bottom"><p>© 2026 أصول الضيافة. جميع الحقوق محفوظة.</p><p>نخدم الملاك والمطورين والمشغلين والشركاء الاستشاريين ضمن مشاريع الضيافة والإيواء في المملكة.</p></div></footer><a class="wa-float" href="https://wa.me/966544384132" target="_blank" rel="noopener">واتساب الأعمال</a>'

for s in sectors:
    slug = s["slug"]
    title = s["title"]
    name = s["name"]
    intro = s["intro"]
    
    # Build risks HTML
    risks_html = ""
    for r in s["risks"]:
        risks_html += f'<div class="risk-item"><strong>{html.escape(r["title"])}</strong><p>{html.escape(r["desc"])}</p></div>'
    
    # Build method steps HTML
    steps_html = ""
    for i, step in enumerate(s["method_steps"], 1):
        steps_html += f'<div class="method-step"><b class="step-num">{i}</b><div class="step-content"><strong>{html.escape(step["title"])}</strong><p>{html.escape(step["desc"])}</p></div></div>'
    
    # CTA
    cta_link = s["cta_link"]
    cta_text = s["cta_text"]
    
    page = f'''<!doctype html><html lang="ar-SA" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} | أصول الضيافة</title><meta name="description" content="{html.escape(intro[:160])}"><meta name="theme-color" content="#103B34"><meta property="og:type" content="website"><meta property="og:title" content="{html.escape(title)} | أصول الضيافة"><meta property="og:description" content="{html.escape(intro[:160])}"><meta property="og:image" content="https://osoulhospitality.com/assets/og-image-brand.png"><link rel="alternate" hreflang="ar-SA" href="https://osoulhospitality.com/{slug}.html"><link rel="alternate" hreflang="x-default" href="https://osoulhospitality.com/{slug}.html"><link rel="canonical" href="https://osoulhospitality.com/{slug}.html"><link rel="icon" href="assets/favicon.png" type="image/png"><link rel="apple-touch-icon" href="assets/apple-touch-icon.png">{FONT_PRELOAD}<link rel="stylesheet" href="css/styles.css">{GA4_SCRIPT}</head><body>{HEADER}<main>
<section class="page-hero"><div class="container"><span class="eyebrow">القطاعات</span><h1>{html.escape(title)}</h1><p>{html.escape(intro)}</p><div class="cta-row"><a class="btn btn-primary" href="{cta_link}">{html.escape(cta_text)}</a><a class="btn btn-secondary" href="https://calendly.com/osoulhospitality/30min" target="_blank" rel="noopener">احجز مكالمة مباشرة (Calendly)</a></div></div></section>

<section class="section"><div class="container"><div class="section-head"><div><span class="eyebrow">مخاطر شائعة</span><h2>ما الذي يتعثر عليه في قطاع {html.escape(name.split(" /")[0].split(" (")[0])}؟</h2></div></div><div class="risk-grid">{risks_html}</div></div></section>

<section class="section section-soft"><div class="container"><div class="section-head"><div><span class="eyebrow">المنهجية</span><h2>كيف نطبّق منهجية «جاهزية أصول»</h2></div></div><div class="method-steps">{steps_html}</div></div></section>

<section class="section"><div class="container"><div class="section-head"><div><span class="eyebrow">سيناريو حالة</span><h2>مثال من الواقع</h2></div></div><div class="scenario-box"><span class="kicker">حالة عملية</span><p>{html.escape(s["scenario"])}</p></div></div></section>

<section class="section section-soft"><div class="container"><div class="section-head"><div><span class="eyebrow">الخطوة التالية</span><h2>المسار الأنسب لهذا القطاع</h2></div></div><div class="cta-row center"><a class="btn btn-primary" href="{cta_link}">{html.escape(cta_text)}</a><a class="btn btn-secondary" href="contact.html">تواصل معنا</a></div></div></section>
</main>{FOOTER}<script src="js/main.js"></script></body></html>'''
    
    outpath = f"{SITE}/{slug}.html"
    with open(outpath, "w") as f:
        f.write(page)
    print(f"  generated: {slug}.html ({len(page)} bytes)")

print(f"\nTotal: {len(sectors)} sector pages")
