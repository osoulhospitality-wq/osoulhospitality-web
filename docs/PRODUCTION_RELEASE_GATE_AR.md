# بوابة إطلاق منظومة Osool / Dragon

## القرار الحالي

**Hold for Evidence — ممنوع الدمج أو النشر الإنتاجي قبل إغلاق اختبارات القبول أدناه.**

هذا القرار لا يعني أن التصميم مرفوض؛ بل يعني أن وجود ملفات وتطبيقات غير كافٍ لإثبات التشغيل المتكامل.

## مصدر الحقيقة

- الكود والـWorkflows: GitHub.
- البيانات التشغيلية: Supabase/PostgreSQL.
- الملفات الأصلية الحساسة: Supabase Storage الخاص.
- لوحة التشغيل والمراجعة البشرية: Retool.
- الأتمتة والتكامل: n8n.
- أوامر العمل وسجل التسليم غير الحساس: GitHub Issues.

يُمنع تشغيل مخططي قاعدة البيانات الحاليين معًا. يعتمد
`osoul-v10-command-center/command-center/enterprise/schema.sql`
كأساس MVP لأنه يحتوي RLS، بينما
`command-center-v9/database/schema.sql`
مرجع تصميم موسع فقط إلى حين تحويله إلى migrations متسلسلة.

## بوابات القبول

| البوابة | الاختبار | معيار النجاح | الحالة |
|---|---|---|---|
| G1 GitHub | Issue يحمل `dragon-task` | Webhook يستقبل حدثًا واحدًا فقط | مثبت جزئيًا |
| G2 n8n | تشغيل Dragon | تسلسل واحد بلا تكرار وبلا عقد معلقة | غير مثبت |
| G3 OpenAI | استدعاء `gpt-5-mini` | مخرج غير فارغ أو فشل مسجل | غير مثبت |
| G4 Supabase | تطبيق migration | الجداول + RLS + سياسات Storage دون Security Advisor Critical | غير مثبت |
| G5 Retool | CRUD بصلاحيات الأدوار | viewer قراءة فقط، analyst إدخال، approver اعتماد | غير مثبت |
| G6 Audit | تتبع Execution ID | نفس المعرّف ظاهر في GitHub وn8n وSupabase | غير مثبت |
| G7 Failure | مفتاح/model غير صالح | `dragon-failed` فقط، ولا يظهر `dragon-completed` | غير مثبت |
| G8 Idempotency | إعادة نفس الحدث | لا تنفيذ ثانٍ ولا تعليق مكرر | غير مثبت |
| G9 Security | أسرار وصلاحيات | لا أسرار بالواجهة/GitHub، وRLS مفعّل | غير مثبت |
| G10 Recovery | إعادة المحاولة | إزالة failed وإعادة الوسم تنجح مرة واحدة | غير مثبت |

## ترتيب النشر الإلزامي

1. تطبيق مخطط Supabase المعتمد في بيئة تجريبية.
2. إنشاء bucket خاص للوثائق وسياسات `SELECT/INSERT/UPDATE` اللازمة.
3. إنشاء مستخدم المالك وربط صف `profiles` يدويًا من جلسة إدارية موثوقة.
4. ربط Retool بقاعدة البيانات باستخدام حساب أقل صلاحية ممكنة.
5. استيراد Workflow Dragon وربط GitHub وOpenAI من خزنة n8n.
6. إضافة تسجيل `execution_id` إلى `audit_events`.
7. تشغيل G1–G10 في بيئة تجريبية.
8. نشر Workflow، ثم دمج PR فقط بعد حفظ أدلة النجاح.

## شروط الإغلاق

- Issue الاختبار يحتوي تعليق قبول وتسليم واحد فقط.
- التصنيف النهائي واحد فقط: `dragon-completed` أو `dragon-failed`.
- سجل Supabase يحتوي `execution_id` المطابق.
- لا توجد Security Advisor findings حرجة.
- لا يحتوي GitHub أو Retool على service-role key أو OpenAI key.
- توثيق Rollback: تعطيل Workflow، إبطال الاعتماد المتأثر، وإعادة migration آمنة.

