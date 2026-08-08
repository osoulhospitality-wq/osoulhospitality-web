export const UPDATED = "2026-08-08";

export const categories = [
  { id: "compliance", ar: "التراخيص والامتثال", en: "Licensing & compliance" },
  { id: "performance", ar: "الأداء والربحية", en: "Performance & profitability" },
  { id: "commercial", ar: "الإيرادات والمبيعات", en: "Revenue & sales" },
  { id: "development", ar: "التطوير والافتتاح", en: "Development & opening" },
  { id: "ownership", ar: "المالك والتقنية والحوكمة", en: "Ownership, technology & governance" }
];

const S = {
  mtReg: { ar: "لائحة خدمات الاستشارات السياحية — وزارة السياحة", en: "Tourism Consultation Services Regulation — Ministry of Tourism", url: "https://cdn.mt.gov.sa/mtportal/mt-fe-production/content/policies-regulations/documents/tourism-regulations/Tourism-Consultation-Regulations-Ar-V012.pdf" },
  portal: { ar: "بوابة تراخيص الأنشطة السياحية", en: "Tourism Activities Licensing Portal", url: "https://tlg.mt.gov.sa/" },
  services: { ar: "الخدمات الإلكترونية — وزارة السياحة", en: "E-services — Ministry of Tourism", url: "https://mt.gov.sa/e-services" },
  violations: { ar: "جدول مخالفات مرافق الضيافة السياحية", en: "Tourism Hospitality Facilities Violations Schedule", url: "https://cdn.mt.gov.sa/mtportal/mt-fe-production/content/policies-regulations/documents/tourism-regulations/Hospitality-Facilities-Violations-Ar-V011.pdf" },
  manage: { ar: "دليل خدمة إدارة مرافق الضيافة", en: "Hospitality Facilities Management Service Guide", url: "https://cdn.mt.gov.sa/mtportal/mt-fe-production/content/policies-regulations/documents/services-directory/Management-of-Hospitality-Facilities-Regulations-service-directory-Ar-V012.pdf" },
  data: { ar: "دليل البيانات التشغيلية للمستثمر — وزارة السياحة", en: "Investor Operational Data Guide — Ministry of Tourism", url: "https://cdn.mt.gov.sa/files/InvestorDataGuide.pdf" },
  saud: { ar: "سياسات وقواعد التوطين في القطاع السياحي", en: "Tourism-sector Saudisation Policies and Rules", url: "https://cdn.mt.gov.sa/mtportal/mt-fe-production/content/policies-regulations/documents/tourism-regulations/Saudization-Policies-Rules-Ar-V01.pdf" },
  pdpl: { ar: "اللائحة التنفيذية لنظام حماية البيانات الشخصية — سدايا", en: "PDPL Executive Regulations — SDAIA", url: "https://sdaia.gov.sa/ar/Research/Documents/ExecutiveRegulations.pdf" },
  transfer: { ar: "لائحة نقل البيانات الشخصية خارج المملكة", en: "Personal Data Transfer Outside the Kingdom Regulation", url: "https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/RegulationonPersonalDataTransferOutsidetheKingdom" },
  zatca: { ar: "الفوترة الإلكترونية — هيئة الزكاة والضريبة والجمارك", en: "E-invoicing — ZATCA", url: "https://zatca.gov.sa/ar/E-Invoicing/Pages/default.aspx" }
};

function entry(slug, category, ar, en, sources = [S.data]) {
  return { slug, category, ...ar, ...en, sources };
}

export const articles = [
  entry("hospitality-licensing-roadmap", "compliance", {
    titleAr: "خارطة ترخيص مرفق ضيافة سياحي: من الفكرة إلى التشغيل",
    excerptAr: "مسار عملي يربط الكيان والنشاط والموقع والتصنيف والأدلة بدل التعامل مع الترخيص كطلب منفصل في نهاية المشروع.",
    diagnosisAr: ["تثبيت نوع المرفق والنشاط قبل التصميم", "مطابقة بيانات الكيان والعقار والعقود", "حصر الموافقات والاعتماديات المتوازية", "تعيين مالك لكل متطلب ودليل إغلاق"],
    actionsAr: ["ابنِ سجل متطلبات واحدًا بتاريخ ومسؤول وحالة", "راجع أثر التصنيف المستهدف على التصميم والتجهيز", "افصل ما تصدره المنشأة عما يصدره مختص مرخص", "نفّذ مراجعة أدلة قبل كل تقديم", "ضع هامشًا للمعالجة وإعادة الرفع"],
    metricsAr: ["نسبة المتطلبات المغلقة بالدليل", "عدد الاعتماديات الحرجة غير المحسومة", "المدة بين أول تقديم والإصدار"],
    mistakesAr: ["بدء التأثيث قبل تثبيت الفئة", "رفع ملفات بأسماء أو تواريخ متعارضة", "اعتبار موافقة واحدة بديلًا عن بقية الجهات"]
  }, {
    titleEn: "A Hospitality Facility Licensing Roadmap: From Concept to Operations",
    excerptEn: "A practical route that connects entity, activity, site, classification and evidence instead of treating the licence as a last-minute application.",
    diagnosisEn: ["Confirm facility type and activity before design", "Reconcile entity, property and contract data", "Map parallel approvals and dependencies", "Assign an owner and closure evidence to every requirement"],
    actionsEn: ["Maintain one requirement register with dates, owners and status", "Test the target classification against design and equipment", "Separate operator evidence from licensed-specialist deliverables", "Run an evidence review before every submission", "Allow time for remediation and resubmission"],
    metricsEn: ["Requirements closed with accepted evidence", "Unresolved critical dependencies", "Elapsed time from first submission to issue"],
    mistakesEn: ["Buying furniture before confirming the category", "Submitting conflicting names or dates", "Treating one approval as a substitute for all others"]
  }, [S.portal, S.services, S.manage]),

  entry("licence-classification-operations", "compliance", {
    titleAr: "الترخيص والتصنيف والتشغيل: ثلاثة ملفات لا ملف واحد",
    excerptAr: "فهم الفرق بين الإذن النظامي ومستوى المنتج والقدرة التشغيلية يمنع افتتاح منشأة مرخصة لكنها غير جاهزة.",
    diagnosisAr: ["تعريف قرار كل مسار وحدوده", "ربط اشتراطات التصنيف بالمواصفات الفعلية", "اختبار الجاهزية التشغيلية بعيدًا عن اكتمال الأعمال", "توحيد سجل الأدلة والملاحظات"],
    actionsAr: ["أنشئ ثلاث بوابات قرار منفصلة", "حدّد الأدلة المطلوبة لكل بوابة", "راجع التعارض بين المخططات والتشغيل", "اختبر الخدمة قبل استقبال النزيل", "لا تعلن الافتتاح قبل إغلاق المتطلبات الحرجة"],
    metricsAr: ["جاهزية الترخيص", "مطابقة التصنيف", "نجاح اختبارات التشغيل"],
    mistakesAr: ["اعتبار الرخصة شهادة جودة", "خلط قائمة الأثاث بقائمة التشغيل", "تجاهل تدريب الفريق"]
  }, {
    titleEn: "Licence, Classification and Operations: Three Files, Not One",
    excerptEn: "Separating regulatory permission, product standard and operating capability prevents a licensed facility from opening unready.",
    diagnosisEn: ["Define the decision and boundary of each workstream", "Connect classification requirements to actual specifications", "Test operating readiness separately from construction completion", "Unify evidence and observation logs"],
    actionsEn: ["Create three separate decision gates", "Define evidence for each gate", "Review conflicts between drawings and operations", "Test service before accepting guests", "Do not announce opening before critical closure"],
    metricsEn: ["Licence readiness", "Classification conformity", "Operating-test pass rate"],
    mistakesEn: ["Treating a licence as a quality certificate", "Confusing the furniture list with operating readiness", "Ignoring team training"]
  }, [S.portal, S.manage]),

  entry("serviced-apartment-licence-renewal", "compliance", {
    titleAr: "تجديد ترخيص الشقق المخدومة دون سباق اللحظة الأخيرة",
    excerptAr: "تقويم امتثال سنوي يحوّل التجديد من حملة طارئة إلى عملية دورية موثقة.",
    diagnosisAr: ["تاريخ انتهاء كل وثيقة مرتبطة", "التغييرات في الملكية أو الإدارة أو السعة", "الملاحظات المفتوحة من الزيارات السابقة", "سلامة النسخ المعتمدة وسهولة استرجاعها"],
    actionsAr: ["ابدأ المراجعة قبل الاستحقاق بوقت كافٍ", "حدّث سجل الوثائق شهريًا", "أغلق الملاحظات بصور ومحاضر", "نفّذ تدقيقًا داخليًا مفاجئًا", "اربط التجديد بلوحة مسؤوليات الإدارة"],
    metricsAr: ["وثائق سارية", "ملاحظات متأخرة", "طلبات إعادة الاستكمال"],
    mistakesAr: ["الاعتماد على ذاكرة موظف واحد", "رفع مستند قديم بعد تغيير المشغّل", "تأجيل الصيانة الظاهرة"]
  }, {
    titleEn: "Renewing a Serviced-Apartment Licence Without a Last-Minute Rush",
    excerptEn: "An annual compliance calendar turns renewal from an emergency campaign into a documented routine.",
    diagnosisEn: ["Expiry dates of every linked document", "Changes in ownership, management or capacity", "Open findings from previous visits", "Integrity and retrievability of approved copies"],
    actionsEn: ["Start the review well before the due date", "Refresh the document register monthly", "Close findings with photos and minutes", "Run an unannounced internal audit", "Put renewal ownership on management dashboards"],
    metricsEn: ["Valid-document ratio", "Overdue findings", "Resubmission requests"],
    mistakesEn: ["Relying on one employee's memory", "Submitting an old document after an operator change", "Deferring visible maintenance defects"]
  }, [S.portal, S.services, S.violations]),

  entry("audit-ready-compliance-register", "compliance", {
    titleAr: "كيف تبني سجل امتثال قابلًا للتدقيق؟",
    excerptAr: "السجل الجيد لا يسرد المتطلبات فقط؛ بل يثبت المصدر والمالك والدورية والدليل والقرار.",
    diagnosisAr: ["مصدر كل التزام وإصداره", "صاحب المسؤولية التنفيذية", "تاريخ التحقق التالي", "رابط الدليل ومراجعته"],
    actionsAr: ["استخدم رقمًا فريدًا لكل التزام", "سجّل النص المصدر دون اجتزاء مضلل", "اربط كل حالة بدليل مؤرخ", "ضع مراجعة مستقلة للمتطلبات الحرجة", "احفظ سجل التغيير بدل استبدال النسخة"],
    metricsAr: ["تغطية الأدلة", "متوسط عمر الملاحظة", "نسبة المراجعات في موعدها"],
    mistakesAr: ["قائمة بلا روابط أدلة", "وصف مبهم للمسؤول", "حذف أثر القرارات السابقة"]
  }, {
    titleEn: "How to Build an Audit-Ready Compliance Register",
    excerptEn: "A sound register does more than list requirements: it proves source, ownership, frequency, evidence and decision history.",
    diagnosisEn: ["Source and version of every obligation", "Named executive owner", "Next verification date", "Evidence link and reviewer"],
    actionsEn: ["Give every obligation a unique ID", "Record the source without misleading truncation", "Support every status with dated evidence", "Add independent review for critical controls", "Preserve change history instead of overwriting it"],
    metricsEn: ["Evidence coverage", "Average age of open findings", "Reviews completed on time"],
    mistakesEn: ["A list with no evidence links", "Vague accountability", "Deleting the trail of earlier decisions"]
  }, [S.mtReg, S.violations]),

  entry("hospitality-violations-evidence-control", "compliance", {
    titleAr: "المخالفات المتكررة: كيف يمنعها نظام أدلة؟",
    excerptAr: "الإجراء الشفهي لا يصمد أمام تبدل المناوبات؛ الوقاية تحتاج ضابطًا واضحًا ودليلًا متكررًا وتصعيدًا.",
    diagnosisAr: ["المخالفة الأعلى احتمالًا وأثرًا", "السبب الجذري لا العرض", "نقطة الكشف المبكر", "الدليل الذي يثبت استمرار الضبط"],
    actionsAr: ["رتّب المخاطر بالأثر والاحتمال", "حوّل كل خطر إلى فحص دوري", "استخدم عينات لا توقيعات شكلية", "صعّد التأخير تلقائيًا", "راجع تكرار السبب بعد الإغلاق"],
    metricsAr: ["تكرار الملاحظة", "زمن الإغلاق", "فعالية الإجراء التصحيحي"],
    mistakesAr: ["إغلاق الملاحظة بصورة واحدة", "معالجة الموظف بدل العملية", "غياب تحقق ما بعد الإغلاق"]
  }, {
    titleEn: "Recurring Violations: Preventing Them With Evidence Controls",
    excerptEn: "Verbal instructions do not survive shift changes; prevention requires a clear control, recurring evidence and escalation.",
    diagnosisEn: ["Highest-likelihood and highest-impact breach", "Root cause rather than symptom", "Early detection point", "Evidence that proves the control keeps working"],
    actionsEn: ["Rank risks by impact and likelihood", "Convert each risk into a periodic check", "Use samples rather than ceremonial signatures", "Escalate overdue actions automatically", "Test whether the cause returns after closure"],
    metricsEn: ["Repeat-finding rate", "Closure time", "Corrective-action effectiveness"],
    mistakesEn: ["Closing a finding with one photograph", "Blaming a person instead of fixing the process", "No post-closure verification"]
  }, [S.violations, S.manage]),

  entry("saudisation-operating-readiness", "compliance", {
    titleAr: "التوطين كجزء من جاهزية التشغيل لا كرقم منفصل",
    excerptAr: "الخطة الفعالة تربط الوظائف المستهدفة بخريطة المناوبات والتدريب والمسار المهني واستمرارية الخدمة.",
    diagnosisAr: ["الوظائف والنسب والقرارات السارية", "الفجوة بحسب الإدارة والمناوبة", "جاهزية التدريب والتوجيه", "مخاطر التسرب الوظيفي"],
    actionsAr: ["ثبّت المرجع النظامي وتاريخ المراجعة", "ابنِ خطة قوى عاملة حسب الطلب", "اربط التوظيف بخطة تعلم عملية", "عيّن بدائل للوظائف الحرجة", "راجع الاستبقاء لا التعيين فقط"],
    metricsAr: ["الامتثال حسب الفئة", "زمن بلوغ الكفاءة", "الاستبقاء بعد 90 يومًا"],
    mistakesAr: ["احتساب إجمالي مضلل", "توظيف بلا مدرب أو مناوبة", "تغيير المسميات دون تغيير العمل"]
  }, {
    titleEn: "Saudisation as Operating Readiness, Not an Isolated Ratio",
    excerptEn: "An effective plan connects targeted roles to rosters, training, career paths and service continuity.",
    diagnosisEn: ["Current roles, ratios and decisions", "Gap by department and shift", "Training and coaching capacity", "Retention risks"],
    actionsEn: ["Record the governing source and review date", "Build a demand-based workforce plan", "Link recruitment to practical learning", "Name deputies for critical roles", "Measure retention, not hiring alone"],
    metricsEn: ["Compliance by category", "Time to competence", "Ninety-day retention"],
    mistakesEn: ["Using a misleading total ratio", "Hiring without a coach or roster", "Renaming jobs without changing the work"]
  }, [S.saud]),

  entry("pdpl-for-hospitality", "compliance", {
    titleAr: "حماية البيانات في الضيافة: ماذا نجمع ولماذا؟",
    excerptAr: "بيانات الحجز والهوية والدفع والتفضيلات تتنقل بين أنظمة وأطراف؛ الحوكمة تبدأ بحصر التدفق والغرض والصلاحية.",
    diagnosisAr: ["فئات البيانات ونقاط الجمع", "الغرض والأساس والمدة", "الأطراف المستلمة داخل المملكة وخارجها", "الصلاحيات وسجلات الوصول"],
    actionsAr: ["ارسم خريطة تدفق البيانات", "قلّل الحقول إلى ما يلزم", "وثّق الإشعارات والموافقات عند الحاجة", "راجع عقود المعالجين والنقل", "اختبر الاستجابة للحوادث والطلبات"],
    metricsAr: ["أنظمة مغطاة بالسجل", "صلاحيات زائدة مغلقة", "زمن الاستجابة للطلب"],
    mistakesAr: ["نسخ الجوازات بلا سياسة احتفاظ", "حسابات مشتركة", "نقل بيانات دون تقييم مناسب"]
  }, {
    titleEn: "Data Protection in Hospitality: What Do We Collect and Why?",
    excerptEn: "Booking, identity, payment and preference data moves across systems and parties; governance starts with flow, purpose and authority.",
    diagnosisEn: ["Data classes and collection points", "Purpose, basis and retention", "Recipients inside and outside the Kingdom", "Permissions and access logs"],
    actionsEn: ["Map the end-to-end data flow", "Minimise fields to what is necessary", "Document notices and consent where required", "Review processor and transfer terms", "Test incident and rights-request response"],
    metricsEn: ["Systems covered by the record", "Excess access removed", "Request-response time"],
    mistakesEn: ["Keeping passport copies without retention rules", "Shared user accounts", "Transferring data without suitable assessment"]
  }, [S.pdpl, S.transfer]),

  entry("e-invoicing-hospitality-advisory", "compliance", {
    titleAr: "الفوترة الإلكترونية في المنشأة ومكتب الاستشارات",
    excerptAr: "الجاهزية ليست إصدار ملف فقط؛ بل تكامل بيانات العميل والضريبة والتسلسل والإشعارات والحفظ.",
    diagnosisAr: ["نوع الفواتير والإشعارات", "اكتمال الحقول والرقم الضريبي", "ترابط العقد والتسليم والفاتورة", "الحفظ والصلاحيات والاسترجاع"],
    actionsAr: ["اعتمد مصدر بيانات رئيسيًا", "اختبر الحالات الاستثنائية", "افصل صلاحية الإنشاء والاعتماد", "صالح الإيراد مع الفواتير والتحصيل", "احتفظ بأثر التعديل"],
    metricsAr: ["فواتير صحيحة من أول مرة", "فروقات المصالحة", "زمن معالجة الإشعار"],
    mistakesAr: ["إدخال يدوي متكرر", "وصف نطاق لا يطابق العقد", "حذف الفاتورة بدل إصدار إشعار"]
  }, {
    titleEn: "E-invoicing for Hospitality Businesses and Advisory Firms",
    excerptEn: "Readiness is not just producing a file; it connects customer, tax, sequence, note and archive data.",
    diagnosisEn: ["Invoice and note types", "Required fields and tax number", "Alignment of contract, delivery and invoice", "Retention, access and retrieval"],
    actionsEn: ["Establish a master data source", "Test exception scenarios", "Separate creation and approval rights", "Reconcile revenue, invoices and collections", "Preserve the amendment trail"],
    metricsEn: ["First-time-correct invoices", "Reconciliation differences", "Note-processing time"],
    mistakesEn: ["Repeated manual entry", "Scope descriptions that conflict with the contract", "Deleting an invoice instead of issuing a note"]
  }, [S.zatca]),

  entry("serviced-apartment-profit-leakage", "performance", {
    titleAr: "تشخيص تسرب الربحية في الشقق المخدومة",
    excerptAr: "التسرب غالبًا مجموع انحرافات صغيرة في القنوات والتنظيف والمرافق والعقود والتسعير، لا بندًا واحدًا كبيرًا.",
    diagnosisAr: ["الإيراد الصافي بعد تكلفة القناة", "تكلفة الوحدة المشغولة", "تكرار التنظيف والصيانة", "العقود والاستهلاك خارج النطاق"],
    actionsAr: ["ابنِ خط أساس 12 شهرًا", "حلّل كل وحدة وقناة وشريحة", "اعزل السعر عن الحجم والمزيج", "نفّذ مكاسب سريعة بضوابط جودة", "ثبّت مراجعة أسبوعية للانحراف"],
    metricsAr: ["هامش المساهمة للوحدة", "تكلفة الإقامة", "نسبة الإيراد الصافي"],
    mistakesAr: ["خفض العمالة دون تحليل الطلب", "مقارنة إجمالي الإيراد فقط", "احتساب الخصم دون عمولة القناة"]
  }, {
    titleEn: "Diagnosing Profit Leakage in Serviced Apartments",
    excerptEn: "Leakage is usually a portfolio of small variances across channels, cleaning, utilities, contracts and pricing—not one dramatic line item.",
    diagnosisEn: ["Net revenue after channel cost", "Cost per occupied unit", "Cleaning and maintenance frequency", "Out-of-scope contract consumption"],
    actionsEn: ["Build a twelve-month baseline", "Analyse by unit, channel and segment", "Separate rate, volume and mix effects", "Deliver quick wins with quality controls", "Lock in weekly variance reviews"],
    metricsEn: ["Contribution margin per unit", "Cost per stay", "Net-revenue ratio"],
    mistakesEn: ["Cutting labour without demand analysis", "Comparing gross revenue alone", "Ignoring channel commission when discounting"]
  }),

  entry("hotel-pnl-owner-reading", "performance", {
    titleAr: "كيف يقرأ المالك قائمة الدخل الفندقية؟",
    excerptAr: "القراءة المفيدة تبدأ من المحركات التشغيلية ثم تعود إلى البنود، مع فصل ما هو سعر وحجم ومزيج وتوقيت.",
    diagnosisAr: ["المقارنة بالميزانية والسنة السابقة", "محركات كل إدارة", "البنود غير المتكررة", "التخصيصات ورسوم الإدارة"],
    actionsAr: ["ابدأ بجسر الإيراد", "افصل التكاليف المتغيرة والثابتة", "اطلب تفسيرًا رقميًا لكل انحراف", "اربط الربح بالنقد", "سجّل قرارات المالك والمتابعة"],
    metricsAr: ["GOP وهامشه", "التدفق النقدي", "دقة التوقع"],
    mistakesAr: ["قبول تفسير إنشائي", "الخلط بين الربح والنقد", "إخفاء الانحراف بتعديل الميزانية"]
  }, {
    titleEn: "How Should an Owner Read a Hotel P&L?",
    excerptEn: "Useful reading starts with operating drivers and returns to line items, separating rate, volume, mix and timing.",
    diagnosisEn: ["Budget and prior-year comparison", "Departmental drivers", "Non-recurring items", "Allocations and management fees"],
    actionsEn: ["Start with a revenue bridge", "Separate variable and fixed costs", "Require quantified variance explanations", "Connect profit to cash", "Record owner decisions and follow-up"],
    metricsEn: ["GOP and margin", "Cash flow", "Forecast accuracy"],
    mistakesEn: ["Accepting narrative explanations", "Confusing profit with cash", "Hiding variance by rebasing the budget"]
  }),

  entry("cost-per-occupied-room", "performance", {
    titleAr: "تكلفة الغرفة المشغولة: مؤشر صغير يكشف قرارات كبيرة",
    excerptAr: "عند تعريفه بثبات، يكشف المؤشر أثر الإشغال على المستلزمات والتنظيف والطاقة ويمنع المتوسطات المضللة.",
    diagnosisAr: ["تعريف البسط والمقام", "التكاليف القابلة للتتبع", "اختلاف نوع الوحدة وطول الإقامة", "المواسم والمناوبات"],
    actionsAr: ["ثبت قاموس المؤشر", "افصل تكلفة الوصول عن تكلفة الليلة التالية", "قارن وحدات متجانسة", "حقق في الانحراف لا الرقم وحده", "اربط التحسين بتقييم الضيف"],
    metricsAr: ["تكلفة الغرفة المشغولة", "تكلفة الوصول", "إعادة العمل والشكاوى"],
    mistakesAr: ["ضم تكاليف ثابتة بلا تفسير", "تجاهل طول الإقامة", "خفض الجودة لتحقيق هدف شهري"]
  }, {
    titleEn: "Cost per Occupied Room: A Small Metric With Big Decisions",
    excerptEn: "With a stable definition, the metric exposes occupancy effects on supplies, cleaning and energy while preventing misleading averages.",
    diagnosisEn: ["Numerator and denominator definitions", "Traceable costs", "Unit type and length-of-stay variation", "Season and roster effects"],
    actionsEn: ["Lock the metric dictionary", "Separate arrival cost from stayover cost", "Compare like-for-like units", "Investigate the driver, not only the number", "Link savings to guest feedback"],
    metricsEn: ["Cost per occupied room", "Cost per arrival", "Rework and complaints"],
    mistakesEn: ["Adding fixed costs without explanation", "Ignoring length of stay", "Reducing quality to hit a monthly target"]
  }),

  entry("supplier-contract-scope-price", "performance", {
    titleAr: "عقود الموردين: افصل السعر عن النطاق قبل المقارنة",
    excerptAr: "أقل عرض سعر قد يكون الأعلى تكلفة عندما تختلف الكميات والاستثناءات ومستويات الخدمة ومسؤولية المواد.",
    diagnosisAr: ["وحدة القياس والكميات", "الاستثناءات والمواد المستهلكة", "مستوى الخدمة وزمن الاستجابة", "آلية التغيير والجزاء"],
    actionsAr: ["وحّد جدول الكميات", "ابنِ مصفوفة فنية قبل المالية", "سعّر السيناريوهات لا العرض الأساسي فقط", "تحقق من القدرة والمراجع", "راقب الفاتورة مقابل النطاق"],
    metricsAr: ["التكلفة الكلية", "الالتزام بمستوى الخدمة", "أوامر التغيير"],
    mistakesAr: ["مقارنة الإجمالي", "ترك الاستثناءات في نص صغير", "التجديد التلقائي دون مراجعة"]
  }, {
    titleEn: "Supplier Contracts: Separate Price From Scope Before Comparing",
    excerptEn: "The lowest bid may be the most expensive when quantities, exclusions, service levels and material responsibility differ.",
    diagnosisEn: ["Units of measure and quantities", "Exclusions and consumables", "Service level and response time", "Change and remedy mechanism"],
    actionsEn: ["Standardise the bill of quantities", "Build a technical matrix before price scoring", "Price scenarios, not only the base bid", "Check capacity and references", "Audit invoices against scope"],
    metricsEn: ["Total cost of ownership", "Service-level compliance", "Change-order value"],
    mistakesEn: ["Comparing totals", "Burying exclusions in small print", "Auto-renewing without review"]
  }),

  entry("occupancy-is-not-profit", "performance", {
    titleAr: "لماذا لا يعني الإشغال المرتفع ربحية مرتفعة؟",
    excerptAr: "قد تمتلئ المنشأة بسعر ضعيف وتكلفة قناة مرتفعة ومزيج إقامة غير صحي؛ لذلك نقرأ جودة الإيراد لا حجمه فقط.",
    diagnosisAr: ["صافي السعر بعد العمولة", "مزيج القنوات والشرائح", "تكلفة خدمة الطلب", "الإزاحة في أيام الطلب القوي"],
    actionsAr: ["قِس الإيراد الصافي", "قارن الهامش حسب القناة", "حدّد حدًا أدنى للأسعار", "أدر القيود حسب الطلب", "راجع أثر كل حملة بعد الإقامة"],
    metricsAr: ["Net RevPAR", "هامش القناة", "تكلفة الاستحواذ"],
    mistakesAr: ["مطاردة 100% إشغال", "خصم شامل بلا سياج", "إهمال الحجوزات المزاحة"]
  }, {
    titleEn: "Why High Occupancy Does Not Guarantee High Profit",
    excerptEn: "A property may fill at a weak rate, high channel cost and poor stay mix; revenue quality matters as much as volume.",
    diagnosisEn: ["Net rate after commission", "Channel and segment mix", "Cost to serve demand", "Displacement on high-demand dates"],
    actionsEn: ["Measure net revenue", "Compare margin by channel", "Set rate floors", "Manage restrictions by demand", "Review every campaign after stay"],
    metricsEn: ["Net RevPAR", "Channel margin", "Acquisition cost"],
    mistakesEn: ["Chasing 100% occupancy", "Blanket discounting without fences", "Ignoring displaced bookings"]
  }),

  entry("honest-hospitality-benchmarking", "performance", {
    titleAr: "المقارنة المرجعية بلا تضليل: كيف تختار النظير الصحيح؟",
    excerptAr: "المقارنة لا تصبح دليلًا إلا بعد ضبط السوق والفئة والحجم والموقع والفترة والتعريفات المحاسبية.",
    diagnosisAr: ["الغرض من المقارنة", "تشابه المنتج والسوق", "سلامة التعريفات", "حجم العينة وفترتها"],
    actionsAr: ["اكتب سؤال القرار أولًا", "استخدم أكثر من مجموعة نظراء", "اعرض النطاق لا المتوسط فقط", "افصل الحقيقة عن الافتراض", "دوّن حدود الاستخدام"],
    metricsAr: ["تغطية بيانات النظراء", "فارق التعريفات", "حساسية القرار"],
    mistakesAr: ["اختيار منافس بالاسم فقط", "مزج شهور مختلفة", "تقديم تقدير كحقيقة"]
  }, {
    titleEn: "Honest Hospitality Benchmarking: Choosing the Right Peer Set",
    excerptEn: "A comparison becomes evidence only after controlling for market, class, size, location, period and accounting definitions.",
    diagnosisEn: ["Purpose of the comparison", "Product and market similarity", "Definition integrity", "Sample size and period"],
    actionsEn: ["Write the decision question first", "Use more than one peer set", "Show ranges, not averages alone", "Separate fact from assumption", "Record limitations"],
    metricsEn: ["Peer-data coverage", "Definition variance", "Decision sensitivity"],
    mistakesEn: ["Selecting peers by name alone", "Mixing different months", "Presenting an estimate as fact"]
  }),

  entry("90-day-hospitality-turnaround", "performance", {
    titleAr: "خطة تحول 90 يومًا لمنشأة ضيافة متعثرة",
    excerptAr: "التحول المنضبط يوقف النزيف أولًا، يثبت الخدمة ثانيًا، ثم يبني التحسين الهيكلي على خط أساس موثق.",
    diagnosisAr: ["السيولة والمخاطر الفورية", "فشل الخدمة المتكرر", "أعلى ثلاثة تسربات ربح", "قدرة الفريق والقيادة"],
    actionsAr: ["أيام 1–15: ثبت الحقيقة والضوابط", "أيام 16–30: أغلق المخاطر والمكاسب السريعة", "أيام 31–60: أعد تصميم العمليات", "أيام 61–90: ثبت الملكية والإيقاع", "اعتمد بوابات قرار أسبوعية"],
    metricsAr: ["النقد المحفوظ", "إغلاق الأعطال", "اتجاه رضا الضيف"],
    mistakesAr: ["قائمة مبادرات طويلة", "تغيير الهيكل قبل التشخيص", "إعلان نجاح قبل ثبات المؤشر"]
  }, {
    titleEn: "A 90-Day Turnaround Plan for an Underperforming Hospitality Asset",
    excerptEn: "A disciplined turnaround first stops leakage, then stabilises service and finally builds structural improvement on an evidenced baseline.",
    diagnosisEn: ["Cash and immediate risks", "Recurring service failures", "Top three profit leaks", "Team and leadership capacity"],
    actionsEn: ["Days 1–15: establish truth and controls", "Days 16–30: close risks and quick wins", "Days 31–60: redesign processes", "Days 61–90: lock ownership and cadence", "Use weekly decision gates"],
    metricsEn: ["Cash preserved", "Failures closed", "Guest-satisfaction trend"],
    mistakesEn: ["An oversized initiative list", "Restructuring before diagnosis", "Declaring victory before a metric holds"]
  }),

  entry("when-cost-cutting-is-wrong", "performance", {
    titleAr: "متى يكون خفض التكلفة قرارًا خاطئًا؟",
    excerptAr: "التكلفة التي تحمي الإيراد أو السلامة أو موثوقية الأصل ليست هدرًا؛ القرار يحتاج أثرًا كليًا لا رقمًا منفردًا.",
    diagnosisAr: ["صلة البند بالإيراد والجودة", "أثر التأجيل على دورة الحياة", "المخاطر النظامية والسلامة", "بدائل الإنتاجية قبل الإلغاء"],
    actionsAr: ["صنّف التكلفة إلى حماية ونمو وهدر", "اختبر سيناريو الأثر الكامل", "ابدأ بالطلب والمواصفات", "استخدم تجربة محدودة", "راقب مؤشرات الحماية"],
    metricsAr: ["صافي التوفير", "تكلفة الفشل", "تغير تقييم الضيف"],
    mistakesAr: ["خفض الصيانة الوقائية", "إلغاء تدريب أساسي", "نقل التكلفة إلى شكوى أو تعويض"]
  }, {
    titleEn: "When Is Cost Cutting the Wrong Decision?",
    excerptEn: "A cost that protects revenue, safety or asset reliability is not waste; the decision requires total impact, not an isolated number.",
    diagnosisEn: ["Connection to revenue and quality", "Deferral impact across the lifecycle", "Regulatory and safety risk", "Productivity options before removal"],
    actionsEn: ["Classify cost as protection, growth or waste", "Model the full-impact scenario", "Start with demand and specification", "Use a bounded pilot", "Monitor protective indicators"],
    metricsEn: ["Net saving", "Cost of failure", "Guest-rating movement"],
    mistakesEn: ["Cutting preventive maintenance", "Cancelling essential training", "Moving cost into complaints or compensation"]
  }),

  entry("adr-revpar-occupancy", "commercial", {
    titleAr: "ADR وRevPAR والإشغال: ماذا يكشف كل مؤشر؟",
    excerptAr: "ثلاثة مؤشرات مترابطة لكنها تجيب عن أسئلة مختلفة؛ القراءة المشتركة تمنع الاستنتاج السريع.",
    diagnosisAr: ["تعريف الغرف المتاحة والمباعة", "الفترة والسوق المقارن", "الإيراد المدرج والمستبعد", "المزيج بين السعر والحجم"],
    actionsAr: ["ثبت قاموس المؤشرات", "حلّل السعر والإشغال معًا", "استخدم Net RevPAR للقرار القنوي", "اربط النتائج بالطلب", "وثّق تفسير الانحراف"],
    metricsAr: ["ADR", "Occupancy", "RevPAR وNet RevPAR"],
    mistakesAr: ["قراءة مؤشر منفرد", "تغيير المقام", "مقارنة منشآت غير متجانسة"]
  }, {
    titleEn: "ADR, RevPAR and Occupancy: What Does Each Metric Reveal?",
    excerptEn: "Three connected measures answer different questions; reading them together prevents premature conclusions.",
    diagnosisEn: ["Definition of available and sold rooms", "Period and comparison market", "Included and excluded revenue", "Rate-volume mix"],
    actionsEn: ["Lock the metric dictionary", "Analyse rate and occupancy together", "Use Net RevPAR for channel decisions", "Connect results to demand", "Document variance explanations"],
    metricsEn: ["ADR", "Occupancy", "RevPAR and Net RevPAR"],
    mistakesEn: ["Reading one metric in isolation", "Changing the denominator", "Comparing unlike properties"]
  }),

  entry("riyadh-serviced-apartment-pricing", "commercial", {
    titleAr: "بناء استراتيجية تسعير للشقق المخدومة في الرياض",
    excerptAr: "التسعير الفعّال يجمع نمط الطلب وطول الإقامة ونوع الوحدة والقناة والحدث ضمن قواعد قابلة للمراجعة.",
    diagnosisAr: ["منحنى الطلب حسب اليوم", "شرائح الإقامة القصيرة والطويلة", "منافسون فعليون لكل وحدة", "أثر الأحداث والحسابات"],
    actionsAr: ["ابنِ تقويم طلب", "عرّف أسعارًا مرجعية وسياجات", "ضع قواعد لطول الإقامة", "راجع الالتقاط أسبوعيًا", "اختبر السعر الصافي حسب القناة"],
    metricsAr: ["Pickup", "Net ADR", "LOS ومعدل الإلغاء"],
    mistakesAr: ["نسخ سعر المنافس", "خصم الإقامة الطويلة بلا تكلفة", "تجاهل يوم الأسبوع"]
  }, {
    titleEn: "Building a Pricing Strategy for Riyadh Serviced Apartments",
    excerptEn: "Effective pricing combines demand pattern, length of stay, unit type, channel and event into reviewable rules.",
    diagnosisEn: ["Demand curve by day", "Short- and long-stay segments", "True competitors by unit", "Event and account effects"],
    actionsEn: ["Build a demand calendar", "Define reference rates and fences", "Set length-of-stay rules", "Review pickup weekly", "Test net price by channel"],
    metricsEn: ["Pickup", "Net ADR", "Length of stay and cancellation"],
    mistakesEn: ["Copying a competitor's price", "Discounting long stays without cost logic", "Ignoring day of week"]
  }),

  entry("reduce-ota-dependency", "commercial", {
    titleAr: "تقليل الاعتماد على منصات الحجز دون خسارة الطلب",
    excerptAr: "الهدف ليس إيقاف القناة؛ بل امتلاك بيانات النزيل وتحسين الحجز المباشر مع حماية الوصول إلى الطلب الجديد.",
    diagnosisAr: ["حصة القناة وصافي مساهمتها", "قابلية التحويل إلى مباشر", "جودة تجربة الموقع والحجز", "سياسة بيانات النزيل"],
    actionsAr: ["قسّم الطلب الجديد والمتكرر", "ابنِ قيمة للحجز المباشر", "أزل احتكاك الهاتف والدفع", "فعّل ما بعد الإقامة", "أعد توزيع المخزون تدريجيًا"],
    metricsAr: ["حصة المباشر", "تكلفة الاستحواذ", "تكرار الحجز"],
    mistakesAr: ["إغلاق القناة فجأة", "كسر تكافؤ السعر دون خطة", "طلب بيانات لا تستخدم"]
  }, {
    titleEn: "Reducing OTA Dependency Without Losing Demand",
    excerptEn: "The goal is not to eliminate a channel, but to own guest relationships and improve direct booking while protecting new-demand reach.",
    diagnosisEn: ["Channel share and net contribution", "Potential to convert repeat demand", "Website and booking experience", "Guest-data policy"],
    actionsEn: ["Separate new and returning demand", "Create direct-booking value", "Remove mobile and payment friction", "Activate post-stay communication", "Reallocate inventory gradually"],
    metricsEn: ["Direct share", "Acquisition cost", "Repeat-booking rate"],
    mistakesEn: ["Closing a channel overnight", "Breaking parity without a plan", "Collecting data that is never used"]
  }),

  entry("corporate-accounts-engine", "commercial", {
    titleAr: "الحسابات المؤسسية: من قائمة شركات إلى محرك طلب",
    excerptAr: "المبيعات المؤسسية تحتاج تقسيمًا للفرص وقيمة واضحة وإيقاع متابعة وقياسًا للغرف المنتجة لا عدد الزيارات.",
    diagnosisAr: ["القطاعات ومولدات الطلب", "حجم الفرصة وتوقيتها", "المنافسة وشروط التعاقد", "قدرة المنشأة على الخدمة"],
    actionsAr: ["ابنِ قائمة حسابات مؤهلة", "حدد عرض قيمة لكل شريحة", "فعّل CRM بسيطًا", "اربط السعر بالحجم والسلوك", "راجع الإنتاج والانكماش شهريًا"],
    metricsAr: ["الغرف المنتجة", "تحويل الفرص", "إنتاجية الحساب"],
    mistakesAr: ["خصم بلا التزام حجم", "قياس عدد المكالمات", "الاحتفاظ بحسابات غير منتجة"]
  }, {
    titleEn: "Corporate Accounts: From Company List to Demand Engine",
    excerptEn: "Corporate sales requires opportunity segmentation, a clear proposition, follow-up cadence and room-production measures—not visit counts.",
    diagnosisEn: ["Sectors and demand generators", "Opportunity size and timing", "Competition and contracting terms", "Property capacity to serve"],
    actionsEn: ["Build a qualified account list", "Define a proposition for each segment", "Use a simple CRM", "Connect rate to volume and behaviour", "Review production and wash monthly"],
    metricsEn: ["Room nights produced", "Opportunity conversion", "Account productivity"],
    mistakesEn: ["Discounting without volume commitment", "Measuring call volume", "Keeping non-producing accounts"]
  }),

  entry("rate-parity-channel-economics", "commercial", {
    titleAr: "تكافؤ الأسعار واقتصاديات القنوات",
    excerptAr: "السعر الظاهر ليس السعر المحقق؛ يجب إدخال العمولة والخصم والتسويق والدفع والإلغاء في القرار.",
    diagnosisAr: ["السعر المعروض والصافي", "العمولات والتكاليف الخفية", "شروط الإلغاء والدفع", "إزاحة القنوات الأخرى"],
    actionsAr: ["ابنِ شلالًا للسعر الصافي", "راقب التكافؤ آليًا أو بعينة", "صمّم قيمة مباشرة غير سعرية", "اضبط العروض بحقوق وصول", "راجع الربحية حسب تاريخ الإقامة"],
    metricsAr: ["Net ADR", "فجوة التكافؤ", "مساهمة القناة"],
    mistakesAr: ["مقارنة السعر الإجمالي", "خصومات متراكبة", "إهمال تكلفة الإلغاء"]
  }, {
    titleEn: "Rate Parity and Channel Economics",
    excerptEn: "Displayed rate is not realised rate; commission, discount, marketing, payment and cancellation belong in the decision.",
    diagnosisEn: ["Displayed and net rate", "Commission and hidden costs", "Cancellation and payment terms", "Displacement of other channels"],
    actionsEn: ["Build a net-rate waterfall", "Monitor parity automatically or by sample", "Design non-price direct value", "Control promotions through access rights", "Review profit by stay date"],
    metricsEn: ["Net ADR", "Parity gap", "Channel contribution"],
    mistakesEn: ["Comparing gross rate", "Stacked discounts", "Ignoring cancellation cost"]
  }),

  entry("13-week-demand-forecast", "commercial", {
    titleAr: "توقع طلب 13 أسبوعًا يربط المبيعات والتسعير والتشغيل",
    excerptAr: "نافذة قصيرة متجددة تكشف التغير مبكرًا وتحوّل التوقع إلى قرارات غرف وفريق ومشتريات ونقد.",
    diagnosisAr: ["الحجوزات القائمة والالتقاط", "المناسبات ومولدات الطلب", "الإلغاء والانكماش", "الطاقة التشغيلية"],
    actionsAr: ["حدّث التوقع أسبوعيًا", "افصل الشرائح والقنوات", "سجّل الافتراضات", "اربط كل انحراف بإجراء", "قارن التوقع بالفعلي"],
    metricsAr: ["دقة التوقع", "Pickup مقابل المطلوب", "فجوة الطاقة"],
    mistakesAr: ["نسخ ميزانية الشهر", "رقم واحد بلا سيناريو", "تغيير الافتراض دون سجل"]
  }, {
    titleEn: "A 13-Week Demand Forecast Linking Sales, Pricing and Operations",
    excerptEn: "A rolling short horizon reveals change early and converts forecast into room, labour, purchasing and cash decisions.",
    diagnosisEn: ["On-books demand and pickup", "Events and demand generators", "Cancellation and wash", "Operating capacity"],
    actionsEn: ["Refresh the forecast weekly", "Separate segments and channels", "Record assumptions", "Attach an action to every variance", "Compare forecast with actual"],
    metricsEn: ["Forecast accuracy", "Pickup versus required", "Capacity gap"],
    mistakesEn: ["Copying the monthly budget", "One number with no scenario", "Changing assumptions without a record"]
  }),

  entry("guest-reviews-commercial-data", "commercial", {
    titleAr: "مراجعات النزلاء كبيانات تجارية لا تعليقات منفصلة",
    excerptAr: "ترميز موضوعات المراجعات وربطها بالقناة والوحدة والتاريخ يكشف أثر الجودة في السعر والتحويل والتكرار.",
    diagnosisAr: ["الموضوع والتكرار والشدة", "الوحدة والمناوبة والقناة", "زمن الاستجابة والإغلاق", "صلة الموضوع بالأداء التجاري"],
    actionsAr: ["أنشئ قاموس ترميز", "راجع عينة أسبوعية", "اربط السبب بمالك عملية", "أغلق الحلقة مع النزيل", "قارن التقييم بالسعر والتحويل"],
    metricsAr: ["تكرار الموضوع", "زمن الحل", "التقييم والتحويل"],
    mistakesAr: ["الرد التسويقي فقط", "مطاردة المتوسط", "عدم فصل الشكوى عن السبب"]
  }, {
    titleEn: "Guest Reviews as Commercial Data, Not Isolated Comments",
    excerptEn: "Coding review themes and connecting them to channel, unit and date exposes quality effects on rate, conversion and repeat demand.",
    diagnosisEn: ["Theme, frequency and severity", "Unit, shift and channel", "Response and closure time", "Link to commercial performance"],
    actionsEn: ["Create a coding dictionary", "Review a weekly sample", "Assign each cause to a process owner", "Close the loop with the guest", "Compare rating with rate and conversion"],
    metricsEn: ["Theme recurrence", "Resolution time", "Rating and conversion"],
    mistakesEn: ["Writing a marketing reply only", "Chasing the average", "Failing to separate complaint from cause"]
  }),

  entry("direct-booking-journey", "commercial", {
    titleAr: "رحلة الحجز المباشر: من البحث إلى ما بعد الإقامة",
    excerptAr: "كل احتكاك بين نية الحجز والتأكيد يرفع تكلفة الاستحواذ؛ الرحلة يجب أن تقاس خطوة بخطوة وبلا جمع زائد للبيانات.",
    diagnosisAr: ["مصدر الزيارة والنية", "سرعة الصفحة ووضوح العرض", "توفر الوحدة والدفع", "التأكيد والتواصل اللاحق"],
    actionsAr: ["ارسم القمع كاملًا", "اختبر الهاتف أولًا", "بسّط الحقول والسياسات", "أظهر السعر والقيمة بوضوح", "فعّل تواصلًا ذا صلة بعد الإقامة"],
    metricsAr: ["تحويل الحجز", "التخلي", "تكلفة الحجز المباشر"],
    mistakesAr: ["زر حجز مخفي", "مفاجآت رسوم متأخرة", "إرسال رسائل بلا موافقة أو قيمة"]
  }, {
    titleEn: "The Direct-Booking Journey: From Search to Post-Stay",
    excerptEn: "Every friction point between intent and confirmation raises acquisition cost; measure the journey step by step without excessive data collection.",
    diagnosisEn: ["Visit source and intent", "Page speed and offer clarity", "Unit availability and payment", "Confirmation and follow-up"],
    actionsEn: ["Map the full funnel", "Test mobile first", "Simplify fields and policies", "Show price and value clearly", "Use relevant post-stay communication"],
    metricsEn: ["Booking conversion", "Abandonment", "Direct-booking cost"],
    mistakesEn: ["A hidden booking button", "Late fee surprises", "Messaging without consent or value"]
  }),

  entry("feasibility-before-hospitality-lease", "development", {
    titleAr: "دراسة الجدوى قبل توقيع عقد الإيجار",
    excerptAr: "العقد الطويل يحوّل افتراضًا متفائلًا إلى التزام؛ لذلك يجب اختبار الطلب والتكلفة والترخيص والسيناريو الهابط قبل التوقيع.",
    diagnosisAr: ["طلب قابل للتحقق", "التكلفة الكلية للتطوير", "قابلية الترخيص والاستخدام", "شروط الإيجار والخروج"],
    actionsAr: ["اختبر السوق ميدانيًا", "ابنِ ثلاثة سيناريوهات", "نفّذ فحصًا فنيًا ونظاميًا", "اربط الدفعات بالشروط السابقة", "استخدم نقطة توقف واضحة"],
    metricsAr: ["نقطة التعادل", "DSCR أو هامش الأمان", "حساسية الإشغال والسعر"],
    mistakesAr: ["الاعتماد على وسيط واحد", "تجاهل فترة التجهيز", "احتساب الإيجار دون الزيادات"]
  }, {
    titleEn: "Feasibility Before Signing a Hospitality Lease",
    excerptEn: "A long lease turns an optimistic assumption into an obligation; test demand, cost, licensing and downside before signature.",
    diagnosisEn: ["Verifiable demand", "Total development cost", "Licensability and permitted use", "Lease and exit terms"],
    actionsEn: ["Test the market in the field", "Build three scenarios", "Run technical and regulatory diligence", "Tie payments to conditions precedent", "Use an explicit stop/go point"],
    metricsEn: ["Break-even point", "DSCR or safety margin", "Occupancy and rate sensitivity"],
    mistakesEn: ["Relying on one broker", "Ignoring fit-out time", "Modelling rent without escalation"]
  }),

  entry("operating-concept-unit-mix", "development", {
    titleAr: "المفهوم التشغيلي ومزيج الوحدات قبل تثبيت التصميم",
    excerptAr: "اختيار أنواع الوحدات ليس قرارًا معماريًا فقط؛ إنه رهان على الشرائح وطول الإقامة والتنظيف والصيانة والإيراد.",
    diagnosisAr: ["شرائح الطلب واستخداماتها", "المدة والسعة المطلوبة", "تكلفة الخدمة لكل نوع", "مرونة التحويل مستقبلًا"],
    actionsAr: ["اكتب فرضية المنتج", "اختبر المزيج ماليًا", "راجع المساحة القابلة للبيع", "نمذج التشغيل لكل نوع", "اترك مرونة مدروسة"],
    metricsAr: ["إيراد المتر", "هامش نوع الوحدة", "كفاءة المساحة"],
    mistakesAr: ["نسخ مشروع مجاور", "تكثير الأنواع", "تجاهل المخازن والخدمة"]
  }, {
    titleEn: "Operating Concept and Unit Mix Before Design Freeze",
    excerptEn: "Unit types are not only an architectural choice; they are a bet on segments, length of stay, cleaning, maintenance and revenue.",
    diagnosisEn: ["Demand segments and use cases", "Required duration and capacity", "Cost to serve each type", "Future conversion flexibility"],
    actionsEn: ["Write the product hypothesis", "Test the mix financially", "Review sellable-area efficiency", "Model operations for every type", "Design deliberate flexibility"],
    metricsEn: ["Revenue per square metre", "Unit-type margin", "Space efficiency"],
    mistakesEn: ["Copying a neighbouring project", "Creating too many types", "Ignoring stores and service space"]
  }),

  entry("back-of-house-serviced-apartments", "development", {
    titleAr: "المناطق الخلفية في الشقق المخدومة: المساحة التي لا يراها النزيل",
    excerptAr: "ضغط المناطق الخلفية قد يربح مترًا قابلًا للبيع لكنه يخلق مسارات متقاطعة ومخزونًا مكشوفًا وعملًا يدويًا مكلفًا.",
    diagnosisAr: ["تدفق النظافة والنفايات", "المخازن والاستلام", "مسارات الموظف والنزيل", "الصيانة والوصول للمعدات"],
    actionsAr: ["ارسم يوم تشغيل حقيقيًا", "اختبر الذروة والعربة", "حدد نقاط النظيفة والمتسخة", "راجع قابلية الصيانة", "وثق الانحراف قبل اعتماده"],
    metricsAr: ["زمن تجهيز الوحدة", "مسافة الحركة", "حوادث تقاطع المسار"],
    mistakesAr: ["تصميم BOH كبواقي مساحة", "باب أو مصعد غير ملائم", "غياب منطقة استلام"]
  }, {
    titleEn: "Back of House in Serviced Apartments: The Space Guests Never See",
    excerptEn: "Compressing back-of-house may gain sellable area but create crossed flows, exposed inventory and expensive manual work.",
    diagnosisEn: ["Housekeeping and waste flow", "Stores and receiving", "Staff and guest routes", "Maintenance access"],
    actionsEn: ["Map a real operating day", "Test peaks and trolley movement", "Separate clean and dirty points", "Review maintainability", "Document deviations before approval"],
    metricsEn: ["Unit turnaround time", "Travel distance", "Flow-conflict incidents"],
    mistakesEn: ["Designing BOH from leftover space", "Wrong door or lift dimensions", "No receiving area"]
  }),

  entry("pre-opening-critical-path", "development", {
    titleAr: "المسار الحرج لما قبل الافتتاح",
    excerptAr: "قائمة طويلة لا تكفي؛ المطلوب شبكة اعتماديات تُظهر ما الذي يمنع الاختبار أو التوظيف أو البيع ومتى.",
    diagnosisAr: ["الاعتماديات بين المشروع والتشغيل", "قرارات المسار الحرج", "تواريخ الوصول والتشغيل", "المسؤوليات المشتركة"],
    actionsAr: ["ابنِ WBS قابلًا للإثبات", "حدّد سابق ولاحق كل نشاط", "استخدم بوابات لا نسب إنجاز عامة", "اربط الخطر بخطة استرداد", "اعقد اجتماع قرار لا سرد حالة"],
    metricsAr: ["انحراف المسار الحرج", "جاهزية البوابة", "عدد القرارات المتأخرة"],
    mistakesAr: ["تلوين المهام بالأخضر دون دليل", "خلط الوصول بالجاهزية", "ترك قرار بلا مالك"]
  }, {
    titleEn: "The Pre-opening Critical Path",
    excerptEn: "A long checklist is not enough; dependency logic must show what blocks testing, recruitment or sales, and when.",
    diagnosisEn: ["Dependencies between project and operations", "Critical-path decisions", "Arrival and commissioning dates", "Shared accountability"],
    actionsEn: ["Build an evidence-based WBS", "Name each activity's predecessor and successor", "Use gates rather than broad completion percentages", "Attach a recovery plan to every risk", "Run decision meetings, not status narration"],
    metricsEn: ["Critical-path variance", "Gate readiness", "Overdue decisions"],
    mistakesEn: ["Marking tasks green without evidence", "Confusing delivery with readiness", "Leaving a decision ownerless"]
  }),

  entry("opening-readiness-gates", "development", {
    titleAr: "بوابات جاهزية الافتتاح: متى يكون القرار Go أو Conditional Go؟",
    excerptAr: "قرار الافتتاح يحتاج معايير توقف واضحة ومخاطر متبقية معلنة وخطة احتواء، لا متوسط إنجاز يخفي فجوة حرجة.",
    diagnosisAr: ["السلامة والامتثال", "الأنظمة والبيانات", "الفريق والتدريب", "رحلة النزيل والاستجابة"],
    actionsAr: ["عرّف شروط Go وNo-Go مسبقًا", "اطلب دليلًا لكل معيار", "اختبر سيناريوهات الفشل", "سجّل المخاطر المقبولة", "قيّد الافتتاح المشروط بزمن ومالك"],
    metricsAr: ["المعايير الحرجة المغلقة", "نجاح الاختبارات", "مخاطر ما بعد الفتح"],
    mistakesAr: ["احتساب المتوسط", "تخفيض المعيار في آخر أسبوع", "قبول وعد بلا دليل"]
  }, {
    titleEn: "Opening Readiness Gates: Go or Conditional Go?",
    excerptEn: "An opening decision requires explicit stop criteria, disclosed residual risk and containment—not an average completion score hiding a critical gap.",
    diagnosisEn: ["Safety and compliance", "Systems and data", "Team and training", "Guest journey and response"],
    actionsEn: ["Define Go and No-Go criteria in advance", "Require evidence for every criterion", "Test failure scenarios", "Record accepted residual risk", "Time-box conditional opening with an owner"],
    metricsEn: ["Critical criteria closed", "Test pass rate", "Post-opening risk"],
    mistakesEn: ["Using an average score", "Lowering the standard in the final week", "Accepting promises without evidence"]
  }),

  entry("ffe-ose-procurement", "development", {
    titleAr: "مشتريات FF&E وOS&E: من القائمة إلى الجاهزية",
    excerptAr: "الشراء الناجح يربط المواصفة والعينة والكمية والمورد والشحن والاستلام والضمان والتشغيل ضمن سجل واحد.",
    diagnosisAr: ["المواصفات والكميات المعتمدة", "المهل والاعتماديات", "العينات والبدائل", "الاستلام والضمان وقطع الغيار"],
    actionsAr: ["ثبت كودًا موحدًا للصنف", "اربط BOQ بالمخطط والوحدة", "اعتمد عينة قبل الإنتاج", "خطط للفحص والتخزين", "اختبر قبل إغلاق أمر الشراء"],
    metricsAr: ["التسليم في الموعد", "الرفض وإعادة العمل", "الجاهزية حسب المنطقة"],
    mistakesAr: ["طلب كميات غير متصالحة", "بديل بلا مراجعة تشغيلية", "تسليم للموقع دون مساحة تخزين"]
  }, {
    titleEn: "FF&E and OS&E Procurement: From List to Readiness",
    excerptEn: "Successful procurement connects specification, sample, quantity, supplier, shipping, receipt, warranty and operation in one register.",
    diagnosisEn: ["Approved specifications and quantities", "Lead times and dependencies", "Samples and alternatives", "Receipt, warranty and spares"],
    actionsEn: ["Use one item code", "Reconcile the BOQ with drawings and units", "Approve a sample before production", "Plan inspection and storage", "Test before closing the purchase order"],
    metricsEn: ["On-time delivery", "Rejection and rework", "Readiness by area"],
    mistakesEn: ["Ordering unreconciled quantities", "Accepting a substitute without operating review", "Delivering without storage capacity"]
  }),

  entry("handover-and-snagging", "development", {
    titleAr: "الاستلام وقائمة الملاحظات: متى تتحول الملاحظة إلى خطر تشغيل؟",
    excerptAr: "ليس كل عيب متساويًا؛ التصنيف الصحيح يربط الأثر بالسلامة والتشغيل وتجربة النزيل وقابلية الإصلاح بعد الافتتاح.",
    diagnosisAr: ["نوع العيب وموقعه", "أثره على السلامة والخدمة", "إمكانية العزل المؤقت", "مسؤولية الإصلاح ودليله"],
    actionsAr: ["استخدم ترميزًا موحدًا", "صنّف حسب الخطر لا الشكل", "اربط كل بند بصورة وموقع", "أعد الفحص مستقلًا", "لا تغلق قبل اختبار الوظيفة"],
    metricsAr: ["ملاحظات حرجة مفتوحة", "زمن الإصلاح", "نسبة العودة"],
    mistakesAr: ["إغلاق جماعي", "صورة بلا اختبار", "قبول عيب يصعب إصلاحه بعد الإشغال"]
  }, {
    titleEn: "Handover and Snagging: When Does a Defect Become an Operating Risk?",
    excerptEn: "Not every defect is equal; sound classification connects impact to safety, operations, guest experience and post-opening repairability.",
    diagnosisEn: ["Defect type and location", "Safety and service impact", "Temporary isolation options", "Repair owner and evidence"],
    actionsEn: ["Use a common coding system", "Classify by risk, not appearance", "Attach a photograph and location", "Reinspect independently", "Do not close before functional testing"],
    metricsEn: ["Open critical snags", "Repair time", "Reopen rate"],
    mistakesEn: ["Bulk closure", "A photograph without a test", "Accepting a defect that becomes inaccessible after occupancy"]
  }),

  entry("first-100-days-after-opening", "development", {
    titleAr: "أول 100 يوم بعد الافتتاح: من الحماس إلى الاستقرار",
    excerptAr: "الافتتاح بداية دورة تعلم كثيفة؛ المطلوب غرفة تحكم للمشكلات والطلب والنقد والفريق مع خفض تدريجي للتدخل.",
    diagnosisAr: ["تكرار الأعطال والشكاوى", "الطلب الفعلي مقابل الفرضية", "قدرة المناوبات والقيادة", "النقد والموردون"],
    actionsAr: ["أنشئ إيقاعًا يوميًا ثم أسبوعيًا", "رتّب المشاكل حسب أثر الضيف", "ثبّت تغييرات العملية", "راجع التوقع والنقد", "انقل الملكية إلى الفريق"],
    metricsAr: ["ثبات الخدمة", "زمن حل المشكلة", "دقة التوقع"],
    mistakesAr: ["فتح مبادرات جديدة يوميًا", "حل المشكلة خارج النظام", "بقاء الفريق المؤقت بلا خروج"]
  }, {
    titleEn: "The First 100 Days After Opening: From Excitement to Stability",
    excerptEn: "Opening begins an intense learning cycle; a control room must govern issues, demand, cash and team while intervention gradually reduces.",
    diagnosisEn: ["Failure and complaint recurrence", "Actual demand versus hypothesis", "Roster and leadership capacity", "Cash and suppliers"],
    actionsEn: ["Start with a daily, then weekly cadence", "Rank issues by guest impact", "Standardise process changes", "Refresh forecast and cash", "Transfer ownership to the operating team"],
    metricsEn: ["Service stability", "Issue-resolution time", "Forecast accuracy"],
    mistakesEn: ["Launching new initiatives every day", "Fixing problems outside the system", "Keeping the temporary team indefinitely"]
  }),

  entry("owner-representation-vs-operator-report", "ownership", {
    titleAr: "تمثيل المالك مقابل تقرير المشغّل",
    excerptAr: "تقرير المشغّل يشرح الأداء من داخل التشغيل؛ ممثل المالك يختبر الافتراض ويحمي الحقوق ويربط القرار بقيمة الأصل.",
    diagnosisAr: ["حقوق القرار والموافقة", "تعريفات المؤشرات", "التزامات العقد", "مخاطر الأصل طويلة الأجل"],
    actionsAr: ["ابنِ تقويم قرارات المالك", "وحّد حزمة التقارير", "تحقق من العينات والفواتير", "سجّل الاستثناءات والتنازلات", "اربط التشغيل بخطة الأصل"],
    metricsAr: ["قرارات في موعدها", "انحراف الميزانية", "إغلاق التزامات المشغّل"],
    mistakesAr: ["إعادة عرض تقرير المشغّل", "التدخل في كل تفصيل", "غياب سجل قرار"]
  }, {
    titleEn: "Owner Representation Versus the Operator Report",
    excerptEn: "The operator report explains performance from inside operations; owner representation tests assumptions, protects rights and connects decisions to asset value.",
    diagnosisEn: ["Decision and approval rights", "Metric definitions", "Contract obligations", "Long-term asset risks"],
    actionsEn: ["Build an owner decision calendar", "Standardise the reporting pack", "Verify samples and invoices", "Record exceptions and waivers", "Connect operations to the asset plan"],
    metricsEn: ["On-time decisions", "Budget variance", "Operator obligations closed"],
    mistakesEn: ["Repeating the operator's report", "Intervening in every detail", "No decision register"]
  }),

  entry("hma-review-questions", "ownership", {
    titleAr: "أسئلة المالك عند مراجعة عقد إدارة فندقية",
    excerptAr: "المراجعة التجارية والتشغيلية تسبق الرأي القانوني وتحدد أين تتوزع السيطرة والمخاطر والحوافز والبيانات والخروج.",
    diagnosisAr: ["مدة العقد وحقوق الإنهاء", "الرسوم واختبارات الأداء", "الميزانية وحقوق الموافقة", "البيانات والموظفون والعلامة"],
    actionsAr: ["حوّل العقد إلى مصفوفة حقوق", "نمذج الرسوم في سيناريوهات", "اختبر آلية الأداء عمليًا", "حدد القرارات المحجوزة للمالك", "نسّق مع مستشار قانوني مرخص"],
    metricsAr: ["الرسوم كنسبة من التدفق", "قابلية اختبار الأداء", "زمن حل النزاع"],
    mistakesAr: ["مراجعة بند الرسوم وحده", "اعتماد مصطلح غير معرّف", "إهمال الانتقال عند الخروج"]
  }, {
    titleEn: "Owner Questions When Reviewing a Hotel Management Agreement",
    excerptEn: "Commercial and operating review precedes legal advice and identifies where control, risk, incentive, data and exit rights sit.",
    diagnosisEn: ["Term and termination rights", "Fees and performance tests", "Budget and approval rights", "Data, people and brand"],
    actionsEn: ["Convert the agreement into a rights matrix", "Model fees across scenarios", "Test the performance mechanism in practice", "Define owner-reserved decisions", "Coordinate with licensed legal counsel"],
    metricsEn: ["Fees as a share of cash flow", "Performance-test enforceability", "Dispute-resolution time"],
    mistakesEn: ["Reviewing only the fee clause", "Accepting undefined terms", "Ignoring transition at exit"]
  }),

  entry("owner-dashboard-dictionary", "ownership", {
    titleAr: "قاموس لوحة المالك: نهاية الجدل حول الأرقام",
    excerptAr: "تعريف المصدر والمالك والتوقيت والمعادلة والاستثناء لكل مؤشر يجعل الاجتماع مكانًا للقرار بدل المصالحة.",
    diagnosisAr: ["مصدر كل رقم", "المعادلة والاستثناء", "توقيت الإقفال", "مسؤول الجودة"],
    actionsAr: ["اعتمد قاموسًا مرقمًا", "حدد مصدرًا رئيسيًا", "وثق التعديلات", "أظهر جودة البيانات", "راجع التعريف سنويًا"],
    metricsAr: ["مؤشرات متصالحة", "تعديلات ما بعد الإقفال", "زمن إعداد الحزمة"],
    mistakesAr: ["مؤشر بلا مالك", "نسخ يدوي بين ملفات", "تغيير التعريف لإخفاء الانحراف"]
  }, {
    titleEn: "The Owner Dashboard Dictionary: Ending Arguments About Numbers",
    excerptEn: "Defining source, owner, timing, formula and exception for each metric turns meetings from reconciliation into decision forums.",
    diagnosisEn: ["Source of every number", "Formula and exclusions", "Close timing", "Data-quality owner"],
    actionsEn: ["Approve a numbered dictionary", "Name a system of record", "Document adjustments", "Show data quality", "Review definitions annually"],
    metricsEn: ["Reconciled indicators", "Post-close adjustments", "Pack-production time"],
    mistakesEn: ["A metric without an owner", "Manual copying across files", "Changing definitions to hide variance"]
  }),

  entry("hospitality-capex-prioritisation", "ownership", {
    titleAr: "ترتيب أولويات CapEx في أصل ضيافي",
    excerptAr: "الأولوية لا تتبع صوت القسم الأعلى؛ بل تجمع السلامة والامتثال واستمرارية الإيراد ودورة الحياة وتجربة النزيل.",
    diagnosisAr: ["مخاطر السلامة والامتثال", "احتمال الفشل وأثره", "الإيراد المحمي أو المتولد", "العمر المتبقي والبدائل"],
    actionsAr: ["صنّف المشاريع على معايير موحدة", "افصل الصيانة عن التحسين", "قدّر تكلفة عدم التنفيذ", "رتب الحزم والاعتماديات", "راجع الفوائد بعد الصرف"],
    metricsAr: ["مخاطر مخفضة", "إيراد محمي", "انحراف التكلفة والوقت"],
    mistakesAr: ["قائمة رغبات", "ROI بلا خط أساس", "تأجيل أصل حرج لأجل تحسين شكلي"]
  }, {
    titleEn: "Prioritising CapEx in a Hospitality Asset",
    excerptEn: "Priority should not follow the loudest department; it combines safety, compliance, revenue continuity, lifecycle and guest experience.",
    diagnosisEn: ["Safety and compliance risk", "Failure likelihood and impact", "Revenue protected or generated", "Remaining life and alternatives"],
    actionsEn: ["Score projects against common criteria", "Separate maintenance from enhancement", "Estimate the cost of inaction", "Sequence bundles and dependencies", "Review benefits after spend"],
    metricsEn: ["Risk reduced", "Revenue protected", "Cost and schedule variance"],
    mistakesEn: ["A wish list", "ROI without a baseline", "Deferring a critical asset for a cosmetic upgrade"]
  }),

  entry("safe-ai-document-intelligence", "ownership", {
    titleAr: "ذكاء المستندات في الضيافة: استخدام مفيد وآمن",
    excerptAr: "الذكاء الاصطناعي يسرّع الاستخراج والمقارنة، لكنه لا يلغي المصدر أو المراجعة البشرية أو حماية البيانات.",
    diagnosisAr: ["نوع المستند وحساسيته", "قرار الاستخدام وحدوده", "مصدر الحقيقة", "مخاطر الخطأ والتسرب"],
    actionsAr: ["صنّف البيانات قبل الرفع", "استخدم بيئة وعقدًا مناسبين", "اطلب إحالة للصفحة والبند", "راجع العينات الحرجة بشريًا", "سجّل النموذج والإصدار والقرار"],
    metricsAr: ["دقة الاستخراج", "زمن المراجعة", "أخطاء حرجة مكتشفة"],
    mistakesAr: ["رفع عقد سري لأداة عامة", "اعتماد ملخص بلا مصدر", "السماح للنموذج باتخاذ قرار نهائي"]
  }, {
    titleEn: "Safe, Useful Document Intelligence in Hospitality",
    excerptEn: "AI can accelerate extraction and comparison, but it does not replace sources, human review or data protection.",
    diagnosisEn: ["Document type and sensitivity", "Use decision and boundary", "Source of truth", "Error and leakage risk"],
    actionsEn: ["Classify data before upload", "Use an appropriate environment and contract", "Require page and clause citations", "Human-review critical samples", "Log model, version and decision"],
    metricsEn: ["Extraction accuracy", "Review time", "Critical errors caught"],
    mistakesEn: ["Uploading a confidential contract to a public tool", "Accepting a summary without source", "Allowing the model to make the final decision"]
  }, [S.pdpl, S.transfer]),

  entry("hospitality-technology-stack", "ownership", {
    titleAr: "PMS وCRM ومدير القنوات: ما الذي يجب أن يتكامل؟",
    excerptAr: "القيمة ليست في عدد الأنظمة؛ بل في تدفق بيانات موثوق يربط المخزون والسعر والضيف والدفع والتقرير.",
    diagnosisAr: ["رحلات البيانات الأساسية", "مصدر الحقيقة لكل كيان", "الواجهات والفشل", "الملكية والصلاحيات"],
    actionsAr: ["ارسم المعمارية الحالية", "حدد حالات الاستخدام قبل الشراء", "اختبر التكامل على سيناريوهات", "راقب المصالحة والأخطاء", "ضع خطة خروج وتصدير"],
    metricsAr: ["نجاح المزامنة", "الحجوزات المتعارضة", "اكتمال ملف النزيل"],
    mistakesAr: ["شراء منصة شاملة بلا متطلبات", "تكامل أحادي الاتجاه غير معلن", "بيانات محتجزة عند المورد"]
  }, {
    titleEn: "PMS, CRM and Channel Manager: What Must Integrate?",
    excerptEn: "Value does not come from the number of systems, but from reliable data flow connecting inventory, rate, guest, payment and reporting.",
    diagnosisEn: ["Critical data journeys", "System of record for each entity", "Interfaces and failure modes", "Ownership and permissions"],
    actionsEn: ["Map the current architecture", "Define use cases before procurement", "Test integrations with scenarios", "Monitor reconciliation and errors", "Create an exit and export plan"],
    metricsEn: ["Sync success", "Conflicting reservations", "Guest-profile completeness"],
    mistakesEn: ["Buying an all-in-one platform without requirements", "Undisclosed one-way integration", "Vendor-held data with no export route"]
  }, [S.pdpl]),

  entry("hospitality-project-data-room", "ownership", {
    titleAr: "غرفة بيانات لمشروع ضيافي: ما الذي يحتاجه القرار؟",
    excerptAr: "غرفة البيانات الجيدة ليست مخزنًا مزدحمًا؛ إنها بنية إصدار وصلاحية وفهرسة تربط كل ادعاء بالدليل المناسب.",
    diagnosisAr: ["أسئلة المستثمر والمالك", "فئات المستندات والإصدارات", "الصلاحيات والسرية", "النواقص والتعارضات"],
    actionsAr: ["اكتب فهرسًا مبنيًا على القرار", "طبّق تسمية وإصدارًا ثابتين", "أنشئ سجل طلبات", "افصل الحقيقة والافتراض", "راجع الصلاحية قبل المشاركة"],
    metricsAr: ["اكتمال الفهرس", "طلبات متأخرة", "تعارضات البيانات"],
    mistakesAr: ["مجلدات بلا مالك", "نسخ متعددة بلا اعتماد", "منح وصول أوسع من الحاجة"]
  }, {
    titleEn: "A Data Room for a Hospitality Project: What Does the Decision Need?",
    excerptEn: "A good data room is not a crowded archive; it is a versioned, permissioned index connecting every claim to suitable evidence.",
    diagnosisEn: ["Investor and owner questions", "Document classes and versions", "Access and confidentiality", "Gaps and contradictions"],
    actionsEn: ["Build a decision-led index", "Apply stable naming and versioning", "Create a request log", "Separate facts and assumptions", "Review access before sharing"],
    metricsEn: ["Index completeness", "Overdue requests", "Data conflicts"],
    mistakesEn: ["Ownerless folders", "Multiple unapproved copies", "Granting broader access than needed"]
  }, [S.pdpl]),

  entry("international-operator-saudi-entry", "ownership", {
    titleAr: "دخول مشغّل دولي إلى السوق السعودي: طبقة التنفيذ المحلية",
    excerptAr: "النجاح يحتاج ترجمة النموذج العالمي إلى اشتراطات وموردين ومواهب وطلب وعقود محلية دون إضعاف جوهر العلامة.",
    diagnosisAr: ["افتراضات النموذج العالمي", "الفجوات النظامية والتجارية", "قدرة الموردين والمواهب", "حقوق القرار بين المقر والمحلي"],
    actionsAr: ["ابنِ خريطة فجوات موثقة", "اختبر المفهوم والسعر محليًا", "أهل الشركاء قبل التعاقد", "عرّف مصفوفة القرار", "ابدأ بنطاق تجريبي مضبوط"],
    metricsAr: ["فجوات مغلقة", "زمن القرار المحلي", "أداء النطاق التجريبي"],
    mistakesAr: ["نسخ دليل التشغيل حرفيًا", "توقيع مورد قبل التأهيل", "غموض صلاحية الاستثناء"]
  }, {
    titleEn: "An International Operator Entering Saudi Arabia: The Local Execution Layer",
    excerptEn: "Success requires translating a global model into local regulation, suppliers, talent, demand and contracts without diluting the brand's core.",
    diagnosisEn: ["Global-model assumptions", "Regulatory and commercial gaps", "Supplier and talent capacity", "Decision rights between head office and local team"],
    actionsEn: ["Build an evidenced gap map", "Test concept and rate locally", "Qualify partners before contracting", "Define a decision matrix", "Start with a controlled pilot"],
    metricsEn: ["Gaps closed", "Local decision time", "Pilot performance"],
    mistakesEn: ["Copying the operating manual literally", "Contracting before supplier qualification", "Unclear exception authority"]
  }, [S.mtReg, S.portal, S.saud])
];

if (articles.length !== 40) {
  throw new Error(`Expected 40 articles, found ${articles.length}`);
}
