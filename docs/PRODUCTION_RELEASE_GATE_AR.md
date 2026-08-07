# بوابة إطلاق منظومة Osool / Dragon

## القرار الحالي

**GitHub/CI Go، لكن Production Hold داخل n8n/Supabase.**

سلامة ملف JSON ونجاح GitHub Actions يثبتان جاهزية الكود والاختبار البنيوي. لا يثبتان أن التشغيل الحي داخل n8n/Supabase نجح تحت أحداث GitHub الفعلية، أو أن منع التكرار يعمل عند إعادة الإرسال والتزامن.

## ما تغيّر في Dragon v3

Dragon v3 يستبدل النسخ القديمة التي اعتمدت على فحص Labels فقط بضوابط تشغيل قابلة للتدقيق:

| البند | النسخ القديمة | Dragon v3 |
|---|---|---|
| صلاحية المُرسل | غير كافية أو غير موحدة | Allowlist صريحة داخل `Authorize & Classify` |
| مصفوفة الأحداث | قبول واسع للأحداث | قبول مضبوط لـ`opened` و`labeled` و`reopened` بشروط واضحة |
| منع التكرار | فحص-ثم-كتابة عبر Labels، مع احتمال سباق | قفل ذري عبر Supabase باستخدام `on_conflict=repository,issue_number,command_version` |
| مفتاح Idempotency | غير مستقر | `repository + issueNumber + commandVersion` مع توحيد `opened/labeled` الأوليين تحت `initial` |
| تعديل الوسوم | قابل لمسح وسوم غير مرتبطة | إضافة/إزالة وسوم Dragon فقط |
| دور الوكيل | قابل للالتباس كوكيل تنفيذ | Intake & Drafting Assistant فقط |
| منع ادعاء الإنجاز | غير محكم | تحذير ثابت ومنع عبارة `تم التنفيذ` دون دليل خارجي قابل للتحقق |
| التدقيق | محدود | جدول `dragon_events_log` يسجل كل حدث وسبب القرار |

## مصدر الحقيقة

- Workflow: `automation/n8n/dragon-intake-production.workflow.json`.
- SQL: `automation/sql/dragon_locks.sql`.
- الاختبار البنيوي: `automation/tests/dragon-workflow.test.mjs`.
- مصفوفة القبول الحي: `docs/DRAGON_ACCEPTANCE_TEST_MATRIX_AR.md`.
- حالة PR الحالية ونتائج CI: وصف PR وGitHub Actions، لأنها تتغير مع كل Commit.

## بوابات القبول الحية

| البوابة | الاختبار | معيار النجاح | الحالة |
|---|---|---|---|
| G1 Authority | مُرسل غير مصرح له يضع الوسم | لا استدعاء للنموذج، وتسجيل `unauthorized` | غير مثبت حيًا |
| G2 Event matrix | حدث غير مقبول مثل `edited` | رفض وتسجيل السبب بلا إجراء على الـIssue | غير مثبت حيًا |
| G3 Idempotency | Redeliver لنفس Webhook | لا تعليق مكرر ولا استدعاء نموذج ثانٍ | غير مثبت حيًا |
| G4 Concurrency | وصول `opened` و`labeled` لنفس التحول | قفل واحد وتنفيذ واحد فقط | غير مثبت حيًا |
| G5 OpenAI | استدعاء النموذج | مخرج غير فارغ أو مسار خطأ مضبوط | غير مثبت حيًا |
| G6 Labels | دورة ناجحة مع وسوم أخرى مثل `bug` | لا تُمس الوسوم غير المرتبطة بـDragon | غير مثبت حيًا |
| G7 Failure | تعطيل OpenAI مؤقتًا بعد القفل | `dragon-failed` فقط، وإغلاق القفل كـ`failed` | غير مثبت حيًا |
| G8 Retry | إزالة وسوم الحالة ثم إعادة الفتح | `commandVersion` جديد وقفل جديد | غير مثبت حيًا |
| G9 Security | فحص الأسرار والاعتمادات | لا أسرار في GitHub أو التعليقات أو السجلات | مثبت نصيًا، ويتطلب تدقيق الاعتمادات فعليًا |
| G10 Audit | تتبع كل حدث | صف تدقيق لكل حدث وارد بسبب واضح | غير مثبت حيًا |

## ترتيب النشر الإلزامي

1. تطبيق `automation/sql/dragon_locks.sql` في Supabase.
2. ربط `SUPABASE_URL` واعتماد Supabase داخل n8n.
3. استيراد Workflow v3 وتعطيل أي Workflow Dragon قديم.
4. ربط GitHub/OpenAI/Supabase credentials بدل كل `MAP_EXISTING_*`.
5. تنفيذ G1-G10 وتوثيق n8n execution IDs وصفوف Supabase وتعليقات/وسوم GitHub.
6. عند اكتمال الأدلة فقط يتحول القرار إلى Production Go.

## شروط الإغلاق

- لا يوجد صف `processing` عالق في `dragon_locks`.
- لا يوجد تكرار تعليقات عند Redelivery.
- لا تظهر أسرار في GitHub أو n8n execution logs أو التعليقات.
- Rollback موثق: تعطيل Workflow v3، إبطال أي اعتماد متأثر، وتنظيف يدوي لأي قفل عالق بعد مراجعة السبب.