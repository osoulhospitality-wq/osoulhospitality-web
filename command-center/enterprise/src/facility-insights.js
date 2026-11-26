import {summarizeGuestReviewSample} from "./guest-review-sample.mjs";

// Version swot-v1: a change to the meaning of a rule must also version the SQL approval snapshot.
export const insightTopics = {
  cleanliness_strength: ["strength", "نظافة المنشأة", "Property cleanliness", "سُجّلت ملاحظة إيجابية عن النظافة في الفترة المحددة. حافظ على إجراء الفحص في المواقع التي شملتها.", "Cleanliness was noted positively during this period. Retain the inspection practice in the areas observed."],
  response_strength: ["strength", "الاستجابة للصيانة", "Maintenance response", "أشار المصدر إلى استجابة فنية جيدة. راجع سجل هذه الحالات لتحديد ما يمكن تكراره.", "The source notes a positive maintenance response. Review the cited cases to identify a repeatable practice."],
  noise_weakness: ["weakness", "الضوضاء داخل المنشأة", "Internal noise", "ذكر المصدر إزعاجاً صوتياً داخل المنشأة. حدّد مصدر الصوت ووقت ظهوره قبل اختيار المعالجة.", "Internal noise was reported. Verify its source and timing before selecting a remedy."],
  cooling_weakness: ["weakness", "راحة التكييف", "Cooling comfort", "سُجّلت ملاحظة عن ضعف الراحة الحرارية. طابق فترة الملاحظة مع سجل معدات التكييف.", "Cooling discomfort was reported. Match the observation window to equipment and service records."],
  access_opportunity: ["opportunity", "تحسن الوصول إلى المنطقة", "Improving local access", "يشير مصدر الموقع إلى تحسن في الوصول. تحقّق ميدانياً من المسار الذي سيستخدمه الضيف قبل تعديل إرشادات الوصول.", "The site source indicates improved access. Verify the guest route before updating directions."],
  demand_opportunity: ["opportunity", "محرك طلب قريب", "Nearby demand driver", "رصد المصدر نشاطاً قريباً قد يخدم الطلب. اختبر ملاءمته لشريحة النزلاء قبل تعديل خطة الخدمة.", "A nearby activity may support demand. Test its relevance to guest segments before changing service plans."],
  works_threat: ["threat", "أعمال محيطة بالموقع", "Works near the property", "تشير الملاحظة إلى أعمال محيطة قد تعوق الوصول أو الراحة. تحقّق من مواعيدها ومسار بديل.", "Nearby works may affect access or comfort. Verify the schedule and an alternative route."],
  seasonality_threat: ["threat", "ضغط موسمي خارجي", "External seasonal pressure", "ورد مؤشر على ضغط موسمي في المنطقة. راجع سعة المناوبة والنقل مقابل الفترة الموثقة.", "The source indicates possible seasonal pressure. Check staffing and transport capacity against the documented period."]
};
const groups = {
  strength: ["نقاط القوة الداخلية", "Internal strengths"], weakness: ["نقاط الضعف الداخلية", "Internal weaknesses"],
  opportunity: ["فرص الموقع", "Location opportunities"], threat: ["تهديدات الموقع", "Location threats"]
};
const kinds = {guest_summary:["ملخص مراجعات النزلاء", "Guest review sample"],owner_record:["ملاحظة مالك المنشأة", "Owner observation"],site_source:["مصدر عن محيط المنشأة", "Location source"]};
const limits = {selected_sample:["عينة منتقاة غير ممثلة لكل النزلاء", "Selected sample, not representative of all guests"],single_source:["مصدر واحد يحتاج تأييداً", "Single source requiring corroboration"],seasonal:["الفترة موسمية", "Season-specific observations"],field_observation:["رصد ميداني محدود النطاق", "Limited field observation"]};

export function buildFacilitySwot(evidence) {
  const result = Object.fromEntries(Object.keys(groups).map(key=>[key, []]));
  for (const row of evidence) {
    if (!Object.hasOwn(insightTopics,row.topic)) throw new Error("Unknown evidence topic");
    const [group, , , ar, en] = insightTopics[row.topic];
    result[group].push({ar,en,evidence:row});
  }
  return result;
}

export function setupFacilityInsights(client, panel) {
  if (!panel) return;
  const content = panel.querySelector("[data-content]");
  const organization = document.querySelector("#organization-select");
  const lang = document.documentElement.lang.startsWith("en") ? 1 : 0;
  const tr = (ar,en)=>[ar,en][lang];
  function element(tag,text) {
    const node=document.createElement(tag);
    if(text!==undefined) node.textContent=text;
    return node;
  }
  const status = element("p");
  status.setAttribute("role","status");
  const site = element("select");
  const siteLabel=element("label",tr("المنشأة","Property"));
  siteLabel.append(site);
  const output = element("div");
  content.append(siteLabel,status,output);
  let generation=0, identity, pendingSite="", renderedOrg="";
  const busy=new Set();

  function clear() {
    ++generation; pendingSite=""; renderedOrg=""; output.replaceChildren(); status.textContent="";
    site.replaceChildren(); panel.open=false;
  }
  async function rpc(name,args) {
    const {data,error}=await client.rpc(name,args);
    if(error) throw error;
    return data;
  }
  function scope() { return {p_org:organization.value,p_facility:site.value}; }
  function matches(s,ticket) { return panel.open && generation===ticket && s.p_org===organization.value && s.p_facility===site.value; }
  function labelFor(form,caption,control) { const label=element("label",caption); label.append(control); form.append(label); return control; }
  function pick(entries) {
    const selection=element("select");
    for (const [value,label] of entries) selection.append(new Option(label,value));
    return selection;
  }
  function field(form,caption,type,required=false) {
    const input=element("input"); input.type=type; input.required=required;
    return labelFor(form,caption,input);
  }
  function message(ar,en) { status.textContent=tr(ar,en); }

  async function mutate(name,request,button) {
    const s=scope(), ticket=generation, key=s.p_org+"/"+s.p_facility;
    if(busy.has(key)) return;
    busy.add(key); button.disabled=true;
    try {
      await rpc(name,{...s,...request});
      if(matches(s,ticket) && await loadSnapshot() && scope().p_facility===s.p_facility && organization.value===s.p_org) message("تم حفظ التغيير.","Change saved.");
    } catch {
      if(matches(s,ticket)) message("تعذر الحفظ. حدّث التحليل وتحقق من التفويض ومرجع المصدر وتواريخ العينة.",
        "Could not save. Refresh the analysis and check permissions, the source reference and sample dates.");
    } finally { busy.delete(key); button.disabled=false; }
  }

  function evidenceForm() {
    const fold=element("details"), form=element("form");
    fold.append(element("summary",tr("إضافة دليل تحقّق منه المالك","Add owner-verified evidence")),form);
    const kind=labelFor(form,tr("نوع المصدر","Source type"),pick(Object.entries(kinds).map(([k,v])=>[k,v[lang]])));
    const topic=labelFor(form,tr("الملاحظة التي يثبتها المصدر","Observation supported by the source"),element("select"));
    const url=field(form,tr("رابط المصدر أو صفحة المنشأة العامة","Source URL or public property listing"),"url");
    form.append(element("small",tr("للمراجعات استخدم رابط صفحة الفندق في Booking أو Tripadvisor أو Agoda، أو رابط Google Maps بصيغة maps?cid=. تجنب روابط المراجعة الفردية والأسماء. يمكن توثيق رصد المالك بلا رابط.","For guest samples use the hotel listing on Booking, Tripadvisor or Agoda, or a Google Maps maps?cid= link. Exclude individual reviews and names. An owner observation may omit its link.")));
    const from=field(form,tr("بداية فترة الرصد","Observation period start"),"date",true);
    const to=field(form,tr("نهاية فترة الرصد","Observation period end"),"date",true);
    const sample=field(form,tr("عدد المراجعات المفحوصة إن كان معلوماً","Reviews examined, if known"),"number");
    sample.min="1"; sample.step="1";
    const limit=labelFor(form,tr("حدود الدليل","Evidence limitation"),pick(Object.entries(limits).map(([k,v])=>[k,v[lang]])));
    let supportingCount=null;
    const supportSummary=element("small"); form.append(supportSummary);
    const confirm=field(form,tr("تحققت من المصدر والفترة واقتصرت على ملاحظة مجمّعة تخلو من بيانات النزلاء.","I checked the source and dates and recorded an aggregate observation free of guest identifiers."),"checkbox",true);
    function filterTopics() {
      const previous=topic.value;
      const entries=Object.entries(insightTopics).filter(([,v])=>kind.value==="owner_record" || (kind.value==="guest_summary")===["strength","weakness"].includes(v[0]));
      topic.replaceChildren(...entries.map(([code,v])=>new Option(v[1+lang],code)));
      if(entries.some(([k])=>k===previous)) topic.value=previous;
      sample.disabled=kind.value!=="guest_summary"; if(sample.disabled) sample.value="";
      url.required=kind.value!=="owner_record";
    }
    kind.addEventListener("change",filterTopics); filterTopics();
    from.addEventListener("input",()=>{to.min=from.value;});
    for(const control of [kind,topic,from,to,sample]) control.addEventListener("input",()=>{
      supportingCount=null; supportSummary.textContent=""; confirm.checked=false;
    });
    const helper=element("details");
    helper.append(element("summary",tr("قراءة عينة مراجعات على هذا الجهاز","Read a review sample on this device")));
    helper.append(element("p",tr("الصق كل مراجعة منزوعة الهوية في سطر يبدأ بتاريخ YYYY-MM-DD ثم | ثم النص، أو ألصق عمودَي CSV باسم date,review. استخدم عينة من صفحة منشأة واحدة وفي فترة محددة. تُحسب الإشارات بقواعد لغوية محدودة وتبقى الحالات غير الواضحة للمراجعة.","Paste one anonymized review per line as YYYY-MM-DD | text, or paste a two-column date,review CSV. Use a single property listing and observation period. Limited language rules suggest topics and leave uncertain lines for review.")));
    const allowed=field(helper,tr("هذه عينة مصرح باستخدامها، وأزلت منها الأسماء والمعرفات.","I may use this sample and have removed names and identifiers."),"checkbox");
    const raw=labelFor(helper,tr("عينة المراجعات على الجهاز فقط","On-device review sample"),element("textarea"));
    raw.spellcheck=false; raw.autocomplete="off"; raw.maxLength=60000;
    const analyze=element("button",tr("معاينة الإشارات محلياً","Preview signals locally")); analyze.type="button";
    const preview=element("div"); preview.setAttribute("aria-live","polite"); helper.append(analyze,preview); fold.append(helper);
    analyze.addEventListener("click",()=>{
      preview.replaceChildren();
      if(!allowed.checked) { preview.textContent=tr("أكّد نطاق الاستخدام أولاً.","Confirm permission to use the sample first."); return; }
      let result;
      try { result=summarizeGuestReviewSample(raw.value); }
      catch { preview.textContent=tr("قسّم العينة إلى دفعات لا تتجاوز 200 مراجعة و60,000 حرف.","Split the sample into batches of up to 200 reviews and 60,000 characters."); return; }
      raw.value="";
      preview.append(element("p",tr("الصفوف المفحوصة","Rows examined")+" "+result.examined+" · "+tr("غير محسومة","Uncertain")+" "+result.uncertain+" · "+tr("مكررة","Duplicates")+" "+result.duplicates+" · "+tr("مستبعدة لتاريخ أو تنسيق أو معرّف محتمل","Excluded for date, format or potential identifier")+" "+result.excluded));
      for(const [topicCode,signal] of Object.entries(result.topics)) {
        const examples=signal.examples.map(e=>e.date+" #"+e.line).join(" · ");
        preview.append(element("p",insightTopics[topicCode][1+lang]+" — "+signal.supporting+"/"+result.examined+" · "+tr("أمثلة بحسب التاريخ ورقم السطر","Examples by date and line")+" "+examples));
        const apply=element("button",tr("استخدام اقتراح","Use suggestion")+" · "+insightTopics[topicCode][1+lang]); apply.type="button";
        apply.addEventListener("click",()=>{
          const wasGuest=kind.value==="guest_summary";
          kind.value="guest_summary"; filterTopics(); topic.value=topicCode;
          from.value=result.from; to.min=result.from; to.value=result.to; sample.value=String(result.examined);
          limit.value="selected_sample"; confirm.checked=false; supportingCount=signal.supporting;
          if(!wasGuest) url.value="";
          supportSummary.textContent=tr("صفوف دعمت الملاحظة ضمن العينة","Supporting rows in the sample")+" "+supportingCount+"/"+result.examined;
          url.focus();
        });
        preview.append(apply);
      }
    });
    const button=element("button",tr("حفظ الدليل","Save evidence")); button.type="submit"; form.append(button);
    form.addEventListener("submit",e=>{
      e.preventDefault();
      void mutate("facility_verify_insight",{p_kind:kind.value,p_topic:topic.value,p_url:url.value.trim(),p_from:from.value,p_to:to.value,p_sample:sample.value?Number(sample.value):null,p_limitation:limit.value,p_confirm:confirm.checked,p_supporting:supportingCount},button);
    });
    return fold;
  }

  function render(snapshot) {
    const sections=buildFacilitySwot(snapshot.evidence);
    output.replaceChildren();
    output.append(element("p",tr("تحليل بقواعد ثابتة، يستند إلى أحدث 40 دليلاً سارياً تحقّق منها المالك. قد يصف أكثر من دليل العينة نفسها. لم تُجمع المراجعات تلقائياً.",
      "Rule-based analysis of the latest 40 active owner-verified observations. Observations can refer to the same sample. Reviews are entered manually.")));
    output.append(element("p",snapshot.status==="approved"?tr("التحليل معتمد بتاريخ ","Analysis approved on ")+snapshot.approved_at.slice(0,10):tr("مسودة بانتظار الاعتماد","Draft awaiting approval")));
    if(snapshot.can_verify) output.append(evidenceForm());
    for(const [key,title] of Object.entries(groups)) {
      const section=element("section"); section.append(element("h3",title[lang]));
      if(!sections[key].length) section.append(element("p",tr("لا يوجد دليل ساري لهذا الجانب.","No current evidence for this area.")));
      for(const insight of sections[key]) {
        const row=insight.evidence;
        section.append(element("p",lang?insight.en:insight.ar));
        const provenance=[kinds[row.kind][lang], row.observed_from+" – "+row.observed_to,
          tr("تحقّق المالك ","Owner verified ")+row.verified_at.slice(0,10),limits[row.limitation][lang]];
        if(row.kind==="guest_summary") provenance.push(row.sample_size===null?tr("حجم العينة غير مسجل","Sample size unrecorded"):tr("حجم العينة ","Sample size ")+row.sample_size);
        if(row.supporting_count!=null) provenance.push(tr("صفوف مؤيدة للملاحظة ","Supporting rows ")+row.supporting_count);
        section.append(element("p",provenance.join(" · ")));
        if(row.source_url) {
          const link=element("a",tr("عرض مرجع المصدر","View source reference"));
          link.href=row.source_url; link.target="_blank"; link.rel="noreferrer noopener"; section.append(link);
        }
        if(snapshot.can_verify) {
          const button=element("button",tr("استبعاد هذا الدليل","Withdraw this evidence")); button.type="button";
          button.addEventListener("click",()=>{if(window.confirm(tr("استبعاد هذا الدليل من المسودة الحالية؟","Withdraw this evidence from the current draft?"))) void mutate("facility_withdraw_insight",{p_evidence:row.id},button);});
          section.append(button);
        }
      }
      output.append(section);
    }
    if(snapshot.status!=="approved" && snapshot.can_approve) {
      if(!snapshot.eligible) output.append(element("p",tr("يتطلب الاعتماد دليلاً لكل جانب وملخص مراجعات ومصدراً عن الموقع.","Approval requires evidence for all four areas, a guest sample and a location source.")));
      else {
        const button=element("button",tr("اعتماد نسخة التحليل المعروضة","Approve this analysis version")); button.type="button";
        button.addEventListener("click",()=>void mutate("facility_approve_swot",{p_version:snapshot.version,p_ids:snapshot.evidence.map(r=>r.id)},button));
        output.append(button);
      }
    }
  }
  async function loadSnapshot() {
    const ticket=++generation,s=scope(); output.replaceChildren(); status.textContent="";
    if(!s.p_org || !s.p_facility || !panel.open) return;
    try {
      const snapshot=await rpc("facility_swot",s);
      if(matches(s,ticket)) { render(snapshot); return true; }
    } catch {
      if(matches(s,ticket)) message("تعذر تحميل التحليل.","Could not load this analysis.");
    }
  }
  async function loadSites() {
    const org=organization.value,ticket=++generation; output.replaceChildren(); status.textContent="";
    const previous=renderedOrg===org?site.value:""; site.replaceChildren(); renderedOrg="";
    if(!panel.open || !org) return;
    try {
      const rows=[];
      for(let start=0;;start+=200) {
        const {data,error}=await client.from("facilities").select("id,name").eq("organization_id",org).order("id").range(start,start+199);
        if(error) throw error;
        if(generation!==ticket || !panel.open || org!==organization.value) return;
        rows.push(...data); if(data.length<200) break;
      }
      site.replaceChildren(new Option(tr("اختر المنشأة","Select property"),""),...rows.map(r=>new Option(r.name,r.id))); renderedOrg=org;
      const wanted=pendingSite||previous; pendingSite="";
      if(rows.some(r=>r.id===wanted)) site.value=wanted;
      else if(!wanted && rows.length===1) site.value=rows[0].id;
      if(!rows.length) message("لا توجد منشأة مسجلة.","No property is registered.");
      else await loadSnapshot();
    } catch {
      if(ticket===generation && org===organization.value) message("تعذر تحميل المنشآت.","Could not load properties.");
    }
  }
  site.addEventListener("change",loadSnapshot);
  organization.addEventListener("change",clear);
  panel.addEventListener("toggle",()=>{if(panel.open) void loadSites(); else {++generation; output.replaceChildren();}});
  document.addEventListener("draqon:facility-focus",event=>{
    const request=event.detail;
    if(request?.panelId!=="facility-insights" || request.orgId!==organization.value || !request.facilityId) return;
    pendingSite=request.facilityId;
    if(panel.open) void loadSites(); else panel.open=true;
  });
  client.auth.onAuthStateChange((event,session)=>{
    const next=session?.user?.id;
    if(event==="SIGNED_OUT" || (identity && next!==identity)) clear();
    identity=next;
  });
}
