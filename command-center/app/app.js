(() => {
  "use strict";
  const KEY = "osoul-command-center-v11";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const money = n => new Intl.NumberFormat("ar-SA", {style:"currency",currency:"SAR",maximumFractionDigits:2}).format(Number(n || 0));
  const date = d => d ? new Intl.DateTimeFormat("ar-SA",{dateStyle:"medium"}).format(new Date(`${d}T12:00:00`)) : "—";
  const daysTo = d => Math.ceil((new Date(`${d}T12:00:00`) - new Date()) / 86400000);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, x => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
  const blank = () => ({version:11,suppliers:[],products:[],quotes:[],contracts:[],decisions:[],documents:[],audit:[],updatedAt:new Date().toISOString()});
  let state;
  try {
    const current=localStorage.getItem(KEY), legacy=localStorage.getItem("osoul-command-center-v10");
    state={...blank(),...(JSON.parse(current || legacy) || {})};
    state.version=11;
    if(!current && legacy)localStorage.setItem(KEY,JSON.stringify(state));
  } catch { state = blank(); }

  const seed = () => {
    const s1=uid(),s2=uid(),s3=uid(),p1=uid(),p2=uid();
    state={version:11,documents:[],audit:[],updatedAt:new Date().toISOString(),
      suppliers:[
        {id:s1,name:"مورد ألف — تجريبي",cr:"1010XXXXXX",city:"الرياض",status:"approved",coverage:"الرياض",payment:"30 يوم"},
        {id:s2,name:"شركة باء — تجريبي",cr:"1011XXXXXX",city:"الرياض",status:"under_review",coverage:"الوسطى",payment:"نقدي"},
        {id:s3,name:"مصاعد جيم — تجريبي",cr:"1012XXXXXX",city:"الرياض",status:"approved",coverage:"المملكة",payment:"ربع سنوي"}
      ],
      products:[
        {id:p1,sku:"CLN-001",name:"منظف أرضيات مركز — تجريبي",supplierId:s1,category:"مواد نظافة",packPrice:92,standardQty:20,unit:"لتر",moq:5},
        {id:p2,sku:"CLN-002",name:"منظف أرضيات مركز — تجريبي",supplierId:s2,category:"مواد نظافة",packPrice:28,standardQty:5,unit:"لتر",moq:12}
      ],
      quotes:[
        {id:uid(),productId:p1,supplierId:s1,quantity:10,packPrice:92,discount:50,delivery:0,taxRate:15,validUntil:"2026-09-30"},
        {id:uid(),productId:p2,supplierId:s2,quantity:40,packPrice:28,discount:0,delivery:100,taxRate:15,validUntil:"2026-09-15"}
      ],
      contracts:[
        {id:uid(),name:"صيانة مصعد — تجريبي",supplierId:s3,building:"مبنى نموذجي",value:42000,endDate:"2026-11-30",noticeDays:90,probability:4,impact:4,risk:"قطع رئيسية مستثناة دون قائمة أسعار معتمدة",status:"open"},
        {id:uid(),name:"صيانة دورية — تجريبي",supplierId:s3,building:"مبنى العرض",value:36000,endDate:"2027-02-28",noticeDays:60,probability:2,impact:3,risk:"زمن الاستجابة غير محدد بدقة",status:"open"}
      ],
      decisions:[{id:uid(),subject:"عقد المصعد التجريبي",decision:"تفاوض",approver:"يزيد الجهني",evidence:"DEMO-CON-001",rationale:"إضافة مصفوفة قطع الغيار وSLA والجزاءات قبل الاعتماد",createdAt:today()}]
    };
    save("تم تحميل بيانات العرض التجريبية");
  };
  const audit = (action, entity, detail="") => {
    state.audit ??= [];
    state.audit.push({id:uid(),at:new Date().toISOString(),actor:"يزيد الجهني — مالك",action,entity,detail});
  };
  const save = (message, event) => { if(event)audit(event.action,event.entity,event.detail);state.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(state));render();if(message) toast(message); };
  const toast = message => { const el=$("#toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2200); };
  const supplier = id => state.suppliers.find(x=>x.id===id);
  const product = id => state.products.find(x=>x.id===id);
  const normalizedProductPrice = p => Number(p.packPrice)/Number(p.standardQty || 1);
  const quoteTotal = q => ((Number(q.packPrice)*Number(q.quantity))-Number(q.discount||0)+Number(q.delivery||0))*(1+Number(q.taxRate||0)/100);
  const quoteUnit = q => { const p=product(q.productId);return p?quoteTotal(q)/(Number(q.quantity)*Number(p.standardQty||1)):0; };
  const riskScore = c => Number(c.probability)*Number(c.impact);
  const riskLevel = score => score>=20?"critical":score>=12?"high":score>=6?"medium":score>=2?"low":"note";
  const riskLabel = score => ({critical:"حرج",high:"مرتفع",medium:"متوسط",low:"منخفض",note:"ملاحظة"}[riskLevel(score)]);
  const statusBadge = status => {
    const map={approved:["معتمد",""],under_review:["قيد المراجعة","review"],suspended:["موقوف","high"]};
    const x=map[status]||[status,""];return `<span class="badge ${x[1]}">${x[0]}</span>`;
  };
  const empty = text => `<div class="empty">${text}</div>`;
  const table = (heads, rows) => rows.length ? `<table><thead><tr>${heads.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>` : empty("لا توجد سجلات بعد.");

  function render(){
    state.documents ??=[]; state.audit ??=[];
    renderOptions(); renderDashboard(); renderSuppliers(); renderProducts(); renderQuotes(); renderContracts(); renderDecisions(); renderDocuments(); renderAudit();
  }
  function renderOptions(){
    $$("[data-options=suppliers]").forEach(el=>{const old=el.value;el.innerHTML=`<option value="">اختر المورد</option>`+state.suppliers.map(s=>`<option value="${s.id}">${escape(s.name)}</option>`).join("");el.value=old;});
    $$("[data-options=products]").forEach(el=>{const old=el.value;el.innerHTML=`<option value="">اختر المنتج</option>`+state.products.map(p=>`<option value="${p.id}">${escape(p.name)} — ${escape(p.sku)}</option>`).join("");el.value=old;});
  }
  function renderDashboard(){
    const expiring=state.contracts.filter(c=>daysTo(c.endDate)<=120).sort((a,b)=>a.endDate.localeCompare(b.endDate));
    const risks=state.contracts.filter(c=>riskScore(c)>=6).sort((a,b)=>riskScore(b)-riskScore(a));
    const potential = savings().reduce((n,x)=>n+x.saving,0);
    $("#kpis").innerHTML=[
      ["الموردون المعتمدون",state.suppliers.filter(x=>x.status==="approved").length,"من أصل "+state.suppliers.length],
      ["بنود الأسعار",state.products.length,"Product Master"],
      ["عقود ≤120 يوم",expiring.length,"تحتاج مراجعة مبكرة"],
      ["توفير محتمل",money(potential),"غير محقق حتى الاعتماد"]
    ].map(x=>`<article class="kpi"><small>${x[0]}</small><b>${x[1]}</b><span>${x[2]}</span></article>`).join("");
    $("#expiryList").innerHTML=expiring.length?expiring.map(c=>`<div class="list-row"><div><b>${escape(c.name)}</b><small>${escape(c.building)} • ${escape(supplier(c.supplierId)?.name||"—")}</small></div><span class="badge ${daysTo(c.endDate)<60?"high":"medium"}">${daysTo(c.endDate)} يوم</span></div>`).join(""):empty("لا توجد عقود قريبة.");
    $("#riskList").innerHTML=risks.length?risks.map(c=>`<div class="list-row"><div><b>${escape(c.risk||c.name)}</b><small>${escape(c.name)} • الإجراء: مراجعة المختص</small></div><span class="badge ${riskLevel(riskScore(c))}">${riskLabel(riskScore(c))} ${riskScore(c)}</span></div>`).join(""):empty("لا توجد مخاطر مفتوحة.");
    const ss=savings();$("#savingList").innerHTML=table(["المنتج","أفضل مورد","سعر الوحدة","التوفير المحتمل"],ss.map(x=>`<tr><td>${escape(x.name)}</td><td>${escape(x.supplier)}</td><td class="money">${money(x.best)}</td><td class="money positive">${money(x.saving)}</td></tr>`));
  }
  function renderSuppliers(){
    const q=($("[data-search=suppliers]")?.value||"").toLowerCase(), f=$("[data-filter=supplierStatus]")?.value||"";
    const rows=state.suppliers.filter(s=>(!f||s.status===f)&&[s.name,s.cr,s.city].join(" ").toLowerCase().includes(q)).map(s=>`<tr><td><b>${escape(s.name)}</b></td><td>${escape(s.cr||"—")}</td><td>${escape(s.city||"—")}</td><td>${escape(s.coverage||"—")}</td><td>${escape(s.payment||"—")}</td><td>${statusBadge(s.status)}</td><td><button class="danger-button" data-delete="suppliers" data-id="${s.id}">حذف</button></td></tr>`);
    $("#supplierTable").innerHTML=table(["المورد","السجل","المدينة","التغطية","الدفع","الحالة",""],rows);
  }
  function renderProducts(){
    const q=($("[data-search=products]")?.value||"").toLowerCase();
    const rows=state.products.filter(p=>[p.name,p.sku,supplier(p.supplierId)?.name].join(" ").toLowerCase().includes(q)).map(p=>`<tr><td><b>${escape(p.sku)}</b></td><td>${escape(p.name)}</td><td>${escape(supplier(p.supplierId)?.name||"—")}</td><td class="money">${money(p.packPrice)}</td><td>${escape(p.standardQty)} ${escape(p.unit)}</td><td class="money"><b>${money(normalizedProductPrice(p))}</b> / ${escape(p.unit)}</td><td>${escape(p.moq)}</td><td><button class="danger-button" data-delete="products" data-id="${p.id}">حذف</button></td></tr>`);
    $("#productTable").innerHTML=table(["SKU","المنتج","المورد","العبوة","الكمية القياسية","سعر الوحدة","MOQ",""],rows);
  }
  function renderQuotes(){
    const grouped={};state.quotes.forEach(q=>(grouped[q.productId]??=[]).push(q));
    const rows=Object.values(grouped).flatMap(group=>{
      const units=group.map(quoteUnit),best=Math.min(...units);
      return group.sort((a,b)=>quoteUnit(a)-quoteUnit(b)).map(q=>{const p=product(q.productId),u=quoteUnit(q);return `<tr><td>${escape(p?.name||"منتج محذوف")}</td><td>${escape(supplier(q.supplierId)?.name||"—")}</td><td>${q.quantity}</td><td class="money">${money(quoteTotal(q))}</td><td class="money"><b>${money(u)}</b> / ${escape(p?.unit||"وحدة")}</td><td>${u===best?'<span class="badge">الأفضل سعريًا</span>':'<span class="badge review">راجع الجودة</span>'}</td><td>${date(q.validUntil)}</td><td><button class="danger-button" data-delete="quotes" data-id="${q.id}">حذف</button></td></tr>`;});
    });
    $("#quoteTable").innerHTML=table(["المنتج","المورد","الكمية","الإجمالي شامل الضريبة","سعر الوحدة","التوصية","الصلاحية",""],rows);
  }
  function renderContracts(){
    const rows=state.contracts.map(c=>{const score=riskScore(c),renewal=new Date(`${c.endDate}T12:00:00`);renewal.setDate(renewal.getDate()-Number(c.noticeDays||0));return `<tr><td><b>${escape(c.name)}</b><small>${escape(c.building)}</small></td><td>${escape(supplier(c.supplierId)?.name||"—")}</td><td class="money">${money(c.value)}</td><td>${date(c.endDate)}</td><td>${date(renewal.toISOString().slice(0,10))}</td><td><span class="badge ${riskLevel(score)}">${riskLabel(score)} ${score}</span></td><td>${escape(c.risk||"لا يوجد وصف")}</td><td><button class="danger-button" data-delete="contracts" data-id="${c.id}">حذف</button></td></tr>`;});
    $("#contractTable").innerHTML=table(["العقد/الأصل","المورد","القيمة","النهاية","آخر إشعار","الخطر","الملاحظة",""],rows);
  }
  function renderDecisions(){
    const rows=[...state.decisions].reverse().map(d=>`<tr><td>${date(d.createdAt)}</td><td><b>${escape(d.subject)}</b></td><td><span class="badge">${escape(d.decision)}</span></td><td>${escape(d.approver)}</td><td>${escape(d.evidence||"—")}</td><td>${escape(d.rationale)}</td><td><button class="danger-button" data-delete="decisions" data-id="${d.id}">حذف</button></td></tr>`);
    $("#decisionTable").innerHTML=table(["التاريخ","الموضوع","القرار","المعتمد","الدليل","المبررات",""],rows);
  }
  function renderDocuments(){
    const rows=[...state.documents].reverse().map(d=>`<tr><td>${date(d.createdAt)}</td><td><b>${escape(d.name)}</b><small>${escape(d.type)}</small></td><td>${escape(d.reference||"—")}</td><td>${escape(d.size)}</td><td><code>${escape(d.hash.slice(0,18))}…</code></td><td><span class="badge review">مسجل محليًا</span></td><td><button class="danger-button" data-delete="documents" data-id="${d.id}">حذف</button></td></tr>`);
    $("#documentTable").innerHTML=table(["التاريخ","الملف/النوع","المرجع","الحجم","SHA-256","الحالة",""],rows);
  }
  function renderAudit(){
    const rows=[...state.audit].reverse().map(a=>`<tr><td>${new Intl.DateTimeFormat("ar-SA",{dateStyle:"short",timeStyle:"short"}).format(new Date(a.at))}</td><td>${escape(a.actor)}</td><td><span class="badge">${escape(a.action)}</span></td><td>${escape(a.entity)}</td><td>${escape(a.detail||"—")}</td></tr>`);
    $("#auditTable").innerHTML=table(["الوقت","المنفذ","الإجراء","الكيان","التفاصيل"],rows);
  }
  function savings(){
    const groups={};state.quotes.forEach(q=>(groups[q.productId]??=[]).push(q));
    return Object.values(groups).filter(g=>g.length>1).map(g=>{const sorted=g.map(q=>({q,u:quoteUnit(q)})).sort((a,b)=>a.u-b.u),p=product(g[0].productId),qty=Math.max(...g.map(x=>Number(x.quantity)*Number(p?.standardQty||1)));return{name:p?.name||"—",supplier:supplier(sorted[0].q.supplierId)?.name||"—",best:sorted[0].u,saving:(sorted.at(-1).u-sorted[0].u)*qty};});
  }
  function exportData(){
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`osoul-command-center-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);audit("تصدير","نسخة احتياطية",a.download);localStorage.setItem(KEY,JSON.stringify(state));toast("تم تنزيل النسخة الاحتياطية");
  }
  function exportAudit(){
    const blob=new Blob([JSON.stringify(state.audit,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`osoul-audit-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast("تم تصدير سجل التدقيق");
  }
  async function registerDocument(){
    const file=$("#documentFile").files[0]; if(!file){toast("اختر ملفًا أولًا");return;}
    const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
    const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
    state.documents.push({id:uid(),name:file.name,type:$("#documentType").value,reference:$("#documentReference").value,size:`${(file.size/1024).toFixed(1)} KB`,mime:file.type,hash,createdAt:today()});
    $("#documentFile").value="";$("#documentReference").value="";
    save("تم تسجيل المستند وبصمته",{action:"إنشاء",entity:"مستند",detail:file.name});
  }
  function handleForm(form){
    const data=Object.fromEntries(new FormData(form)); const kind=form.dataset.form;
    if(kind==="supplier")state.suppliers.push({id:uid(),...data});
    if(kind==="product")state.products.push({id:uid(),...data,packPrice:+data.packPrice,standardQty:+data.standardQty,moq:+data.moq});
    if(kind==="quote")state.quotes.push({id:uid(),...data,quantity:+data.quantity,packPrice:+data.packPrice,discount:+data.discount,delivery:+data.delivery,taxRate:+data.taxRate});
    if(kind==="contract")state.contracts.push({id:uid(),...data,value:+data.value,noticeDays:+data.noticeDays,probability:+data.probability,impact:+data.impact,status:"open"});
    if(kind==="decision")state.decisions.push({id:uid(),...data,createdAt:today()});
    form.closest("dialog").close();form.reset();save("تم حفظ السجل",{action:"إنشاء",entity:kind,detail:data.name||data.subject||data.sku||""});
  }
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-view]");if(nav){$$(".nav-item,.view").forEach(x=>x.classList.remove("active"));nav.classList.add("active");$(`#view-${nav.dataset.view}`).classList.add("active");}
    const open=e.target.closest("[data-open]");if(open)document.getElementById(open.dataset.open).showModal();
    const action=e.target.closest("[data-action]")?.dataset.action;
    if(action==="seed"&&confirm("سيتم استبدال البيانات الحالية ببيانات تجريبية. متابعة؟"))seed();
    if(action==="export")exportData();
    if(action==="exportAudit")exportAudit();
    if(action==="registerDocument")registerDocument();
    if(action==="reset"&&confirm("حذف جميع بيانات هذه النسخة من الجهاز؟")){state=blank();save("تم مسح البيانات",{action:"مسح",entity:"قاعدة الجهاز"});}
    const del=e.target.closest("[data-delete]");if(del&&confirm("حذف هذا السجل؟")){state[del.dataset.delete]=state[del.dataset.delete].filter(x=>x.id!==del.dataset.id);save("تم حذف السجل",{action:"حذف",entity:del.dataset.delete,detail:del.dataset.id});}
  });
  $$("form[data-form]").forEach(form=>form.addEventListener("submit",e=>{e.preventDefault();handleForm(form);}));
  $$("[data-search], [data-filter]").forEach(el=>el.addEventListener("input",render));
  $("#restoreFile").addEventListener("change",async e=>{try{const parsed=JSON.parse(await e.target.files[0].text());if(!parsed.suppliers||!parsed.products)throw Error();state={...blank(),...parsed,version:11};save("تمت استعادة النسخة",{action:"استعادة",entity:"نسخة احتياطية"});}catch{toast("ملف النسخة غير صالح");}e.target.value="";});
  render();
})();
