# حالة تفعيل Dragon Intake Production

**التاريخ:** 2026-07-27  
**الفرع:** `chore/dragon-intake-production`  
**آخر Commit:** `b4c4333e96f7a87b0d5d5378b4e318a930f8428b`

## ما تم إغلاقه

- تم تحديث Workflow إلى Dragon v3.
- تم تنظيف PR ليصبح مبنيًا فوق `main` الحالي بدون Divergence.
- أصبح فرق PR محصورًا في ملفات Dragon فقط.
- تم تمرير اختبار GitHub Actions بنجاح على Commit `b4c4333`.
- تم التحقق محليًا من:
  - بنية Workflow والروابط بين العقد.
  - صلاحية المرسل ومصفوفة الأحداث.
  - توحيد `opened/labeled` تحت `initial`.
  - محاكاة القفل الذري ومنع التكرار.
  - مسار Retry.
  - عدم وجود أسرار مضمنة.
  - التحذير الثابت في الردود.
  - بناء مصدر الموقع واختبارات الصفحات منفصلًا.

## ما لم يُفعّل بعد

لم يتم تفعيل Workflow إنتاجيًا داخل n8n حتى الآن، لأن جلسة n8n المتاحة وصلت إلى صفحة تسجيل الدخول، ولا توجد جلسة مصادقة أو صلاحيات Supabase مباشرة داخل بيئة التنفيذ.

## قرار التفعيل

**No-Go للتفعيل الإنتاجي الحي حاليًا.**

السبب: نجاح GitHub وCI لا يكفي وحده. يلزم تنفيذ G1-G10 فعليًا داخل n8n/Supabase مع أدلة:

- n8n execution IDs.
- صفوف `dragon_locks`.
- صفوف `dragon_events_log`.
- تعليقات GitHub والوسوم الناتجة.
- إثبات Redelivery/Duplicate لا يسبب تشغيلًا ثانيًا.

## الخطوة التالية

بعد تسجيل الدخول إلى n8n وربط Supabase/OpenAI/GitHub credentials، يتم استيراد:

`automation/n8n/dragon-intake-production.workflow.json`

ثم تطبيق:

`automation/sql/dragon_locks.sql`

ثم تنفيذ مصفوفة:

`docs/DRAGON_ACCEPTANCE_TEST_MATRIX_AR.md`

ولا يُسمح بتحويل القرار إلى `Production Go` إلا بعد نجاح الاختبارات العشرة بالأدلة.
