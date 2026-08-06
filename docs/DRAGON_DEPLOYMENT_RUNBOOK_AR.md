# دليل نشر Dragon Intake Production (v3)

> **تحديث v3:** هذه النسخة تثبت ضوابط القفل الذري وسجل التدقيق، وتصحح روابط n8n وسياق القرار وتعليمات منع ادعاء الإنجاز. أي نسخة قديمة تعتمد على فحص Labels فقط أو تعرض 12 عقدة داخل n8n لا تُعد نسخة إنتاجية معتمدة.

## النتيجة المستهدفة

عند إنشاء أو تصنيف أو إعادة فتح GitHub Issue مفتوح يحمل التصنيف `dragon-task`، من مُرسل مصرّح له فقط:

1. يتحقق من صلاحية المُرسل ومطابقة الحدث لمصفوفة الأحداث المقبولة.
2. يبني مفتاح Idempotency (`repository + issueNumber + commandVersion`) ويكتسب قفلًا ذريًا على Supabase قبل أي إجراء آخر.
3. يسجل كل حدث وارد في `dragon_events_log` مع القرار والسبب.
4. يضيف أو يزيل وسوم Dragon فقط دون المساس بأي وسوم أخرى.
5. يسجل تعليق استلام يتضمن رقم التنفيذ ومفتاح Idempotency.
6. يرسل المهمة إلى Dragon Intake & Drafting Assistant لإنتاج مسودة تنفيذية فقط.
7. ينشر المسودة داخل الـIssue مع تحذير ثابت بأنها مخرج آلي أولي وليست تنفيذًا خارجيًا.
8. يحول الحالة إلى `dragon-completed` عند النجاح، أو `dragon-failed` عند الفشل، ويغلق صف القفل بالحالة النهائية.

## الملفات

- `automation/n8n/dragon-intake-production.workflow.json`: ملف n8n v3 الجاهز للاستيراد.
- `automation/sql/dragon_locks.sql`: مخطط جدولي القفل وسجل التدقيق على Supabase/Postgres.
- `automation/tests/dragon-workflow.test.mjs`: اختبار البنية والسياسات محليًا وعلى GitHub Actions.
- `docs/DRAGON_ACCEPTANCE_TEST_MATRIX_AR.md`: مصفوفة G1-G10 المطلوبة قبل أي Go إنتاجي.
- `docs/PRODUCTION_RELEASE_GATE_AR.md`: بوابة القرار الرسمية.

## ضوابط الأمان

- لا يحتوي أي ملف على Token أو API Key؛ كل الاعتمادات placeholders ويجب ربطها داخل n8n فقط.
- اعتماد GitHub المتوقع داخل n8n: `GitHub account` أو ما يعادله فعليًا.
- اعتماد OpenAI المتوقع داخل n8n: `OpenAI account` أو ما يعادله فعليًا.
- يلزم اعتماد Supabase من نوع `httpHeaderAuth` يحمل رأسي `apikey` و`Authorization: Bearer` لمفتاح service role، مع متغير بيئة `SUPABASE_URL`.
- قائمة المرسلين المصرح لهم موجودة صراحة داخل عقدة `Authorize & Classify`، وحاليًا تقبل `osoulhospitality-wq` فقط.
- لا تجعل النسخة القديمة والنسخة v3 نشطتين في الوقت نفسه؛ كلاهما قد يستقبل أحداث GitHub نفسها.

## النشر داخل n8n

1. طبّق `automation/sql/dragon_locks.sql` على Supabase تجريبيًا أولًا.
2. أنشئ وربط اعتماد Supabase في n8n، وعرّف `SUPABASE_URL`.
3. استورد `automation/n8n/dragon-intake-production.workflow.json`.
4. تأكد أن النسخة المستوردة تحتوي 23 عقدة، وأنها تبدأ بـ`Authorize & Classify` ثم `Acquire Lock` ثم مسارات النجاح/الفشل.
5. اربط اعتمادات GitHub وOpenAI وSupabase بكل عقدة يظهر فيها placeholder مثل `MAP_EXISTING_*`.
6. تأكد أن النموذج `gpt-5-mini` متاح؛ إن لم يظهر، اختر نموذجًا حديثًا متاحًا وسجّل القرار في مصفوفة الاختبار.
7. عطّل Workflow القديم قبل تفعيل v3.
8. تحقق من أن مسارات الخطأ في `Add dragon-processing` و`Post Acceptance` و`Normalize Delivery` و`Post Delivery` تنتهي في `Finalize Lock: failed`، وأن إنهاء القفل يسبق تسوية Labels.
9. نفّذ كامل G1-G10 من `docs/DRAGON_ACCEPTANCE_TEST_MATRIX_AR.md` ووثّق الأدلة.
10. لا يتم إعلان Production Go إلا بعد نجاح G1-G10 بأدلة من n8n/Supabase/GitHub.

## ملاحظة تشغيلية مهمة

Dragon هنا Intake & Drafting Assistant، وليس وكيل تنفيذ يكتب كودًا أو ينشر ملفات أو يدمج PRs. أي تعليق آلي يجب أن يبقى مسودة أو مخرجًا أوليًا ما لم يتضمن دليل تنفيذ خارجي قابل للتحقق.

## حالة الاعتماد

GitHub/CI يثبت سلامة الكود والاختبار البنيوي فقط. التفعيل الحي داخل n8n/Supabase يبقى **No-Go** حتى اكتمال G1-G10.