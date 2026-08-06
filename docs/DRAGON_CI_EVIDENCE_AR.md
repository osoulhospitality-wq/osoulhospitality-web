# دليل CI — Dragon Intake Production

## نطاق الدليل

هذا الملف يوضح ما يثبته CI وما لا يثبته. أرقام Commit وRun الحالية يجب قراءتها من وصف PR وGitHub Actions، لأنها تتغير مع كل تعديل توثيقي أو كودي على الفرع.

## ما يثبته GitHub Actions

- تشغيل اختبار `automation/tests/dragon-workflow.test.mjs`.
- سلامة بنية Workflow وروابط العقد الأساسية.
- وجود سياسات المرسل والأحداث والقفل والتكرار والتحذير الثابت داخل ملف JSON.
- عدم وجود أسرار مضمنة في ملفات Dragon الخاضعة للاختبار.

## ما لا يثبته CI

- نجاح استيراد Workflow داخل حساب n8n الفعلي.
- صحة اعتمادات GitHub/OpenAI/Supabase داخل n8n.
- تطبيق SQL فعليًا في Supabase.
- نجاح G1-G10 تحت Webhooks حقيقية وRedelivery وتزامن.

## نطاق الفرق المطلوب مقابل main

يجب أن يبقى PR محصورًا في ملفات Dragon والوثائق/الاختبارات المرتبطة به:

- `.github/workflows/static-site-checks.yml`
- `automation/n8n/dragon-intake-production.workflow.json`
- `automation/sql/dragon_locks.sql`
- `automation/tests/dragon-workflow.test.mjs`
- `docs/DRAGON_ACCEPTANCE_TEST_MATRIX_AR.md`
- `docs/DRAGON_ACTIVATION_STATUS_AR.md`
- `docs/DRAGON_CI_EVIDENCE_AR.md`
- `docs/DRAGON_DEPLOYMENT_RUNBOOK_AR.md`
- `docs/DRAGON_FINAL_GATE_AR.md`
- `docs/PRODUCTION_RELEASE_GATE_AR.md`

## القرار

CI الأخضر = جاهزية GitHub. Production Go = ممنوع حتى تنفيذ G1-G10 فعليًا داخل n8n/Supabase بأدلة.