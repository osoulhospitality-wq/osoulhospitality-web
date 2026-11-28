const bi=(ar,en)=>({ar,en});
const training=bi("سيناريو تدريب المطوّر","Developer training scenario");
const monthly=bi("شهري","Monthly"), quarterly=bi("ربع سنوي","Quarterly"),weekly=bi("أسبوعي","Weekly");
const tech=bi("فني المنشأة","Facility technician");
const services={
  cooling:[bi("صيانة أجهزة التبريد","Comfort cooling"),bi("التحقق من حالة الأصول المسجلة وملخص زيارتها","Check the recorded asset condition and visit summary"),monthly],
  pumps:[bi("زيارة مضخات التغذية","Supply-pump service"),bi("مراجعة سجل التشغيل والملاحظات المسجلة","Review the operating log and recorded findings"),monthly],
  cleaning:[bi("جودة نظافة المداخل","Entrance cleaning quality"),bi("جولة جودة في المداخل والممرات المشتركة","Quality walk through entrances and shared corridors"),weekly],
  pool:[bi("خدمة مرافق المسبح","Pool facility service"),bi("مراجعة تقرير مقدم الخدمة وحالة مرافق المسبح","Review the provider report and condition of pool facilities"),weekly],
  meters:[bi("قراءات عدادات الري","Irrigation meters"),bi("تسجيل قراءة تجريبية ومقارنتها بالسجل","Record a simulated reading and compare the log"),monthly],
  landscape:[bi("خدمة المساحات الخضراء","Landscape care"),bi("توثيق حالة المساحات المزروعة وملاحظة الهدر","Record the condition of landscaped areas and potential waste"),weekly],
  access:[bi("إدارة بوابات الدخول","Entry-gate service"),bi("مراجعة تذاكر دخول الموقع وسجل مقدم الخدمة","Review access tickets and the provider service log"),monthly],
  laundry:[bi("صيانة تجهيزات المغسلة","Laundry equipment servicing"),bi("مراجعة سجل قطع الغيار وحالة معدات المغسلة","Review equipment condition and the laundry parts log"),quarterly],
  waste:[bi("جمع النفايات المفروزة","Separated waste collection"),bi("مراجعة سجل الاستلام ونظافة نقطة التجميع","Review collection receipts and the collection point"),weekly],
  lift:[bi("متابعة خدمة المصاعد","Lift service oversight"),bi("مراجعة وثيقة زيارة المقاول المختص","Review the specialist contractor’s visit evidence"),monthly],
  network:[bi("توفر الشبكة المشتركة","Shared network availability"),bi("توثيق تذاكر الاتصال وزمن معالجة البلاغات","Record connectivity tickets and resolution times"),monthly],
  lighting:[bi("إنارة المواقف","Parking-area lighting"),bi("حصر نقاط الإنارة ذات ملاحظات الصيانة","Record lighting points with maintenance findings"),monthly],
  doors:[bi("أبواب المناطق المشتركة","Common-area doors"),bi("مراجعة سجل أعطال الأبواب وحالة الإغلاق","Review door faults and closure records"),quarterly],
  water:[bi("رصد قراءات المياه","Water-meter monitoring"),bi("مراجعة تسلسل القراءات وربطه بآخر زيارة","Review sequential readings against the last visit"),monthly],
  fabric:[bi("متابعة تشطيبات الوحدات","Unit fabric inspections"),bi("فحص حالة التشطيبات وتوثيق ملاحظات الوحدة","Record unit finishes and inspection findings"),quarterly]
};
const groups=[
  ["court",bi("دار الفناء","Courtyard House"),bi("سكن قصير الإقامة","Short-stay residence"),47,[["cooling",2730],["pumps",1160],["cleaning",1810],["water",580]],bi("مراجعة تكرار بلاغات التبريد","Review recurring cooling tickets"),bi("يطلب السيناريو ربط أمرين تجريبيين بسجل الأصل قبل طلب زيارة إضافية.","The scenario asks for two trial requests to be linked to the asset before requesting an additional visit.")],
  ["garden",bi("نُزل الحدائق","Garden Lodge"),bi("نُزل بحديقة ومسبح","Garden lodge with pool"),35,[["pool",1690],["meters",620],["landscape",1570]],bi("مراجعة اختلاف قراءتي الري","Review inconsistent irrigation readings"),bi("يتحقق المراجع من توقيت القراءتين قبل إقرار تعديل الزيارة.","The reviewer checks when the two readings were taken before approving a visit adjustment.")],
  ["terrace",bi("أجنحة الشرفة","Terrace Suites"),bi("أجنحة ضيافة","Hospitality suites"),68,[["access",940],["laundry",1210],["waste",870],["doors",730]],bi("متابعة إثبات استلام النفايات","Check waste collection evidence"),bi("يتطلب إغلاق المهمة التجريبية مطابقة وثيقة الاستلام مع الزيارة المحددة.","Closing the trial task requires matching the collection receipt with its scheduled visit.")],
  ["horizon",bi("برج الأفق التجريبي","Horizon Training Tower"),bi("برج متعدد الاستخدام","Mixed-use tower"),96,[["lift",2130],["network",1110],["lighting",1340],["fabric",910]],bi("مقارنة معالجة أعطال الإنارة","Compare lighting-fault responses"),bi("يختبر المشغّل قدرة السجل على تفسير تكرار الأعطال في المنطقة نفسها.","The operator tests whether the log explains repeat faults in the same area.")]
];
const days=['2026-11-29','2026-11-30','2026-12-01','2026-12-02','2026-12-03'];
export const pilot={version:1,start:days[0],end:days[4],timezone:"Asia/Riyadh",source:{name:training,notes:bi("المباني والموردون والمبالغ والمواعيد افتراضية لهذا التمرين.","Buildings, providers, amounts and appointments are fictional training inputs.")},sites:groups.map(([code,name,type,units,servicesForSite,title,why],i)=>{
  const contracts=servicesForSite.map(([k,price],j)=>{const [label,scope,serviceFrequency]=services[k];return {id:code+'-'+k,name:label,vendor:bi("فريق التدريب "+(i+1)+" / "+(j+1),"Training team "+(i+1)+" / "+(j+1)),serviceFrequency,paymentFrequency:monthly,annualCost:price*12,monthlyCost:price,periodCost:price,calls:null,scope,source:training,status:"simulated",kind:"service"}});
  const mkVisit=(c,j,phase)=>({id:code+'-'+phase+'-'+j,title:c.name,contractId:c.id,date:phase==='week'?days[(i+j)%5]:'2026-12-06',time:['08:30','10:00','12:30','14:00'][j%4],role:tech,scope:c.scope,checks:[bi("تأكيد موقع الأصل ونطاق الخدمة","Confirm the asset location and service scope"),bi("مراجعة الملاحظة وتوثيق النتيجة","Review the finding and record the outcome")],evidence:bi("اكتب وصفًا افتراضيًا لنتيجة الزيارة والمستند المراجع.","Enter a fictional description of the outcome and document reviewed."),recurrence:phase==='next'?bi("جولة متابعة مقترحة","Proposed follow-up visit"):c.serviceFrequency,phase});
  return {code,name,facts:[{label:bi("نوع المنشأة","Property type"),value:type,source:training},{label:bi("عدد الوحدات التجريبي","Scenario unit count"),value:units,source:training}],contracts,visits:[...contracts.map((c,j)=>mkVisit(c,j,'week')),mkVisit(contracts[0],0,'next')],decisions:[{id:code+'-d1',title,why,role:bi("مدير المنشأة","Facility manager"),due:days[i+1],priority:bi("مرتفعة","High"),contractId:contracts[0].id}]}
})};
