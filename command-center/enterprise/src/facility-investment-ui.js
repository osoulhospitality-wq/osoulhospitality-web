import {compareInvestmentCase,investmentLimits,investmentMethodSource} from "./facility-investment.mjs";

// All inputs are transient DOM fields. There is no transport, storage or financial action.
export function mountInvestmentCase() {
  const en=document.documentElement.lang.startsWith("en");
  const t=(ar,english)=>en?english:ar;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el("details"),form=el("form"),output=el("div");
  const fields=new Map();
  root.append(el("summary",t("مقارنة إصلاح الأصل واستبداله","Compare asset repair and replacement")),form,output);
  form.autocomplete="off";
  output.setAttribute("aria-live","polite");
  form.append(el("p",t("قارن خيارين يقدمان الخدمة نفسها طوال المدة. أدخل تكاليف كل خيار بعملة واحدة وعلى أساس ضريبي وتضخمي متسق، واكتب صفراً عند انعدام التكلفة. تبقى المدخلات في هذه الصفحة.",
    "Compare alternatives delivering equivalent service over the entire horizon. Use one currency and consistent tax and inflation treatment. Enter zero where a cost does not apply. Inputs stay on this page.")));

  function group(title) {const n=el("fieldset");n.append(el("legend",title));form.append(n);return n;}
  function field(parent,key,title,type="text",options={}) {
    const label=el("label",title),n=el("input");n.type=type;n.required=true;n.autocomplete="off";
    Object.assign(n,options);label.append(n);parent.append(label);fields.set(key,n);return n;
  }
  function source(parent,prefix) {
    field(parent,prefix+".reference",t("مرجع مستند أو افتراض موثق","Document or documented assumption reference"),"text",{maxLength:500});
    field(parent,prefix+".date",t("تاريخ المصدر","Source date"),"date");
  }
  const assumptions=group(t("افتراضات المقارنة","Comparison assumptions"));
  field(assumptions,"valuationDate",t("تاريخ التقييم","Valuation date"),"date");
  field(assumptions,"currency",t("رمز العملة من ثلاثة أحرف","Three-letter currency code"),"text",{placeholder:"SAR",maxLength:3,pattern:"[A-Za-z]{3}"});
  field(assumptions,"years",t("مدة المقارنة بالسنوات","Comparison years"),"number",{min:1,max:investmentLimits.years,step:1});
  field(assumptions,"discountRatePct",t("معدل الخصم السنوي (%)","Annual discount rate (%)"),"number",{min:investmentLimits.minRate,max:investmentLimits.maxRate,step:"any"});
  const basisLabel=el("label",t("أساس التدفقات ومعدل الخصم","Cash flow and discount-rate basis"));
  const basis=el("select");basis.required=true;
  for(const [value,label] of [["",t("اختر الأساس","Select basis")],["real",t("حقيقي، بأسعار ثابتة","Real, constant price level")],["nominal",t("اسمي، بمبالغ سنوية ثابتة","Nominal, level annual amounts")]]) {
    const opt=el("option",label);opt.value=value;basis.append(opt);
  }
  basisLabel.append(basis);assumptions.append(basisLabel);fields.set("basis",basis);
  source(assumptions,"rateSource");
  const labels={
    upfront:t("تكلفة البدء الآن","Upfront cost at the valuation date"),
    operating:t("تكلفة التشغيل والصيانة السنوية","Annual operation and maintenance cost"),
    downtime:t("التكلفة السنوية الصافية للتوقف بعد التخفيف","Annual net downtime cost after mitigation"),
    disposal:t("تكلفة الإزالة أو التخلص في نهاية المدة","End-of-horizon removal or disposal cost"),
    residual:t("القيمة المتبقية القابلة للتحصيل في نهاية المدة","Recoverable residual value at the horizon"),
    extraUpfront:t("زيادة تكلفة بدء الاستبدال","Additional replacement upfront cost"),
    extraAnnual:t("الزيادة السنوية في كلفة الاستبدال والتوقف مجتمعين","Additional annual replacement operating and net downtime cost"),
    lostResidual:t("الانخفاض في قيمة الاستبدال المتبقية","Reduction in replacement residual value")
  };
  const money=(parent,key)=>field(parent,key,labels[key.split(".")[1]],"number",{min:0,max:investmentLimits.amount,step:"any"});
  for(const [key,label] of [["repair",t("إصلاح الأصل الحالي","Repair existing asset")],["replace",t("استبدال الأصل","Replace asset")]]) {
    const g=group(label);for(const part of ["upfront","operating","downtime","disposal","residual"]) money(g,key+"."+part);
    source(g,key);
  }
  const stress=group(t("سيناريو متحفظ للاستبدال","Replacement downside case"));
  stress.append(el("p",t("أبقِ افتراضات الإصلاح ثابتة، وأدخل عبء الاستبدال الإضافي مرة واحدة لكل بند. احسب خسارة التوقف بهامش المساهمة المفقود والتكاليف المباشرة بعد التعويض، وتجنب احتساب الإيراد الإجمالي كخسارة صافية.","Keep repair assumptions fixed. Enter incremental replacement burdens once. Use foregone contribution and direct downtime costs net of mitigation, and avoid counting gross lost revenue as a net cost.")));
  for(const key of ["extraUpfront","extraAnnual","lostResidual"]) money(stress,"downside."+key);
  source(stress,"downside");
  const button=el("button",t("احسب المقارنة","Calculate comparison"));button.type="submit";form.append(button);
  form.addEventListener("input",()=>output.replaceChildren());
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const input={rateSource:{},repair:{},replace:{},downside:{}};
    for(const [name,control] of fields){
      const [groupName,key]=name.split(".");
      let value=control.type==="number"?control.valueAsNumber:control.value.trim();
      if(name==="currency")value=value.toUpperCase();
      if(key)input[groupName][key]=value;else input[groupName]=value;
    }
    const r=compareInvestmentCase(input);output.replaceChildren();
    if(r.status!=="compared"){
      const explanation=r.reason==="outside_numerical_range"?t("تجاوزت التدفقات النطاق العددي الدقيق. راجع المدة والمعدل والمبالغ.","The cash flows exceed calculation precision. Review the horizon, rate and amounts."):
        r.reason==="exceeds_base_residual"?t("يتجاوز انخفاض القيمة المتبقية القيمة المسجلة لخيار الاستبدال.","The residual reduction exceeds the original replacement residual value."):
        t("راجع الحقل المحدد، ويجب ألا يتجاوز تاريخ المصدر تاريخ التقييم.","Review the indicated field. A source may not be dated after the valuation date.");
      output.append(el("p",explanation));fields.get(r.field)?.focus();return;
    }
    const format=new Intl.NumberFormat(en?"en":"ar-SA",{style:"currency",currency:r.currency,minimumFractionDigits:2,maximumFractionDigits:2});
    const amount=n=>format.format(n);
    const rows=[
      [t("القيمة الحالية لتكلفة الإصلاح","Repair present lifecycle cost"),"repair"],
      [t("القيمة الحالية لتكلفة الاستبدال","Replacement present lifecycle cost"),"replace"],
      [t("وفر الاستبدال الحالي مقارنة بالإصلاح","Present cost saved by replacement"),"difference"],
      [t("الحد السنوي للوفر اللازم لتعادل الاستبدال","Annual savings required for replacement to break even"),"breakEvenAnnualSavings"],
      [t("الوفر السنوي المفترض في التشغيل والتوقف","Assumed annual operating and downtime savings"),"assumedAnnualSavings"]
    ];
    const table=el("table"),head=el("tr");table.append(el("caption",t("تكلفة دورة الحياة بالقيمة الحالية","Discounted lifecycle comparison")));
    for(const title of [t("المؤشر","Measure"),t("الأساس","Base"),t("المتحفظ","Downside")]){const cell=el("th",title);cell.scope="col";head.append(cell);}
    const thead=el("thead");thead.append(head);table.append(thead);const body=el("tbody");
    for(const [label,k] of rows){const row=el("tr"),heading=el("th",label);heading.scope="row";row.append(heading);
      for(const s of [r.base,r.downside]) row.append(el("td",amount(k==="repair"||k==="replace"?s[k].totalPV:s[k])));body.append(row);}
    table.append(body);output.append(table);
    output.append(el("p",t("القيمة الموجبة لوفر الاستبدال تعني أنه أقل تكلفة. العتبة السنوية السالبة تعني أن تكلفته السنوية يمكن أن تزيد بمقدار العتبة المطلقة عند التعادل. التدفقات السنوية ثابتة وتسدد في نهاية كل سنة، وتخصم قيمة البيع من تكاليف نهاية المدة.","Positive present savings favor replacement on cost. A negative annual break-even threshold permits higher annual replacement costs by that magnitude at equality. Level annual cash flows occur at year-end, with residual proceeds deducted from terminal costs.")));
    output.append(el("p",t("تاريخ التقييم","Valuation date")+" "+r.valuationDate+" · "+r.years+" "+t("سنة","years")+" · "+r.discountRatePct+"% · "+(r.basis==="real"?t("أساس حقيقي","Real basis"):t("أساس اسمي","Nominal basis"))));
    const list=el("ul");
    for(const [key,label] of [["rateSource",t("المعدل","Rate")],["repair",t("الإصلاح","Repair")],["replace",t("الاستبدال","Replacement")],["downside",t("المتحفظ","Downside")]]) list.append(el("li",label+" · "+r.sources[key].reference+" · "+r.sources[key].date));
    output.append(list,el("p",t("يظل قرار الإنفاق لدى صاحب التفويض المالي.","The financial authority retains spending approval.")));
  });
  const guidance=el("a","RICS · Discounted cash flow (DCF) valuation");guidance.href=investmentMethodSource;guidance.target="_blank";guidance.rel="noopener noreferrer";root.append(guidance);
  return root;
}
