# بوابة Dragon النهائية

تم تجهيز PR فنيًا وتمرير CI، لكن التفعيل الإنتاجي داخل n8n/Supabase غير منفذ من هذه الجلسة بسبب عدم توفر جلسة n8n/Supabase مصادقة داخل بيئة العمل.

## آخر حالة مثبتة

- PR: `#22`
- Branch: `chore/dragon-intake-production`
- Scope: Dragon Intake Production v3.
- GitHub compare: يجب أن يبقى `behind_by=0` قبل الدمج.
- GitHub Actions: يجب أن تكون آخر نتيجة على رأس الفرع `success` قبل الدمج.

> لا يتم تثبيت رقم Commit أو Run هنا لأن هذا الملف نفسه قد يغيّر رأس الفرع. مصدر الحقيقة للأرقام الحالية هو وصف PR وGitHub Actions.

## قرار الإنتاج

- GitHub/CI: **Go إذا كان آخر CI على رأس الفرع ناجحًا**.
- n8n/Supabase live activation: **No-Go حتى تشغيل G1-G10 وتوثيق الأدلة**.

## الشرط الوحيد المتبقي

تسجيل الدخول إلى n8n، استيراد Workflow v3، تطبيق SQL، ربط Credentials، ثم تنفيذ مصفوفة القبول الحية كاملة.