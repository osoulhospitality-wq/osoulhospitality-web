(() => {
  "use strict";
  const en = document.documentElement.lang.startsWith("en");
  const t = (ar, english) => en ? english : ar;
  const fmt = new Intl.NumberFormat(en ? "en-GB" : "ar-SA", {maximumFractionDigits:2});
  const metrics = new Map(Object.entries({
    electricity_cost:["فواتير الكهرباء","Electricity charges","SAR"],water_cost:["فواتير المياه","Water charges","SAR"],
    internet_cost:["فواتير الإنترنت","Internet charges","SAR"],electricity_kwh:["استهلاك الكهرباء","Electricity consumption","kWh"],
    water_m3:["استهلاك المياه","Water consumption","m³"],maintenance_cost:["تكاليف الصيانة","Maintenance cost","SAR"],
    maintenance_orders:["أوامر الصيانة","Maintenance orders","count"],inspections:["الكشوف المنفذة","Completed inspections","count"],
    operations_cost:["تكاليف التشغيل","Operating cost","SAR"],occupancy_percent:["الإشغال","Occupancy","%"],
    service_score:["تقييم الخدمة","Service rating","points"],
    stc_internet_cost:["فواتير إنترنت STC","STC internet charges","SAR"],zain_internet_cost:["فواتير إنترنت زين","Zain internet charges","SAR"],
    total_utilities_cost:["إجمالي فواتير المرافق والإنترنت","Total utility and internet charges","SAR"],
    guest_issues_resolved:["بلاغات الضيوف المعالجة","Guest issues resolved","count"],guest_issues_total:["إجمالي بلاغات الضيوف","Reported guest issues","count"],
    ac_outdoor_units_serviced:["وحدات التكييف الخارجية المخدومة","Outdoor AC units serviced","count"],in_unit_ppm_completed:["وحدات استُكملت صيانتها الوقائية","Units with completed preventive maintenance","count"],
    guest_issues_on_hold:["بلاغات الضيوف المعلّقة","Guest issues on hold","count"],guest_reviews:["عدد التقييمات","Guest review count","count"],
    google_period_review_count:["عدد تقييمات Google","Google review count","count"],airbnb_period_review_count:["عدد تقييمات Airbnb","Airbnb review count","count"],booking_period_review_count:["عدد تقييمات Booking","Booking review count","count"],
    guest_reviews_max_score:["تقييمات بالدرجة الكاملة","Top-score reviews","count"],google_period_rating:["متوسط تقييم Google من ٥","Google average out of 5","points"],
    airbnb_period_rating:["متوسط تقييم Airbnb من ٥","Airbnb average out of 5","points"],booking_period_rating:["متوسط تقييم Booking من ١٠","Booking average out of 10","points"],
    operational_assignments:["المهام التشغيلية","Operational assignments","count"],assignments_marked_overdue:["المهام الموسومة متأخرة","Assignments marked overdue","count"]
  }));
  const technical = new Set(["maintenance_orders","inspections","ac_outdoor_units_serviced","in_unit_ppm_completed","guest_issues_resolved","guest_issues_on_hold","guest_issues_total"]);
  const hosts = new Map();
  const siteKey = x => String(x ?? "").normalize("NFKC").replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
  const build = (tag,text,cls) => {
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=text;
    if(cls)el.className=cls;
    return el;
  };
  const number = n => fmt.format(n);
  function labelSelect(title,items,initial) {
    const label=build("label",title), select=build("select");
    for(const [value,text] of items)select.add(new Option(text,value));
    if(initial && items.some(pair=>pair[0]===initial))select.value=initial;
    label.append(select);return [label,select];
  }
  function unpack(raw) {
    let value=raw.trim();
    if(value.startsWith("<")){
      const match=/<script\b[^>]*\bid=["']osoul-history-export["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(value);
      if(!match)throw Error();
      value=match[1];
    }
    const payload=JSON.parse(value);
    if(payload?.version!==1 || !Array.isArray(payload.observations) || payload.observations.length>30000)throw Error();
    const index=new Map();
    for(const o of payload.observations) {
      if(!o||!metrics.has(o.metric))continue;
      if(typeof o.facility!=="string"||!o.facility.trim()||o.facility.length>150||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(o.period)||
        !Number.isFinite(o.value)||typeof o.source!=="string"||!o.source.trim()||o.source.length>1200)throw Error();
      const key=JSON.stringify([o.facility,o.period,o.metric]);
      const previous=index.get(key);
      if(previous){if(previous.value!==o.value)previous.conflict=true; if(!previous.sources.includes(o.source))previous.sources.push(o.source);}
      else index.set(key,{facility:o.facility,period:o.period,metric:o.metric,value:o.value,sources:[o.source],conflict:false});
    }
    return [...index.values()];
  }
  function mount(host) {
    let generation=0;
    const field=host.dataset.osoulHistory==="technician";
    const panel=build("details",undefined,"history-review");
    const status=build("p");status.setAttribute("role","status");
    const output=build("div");const file=build("input");
    file.type="file";file.accept=".html,.json,text/html,application/json";
    const label=build("label",t("ملف التقارير الخاص","Private report file"));label.append(file);
    const hint=build("p",t("اختر ملف لوحة التقارير لعرض المقارنة على هذا الجهاز. تُمسح القراءة عند تغيير النطاق أو الخروج.","Select your private report dashboard to compare periods on this device. Switching scope or signing out clears the view."));
    panel.append(build("summary",t("مقارنة التقارير الشهرية الخاصة","Compare private monthly reports")),hint,label,status,output);
    host.replaceChildren(panel);
    function reset() {generation++;file.value="";status.textContent="";output.replaceChildren();panel.open=false;}
    file.onchange=async()=>{
      const revision=++generation;output.replaceChildren();status.textContent="";
      const chosen=file.files[0];if(!chosen)return;
      try{
        if(chosen.size>32*1024*1024)throw Error();
        let rows=unpack(await chosen.text());
        if(!host.isConnected||revision!==generation)return;
        if(field)rows=rows.filter(row=>technical.has(row.metric)&&siteKey(row.facility)===siteKey(host.dataset.siteLabel));
        if(!rows.length){status.textContent=t("لا توجد قياسات شهرية مؤهلة لهذا النطاق في الملف.","No eligible monthly observations for this scope in the file.");return;}
        const facilities=[...new Set(rows.map(row=>row.facility))];
        const site=labelSelect(t("المبنى","Building"),facilities.map(x=>[x,x]),facilities.find(x=>siteKey(x)===siteKey(host.dataset.siteLabel)));
        const area=build("div");output.replaceChildren(site[0],area);
        function selectSite(){
          const selected=rows.filter(row=>row.facility===site[1].value);
          const available=[...new Set(selected.map(row=>row.metric))];
          const metric=labelSelect(t("المؤشر","Measure"),available.map(k=>[k,t(...metrics.get(k))]));
          const content=build("div");area.replaceChildren(metric[0],content);
          const renderMetric=()=>renderSeries(content,selected.filter(row=>row.metric===metric[1].value));
          metric[1].onchange=renderMetric;renderMetric();
        }
        site[1].onchange=selectSite;selectSite();
      }catch{if(revision===generation&&host.isConnected)status.textContent=t("تعذرت قراءة حزمة التقارير. اختر ملف لوحة التقارير المرفق أو ملف بيانات متوافقًا.","Could not read this report package. Choose the supplied dashboard file or a compatible data file.");}
    };
    host.addEventListener("osoul:report-scope-reset",reset);
    return {reset,dispose(){reset();host.removeEventListener("osoul:report-scope-reset",reset);}};
  }
  function renderSeries(box,rows) {
    rows.sort((a,b)=>a.period.localeCompare(b.period));
    const [ar,eng,unit]=metrics.get(rows[0].metric);
    const unitText=({SAR:t("ريال","SAR"),count:t("عدد","count"),points:t("نقطة","points")})[unit]||unit;
    const title=build("h3",t(ar,eng)+" · "+unitText), months=rows.map(r=>[r.period,r.period]);
    const a=labelSelect(t("الفترة السابقة","Earlier period"),months,rows.at(-2)?.period||rows[0].period);
    const b=labelSelect(t("الفترة المقارنة","Comparison period"),months,rows.at(-1).period);
    const delta=build("p",undefined,"history-delta");delta.setAttribute("role","status");
    function compare(){
      const first=rows.find(r=>r.period===a[1].value),last=rows.find(r=>r.period===b[1].value);
      if(first.period>=last.period || first.conflict||last.conflict){delta.textContent=t("اختر شهرين متعاقبين زمنيًا بقيم متوافقة لحساب الفرق.","Choose two different months in chronological order with undisputed values.");return;}
      const change=last.value-first.value, pct=first.value>0&&unit!=="%"&&unit!=="points" ? " ("+number(100*change/first.value)+"%)":"";
      delta.textContent=first.period+" ← "+last.period+"  ·  "+t("التغير ","Change ")+(change>0?"+":"")+number(change)+" "+(unit==="%"?t("نقطة مئوية","percentage points"):unitText)+pct;
    }
    a[1].onchange=b[1].onchange=compare;
    const axis=build("div",undefined,"history-bars");
    const scale=Math.max(0,...rows.filter(r=>!r.conflict).map(r=>Math.abs(r.value)));
    for(const row of rows){
      const line=build("div",undefined,"history-row"),track=build("div",undefined,"history-track");
      const bar=build("progress");bar.max=scale||1;bar.value=row.conflict?0:Math.abs(row.value);bar.setAttribute("aria-label",row.period);track.append(bar);
      line.append(build("span",row.period),track,build("b",row.conflict?t("تعارض مصادر","Conflicting sources"):number(row.value)));axis.append(line);
    }
    const sources=build("details");sources.append(build("summary",t("الفترات ومراجع الأرقام","Periods and source references")));
    for(const row of rows)sources.append(build("p",row.period+" · "+row.sources.join(" / ")));
    const filters=build("div",undefined,"history-months");filters.append(a[0],b[0]);
    box.replaceChildren(title,filters,delta,axis,sources);compare();
  }
  function sync(){
    for(const [host,state] of hosts)if(!host.isConnected){state.dispose();hosts.delete(host);}
    for(const host of document.querySelectorAll("[data-osoul-history]"))if(!hosts.has(host))hosts.set(host,mount(host));
  }
  new MutationObserver(sync).observe(document.body,{childList:true,subtree:true});
  sync();
})();
