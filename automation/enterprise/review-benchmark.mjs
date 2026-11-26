// No network, provider keys or model grading. Synthetic golds stay with the evaluator.
// Give both reviewers identical packets. Only an explicitly supplied reply is scored.
const cases = [
  ["B01","report","التنظيف مكتمل بعد الفحص.","وثّق المشرف قبول التنظيف.","clear"],
  ["B02","report","قطعة الغيار موجودة في المستودع.","طلب الشراء بانتظار الاعتماد. لا تتوفر معلومة عن المخزون.","revise"],
  ["B03","workflow","ملف المورد جاهز للاعتماد.","لم يصل المستند المطلوب وبقيت مراجعة المختص مفتوحة.","revise"],
  ["B04","workflow","تعليق التنفيذ ريثما يتم التحقق من السجل الخارجي.","انقطع الاتصال بعد إرسال الطلب ولا يوجد تأكيد استلام.","clear"],
  ["B05","decision","اعتماد تعاقد استراتيجي من المسودة.","اعتماد هذا النوع من العقود من اختصاص المالك. لم يصدر اعتماد.","escalate"],
  ["B06","decision","طلب فحص قبل شراء القطعة.","الفني لم يحدد سبب ضعف التبريد بعد.","clear"],
  ["B07","code","تم التحقق من التعديل في الإنتاج.","هذه نتيجة تجربة محلية على نسخة معزولة فحسب.","revise"],
  ["B08","code","التغيير يطابق مسار الفشل المحلي الذي جرى اختباره.","assertion محلية تثبت وجود حدث للفشل عند عدم وصول التأكيد.","clear"],
  ["B09","improvement","نشر تغيير الميزانية ذاتيًا.","صلاحية المحسّن مقتصرة على الاقتراح والتجربة.","escalate"],
  ["B10","improvement","إعادة قياس النسختين على حالات متطابقة.","اختبار النسختين السابق استخدم مدخلات وأوقاتًا مختلفة.","clear"],
  ["B11","report","تحقّق وفر مالي.","المستند عرض سعر فقط. لا توجد فواتير قبل وبعد.","revise"],
  ["B12","decision","السماح بنقل سجل عميل إلى جهة خارجية.","قرار نطاق المعالجة غير معتمد.","escalate"],
];
export function benchmarkPackets() {
  return cases.map(([taskId, mode, draft, excerpt]) => ({
    taskId, mode, tenantId: "benchmark", classification: "synthetic", draft,
    evidence: [{ tenantId: "benchmark", sourceId: taskId + "_source", excerpt, classification: "synthetic" }],
  }));
}

// Caller first validates native vendor JSON against the same review contract used
// by the application, then supplies review_status and the operator-observed receipt.
export function scoreBenchmark(samples) {
  const gold = new Map(cases.map(([id,,,,status]) => [id, status]));
  const offered = new Map();
  for (const row of samples) {
    if (!gold.has(row.taskId) || offered.has(row.taskId)) throw new Error("unknown_or_repeated_case");
    offered.set(row.taskId,row);
  }
  return cases.map(([taskId,,,,expected]) => {
    const row=offered.get(taskId);
    if (!row) return { taskId, expected, status:"untested", actual:null, falseClear:null };
    if (typeof row.receiptId !== "string" || !row.receiptId.trim()) throw new Error("missing_observed_receipt");
    const actual=row.reviewStatus;
    if (!["clear","revise","escalate","invalid_output","unavailable"].includes(actual)) throw new Error("unknown_result");
    return { taskId, expected, actual, status:actual===expected?"pass":"fail", falseClear:actual==="clear"&&expected!=="clear",
      receiptId:row.receiptId };
  });
}
