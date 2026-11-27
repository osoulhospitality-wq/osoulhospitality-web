# DRAQON — إصدار تصحيح إعادة فتح طلب الاستقبال

حالة الإصدار: ينتظر اعتماد نشر مستقل وفق مستوى L5 في [دليل التشغيل](../../../docs/draqon/operations.md). بُني التصحيح على العقدة الفعلية `Authorize & Classify` من `Dragon Intake Production v3`، مسار `viheVitGZCbTGqqR` ونسخة `c028a794-a32f-4c7a-aa84-63fc647c525b`. تحقَّق الفحص من تطابق النسختين المنشورة والتحريرية قبل إعداد هذا التصحيح.

## النطاق والأدلة

تعالج القاعدة حالة إعادة فتح طلب بلا وقت تحديث صالح، بحيث لا يحجز قفل إعادة محاولة بمفتاح غير صالح. التمرين المعزول رقم 311 كشف المشكلة قبل المعالجة، والتنفيذان 320 و324 أكدا إيقاف الحالات غير الصالحة بعد المعالجة. تطابقت نتائج 12 حالة مع مخرجاتها المنتظرة في محرك n8n الاختباري. قارنت تجربة محلية مستقلة النص الفعلي قبل وبعد التصحيح على ثمانية مدخلات، ونجح تطبيق التصحيح ثم عكسه مع تطابق بايتات المصدر.

## نشر التغيير المحدود والتراجع

1. أعد قراءة إصدار المسار المنشور ونسخة التحرير وصلاحية النشر. يُعاد إجراء المقارنة إن اختلف معرّف الإصدار السابق.
2. صدّر قيمة `parameters.jsCode` للعقدة المعنية وحدها كنص UTF-8 إلى `classifier.js` من دون إضافة سطر أخير. بصمة SHA-256 المتوقعة للنص هي `73e1e101ee91379989834b04e0609de1943560221294356363895ba8036acf27`.
3. احفظ نسخة المسار باستخدام نظام النسخ الخاص بالمؤسسة داخل بيئتها. طبّق الفرق أدناه باستخدام `git apply --check` ثم `git apply` في مجلد الملف. بصمة النص الناتج هي `bd88bc7a8d0a1218fce5dcfe2c35d949207d174d8e5b344ca1c88ea349397a99`.
4. بعد اعتماد الإصدار، عدّل قيمة حقل الكود وحده في مسودة n8n. طابق البصمة وراجع الفرق مع النسخة السابقة وتحقق من ثبات باقي العقد والاتصالات والاعتمادات. انشر النسخة المحددة وفق سجل الإصدار واختبر تدفق الاستقبال في نافذة تجريبية معتمدة.
5. عند التراجع، أعِد الإصدار الأساسي المنشور أو اعكس هذا الفرق عبر `git apply --reverse`، وتحقق من البصمة الأساسية ثم انشر نسخة التراجع المعتمدة. تَحقّق من حالة الطلبات الجارية في النافذة ومن عدم ازدواج الأثر.

```diff
diff --git a/classifier.js b/classifier.js
index dffec79..616a39f 100644
--- a/classifier.js
+++ b/classifier.js
@@ -57,6 +57,16 @@ if (!eligible) {
 // new transition (a later explicit retry has a newer updated_at). This makes the
 // idempotency key derivable without our own counter, so there is no separate
 // race condition in computing it.
+if (action === 'reopened') {
+  // GitHub timestamps are the durable identity of an explicit retry.
+  const version = issue.updated_at;
+  const timestamp = typeof version === 'string' ? Date.parse(version) : NaN;
+  const roundTrip = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
+  if (!roundTrip || (version !== roundTrip && version !== roundTrip.replace('.000Z', 'Z'))) {
+    return [{ json: reject('explicit retry requires a valid GitHub UTC update timestamp') }];
+  }
+}
+
 const commandVersion = issue.updated_at;
 const idempotencyKey = `${repository}#${issueNumber}@${commandVersion}`;
```
