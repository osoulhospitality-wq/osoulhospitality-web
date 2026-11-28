import {uiText as t} from "./locale.js";
import {periodInRiyadh} from "./executive-overview.js";

const platforms={google:"Google Maps",booking:"Booking.com",airbnb:"Airbnb",agoda:"Agoda",expedia:"Expedia",gathern:"Gathern",tripadvisor:"Tripadvisor"};
const el=(tag,text="")=>Object.assign(document.createElement(tag),{textContent:text});
const num=value=>value===null||value===undefined||String(value).trim()===""?null:Number(value);
const display=value=>Number.isFinite(num(value))?new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:4}).format(num(value)):t("غير متاح","Unavailable");

export function reputationTrend(row){
  const current=num(row.average_rating),previous=num(row.previous_average);
  const min=num(row.native_min),max=num(row.native_max);
  if(![current,previous,min,max].every(Number.isFinite)||max<=min||row.review_count<=0||row.previous_count<=0||
    !Number.isInteger(row.review_count)||!Number.isInteger(row.previous_count)||current<min||current>max||previous<min||previous>max)return null;
  return Math.round((current-previous)*10000)/10000;
}
export function previousClosedMonth(today){
  const month=today.slice(0,7);
  return new Date(Date.parse(month+"-01T00:00:00Z")-86400000).toISOString().slice(0,7);
}

export function setupReputation(client,root){
  const panel=el("details");panel.hidden=true;
  panel.append(el("summary",t("سمعة المنشأة في منصات التقييم","Facility reputation by review platform")));
  const month=el("input");month.type="month";
  const monthLabel=el("label",t("آخر شهر مكتمل للتقرير ","Reporting month (closed periods) "));monthLabel.append(month);
  const msg=el("p");msg.setAttribute("role","status");
  const actions=el("div"),list=el("div"),editor=el("div");
  const refresh=el("button",t("تحديث السجلات","Refresh records"));refresh.type="button";
  const register=el("button",t("توثيق صفحة المنشأة","Confirm a facility listing"));register.type="button";
  actions.append(refresh,register);
  panel.append(monthLabel,el("p",t("مجاميع شهرية من مصدر المنصة يدوّنها المسؤول بعد مطابقة هوية المنشأة. تُعرض شكاوى التشغيل وتأكيدات المستفيدين في سجل الأدلة.","Monthly platform aggregates entered after the facility listing is verified by an authorized person. Operational complaints and customer confirmations are in the evidence register.")),msg,actions,editor,list);root.append(panel);
  let org="",site="",seq=0,loaded=false;
  function formFor(row){
    if(!org||!site||!loaded)return;
    editor.replaceChildren();
    const token=seq,form=el("form");
    const args={p_org:org,p_site:site};
    const controls={};
    function field(name,label,type="text",value="",attrs={}){
      const input=el(type==="select"?"select":"input");
      if(type==="select")for(const [key,text] of Object.entries(platforms))input.append(new Option(text,key));
      else input.type=type;
      input.required=true;Object.assign(input,attrs);input.value=value;
      controls[name]=input;const line=el("label",label+" ");line.append(input);form.append(line);
      return input;
    }
    if(!row){
      form.append(el("h4",t("إثبات ارتباط صفحة المنصة بهذه المنشأة","Confirm that the platform listing belongs to this facility")));
      field("platform",t("المنصة","Platform"),"select","google");
      field("key",t("معرّف المنشأة في المنصة","Platform property identifier"),"text","",{maxLength:150});
      field("url",t("الرابط الرسمي المباشر للمنشأة، دون معلمات تتبع","Direct official property URL without tracking parameters"),"url","",{maxLength:1200});
      field("min",t("الحد الأدنى لمقياس المنصة","Native scale minimum"),"number","",{min:"0",max:"99.99",step:"0.01"});
      field("max",t("الحد الأعلى لمقياس المنصة","Native scale maximum"),"number","",{min:"0.01",max:"100",step:"0.01"});
      field("confirmation",t("تاريخ مطابقة هوية المنشأة","Listing identity confirmation date"),"date","",{max:periodInRiyadh().today});
      field("reference",t("مرجع مستند المطابقة","Identity evidence reference"),"text","",{minLength:2,maxLength:180});
      const confirm=field("attested",t("طابقت معرّف المنشأة والمقياس مع المستند","I verified the property identifier and rating scale against the source"),"checkbox");
      confirm.required=true;
    }else{
      form.append(el("h4",platforms[row.platform]+" · "+row.external_key+" · "+month.value));
      form.append(el("p",t("أدخل متوسط وكمية التقييمات المنشورة خلال هذا الشهر وحده وفق تقرير المنصة. استبعد المتوسط التراكمي المعروض على الصفحة العامة.","Use the mean and number of ratings published within this month from the platform report. Exclude the lifetime rating displayed on the public listing.")));
      const count=field("count",t("عدد التقييمات الجديدة","Number of new ratings"),"number",row.review_count??"",{min:"0",step:"1"});
      const rating=field("average",t("المتوسط بمقياس المنصة","Monthly average on native scale"),"number",row.average_rating??"",{min:String(row.native_min),max:String(row.native_max),step:"0.0001"});
      const update=()=>{rating.disabled=count.value!==""&&Number(count.value)===0;rating.required=!rating.disabled;};count.oninput=update;update();
      field("date",t("تاريخ تقرير المنصة","Platform report date"),"date",row.source_date||"",{max:periodInRiyadh().today});
      field("reference",t("مرجع التقرير الشهري المصرّح به","Authorized monthly report reference"),"text",row.source_reference||"",{minLength:2,maxLength:180});
    }
    const save=el("button",t("حفظ مع المرجع","Save with source"));save.type="submit";
    const cancel=el("button",t("إلغاء","Cancel"));cancel.type="button";cancel.onclick=()=>editor.replaceChildren();form.append(save,cancel);editor.append(form);
    form.onsubmit=async event=>{
      event.preventDefault();if(token!==seq||save.disabled)return;
      let rpc;
      const v=key=>controls[key].value.trim();
      if(!row){rpc="fm_confirm_reputation_listing";Object.assign(args,{p_platform:v("platform"),p_key:v("key"),p_url:v("url"),p_min:Number(v("min")),p_max:Number(v("max")),p_confirmation:v("confirmation"),p_reference:v("reference")});}
      else{rpc="fm_record_reputation_month";Object.assign(args,{p_listing:row.listing_id,p_month:month.value+"-01",p_expected:row.revision??0,p_count:Number(v("count")),p_average:controls.average.disabled?null:Number(v("average")),p_source_date:v("date"),p_reference:v("reference")});}
      save.disabled=cancel.disabled=true;
      try{
        const {error}=await client.rpc(rpc,args);if(token!==seq)return;
        if(error)throw error;
        await load();
      }catch(error){
        if(token===seq)msg.textContent=error.code==="40001" ? t("تغيّر الإصدار. حدّث السجلات قبل التصحيح.","The version changed. Refresh before correcting.")
          :t("تعذّر حفظ الدليل. راجع الصلاحية ومرجع المنشأة والمدى الزمني والمقياس.","Evidence could not be saved. Check permission, listing identity, period and scale.");
      }finally{if(token===seq)save.disabled=cancel.disabled=false;}
    };
  }
  function render(rows){
    list.replaceChildren();if(!rows.length)list.append(el("p",t("لا توجد صفحة منصة موثّقة لهذه المنشأة.","No confirmed platform listing for this facility.")));
    for(const row of rows){
      const card=el("details");card.append(el("summary",[platforms[row.platform]||row.platform,row.external_key,row.revision?display(row.average_rating):t("بانتظار تقرير الشهر","Monthly report pending")].join(" · ")));
      const dl=el("dl");const line=(label,value)=>dl.append(el("dt",label),el("dd",value));
      line(t("مصدر إثبات المنشأة","Listing evidence"),[row.identity_reference,row.confirmed_on].join(" · "));
      line(t("مقياس المنصة","Platform scale"),display(row.native_min)+" – "+display(row.native_max));
      line(t("تقييمات الشهر","Current month rating count"),display(row.review_count));
      line(t("متوسط الشهر السابق وعدده","Prior month average and count"),display(row.previous_average)+" · "+display(row.previous_count));
      line(t("التغير عن الشهر السابق بنقاط المقياس نفسه","Change from prior month in native scale points"),display(reputationTrend(row)));
      if(row.source_reference)line(t("تقرير الشهر","Month source"),row.source_reference+" · "+row.source_date);
      if(row.previous_reference)line(t("تقرير الشهر السابق","Prior month source"),row.previous_reference+" · "+row.previous_source_date);
      const link=el("a",t("عرض صفحة المنشأة في المنصة","View property listing"));link.href=row.listing_url;link.rel="noreferrer";link.target="_blank";
      const update=el("button",row.revision?t("تسجيل تصحيح","Record correction"):t("إدخال تقرير الشهر","Enter monthly report"));update.type="button";update.onclick=()=>formFor(row);
      card.append(dl,link,document.createTextNode(" · "),update);list.append(card);
    }
  }
  async function load(){
    const token=++seq,input={p_org:org,p_site:site,p_month:month.value+"-01"};
    list.replaceChildren();editor.replaceChildren();loaded=false;actions.hidden=true;
    if(!panel.open||!org||!site||!/^\d{4}-\d{2}$/.test(month.value))return;
    msg.textContent=t("جارٍ قراءة تقارير المنصات…","Reading platform reports…");
    try{
      const rows=[];
      for(let offset=0;;offset+=100){
        const {data,error}=await client.rpc("fm_read_reputation",{...input,p_offset:offset});if(token!==seq)return;
        if(error||!Array.isArray(data))throw Error("unavailable");rows.push(...data);if(data.length<100)break;
      }
      loaded=true;actions.hidden=register.hidden=false;msg.textContent="";render(rows);
    }catch{if(token===seq){msg.textContent=t("مصدر التقارير غير متاح لهذا الحساب أو البيئة.","Report source is unavailable for this account or environment.");actions.hidden=false;register.hidden=true;}}
  }
  panel.ontoggle=()=>{if(panel.open&&!loaded)void load()};refresh.onclick=load;register.onclick=()=>formFor(null);month.onchange=load;
  return (organization,facility)=>{
    ++seq;org=organization;site=facility;loaded=false;editor.replaceChildren();list.replaceChildren();msg.textContent="";actions.hidden=true;
    month.value=month.max=previousClosedMonth(periodInRiyadh().today);panel.hidden=!org||!site;
    if(panel.hidden)panel.open=false;else if(panel.open)void load();
  };
}
