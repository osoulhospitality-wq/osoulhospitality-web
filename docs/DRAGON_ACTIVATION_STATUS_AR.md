# حالة تفعيل Dragon Intake Production

**التاريخ:** 2026-08-06  
**الفرع:** `chore/dragon-intake-production`  
**النطاق:** Dragon Intake Production v3

## ما تم إغلاقه

- تم تجهيز Workflow v3 كملف n8n export.
- تم إضافة قفل Supabase الذري وسجل التدقيق.
- تم إضافة اختبار GitHub Actions للتحقق البنيوي والسياسات الأساسية.
- تم توحيد الوثائق على قرار واحد: GitHub/CI Go لا يساوي Production Go.
- تم تثبيت منع ادعاء الإنجاز دون دليل خارجي قابل للتحقق.
- تم تحديد G1-G10 كشرط قبول حي قبل التفعيل الإنتاجي.

## ما لم يُفعّل بعد

لم يتم تفعيل Workflow إنتاجيًا داخل n8n/Supabase من هذه الجلسة لأن الاعتمادات والجلسة المصادقة غير متاحة داخل بيئة العمل.

العناصر غير المثبتة حيًا:

- استيراد Workflow v3 داخل n8n الفعلي.
- تطبيق `automation/sql/dragon_locks.sql` داخل Supabase الفعلي.
- ربط GitHub/OpenAI/Supabase credentials.
- تنفيذ G1-G10 بأدلة فعلية.

## قرار التفعيل

**No-Go للتفعيل الإنتاجي الحي حاليًا.**

السبب: نجاح GitHub وCI لا يكفي وحده. يلزم تنفيذ G1-G10 فعليًا داخل n8n/Supabase مع أدلة:

- n8n execution IDs.
- صفوف `dragon_locks`.
- صفوف `dragon_events_log`.
- تعليقات GitHub والوسوم الناتجة.
- إثبات Redelivery/Duplicate لا يسبب تشغيلًا ثانيًا.

## الخطوة التالية

بعد تسجيل الدخول إلى n8n وربط الاعتمادات، يتم استيراد:

`automation/n8n/dragon-intake-production.workflow.json`

ثم تطبيق:

`automation/sql/dragon_locks.sql`

ثم تنفيذ:

`docs/DRAGON_ACCEPTANCE_TEST_MATRIX_AR.md`

ولا يُسمح بتحويل القرار إلى `Production Go` إلا بعد نجاح الاختبارات العشرة بالأدلة.