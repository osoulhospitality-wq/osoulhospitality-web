(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link || link.hasAttribute("download") || link.target === "_blank") return;
    var url;
    try { url = new URL(link.href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin || url.protocol !== window.location.protocol) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(url.pathname + url.search + url.hash);
  }, true);

  var form = document.querySelector('form[action="/submit.php"]');
  if (form) {
    var started = document.createElement("input");
    started.type = "hidden";
    started.name = "started_at";
    started.value = String(Date.now());
    form.appendChild(started);
  }

  var params = new URLSearchParams(window.location.search);
  var status = params.get("status");
  var englishStatus = document.documentElement.lang && document.documentElement.lang.indexOf("en") === 0;
  var messages = englishStatus ? {
    "incomplete": "Some required fields are incomplete. Review the brief and submit again.",
    "contact": "Enter at least one professional email address or contact number.",
    "email": "The email address format is not valid.",
    "phone": "The contact number format is not valid.",
    "security": "The request source could not be verified. Open the form directly from this website.",
    "send-error": "The brief could not be sent. Email info@osoulhospitality.com or use WhatsApp."
  } : {
    "incomplete": "بعض الحقول المطلوبة غير مكتملة. راجع الموجز ثم أعد الإرسال.",
    "contact": "أدخل بريدًا مهنيًا أو رقم تواصل واحدًا على الأقل.",
    "email": "صيغة البريد الإلكتروني غير صحيحة.",
    "phone": "صيغة رقم التواصل غير صحيحة.",
    "security": "تعذر التحقق من مصدر الطلب. أعد فتح النموذج من الموقع مباشرة.",
    "send-error": "تعذر إرسال الموجز الآن. أرسله إلى info@osoulhospitality.com أو استخدم واتساب."
  };
  if (status && messages[status]) {
    var card = document.getElementById("project-brief");
    if (card) {
      var alert = document.createElement("div");
      alert.className = "form-alert";
      alert.setAttribute("role", "alert");
      alert.textContent = messages[status];
      card.insertBefore(alert, card.firstChild);
    }
  }
})();

(function () {
  "use strict";

  var serviceCards = [
    ["01", "الاستراتيجية والاستثمار", "من الفكرة إلى قرار استثماري قابل للدفاع.", ["الاستراتيجيات وخطط النمو", "دراسات السوق والطلب والجدوى", "تحليل المواقع والمفاهيم", "دخول السوق والشراكات"]],
    ["02", "الترخيص والامتثال", "نحوّل الاشتراطات إلى مسار واضح ومسؤوليات قابلة للإغلاق.", ["الترخيص والتصنيف والتجديد", "التدقيق والجاهزية الرقابية", "خطط معالجة المخالفات", "الامتثال التشغيلي المستمر"]],
    ["03", "التطوير وما قبل الافتتاح", "نربط التصميم والتجهيز والتشغيل قبل أن تصبح الفجوة تكلفة.", ["تطوير المفهوم والتصميم التشغيلي", "مراجعة المخططات وBOH", "المشتريات وتجهيز الأصل", "خطة الافتتاح واختبارات الجاهزية"]],
    ["04", "التشغيل وتحسين الربحية", "نكشف تسرب الأرباح ونحوّل التشخيص إلى برنامج تنفيذ وقياس.", ["تحليل P&L والتكاليف", "إجراءات التشغيل والجودة", "تجربة النزيل والإنتاجية", "إعادة الهيكلة والتحول"]],
    ["05", "الإيرادات والمبيعات", "نربط التسعير والتوزيع والطلب بهدف تجاري واحد.", ["إدارة الإيرادات والتسعير", "المبيعات والحسابات المؤسسية", "القنوات والتوزيع", "تحسين ADR والإشغال وRevPAR"]],
    ["06", "إدارة الأصول وتمثيل المالك", "رؤية مستقلة تحمي قرار المالك وتضبط أداء المشغّل.", ["مراجعة المشغّل والميزانيات", "اختيار المشغّل ودعم التفاوض", "حوكمة التقارير والقرارات", "خطط CapEx وتعظيم قيمة الأصل"]]
  ];

  var catalogCards = [
    ["01", "الاستراتيجية ودراسات الجدوى", "قرارات تأسيس ونمو مبنية على السوق والطلب والسيناريوهات.", ["استراتيجيات سياحية", "دراسة سوق وطلب", "جدوى تشغيلية ومالية", "تحليل موقع ومنافسين", "تطوير المفهوم", "خطة دخول السوق"]],
    ["02", "الترخيص والتصنيف والامتثال", "إدارة المسار النظامي من التأسيس حتى التجديد والجاهزية الرقابية.", ["تراخيص وزارة السياحة", "التصنيف والتجديد", "البلدية والسلامة عبر مختصين", "تدقيق الامتثال", "معالجة المخالفات", "جاهزية التفتيش"]],
    ["03", "التطوير والتصميم التشغيلي", "مواءمة المنتج والمخططات والتكلفة مع تجربة الضيف والتشغيل.", ["مزيج الوحدات", "BOH ومسارات الخدمة", "مراجعة المخططات", "متطلبات المشغّل", "المشتريات وFF&E/OS&E", "الاستلام والتسليم"]],
    ["04", "ما قبل الافتتاح والتشغيل", "تحويل الأصل من مشروع مكتمل إلى منشأة تعمل بثبات ومعايير واضحة.", ["خطة ما قبل الافتتاح", "الميزانية والتوظيف", "SOPs والتدريب", "اختبارات الجاهزية", "الجودة وتجربة النزيل", "برنامج استقرار 90 يومًا"]],
    ["05", "الأداء والربحية والموردون", "قراءة متكاملة للإيراد والتكلفة والعقود تكشف أين تتسرب الأرباح.", ["تحليل P&L", "تكلفة الوحدة والإقامة", "مقارنة الفواتير والأسعار", "تدقيق العقود والنطاقات", "تقييم الموردين", "برامج خفض الهدر"]],
    ["06", "الإيرادات والمبيعات والتوزيع", "رفع جودة القرار التجاري عبر التسعير والطلب والقنوات والمبيعات.", ["Revenue Management", "ADR وRevPAR", "OTA والقنوات المباشرة", "الحسابات المؤسسية", "التسويق التجاري", "لوحات الأداء"]],
    ["07", "تمثيل المالك وإدارة الأصول", "صوت مستقل للمالك يربط أداء المشغّل والميزانية والمخاطر بالقيمة.", ["مراجعة أداء المشغّل", "التقارير الشهرية للمالك", "اختيار المشغّل", "مراجعة HMA والنطاق", "خطط CapEx", "حوكمة القرار والتصعيد"]],
    ["08", "التحول المؤسسي والتقني", "بناء قدرة تشغيلية قابلة للتوسع بدل حلول متفرقة لا تتكامل.", ["PMS وCRM والتكاملات", "الأتمتة والذكاء الاصطناعي", "الموارد البشرية والتوطين", "إدارة المرافق ودورة الحياة", "إعادة الهيكلة", "الشريك المحلي للمستثمر الدولي"]]
  ];

  function create(tag, className, html) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (html) element.innerHTML = html;
    return element;
  }

  function setText(selector, value) {
    var element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function setHTML(selector, value) {
    var element = document.querySelector(selector);
    if (element) element.innerHTML = value;
  }

  function list(items) {
    return "<ul>" + items.map(function (item) { return "<li>" + item + "</li>"; }).join("") + "</ul>";
  }

  function addStylesheet() {
    ["/site-v13.css", "/site-v14.css"].forEach(function (href) {
      if (document.querySelector('link[href="' + href + '"]')) return;
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });
  }

  function updateMeta(name, content, property) {
    var selector = property ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    var meta = document.querySelector(selector);
    if (meta) meta.setAttribute("content", content);
  }

  function enhanceCommon() {
    var english = document.documentElement.lang && document.documentElement.lang.indexOf("en") === 0;
    var header = document.querySelector(".site-header");
    if (header) header.classList.add("osoul-v13-header");
    document.querySelectorAll(".brand-lockup small").forEach(function (node) {
      node.textContent = english ? "Strategy • Execution • Growth" : "استراتيجية • تنفيذ • نمو";
    });
    if (!english) {
      var bilingualRoutes = ["/solutions", "/outputs", "/about", "/scenarios", "/insights", "/contact", "/privacy", "/terms", "/accessibility", "/thank-you"];
      var currentPath = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "") || "/";
      var englishPath = currentPath === "/" ? "/en/" : (bilingualRoutes.some(function (route) { return currentPath === route || currentPath.indexOf(route + "/") === 0; }) ? "/en" + currentPath + "/" : "/en/");
      document.querySelectorAll("a.language-link").forEach(function (node) { node.setAttribute("href", englishPath); });
      document.querySelectorAll('a[href="/solutions"]').forEach(function (node) {
        if (node.textContent.trim() === "كيف تبدأ") node.textContent = "الخدمات";
      });
      document.querySelectorAll(".header-actions .button-small").forEach(function (node) {
        node.innerHTML = 'ابدأ مشروعك <span aria-hidden="true">←</span>';
      });
      document.querySelectorAll(".mobile-menu .mobile-cta").forEach(function (node) { node.textContent = "ابدأ مشروعك"; });
      var footerCopy = document.querySelector(".site-footer .footer-brand > p");
      if (footerCopy) footerCopy.textContent = "بيت خبرة سعودي متخصص في الاستشارات السياحية، يجمع الاستراتيجية والدراسات والامتثال والتطوير والتشغيل وتحسين الربحية، ويقود التنفيذ حتى ظهور نتائج قابلة للقياس.";
    }
  }

  function enhanceHome() {
    if (location.pathname !== "/" && location.pathname !== "/index.html") return;
    document.body.classList.add("osoul-v13-home");
    var hero = document.querySelector(".hero");
    if (!hero) return;
    hero.classList.add("osoul-v13-home-hero");
    setHTML(".hero .eyebrow", "<i></i> بيت خبرة سعودي متخصص في الاستشارات السياحية وتطوير منشآت الضيافة");
    setHTML(".hero h1", "من الفكرة والتحدي<br><em>إلى أصل ينجح وينمو.</em>");
    setText(".hero-copy > p", "نقدّم الاستراتيجية والدراسات والترخيص والتطوير والتشغيل وتحسين الربحية، ثم نقود التنفيذ من القرار الأول حتى استقرار الأداء—بخبرة ميدانية، بيانات موثقة، ومسؤوليات واضحة.");
    var heroButtons = document.querySelectorAll(".hero-actions a");
    if (heroButtons[0]) heroButtons[0].innerHTML = 'ابدأ مشروعك <span aria-hidden="true">←</span>';
    if (heroButtons[1]) heroButtons[1].innerHTML = 'استعرض جميع الخدمات <span aria-hidden="true">←</span>';
    var trust = document.querySelector(".hero-trust");
    if (trust) trust.innerHTML = "<span>◉ استشارة موثقة</span><span>◉ تنفيذ منضبط</span><span>◉ نتيجة قابلة للقياس</span>";
    if (!document.querySelector(".osoul-v13-license-note")) {
      var note = create("div", "osoul-v13-license-note", "الخدمات ذات الاعتماد المستقل تُنفذ عبر شركاء ومختصين مرخصين ضمن حوكمة أصول.");
      trust.insertAdjacentElement("afterend", note);
    }
    setText(".decision-head small", "منظومة القيمة");
    setText(".decision-head strong", "رحلة الأصل السياحي");
    var rows = document.querySelectorAll(".decision-row");
    var rowCopy = [
      ["استراتيجيًا", "السوق • الجدوى • المفهوم"],
      ["نظاميًا", "الترخيص • التصنيف • الامتثال"],
      ["تشغيليًا", "الفريق • الجودة • التكاليف"],
      ["تجاريًا", "الإيراد • المبيعات • النمو"]
    ];
    rows.forEach(function (row, index) {
      if (!rowCopy[index]) return;
      var strong = row.querySelector("strong");
      var small = row.querySelector("small");
      if (strong) strong.textContent = rowCopy[index][0];
      if (small) small.textContent = rowCopy[index][1];
    });
    var decisionFoot = document.querySelector(".decision-foot");
    if (decisionFoot) decisionFoot.innerHTML = "<span>تشخيص</span><span>←</span><span>قرار</span><span>←</span><span>تنفيذ</span><span>←</span><span>قياس</span>";
    setText(".illustrative-note", "إطار توضيحي؛ نطاق كل مهمة يحدد بعد مراجعة بيانات العميل.");

    if (!document.getElementById("osoul-full-services")) {
      var capabilities = create("section", "osoul-v13-section osoul-v13-capabilities", '<div class="shell"><div class="osoul-v13-heading"><span>بيت خبرة بدورة حياة كاملة</span><h2>كل ما يحتاجه المستثمر والمالك والمشغّل—تحت قيادة واحدة.</h2><p>نعرض قدرات متكاملة، ثم نصمم للعميل نطاقًا مركزًا يبدأ من مشكلته الفعلية ويتوسع فقط عندما يثبت الأثر.</p></div><div class="osoul-v13-capability-grid">' + serviceCards.map(function (card) { return '<article class="osoul-v13-capability"><span class="osoul-v13-number">' + card[0] + '</span><h3>' + card[1] + '</h3><p>' + card[2] + '</p>' + list(card[3]) + '</article>'; }).join("") + '</div><div class="osoul-v13-promise"><div><h3>الاستشارة لا تنتهي عند التقرير.</h3><p>نحوّل التوصية إلى مسؤول وموعد ومؤشر نجاح ودليل إغلاق، ونبقى مع العميل حتى تثبيت النتيجة.</p></div><a class="button" href="/solutions">استعرض المحفظة الكاملة</a></div></div>');
      capabilities.id = "osoul-full-services";
      var problem = document.querySelector(".problem-section");
      if (problem) problem.insertAdjacentElement("beforebegin", capabilities);
    }

    if (!document.getElementById("osoul-client-paths")) {
      var pathways = create("section", "osoul-v13-section osoul-v13-pathways", '<div class="shell"><div class="osoul-v13-heading osoul-v13-heading-light"><span>ثلاث رحلات عميل واضحة</span><h2>مهما كانت نقطة البداية، نعرف ما هو القرار التالي.</h2><p>لا نبيع قائمة خدمات محفوظة؛ نبني مسارًا يناسب مرحلة الأصل ومشكلة صاحبه.</p></div><div class="osoul-v13-path-grid"><article class="osoul-v13-path"><span>مستثمر أو مشروع جديد</span><h3>من الفرصة إلى الافتتاح</h3><ol><li>دراسة السوق والجدوى</li><li>المفهوم والتصميم التشغيلي</li><li>الترخيص وخطة التطوير</li><li>ما قبل الافتتاح والتشغيل التجريبي</li><li>استقرار الأداء والنمو</li></ol><a href="/contact">ابدأ دراسة المشروع ←</a></article><article class="osoul-v13-path"><span>منشأة قائمة</span><h3>من التعثر إلى الربحية</h3><ol><li>تشخيص 360 درجة</li><li>تحليل الإيرادات والتكاليف</li><li>تدقيق العقود والموردين</li><li>برنامج تصحيح 30/60/90</li><li>متابعة المؤشرات والتحسين</li></ol><a href="/contact">اطلب تشخيص المنشأة ←</a></article><article class="osoul-v13-path"><span>مالك مع مشغّل</span><h3>من التقارير إلى السيطرة</h3><ol><li>مراجعة العقود والالتزامات</li><li>توحيد مؤشرات المالك</li><li>مراجعة الميزانية والأداء</li><li>حوكمة القرار والتصعيد</li><li>تعظيم قيمة الأصل</li></ol><a href="/contact">ناقش تمثيل المالك ←</a></article></div></div>');
      pathways.id = "osoul-client-paths";
      var method = document.querySelector(".method-section");
      if (method) method.insertAdjacentElement("beforebegin", pathways);
    }

    if (!document.getElementById("osoul-operating-model")) {
      var model = create("section", "osoul-v13-section osoul-v13-model", '<div class="shell"><div class="osoul-v13-heading"><span>نموذج أصول</span><h2>استشارة تفهم القرار. تنفيذ يغلق الفجوة. ذكاء يحسّن الحكم.</h2><p>التميّز ليس في كلمة 360 أو الذكاء الاصطناعي؛ بل في دمج الخبرة الميدانية والبيانات والتنفيذ ضمن نظام مسؤولية واحد.</p></div><div class="osoul-v13-model-grid"><article class="osoul-v13-model-card"><small>ADVISORY</small><h3>الاستشارات</h3><p>دراسات وتشخيص واستراتيجية وتوصيات موثقة تساعد الإدارة والمستثمر على اتخاذ قرار قابل للدفاع.</p><strong>المخرج: قرار واضح ونطاق قابل للتنفيذ</strong></article><article class="osoul-v13-model-card"><small>EXECUTION</small><h3>التنفيذ</h3><p>قيادة خطط التصحيح والتطوير والافتتاح والتحول حتى إغلاق الفجوات وظهور الأثر.</p><strong>المخرج: نتائج مثبتة لا تقارير نائمة</strong></article><article class="osoul-v13-model-card"><small>INTELLIGENCE</small><h3>الذكاء والأداء</h3><p>قواعد معرفة ومقارنات أسعار وعقود ومؤشرات وتحليل مدعوم بالذكاء الاصطناعي لتحسين جودة القرار.</p><strong>المخرج: سرعة أدق وذاكرة مؤسسية</strong></article></div></div>');
      model.id = "osoul-operating-model";
      var leadership = document.querySelector(".leadership-section");
      if (leadership) leadership.insertAdjacentElement("beforebegin", model);
    }

    document.title = "أصول الضيافة | بيت خبرة سعودي للاستشارات السياحية والتنفيذ";
    updateMeta("description", "بيت خبرة سعودي متخصص في الاستشارات السياحية يقدم الاستراتيجية ودراسات الجدوى والترخيص والتطوير والتشغيل وتحسين الربحية وتمثيل المالك، ويقود التنفيذ في المملكة العربية السعودية.");
    updateMeta("og:title", "أصول الضيافة | استشارات سياحية وتنفيذ من الفكرة إلى النمو", true);
    updateMeta("og:description", "استراتيجية ودراسات وترخيص وتطوير وتشغيل وتحسين ربحية وتمثيل مالك تحت قيادة واحدة.", true);
  }

  function enhanceSolutions() {
    if (location.pathname.indexOf("/solutions") !== 0) return;
    var intro = document.querySelector(".page-intro");
    if (intro) intro.classList.add("osoul-v13-page-intro");
    setHTML(".page-intro .eyebrow", "<i></i> محفظة الخدمات");
    setText(".page-intro h1", "بيت خبرة متكامل يخدم دورة حياة المشروع السياحي.");
    setText(".page-intro p", "من الاستراتيجية والجدوى والترخيص إلى التطوير والافتتاح والتشغيل وتحسين الربحية وتمثيل المالك. نختار معك نقطة البداية الصحيحة، ثم نقود التنفيذ ضمن نطاق ومسؤوليات ومؤشرات واضحة.");
    if (!document.getElementById("osoul-service-catalog")) {
      var catalog = create("section", "osoul-v13-section osoul-v13-catalog", '<div class="shell"><div class="osoul-v13-heading"><span>المحفظة الكاملة</span><h2>ثمانية مسارات. جهة قيادة واحدة.</h2><p>يمكن شراء كل مسار كمهمة مستقلة، أو دمج المسارات ضمن برنامج تطوير أو تحول متكامل حسب مرحلة الأصل.</p></div><div class="osoul-v13-catalog-grid">' + catalogCards.map(function (card) { return '<article class="osoul-v13-catalog-card"><header><span>' + card[0] + '</span><h2>' + card[1] + '</h2></header><p>' + card[2] + '</p>' + list(card[3]) + '</article>'; }).join("") + '</div><div class="osoul-v13-promise"><div><h3>نطاق واحد لا يعني فريقًا واحدًا ثابتًا.</h3><p>تُدار المهمة بنواة استشارية واضحة، وتُستدعى التخصصات الهندسية والقانونية والمالية والتقنية المرخصة عند الحاجة، مع بقاء أصول جهة التكامل والقيادة.</p><div class="osoul-v13-pill-row"><span>استراتيجية</span><span>مالية</span><span>تشغيل</span><span>تقنية</span><span>موارد بشرية</span><span>هندسة وسلامة عبر مختصين</span></div></div><a class="button" href="/contact">صمّم نطاق مشروعك</a></div></div>');
      catalog.id = "osoul-service-catalog";
      var entry = document.querySelector(".entry-products-section");
      if (entry) entry.insertAdjacentElement("beforebegin", catalog);
    }
    document.title = "خدمات أصول الضيافة | الاستشارات السياحية والتطوير والتشغيل";
  }

  function enhanceAbout() {
    if (location.pathname.indexOf("/about") !== 0) return;
    var intro = document.querySelector(".page-intro");
    if (intro) intro.classList.add("osoul-v13-page-intro");
    setHTML(".page-intro .eyebrow", "<i></i> من نحن");
    setText(".page-intro h1", "خبرة ميدانية تقود القرار من الاستراتيجية حتى التنفيذ.");
    setText(".page-intro p", "أصول الضيافة بيت خبرة سعودي متخصص في الاستشارات السياحية، بُني لسد الفجوة بين التقرير الاستشاري والواقع التشغيلي. نجمع خبرات السوق والامتثال والتطوير والأداء ضمن قيادة واحدة تخدم المستثمر والمالك والمشغّل.");
    document.title = "عن أصول الضيافة | خبرة سعودية في الاستشارات السياحية والتنفيذ";
  }

  function enhanceContact() {
    if (location.pathname.indexOf("/contact") !== 0) return;
    var intro = document.querySelector(".page-intro");
    if (intro) intro.classList.add("osoul-v13-page-intro");
    setText(".page-intro h1", "حدثنا عن الفرصة أو المشكلة—ونحوّلها إلى مسار عمل.");
    setText(".page-intro p", "سواء كنت تبدأ مشروعًا جديدًا، تعالج تعثرًا قائمًا، أو تحتاج جهة مستقلة تمثل المالك: أرسل موجزًا أوليًا دون بيانات سرية، وسنحدد المسار الأنسب خلال يومي عمل.");
    document.title = "ابدأ مشروعك | أصول الضيافة للاستشارات السياحية";
  }

  function enhanceEnglish() {
    if (location.pathname.indexOf("/en") !== 0) return;
    document.body.classList.add("english-page");
    if (location.pathname !== "/en" && location.pathname !== "/en/" && location.pathname !== "/en/index.html") return;
    setText(".english-hero .shell > span", "Saudi tourism advisory, execution and intelligence");
    setHTML(".english-hero h1", "From opportunity and complexity<br><span class=\"osoul-v13-accent\">to a hospitality asset that performs.</span>");
    setText(".english-hero p", "Osool Hospitality brings strategy, feasibility, licensing, development, operations, profitability improvement and owner representation under one accountable Saudi-led advisory platform.");
    document.title = "Osool Hospitality | Saudi Tourism Advisory and Execution";
  }

  function applyEnhancements() {
    addStylesheet();
    enhanceCommon();
    enhanceHome();
    enhanceSolutions();
    enhanceAbout();
    enhanceContact();
    enhanceEnglish();
    document.documentElement.setAttribute("data-osoul-version", "14");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyEnhancements, { once: true });
  } else {
    applyEnhancements();
  }
  window.addEventListener("load", applyEnhancements, { once: true });
  window.setTimeout(applyEnhancements, 800);
})();
