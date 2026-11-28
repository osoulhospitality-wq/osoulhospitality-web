// Management definitions. Each input is an aggregate for one tenant and one period.
// A null target remains unset until the owner records a dated decision.
const groupInfo = {
  executive: ['الإدارة التنفيذية', 'Executive', 'CEO'],
  finance: ['المالية', 'Finance', 'CFO'],
  marketing: ['التسويق', 'Marketing', 'CMO'],
  commercial: ['المبيعات', 'Sales', 'CCO'],
  operations: ['التشغيل', 'Operations', 'COO'],
  intelligence: ['الذكاء الاصطناعي', 'AI operations', 'CAIO']
};
export const groups = groupInfo;

const calculations = {
  total: ([a]) => a,
  net: ([a,b]) => a-b,
  sum3: ([a,b,c]) => a+b+c,
  sum2: ([a,b]) => a+b,
  share: ([a,b]) => b > 0 && a <= b ? 100*a/b : null,
  percent: ([a,b]) => b > 0 ? 100*a/b : null,
  ratio: ([a,b]) => b > 0 ? a/b : null,
  margin: ([a,b]) => a > 0 ? 100*(a-b)/a : null,
  investmentReturn: ([a,b]) => b > 0 ? 100*(a-b)/b : null,
  variance: ([a,b]) => b > 0 ? 100*(a-b)/b : null,
  breakEven: ([fixed,revenue,variable]) => revenue > variable && revenue > 0 ? fixed/(1-variable/revenue) : null
};
const formula = {
  total: a=>a[0], net: ([a,b])=>a+' − '+b, sum3: a=>a.join(' + '), sum2: a=>a.join(' + '),
  share: ([a,b])=>'100 × '+a+' / '+b, percent: ([a,b])=>'100 × '+a+' / '+b, ratio: ([a,b])=>a+' / '+b,
  margin: ([a,b])=>'100 × ('+a+' − '+b+') / '+a,
  investmentReturn: ([a,b])=>'100 × ('+a+' − '+b+') / '+b,
  variance: ([a,b])=>'100 × ('+a+' − '+b+') / '+b,
  breakEven: ([a,b,c])=>a+' / (1 − '+c+' / '+b+')'
};
const source = {
  goals:['سجل الأهداف والمبادرات المعتمدة','Approved objectives and initiatives register'],
  decisions:['سجل القرارات والموافقات المؤرخ','Timestamped decision and approval ledger'],
  work:['سجل المهام والمواعيد والأدلة المقبولة','Task due dates and accepted closure evidence'],
  ledger:['دفتر الأستاذ وقيود الإقفال المعتمدة','Closed general ledger and approved journal entries'],
  budget:['الميزانية المعتمدة ودفتر الأستاذ','Approved budget and closed general ledger'],
  bank:['تسويات البنك ودفتر النقدية','Reconciled bank and cash ledger'],
  cost:['مراكز التكلفة ودفتر الأستاذ','Cost allocations and general ledger'],
  attribution:['إيصالات القنوات وربط الحملات وCRM والمالية','Channel receipts, campaign attribution, CRM and finance'],
  channel:['تصدير تحليلات القناة الرسمية','Official channel analytics export'],
  crm:['سجل الصفقات والعملاء في CRM','CRM deal and customer history'],
  sales:['العقود الموقعة وCRM','Executed contracts and CRM'],
  service:['عقود الخدمة وسجل أوامر العمل والزيارات','SLA contracts, work orders and visit receipts'],
  tickets:['سجل تذاكر الخدمة والشكاوى','Service request and complaints log'],
  audit:['سجل تشغيل الوكلاء وإيصالات التحقق','Agent run ledger and verification receipts'],
  eval:['عينة تقييم مستقلة بأحكام موثقة','Independently adjudicated evaluation sample'],
  usage:['فواتير المزود واستهلاك النموذج والتشغيل','Provider bills, model usage and compute'],
  uptime:['مراقبة التوافر المستقلة ذات سجل تغطية','Independent uptime monitor with coverage records']
};
// Row: id, Arabic label, English label, definition (Arabic/English), source, cadence,
// unit, calculation, ordered input fields. Monetary figures use SAR excluding VAT.
const rows = {
 executive: [
 ['goals','تحقيق الأهداف','Goal attainment','الأهداف المستحقة التي حققت معيارها المعتمد','Due objectives meeting their approved threshold','goals','month','%','share','goals_met goals_due'],
 ['initiatives','إنجاز المبادرات','Initiative delivery','المبادرات المستحقة التي قبل المالك تسليمها','Due initiatives with accepted deliverables','goals','week','%','share','initiatives_accepted initiatives_due'],
 ['decision_speed','زمن اتخاذ القرار','Decision lead time','الوقت من اكتمال طلب القرار إلى صدور القرار المعتمد','Elapsed hours from complete submission to authorized decision','decisions','day','h','ratio','decision_hours decisions_closed'],
 ['on_time','المهام المنجزة في موعدها','On-time tasks','المهام المستحقة المنجزة قبل الموعد بما فيها المستحقة المفتوحة في المقام','Tasks accepted by deadline among all tasks due, including overdue open tasks','work','day','%','share','tasks_on_time tasks_due'],
 ['roi','العائد على الاستثمار','Realized ROI','المنافع المالية المحققة بعد تكلفة الاستثمار حسب نطاق وفترة موحدين','Realized financial benefit net of investment for the same scope and horizon','ledger','month','%','investmentReturn','realized_benefit investment_cost']
 ],
 finance: [
 ['revenue','الإيرادات','Revenue','صافي الإيراد المثبت بعد الخصومات والمرتجعات','Recognized revenue net of discounts and returns','ledger','month','SAR','total','net_revenue'],
 ['gross_margin','هامش الربح الإجمالي','Gross margin','حصة الإيراد المثبت بعد تكاليف تقديم الخدمة المباشرة','Recognized revenue remaining after direct cost of service','ledger','month','%','margin','net_revenue direct_cost'],
 ['ebitda','الأرباح قبل الفوائد والضرائب والإهلاك والإطفاء','EBITDA','الربح التشغيلي مضافًا إليه الإهلاك والإطفاء المحملان عليه','Operating profit plus depreciation and amortization charged in arriving at that profit','ledger','month','SAR','sum3','operating_profit depreciation amortization'],
 ['cash_flow','صافي التدفق النقدي','Net cash flow','المقبوضات الفعلية مطروحًا منها المدفوعات مع استبعاد التحويلات الداخلية','Cash received less cash paid, excluding internal transfers','bank','week','SAR','net','cash_received cash_paid'],
 ['budget_variance','انحراف المصروف عن الميزانية','Expense budget variance','الزيادة أو النقص في المصروف الفعلي عن المصروف المعتمد لنفس الفترة','Actual expense above or below approved expense for the same period','budget','month','%','variance','actual_expense budget_expense'],
 ['opex','تكلفة التشغيل','Operating expense','مصروفات التشغيل وفق تبويب الدفتر المعتمد مع استبعاد الإنفاق الرأسمالي','Operating expense under the adopted chart of accounts excluding capital expenditure','ledger','month','SAR','total','operating_expense'],
 ['break_even','إيراد نقطة التعادل','Break-even revenue','الإيراد اللازم لتغطية التكاليف الثابتة عند مزيج الخدمات وهامش المساهمة المقاسين','Revenue required to cover fixed costs at observed service mix and contribution margin','cost','month','SAR','breakEven','fixed_cost net_revenue variable_cost']
 ],
 marketing: [
 ['reach','الوصول الفريد','Unique reach','الحسابات الفريدة التي وصلت إليها الحملة داخل قناة واحدة؛ لا تجمع القنوات بلا إزالة تكرار','Unique accounts reached within one channel or an explicitly deduplicated cross-channel cohort','channel','day','count','total','unique_accounts'],
 ['engagement','معدل التفاعل','Engagement rate','عدد التفاعلات على مرات الظهور في القناة نفسها وقد يتجاوز المئة بالمئة','Interaction events per impression within one channel; multiple events per impression are possible','channel','day','%','percent','interactions impressions'],
 ['ctr','نسبة النقر للظهور','Click-through rate','نقرات الروابط مقسومة على مرات ظهور الإعلان أو المنشور نفسه','Link clicks divided by impressions of the same creative','channel','day','%','percent','link_clicks impressions'],
 ['conversion','معدل تحويل الجلسات','Session conversion','الجلسات التي أنجزت الحدث المعتمد مرة على الأقل من جميع الجلسات المؤهلة','Eligible sessions completing the approved conversion event at least once','attribution','week','%','share','converting_sessions eligible_sessions'],
 ['cpl','تكلفة العميل المحتمل','Cost per lead','إنفاق الحملة لكل عميل محتمل فريد وفق نافذة الإسناد','Campaign spend per deduplicated lead within the attribution window','attribution','week','SAR','ratio','campaign_spend unique_leads'],
 ['cac','تكلفة اكتساب العميل','Customer acquisition cost','تكلفة المبيعات والتسويق المخصصة للاكتساب لكل عميل جديد دافع','Allocated sales and marketing acquisition costs per new paying customer','attribution','month','SAR','ratio','acquisition_cost new_customers'],
 ['roas','العائد على الإنفاق الإعلاني','Return on ad spend','إيراد الإعلانات المنسوب وفق نموذج موثق لكل ريال إنفاق إعلاني','Attributed ad revenue per riyal of media spend under a documented model','attribution','week','×','ratio','ad_revenue media_spend'],
 ['marketing_roi','العائد على الاستثمار التسويقي','Marketing ROI','هامش المساهمة الإضافي المنسوب للحملة بعد تحميل كلفتها الكاملة','Incremental contribution attributable to the campaign net of all campaign costs','attribution','month','%','investmentReturn','incremental_contribution campaign_cost'],
 ['qualified_leads','العملاء المحتملون المؤهلون','Qualified leads','العملاء الفريدون الذين استوفوا تعريف التأهيل المعتمد خلال الفترة','Distinct leads first meeting approved qualification criteria during the period','crm','week','count','total','qualified_leads'],
 ['sourced_revenue','الإيراد الناشئ عن التسويق','Marketing-sourced revenue','الإيراد المثبت من فرص كان مصدرها التسويق وفق سياسة الإسناد','Recognized revenue from opportunities sourced by marketing under the attribution policy','attribution','month','SAR','total','sourced_revenue'],
 ['clv','قيمة العميل طوال العلاقة','Observed customer lifetime value','مساهمة مجموعة عملاء مكتملة دورة العلاقة لكل عميل فيها، بعد تكاليف خدمتها المباشرة','Realized lifetime contribution per customer for a fully observed closed cohort','attribution','month','SAR','ratio','cohort_contribution cohort_customers']
 ],
 commercial: [
 ['pipeline','قيمة الفرص المفتوحة','Open pipeline value','قيمة الصفقات المفتوحة عند نهاية الفترة دون ترجيح أو تكرار','Unweighted value of distinct open deals at period end','crm','day','SAR','total','open_pipeline'],
 ['win_rate','معدل إغلاق الصفقات الرابحة','Win rate','الصفقات الرابحة من جميع الصفقات المحسومة خلال الفترة','Won deals among all won and lost decisions during the period','crm','week','%','share','won_deals decided_deals'],
 ['contracts','قيمة العقود الموقعة','Signed contract value','إجمالي قيمة الالتزامات الموقعة الجديدة بعد استبعاد الضريبة والخيارات غير الملزمة','Value of newly signed binding commitments excluding tax and unexercised options','sales','week','SAR','total','signed_value'],
 ['customer_value','متوسط الإيراد لكل عميل','Average revenue per customer','الإيراد المثبت للفترة لكل عميل ساهم في ذلك الإيراد','Period recognized revenue per customer contributing to it','attribution','month','SAR','ratio','net_revenue paying_customers'],
 ['sales_cycle','مدة دورة البيع','Sales cycle duration','المدة من تأهيل الفرصة إلى حسمها للصفقات المغلقة خلال الفترة','Time from opportunity qualification to close for deals decided in the period','crm','week','days','ratio','sales_cycle_days decided_deals'],
 ['retention','الاحتفاظ بالعملاء','Customer retention','عملاء بداية الفترة المستمرون حتى نهايتها من مجموعة البداية نفسها','Opening customers retained at period end within the original cohort','crm','month','%','share','retained_customers opening_customers']
 ],
 operations: [
 ['sla','الالتزام بمستوى الخدمة','SLA compliance','الالتزامات المستحقة المحققة وفق تقويم العقد واستثناءاته الموثقة','Due obligations meeting the contracted clock and documented exclusions','service','day','%','share','sla_met sla_due'],
 ['completion','إنجاز الأعمال المستحقة','Work completion','الأعمال المستحقة خلال الفترة والمغلقة بدليل مقبول بحلول نهاية الفترة','Work due in the period closed with accepted evidence by period end','work','day','%','share','work_accepted work_due'],
 ['quality','قبول العمل من أول مراجعة','First-pass acceptance','الأعمال المقبولة من أول فحص من جميع الأعمال المفحوصة','Work accepted on first inspection among all inspected submissions','service','week','%','share','passed_first inspections'],
 ['response','زمن الاستجابة الأولى','First response time','متوسط الدقائق من استلام البلاغ إلى أول استجابة فعلية للبلاغات التي استجيبت','Mean elapsed minutes from receipt to first substantive response among responded requests','tickets','day','min','ratio','response_minutes responded_requests'],
 ['complaints','الشكاوى لكل مئة خدمة','Complaints per 100 services','الشكاوى الفريدة لكل مئة خدمة مقدمة في النطاق نفسه','Distinct complaints per hundred services delivered in the same scope','tickets','week','per100','percent','complaints services_delivered'],
 ['cost_service','تكلفة تقديم الخدمة','Cost per delivered service','تكاليف التنفيذ المخصصة لنوع خدمة واحد لكل وحدة مسلمة من النوع نفسه','Allocated delivery costs per delivered unit of the same service type','cost','month','SAR','ratio','delivery_cost services_delivered']
 ],
 intelligence: [
 ['success','نجاح مهام الوكلاء','Verified task success','المهام ذات إيصال تحقق ناجح من المحاولات المحسومة، مع استبعاد التجارب','Concluded operational attempts with successful verification receipts, excluding rehearsals','audit','day','%','share','verified_success terminal_attempts'],
 ['errors','معدل أخطاء التنفيذ','Execution error rate','المحاولات المحسومة بالفشل من المحاولات المحسومة في النطاق نفسه','Failed operational attempts among concluded attempts in the same scope','audit','day','%','share','failed_attempts terminal_attempts'],
 ['accuracy','دقة المخرجات','Output accuracy','العينات الصحيحة وفق المراجع المستقل من جميع العينات ذات الحكم النهائي','Outputs judged correct by independent reviewers among adjudicated samples','eval','week','%','share','correct_samples judged_samples'],
 ['cost_task','تكلفة المهمة الناجحة','Cost per verified task','إجمالي تكاليف النموذج والأدوات والتشغيل بما فيه الإخفاقات لكل مهمة ناجحة فريدة','Model, tool and hosting cost including failures per distinct verified successful task','usage','week','SAR','ratio','allocated_run_cost verified_tasks'],
 ['latency','زمن إنجاز المهمة','Task completion time','متوسط الزمن من القبول إلى تحقق الإغلاق للمهام الناجحة الفريدة','Mean elapsed time from acceptance to verified closure for distinct successful tasks','audit','day','s','ratio','elapsed_seconds verified_tasks'],
 ['human','نسبة تدخل البشر','Human intervention rate','المهام المحسومة التي تطلبت تدخلاً بشريًا واحدًا على الأقل','Concluded tasks that required at least one human intervention','audit','week','%','share','human_tasks concluded_tasks'],
 ['rework','نسبة إعادة العمل','Rework rate','المخرجات التي أعيدت للتصحيح مرة على الأقل من جميع المخرجات المراجعة','Outputs returned for rework at least once among all reviewed outputs','audit','week','%','share','returned_outputs reviewed_outputs'],
 ['availability','توافر الخدمات الحرجة','Critical service availability','الزمن المتاح من كامل نافذة القياس مع اكتمال الرصد وتعريف الخدمة الحرجة','Available time over the full period, requiring complete monitoring coverage for one critical service','uptime','month','%','share','available_seconds monitored_seconds']
 ]
};
export const kpis = Object.entries(rows).flatMap(([group, entries]) => entries.map(row => {
  const [id, ar, en, arDefinition, enDefinition, src, cadence, unit, calculation, fields] = row;
  const inputs=fields.split(' ');
  return Object.freeze({id:group+'.'+id, group, owner:groupInfo[group][2], ar, en, arDefinition, enDefinition,
    source:source[src], cadence, unit, calculation, inputs, formula:formula[calculation](inputs), target:null});
}));
const signed = new Set(['net_revenue','operating_profit','cohort_contribution','incremental_contribution','realized_benefit','sourced_revenue','ad_revenue']);
export function calculateKpi(metric, inputs) {
  if (!metric || !inputs || typeof inputs!=='object' || Array.isArray(inputs)) return null;
  const numbers=metric.inputs.map(key=>inputs[key]);
  if (numbers.some((value,i)=>!Number.isFinite(value) || (value<0 && !signed.has(metric.inputs[i])))) return null;
  const result=calculations[metric.calculation](numbers);
  return Number.isFinite(result) ? result : null;
}
