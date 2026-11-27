import {uiText as t} from "./locale.js";
import {assetLabelGraphic, printAssetLabel} from "./asset-label.js";
import {readAssetPhoto} from "./asset-photo.js";

function options(select, rows, caption, label) {
  select.replaceChildren(new Option(caption,""), ...rows.map(row=>new Option(label(row),row.id)));
}

const buildingKinds={
  floors_above:["طوابق فوق الأرض","Above-ground floors"],basements:["طوابق القبو","Basements"],built_area_m2:["مساحة البناء (م²)","Built area (m²)"],land_area_m2:["مساحة الأرض (م²)","Land area (m²)"],
  lifts:["عدد المصاعد","Lift count"],units:["عدد الوحدات","Unit count"],staff_total:["إجمالي العاملين","Total staff"],staff_breakdown:["توزيع العاملين","Staff breakdown"],address:["عنوان المبنى","Building address"],property_type:["نوع المنشأة","Property type"],inspection_note:["ملاحظة المعاينة","Inspection note"]
};
const assetKinds={category:["فئة الأصل","Asset category"],location:["موقع الأصل","Asset location"],manufacturer:["الشركة المصنّعة","Manufacturer"],model:["الطراز","Model"],serial:["الرقم التسلسلي","Serial number"],condition:["حالة الأصل","Asset condition"],inspection_note:buildingKinds.inspection_note};
const allKinds={...buildingKinds,...assetKinds};
const counts=new Set(["floors_above","basements","lifts","units","staff_total"]);
const areas=new Set(["built_area_m2","land_area_m2"]);
const assetCaption = row => row.asset_code+" · "+row.name;
function textElement(tag,text) {
  const node=document.createElement(tag);node.textContent=text;return node;
}
async function unwrap(operation) {
  const {data,error}=await operation;
  if(error) throw error;
  return data;
}

export function setupBuildingMemory(client,panel) {
  const byId=id=>panel.querySelector("#"+id);
  const organization=document.getElementById("organization-select");
  const site=byId("memory-site"), asset=byId("memory-asset"), work=byId("memory-site-work");
  const fact=byId("memory-fact-form"), search=byId("memory-recall"), scan=byId("memory-scan");
  const assetForm=byId("memory-asset-create"), results=byId("memory-results"), message=byId("memory-message");
  const label=byId("memory-label-preview"), labelOutput=byId("memory-label-output");
  let scope=0,reading=0,identity=null,assets=[],preferredSite="",canVerify=false,pendingFactId=null;
  const siteCaption=t("اختر المبنى","Choose a property"), noAsset=t("اختر الأصل","Choose an asset");
  function clearLabel(){label.replaceChildren();labelOutput.hidden=true;}
  function resetSite(){
    scope++;reading++;assets=[];pendingFactId=null;canVerify=false;work.hidden=true;
    results.replaceChildren();clearLabel();asset.replaceChildren();
    for(const form of [fact,search,scan,assetForm]) form.reset();
    byId("memory-photo").value="";
    for(const details of work.querySelectorAll("details")) details.open=false;
    message.textContent="";
  }
  function reset(){
    resetSite();byId("memory-site-create").reset();options(site,[],siteCaption,row=>row.name);preferredSite="";panel.open=false;
  }
  function stamp(){return {scope,org:organization.value,site:site.value};}
  function current(s){return panel.open && scope===s.scope && organization.value===s.org && site.value===s.site;}
  const failed=()=>{message.textContent=t("تعذّر إكمال العملية. تحقق من الصلاحية والاتصال ثم أعد تحميل السجل.","Could not complete this action. Check your permissions and connection, then reload the register.");};
  function scopedCall(name,extra,s=stamp()) {
    return unwrap(client.rpc(name,{p_org:s.org,p_facility:s.site,...extra}));
  }
  async function pages(table,fields,org,siteId,sort) {
    const batch=100,records=[];
    for(let start=0;;start+=batch) {
      let query=client.from(table).select(fields).eq("organization_id",org);
      if(siteId) query=query.eq("facility_id",siteId);
      const rows=await unwrap(query.order(sort).order("id").range(start,start+batch-1));
      records.push(...rows);if(rows.length<batch) return records;
    }
  }
  async function chooseSite(){
    const id=site.value;
    resetSite();
    if(!id) return;
    const s=stamp();
    try {
      const [rows, membership]=await Promise.all([
        pages("facility_assets","id,asset_code,name,scan_token",s.org,id,"asset_code"),
        client.auth.getUser().then(async result=>{
          if(result.error || !result.data.user)throw Error("Session unavailable");
          return unwrap(client.from("organization_members").select("role").eq("organization_id",s.org).eq("user_id",result.data.user.id).eq("active",true).limit(1));
        })
      ]);
      if(!current(s)) return;
      canVerify=["owner","approver"].includes(membership[0]?.role);assets=rows;options(asset,rows,noAsset,assetCaption);
      options(fact.elements.asset,rows,t("المبنى","Property"),assetCaption);
      options(search.elements.scope,rows,t("كل سجلات المبنى","All property records"),assetCaption);
      updateKinds();
      work.hidden=false;await recall();
    } catch {if(current(s))failed();}
  }
  async function loadSites(){
    const org=organization.value;if(!org||!panel.open)return;
    const requested=preferredSite || site.value;
    resetSite();const version=scope;options(site,[],siteCaption,row=>row.name);
    try {
      const rows=await pages("facilities","id,name",org,null,"name");
      if(!panel.open||version!==scope||organization.value!==org)return;
      options(site,rows,siteCaption,row=>row.name);
      if(!rows.length){message.textContent=t("أضف مبنى من قسم إدارة المرافق والأصول لتبدأ السجل.","Add a property under facilities and asset management to start its register.");return;}
      if(requested && rows.some(r=>r.id===requested))site.value=requested;
      else if(rows.length===1 && !requested)site.value=rows[0].id;
      preferredSite="";await chooseSite();
    }catch{if(panel.open&&version===scope&&organization.value===org)failed();}
  }
  function displayLabel(token,selected){
    clearLabel();
    const graphic=assetLabelGraphic(token,t("رمز ملصق الأصل","Asset label QR code"));
    const id=textElement("bdi",token);id.dir="ltr";
    const siteName=site.selectedOptions[0]?.textContent||"";
    label.append(textElement("strong",selected.name),textElement("small",siteName+" · "+selected.asset_code),graphic,id);
    labelOutput.hidden=false;
  }
  function selectedAsset(){
    clearLabel();
    const row=assets.find(item=>item.id===asset.value);
    if(row)displayLabel(row.scan_token,row);
  }
  function valueHint(){
    const key=fact.elements.kind.value, input=fact.elements.text;
    input.inputMode=counts.has(key)?"numeric":areas.has(key)?"decimal":"text";
    byId("memory-value-hint").textContent=counts.has(key)?t("أدخل عدداً صحيحاً موثقاً. اترك المجهول دون تسجيل.","Enter a documented whole number. Leave unknown counts unrecorded."):
      areas.has(key)?t("أدخل المساحة بالمتر المربع، حتى ثلاث منازل عشرية.","Enter square metres, with up to three decimal places."):"";
  }
  function updateKinds(){
    const kinds=fact.elements.asset.value?assetKinds:buildingKinds;
    fact.elements.kind.replaceChildren(...Object.entries(kinds).map(([key,labels])=>new Option(t(...labels),key)));valueHint();
  }
  function showFact(row,s) {
    const li=document.createElement("li");
    const labels=allKinds[row.fact_key];
    li.append(textElement("strong",labels?t(...labels):row.fact_key),textElement("p",row.fact_value));
    const attachment=assets.find(a=>a.id===row.asset_id);
    const verified=row.verified_at?t("متحقق","Verified"):t("بانتظار الاعتماد","Awaiting verification");
    li.append(textElement("small",[verified,row.source_ref,String(row.observed_on).slice(0,10),attachment?assetCaption(attachment):site.selectedOptions[0]?.textContent].filter(Boolean).join(" · ")));
    if(row.verified_at) li.append(textElement("small",t("تاريخ الاعتماد","Verified on")+" "+new Date(row.verified_at).toLocaleDateString(document.documentElement.lang,{timeZone:"Asia/Riyadh"})));
    if(!row.verified_at&&canVerify){
      const button=textElement("button",t("اعتماد المعلومة","Verify fact"));button.type="button";
      button.addEventListener("click",async()=>{
        if(!current(s)||button.disabled)return;button.disabled=true;
        try{await scopedCall("facility_memory_verify",{p_id:row.id},s);if(current(s))await recall();}
        catch{if(current(s))failed();}finally{button.disabled=false;}
      });li.append(button);
    }
    return li;
  }
  async function recall(){
    const s=stamp(),serial=++reading;if(!s.site)return;
    const term=search.elements.query.value.trim();
    const localizedKey=Object.entries(allKinds).find(([,labels])=>labels.some(l=>l.toLowerCase()===term.toLowerCase()))?.[0];
    try{
      const records=[];const batch=100;
      for(let start=0;;start+=batch){
        const rows=await unwrap(client.rpc("facility_memory_find",{p_org:s.org,p_facility:s.site,p_term:localizedKey||term,p_asset:search.elements.scope.value||null}).range(start,start+batch-1));
        if(!current(s)||serial!==reading)return;
        records.push(...rows);if(rows.length<batch)break;
      }
      results.replaceChildren(...records.map(row=>showFact(row,s)));
      if(!records.length) results.append(textElement("li",t("لا توجد معلومات موثقة تطابق البحث.","No sourced facts match this search.")));
    }catch{if(current(s)&&serial===reading){results.replaceChildren();failed();}}
  }
  function onSubmit(form,action) {
    form.addEventListener("submit",async event=>{
      event.preventDefault();const button=form.querySelector("button"),s=stamp();
      if(!s.org||!s.site||!panel.open||button.disabled)return;
      button.disabled=true;message.textContent="";
      try {await action(s);}
      catch {if(current(s))failed();}
      finally {button.disabled=false;}
    });
  }
  byId("memory-site-create").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector("button"),org=organization.value,version=scope;
    if(!org||!panel.open||button.disabled)return;
    button.disabled=true;
    try{
      const row=await unwrap(client.from("facilities").insert({organization_id:org,name:form.elements.name.value.trim()}).select("id").single());
      if(organization.value!==org||version!==scope||!panel.open)return;
      preferredSite=row.id;form.reset();form.closest("details").open=false;await loadSites();
    }catch{if(organization.value===org&&scope===version)failed();}
    finally{button.disabled=false;}
  });
  onSubmit(search,recall);
  onSubmit(assetForm,async s=>{
    const row=await unwrap(client.from("facility_assets").insert({organization_id:s.org,facility_id:s.site,asset_code:assetForm.elements.code.value.trim(),name:assetForm.elements.name.value.trim()}).select("id").single());
    if(!current(s))return;
    await chooseSite();
    if(organization.value!==s.org||site.value!==s.site||!panel.open)return;
    if(assets.some(a=>a.id===row.id)){asset.value=row.id;await selectedAsset();message.textContent=t("تم تسجيل الأصل.","Asset registered.");}
  });
  let lookupRevision=0;
  async function lookupToken(token,s){
    const version=++lookupRevision;
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(token)){clearLabel();asset.value="";message.textContent=t("أدخل الرمز الكامل المطبوع تحت الملصق.","Enter the full code printed beneath the label.");return;}
    let matches;
    try{matches=await scopedCall("facility_asset_by_token",{p_token:token},s);}
    catch{if(current(s)&&version===lookupRevision){clearLabel();asset.value="";failed();}return;}
    if(!current(s)||version!==lookupRevision)return;
    const selected=matches[0];
    if(!selected){asset.value="";clearLabel();message.textContent=t("لم يُعثر على هذا الملصق في المبنى المحدد.","No matching label was found at this property.");return;}
    if(!assets.some(r=>r.id===selected.id)){assets.push(selected);asset.add(new Option(assetCaption(selected),selected.id));}
    asset.value=selected.id;selectedAsset();message.textContent=t("الأصل المطابق","Matching asset")+" · "+assetCaption(selected);
  }
  onSubmit(scan,s=>lookupToken(scan.elements.token.value.trim(),s));
  byId("memory-photo").addEventListener("change",async event=>{
    const input=event.currentTarget,file=input.files?.[0],s=stamp();
    if(!file||!s.site||!current(s))return;
    const version=++lookupRevision;input.disabled=true;
    try{
      const token=await readAssetPhoto(file);
      if(!current(s)||version!==lookupRevision)return;
      if(!token){clearLabel();asset.value="";message.textContent=t("لم يظهر رمز QR واضح في الصورة. قرّب الملصق أو أدخل الرمز المكتوب.","No readable QR code was found. Move closer or enter the printed code.");return;}
      scan.elements.token.value=token;await lookupToken(token,s);
    }catch{if(current(s)&&version===lookupRevision)message.textContent=t("تعذرت قراءة الصورة. اختر صورة واضحة بصيغة مدعومة أو أدخل الرمز.","Could not read this photo. Choose a clear image in a supported format or enter the code.");}
    finally{input.disabled=false;input.value="";}
  });
  onSubmit(fact,async s=>{
    const values=new FormData(fact);
    pendingFactId??=crypto.randomUUID();
    const receipt=await scopedCall("facility_memory_save",{p_id:pendingFactId,p_asset:values.get("asset")||null,p_key:values.get("kind"),p_value:values.get("text").trim(),p_source:values.get("source").trim(),p_asof:values.get("date")},s);
    if(!current(s))return;
    pendingFactId=null;fact.reset();updateKinds();search.reset();await recall();
    if(current(s)){
      const ref=textElement("bdi",receipt);ref.dir="ltr";
      message.replaceChildren(document.createTextNode(t("حُفظت المعلومة. مرجع السجل ","Fact saved. Record reference ")),ref);
    }
  });
  fact.addEventListener("input",()=>{pendingFactId=null;});
  fact.elements.asset.addEventListener("change",updateKinds);
  fact.elements.kind.addEventListener("change",valueHint);
  search.elements.scope.addEventListener("change",recall);
  byId("memory-print").addEventListener("click",()=>{if(panel.open&&!labelOutput.hidden&&site.value&&asset.value)printAssetLabel(label);});
  organization.addEventListener("change",reset);
  site.addEventListener("change",chooseSite);asset.addEventListener("change",selectedAsset);
  panel.addEventListener("toggle",()=>{if(panel.open)void loadSites();else resetSite();});
  client.auth.onAuthStateChange((event,session)=>{const id=session?.user?.id??null;if(identity!==id||event==="SIGNED_OUT")reset();identity=id;});
  document.addEventListener("draqon:facility-focus",event=>{
    const detail=event.detail;
    if(detail?.panelId!==panel.id||!detail.facilityId||organization.value!==detail.orgId)return;
    preferredSite=detail.facilityId;
    if(panel.open)void loadSites();else panel.open=true;
  });
}
