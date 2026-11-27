// A method source explains how to interpret an indicator. Each observed amount still requires a property record.
import {forecastSeries} from "./facility-outlook.mjs";

export const referenceReviewDate="2026-11-26";
export const references={
  market:{title:"الهيئة العامة للإحصاء · منهجية إحصاءات المنشآت السياحية",url:"https://www.stats.gov.sa/ar/w/methodology-and-quality-report-of-tourism-establishments-statistics"},
  marketing:{title:"Google Ads · Conversion Lift",url:"https://support.google.com/google-ads/answer/12003020?hl=en"},
  advisory:{title:"CBRE · Global Hotel Asset Management",url:"https://www.cbre.com/services/property-types/hotels/global-hotel-asset-management"},
  fm:{title:"ISO 41001:2018 · Facility management",url:"https://www.iso.org/standard/68021.html"},
  assets:{title:"ISO 55001:2024 · Asset management",url:"https://www.iso.org/standard/83054.html"},
  people:{title:"IFMA · What is facility management?",url:"https://www.ifma.org/about/what-is-fm/"},
  forecast:{title:"NIST · AI Risk Management Framework",url:"https://www.nist.gov/itl/ai-risk-management-framework"},
  cash:{title:"IFRS Foundation · IAS 7",url:"https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/"},
  projects:{title:"PMI · PMBOK Guide",url:"https://www.pmi.org/standards/pmbok"},
  licensing:{title:"وزارة السياحة · ترخيص مرفق الضيافة السياحي",url:"https://mt.gov.sa/ar/eservices/request-to-issue-new-tourism-accommodation-facility-license"},
  investment:{title:"RICS · Discounted cash flow valuations",url:"https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/valuation-standards/discounted-cash-flow-valuation"}
};
const count=["عدد","count"],percent=["٪","%"],money=["ريال","SAR"];
function metric(id,label,unit,title,question,action,owner,ref,basis,direction){
  return {id,metric:id,label,indicator:label,unit,title,question,action,owner,source:references[ref],basis,direction};
}
export const councilMetrics=[
  metric("occupancy_pct",["إشغال الغرف","Room occupancy"],percent,["بحوث السوق والتجارة","Market research and commerce"],["هل تغير الطلب أم عدد الغرف المتاحة؟","Did demand change, or did the available room stock change?"],["طابق الليالي المباعة والمتاحة مع الإغلاقات ونوع المنشأة والموسم قبل مقارنة السوق.","Reconcile sold and available room nights, closures, property type and season before benchmarking."],["مدير الإيرادات","Revenue manager"],"market",["ليالي الغرف المباعة ÷ المتاحة × 100؛ حدد نطاق جرد الغرف.","Room nights sold / available × 100; identify the inventory scope."],"down"),
  metric("qualified_leads",["الفرص التسويقية المؤهلة","Qualified leads"],count,["التسويق وتطوير الأعمال","Marketing and business development"],["أي قناة تجلب فرصاً مؤهلة؟","Which channel produces qualified demand?"],["راجع تعريف الفرصة والتكرار والإنفاق حسب القناة، ثم اختبر تغييراً واحداً بحملة مقارنة.","Check qualification, duplicates and spend by channel, then test one campaign change against a comparator."],["مدير التسويق","Marketing lead"],"marketing",["سجل CRM منزوع التكرار بتعريف تأهيل ثابت.","Deduplicated CRM opportunities under a stable qualification rule."],"down"),
  metric("lead_conversion_pct",["تحويل الفرص إلى تعاقدات","Lead-to-contract conversion"],percent,["اللجنة التجارية","Commercial review"],["أين تخسر المنشأة فرص التعاقد؟","Where are contracts being lost?"],["افحص أسباب فقد العروض ومدة القرار وقارن مجموعات فرص متكافئة قبل تعديل السعر.","Review loss reasons and decision times for comparable opportunity cohorts before repricing."],["مدير المبيعات","Sales lead"],"advisory",["تعاقدات مجموعة فرص محددة ÷ فرص المجموعة × 100؛ استبعد المجموعة غير الناضجة.","Won contracts / leads in the same matured cohort × 100."],"down"),
  metric("guest_complaints",["شكاوى النزلاء المسجلة","Logged guest complaints"],count,["التجربة والتحليل الاستشاري","Guest experience and consulting"],["هل يتكرر سبب شكوى يمكن معالجته؟","Do recurring complaints share an actionable cause?"],["افصل أنواع الشكاوى وطابقها بتاريخ الإقامة وليالي الإشغال وتذاكر الصيانة.","Classify complaints and reconcile stay dates, occupied nights and maintenance tickets."],["مدير تجربة النزيل","Guest experience lead"],"advisory",["تذاكر شكاوى فريدة خلال الشهر؛ لا يشمل كل المراجعات العامة.","Distinct complaint cases in the month; coverage may differ from public reviews."],"up"),
  metric("cash_balance_sar",["النقد المتاح بنهاية الشهر","Month-end available cash"],money,["اللجنة المالية والخزينة","Finance and treasury"],["ما الالتزامات التي تستحق قبل التحصيل؟","Which obligations fall due before collections?"],["طابق الرصيد البنكي مع الدفاتر، ثم جدولة التحصيل والرواتب والموردين قبل أي التزام جديد.","Reconcile bank and ledger balances, then time collections, payroll and supplier obligations before committing funds."],["المدير المالي","Finance director"],"cash",["رصيد نقدي مسوّى على مستوى المنشأة؛ وثّق الأموال المقيدة والسحب على المكشوف.","Reconciled property cash; document restrictions and overdrafts."],"down"),
  metric("operating_cost_sar",["تكلفة التشغيل الشهرية","Monthly operating cost"],money,["المالية وإدارة الأعمال","Management accounting"],["ما الذي يفسر تغير تكلفة التشغيل؟","What explains the change in operating costs?"],["افصل أثر الحجم عن السعر وطابق الاستهلاك والفواتير وأسعار الوحدات مع بنك أصول.","Separate volume from price effects and match usage, invoices and unit prices to the approved bank."],["المراقب المالي","Financial controller"],"people",["دفتر تكلفة التشغيل المعتمد بنفس حدود المنشأة وأساس التسجيل.","Approved operating ledger with consistent scope and recognition basis."],"up"),
  metric("capex_variance_sar",["فرق الإنفاق الرأسمالي عن الاعتماد","Capital spend variance"],money,["الاستثمار وإدارة الأصول","Investment and asset management"],["هل تستدعي فجوة الإنفاق إعادة دراسة البدائل؟","Does the capital variance warrant a new options review?"],["قارن الإصلاح والتأهيل والاستبدال بتكلفة دورة الحياة والتوقف ومنفعة التشغيل؛ اعرض السيناريو على المالك.","Compare repair, refurbishment and replacement using lifecycle costs, downtime and operating benefit; submit the scenario to the owner."],["مالك الاستثمار","Investment owner"],"investment",["الإنفاق الرأسمالي الفعلي للفترة ناقص موازنة الفترة المعتمدة؛ الزيادة موجبة.","Actual period capital spend minus approved period budget; positive means overspend."],"up"),
  metric("late_milestones",["مراحل المشاريع المتأخرة","Late project milestones"],count,["إدارة المشاريع","Project management"],["أي تبعية تؤخر التسليم أو فتح الغرف؟","Which dependency is holding up delivery or room release?"],["راجع المسار الحرج والتوريد ومحاضر الاستلام وبنود التغيير وحدد صاحب القرار.","Review the critical path, procurement, handover evidence and change requests; assign the decision."],["مدير المشروع","Project manager"],"projects",["مراحل مستحقة لم تنجز عند إقفال الشهر وفق خط الأساس المعتمد.","Baseline milestones due and incomplete at month-end."],"up"),
  metric("overdue_pm",["أعمال الصيانة الوقائية المتأخرة","Overdue preventive tasks"],count,["إدارة المرافق والصيانة","Facilities operations"],["أي أعمال متأخرة تهدد استمرارية الخدمة؟","Which overdue tasks threaten service continuity?"],["رتب الأعمال حسب حرجية الأصل ومتطلبات العقد وإمكان إخراجه من الخدمة.","Prioritise by asset criticality, contract requirements and safe maintenance windows."],["مدير المرافق","Facility manager"],"fm",["مهام وقائية تجاوزت استحقاقها وظلت مفتوحة بنهاية الشهر.","Preventive tasks past due and still open at month-end."],"up"),
  metric("repeat_faults",["الأعطال المتكررة","Repeat faults"],count,["هندسة الأصول والموثوقية","Reliability and asset engineering"],["هل يعود العطل للأصل نفسه بعد الإصلاح؟","Does the same fault recur on the same asset after repair?"],["طابق رموز الأصول وأوامر العمل وتقارير الفنيين، ثم راجع السبب الجذري والضمان.","Match asset tags, work orders and technician reports before reviewing root cause and warranty."],["مهندس الموثوقية","Reliability engineer"],"assets",["أوامر متكررة لنفس العطل والأصل وفق نافذة وتعريف موثقين ثابتين.","Repeat orders for the same fault and asset under a documented stable lookback window."],"up"),
  metric("energy_kwh",["استهلاك الكهرباء","Electricity use"],["ك.و.س","kWh"],["الهندسة وكفاءة الموارد","Engineering and resource efficiency"],["هل الزيادة بسبب الطقس أو الإشغال أو خلل في المعدات؟","Could weather, occupancy or equipment explain higher consumption?"],["طابق تواريخ قراءة العدادات وفترة الاستهلاك والحرارة والإشغال قبل تسعير مشروع كفاءة.","Reconcile meter dates, consumption period, temperature and occupancy before costing an efficiency project."],["مهندس الطاقة","Energy engineer"],"fm",["فرق قراءات العدادات بالكيلوواط ساعة لنفس الحدود والفترة.","Metered kWh over the same physical boundary and period."],"up"),
  metric("staff_shortfall",["عجز تغطية المناوبات","Unfilled roster positions"],count,["إدارة الأعمال والموارد","Business operations and staffing"],["أين تظهر فجوة التغطية في الجدول؟","Which shifts have a coverage gap?"],["راجع الاحتياج المعتمد والتغطية الفعلية وتخصصات الموردين قبل اعتماد توظيف أو ساعات إضافية.","Compare approved staffing, actual coverage and contractor skills before approving hiring or overtime."],["مدير التشغيل","Operations director"],"people",["مناوبات-وظائف معتمدة لم تُغطَّ خلال الشهر؛ ثبّت وحدة العد.","Approved shift positions left unfilled during the month; keep the counting unit consistent."],"up"),
  metric("vendor_sla_pct",["التزام المورد بمستوى الخدمة","Supplier SLA attainment"],percent,["العقود والمشتريات","Contracts and procurement"],["هل إخفاق المورد مثبت وفق طريقة القياس التعاقدية؟","Does contract-defined measurement support a vendor exception?"],["طابق الاستثناءات وساعات الإيقاف وإيصالات الزيارة مع العقد قبل أي جزاء أو تجديد.","Reconcile exclusions, paused clocks and visit receipts against the contract before sanctions or renewal."],["مدير العقود","Contracts manager"],"fm",["بنود الخدمة المستوفاة ÷ البنود المستحقة المشمولة بالاتفاق × 100.","Eligible due items meeting contracted service terms / eligible due items × 100."],"down"),
  metric("compliance_open",["بنود الامتثال المفتوحة","Open compliance items"],count,["الحوكمة والامتثال","Governance and compliance"],["ما الإجراء المسند لوثيقة تنطبق على نوع المنشأة؟","Which action traces to a requirement applicable to this property?"],["راجع المصدر الرسمي الساري ونوع النشاط والمدينة وتاريخ الاستحقاق ومحضر الإغلاق مع مسؤول الامتثال.","Check the current issuing authority, activity, jurisdiction, due date and closure receipt with the compliance owner."],["مسؤول الامتثال","Compliance lead"],"licensing",["بنود مفتوحة مثبتة بسجل منشأة ومرجع جهة مختصة؛ لا يستنتج العدد حالة الترخيص.","Open items with a property record and competent authority reference; count alone does not determine licensing status."],"up")
];

function closedMonth(asOf){
  const date=new Date(asOf+"T00:00:00Z");if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==asOf)return null;
  date.setUTCDate(0);return date.toISOString().slice(0,7);
}
function monthlyRows(history,key,asOf){
  return history.filter(r=>r.metric===key && String(r.month).slice(0,7)<=asOf.slice(0,7) &&
    (!r.retrieved_on||r.retrieved_on<=asOf)).map(r=>{
      const raw=r.value;
      const value=(typeof raw==="string" && /^-?\d+(?:\.\d+)?$/.test(raw))?Number(raw):raw;
      return {...r,value};
    }).sort((a,b)=>String(a.month).localeCompare(String(b.month)));
}
function trusted(r){return r && ["verified","resolved"].includes(r.status) && typeof r.value==="number" && Number.isFinite(r.value) && !!r.source_ref;}
export function buildCouncilStudy({history=[],brief={},asOf}){
  const expected=closedMonth(asOf);
  return councilMetrics.map(m=>{
    const rows=monthlyRows(history,m.id,asOf),last=rows.at(-1),latest=trusted(last)?last:null;
    const points=rows.map(r=>({month:String(r.month).slice(0,7),value:trusted(r)?r.value:null,source:r.source_ref||""}));
    const bounds=m.unit===percent?{min:0,max:100}:["cash_balance_sar","capex_variance_sar"].includes(m.id)?{}:{min:0};
    const outlook=forecastSeries(points,asOf,bounds);
    let signal=["آخر قراءة مسندة","Latest sourced observation"];
    if(!last)signal=["لم ترد قراءة معتمدة","No approved observation"];
    else if(!latest)signal=["قيمة متنازع عليها أو غير قابلة للتحقق","Value disputed or unverifiable"];
    else if(String(last.month).slice(0,7)!==expected)signal=["تحتاج الفترة الأخيرة إلى تحديث","Latest closed period needs an update"];
    else if(latest.value===0)signal=["صفر موثّق في الفترة الأخيرة","Verified zero in latest period"];
    if(latest && expected===String(latest.month).slice(0,7)){
      const priorMonth=closedMonth(expected+"-01"), prior=rows.filter(r=>String(r.month).slice(0,7)===priorMonth);
      if(prior.length===1 && trusted(prior[0])){
        const delta=latest.value-prior[0].value, magnitude=Math.abs(delta);
        const units=m.unit===percent?["نقطة مئوية","percentage points"]:m.unit;
        const variation=(lang)=>new Intl.NumberFormat(lang,{maximumFractionDigits:6}).format(magnitude);
        const origin=priorMonth+" · "+prior[0].source_ref;
        signal=delta===0?["لم تتغير القراءة عن "+origin,"Unchanged from "+origin]:
          [(delta>0?"ارتفاع ":"انخفاض ")+variation("ar")+" "+units[0]+" مقارنة بـ "+origin,
           (delta>0?"Increased by ":"Decreased by ")+variation("en")+" "+units[1]+" versus "+origin];
      }
    }
    const gaps=[...m.basis];
    if(m.id==="overdue_pm" && brief.maintenance) {
      gaps[0]+=" · الاستحقاقات الحية حتى اليوم "+brief.maintenance.due+" (تشمل اليوم).";
      gaps[1]+=" · Live tasks due through today: "+brief.maintenance.due+" (includes today).";
    }
    return {...m,latest,outlook,signal,gaps};
  });
}

// Issue a joint review only on aligned, current, consecutive property observations.
export function buildCouncilDecisions({history=[],asOf}){
  const current=closedMonth(asOf);if(!current)return [];
  const previous=closedMonth(current+"-01");
  const pairs=(key)=>{
    const rows=monthlyRows(history,key,asOf);
    const pick=month=>{const r=rows.filter(x=>String(x.month).slice(0,7)===month);return r.length===1&&trusted(r[0])?r[0]:null;};
    const a=pick(previous),b=pick(current);return a&&b?{a,b,delta:b.value-a.value}:null;
  };
  const results=[];
  function consider(keys,trigger,title,finding,options,owner,next){
    const inputs=keys.map(pairs);
    if(inputs.every(Boolean)&&trigger(inputs.map(x=>x.delta))){
      results.push({title,finding,options,owner,next,evidence:inputs.flatMap(x=>[x.a,x.b])});
    }
  }
  consider(["repeat_faults","guest_complaints"],d=>d.every(x=>x>0),
    ["أعطال متكررة وشكاوى متزايدة","Recurring faults and rising complaints"],
    ["زاد المؤشران في الشهر نفسه. يلزم تطابق الغرفة والأصل وتاريخ الشكوى لإثبات العلاقة.","Both counts rose in the same month. Link rooms, assets and dates before attributing complaints to faults."],
    [["معالجة السبب الجذري تحت الضمان","Investigate root cause and warranty"],["تأهيل الأصل أو استبداله بعد تسعير دورة الحياة","Cost refurbishment or replacement over the asset life"]],
    ["مدير المرافق ومدير تجربة النزيل","Facility manager and guest experience lead"],
    ["استخرج أوامر الأصل وليالي الإشغال والتعطل، ثم اعرض البدائل على المالك.","Retrieve asset orders, occupied nights and downtime before presenting options to the owner."]);
  consider(["qualified_leads","lead_conversion_pct"],d=>d[0]>0&&d[1]<0,
    ["زيادة الفرص مع تراجع التحويل","More leads with weaker conversion"],
    ["تحرك حجم الفرص والتحويل في اتجاهين متعاكسين. افحص تعريف التأهيل وعمر مجموعة الفرص.","Volume and conversion moved in opposite directions. Check qualification and cohort maturity."],
    [["تدقيق الفرص حسب القناة","Audit opportunities by channel"],["اختبار العرض على شريحة واحدة مع مجموعة مقارنة","Test the offer on a segment with a comparator"]],
    ["مديرا التسويق والمبيعات","Marketing and sales leads"],["طابق عروض الأسعار المفقودة ومدد الإغلاق قبل زيادة ميزانية الحملة.","Reconcile lost proposals and sales cycle length before increasing campaign spend."]);
  consider(["cash_balance_sar","capex_variance_sar"],d=>d[0]<0&&d[1]>0,
    ["انخفاض النقد وتزايد فرق الإنفاق الرأسمالي","Declining cash and increasing capital variance"],
    ["تزامن انخفاض النقد مع زيادة الفرق مقابل الموازنة؛ يجب مطابقة المقبوضات والاستحقاقات.","Cash fell while the variance against budget rose; reconcile receipts and obligations."],
    [["إعادة جدولة أعمال غير حرجة","Rephase noncritical works"],["مقارنة إصلاح مرحلي باستبدال كامل","Compare phased repair against full replacement"]],
    ["المدير المالي ومالك الاستثمار","Finance director and investment owner"],["اعرض التدفقات والعروض والقيود التعاقدية للموافقة قبل أي التزام.","Present cash flows, quotations and contractual constraints for approval before commitment."]);
  consider(["late_milestones","overdue_pm"],d=>d.every(x=>x>0),
    ["تزامن تأخر المشاريع والصيانة","Project and preventive backlogs rose together"],
    ["زاد عدد مراحل المشروع المتأخرة ومهام الصيانة المتأخرة. راجع التنافس على الموردين ونوافذ الإغلاق.","Late milestones and overdue maintenance both rose. Check shared suppliers and outage windows."],
    [["إعادة ترتيب نافذة العمل","Resequence the work window"],["تقييم مورد بديل بعد فحص العقد","Assess a backup supplier after contract review"]],
    ["مدير المشروع ومدير المرافق","Project and facilities managers"],["حدد التبعية ومالك العمل وأثر التأخير وسجّل قرار الاجتماع.","Identify the dependency, owner and delay impact and record the decision."]);
  return results;
}
