import { uiText as tr } from './locale.js';

const reasons = {
  comparable: ['مطابق', 'Comparable'], unsupported_unit: ['وحدة غير مدعومة', 'Unit unsupported'],
  unknown_commercial_basis: ['أساس الضريبة أو النقل أو الخصم غير مكتمل', 'Tax, freight or discount basis unknown'],
  negative_net_amount: ['صافي البند سالب', 'Negative net total'], no_approved_item: ['لا مرجع معتمد للصنف', 'No approved item reference'],
  specification_mismatch: ['المواصفة مختلفة', 'Specification differs'], unit_mismatch: ['وحدات القياس غير متجانسة', 'Unit dimensions differ'],
  currency_mismatch: ['العملة مختلفة', 'Currency differs'], region_mismatch: ['منطقة التسليم مختلفة', 'Delivery region differs'],
  date_mismatch: ['المرجع خارج فترة الفاتورة', 'Outside reference validity'], quantity_mismatch: ['الكمية خارج الشريحة', 'Outside quantity tier']
};
function element(tag, text) {
  const el=document.createElement(tag);
  if(text!==undefined) el.textContent=text;
  return el;
}
function field(form, name, ar, en, type='text', required=true) {
  const label=element('label',tr(ar,en)), control=element(type==='select'?'select':'input');
  control.name=name;control.required=required;
  if(type!=='select'){control.type=type;if(type==='number'){control.min='0';control.step='any';}}
  label.append(control);form.append(label);return control;
}
function submit(form, ar, en) {
  const b=element('button',tr(ar,en));b.type='submit';form.append(b);return b;
}
function formData(form) {
  return Object.fromEntries(Array.from(new FormData(form),([k,v])=>[k,String(v).trim()||null]));
}
function makeTable(rows) {
  const table=element('table');const head=table.createTHead().insertRow();
  for(const [ar,en] of [['الفاتورة والبند','Invoice and line'],['الصنف والمواصفة','Item and specification'],['التاريخ','Invoice date'],
    ['وحدة المقارنة','Comparison unit'],['الشراء الصافي مع النقل','Net delivered purchase'],['المتوسط المعتمد','Approved mean'],['الفارق','Variance'],['مرجع مطابق','References'],['حالة المقارنة','Comparison']]){
    const th=element('th',tr(ar,en));th.scope='col';head.append(th);
  }
  const body=table.createTBody();
  const number=val=>val==null?'—':Number(val).toLocaleString(document.documentElement.lang,{maximumFractionDigits:6});
  for(const row of rows){
    const line=body.insertRow();const words=reasons[row.reason]||['تعذرت المقارنة','Unavailable'];
    for(const value of [row.invoice_ref+' · '+row.invoice_line,row.item_key+' · '+row.spec_key,row.purchased_on,
      [row.currency,row.base_unit].filter(Boolean).join(' / '),number(row.net_delivered_unit),number(row.approved_unit),
      row.difference_pct==null?'—':number(row.difference_pct)+'%',String(row.reference_count),tr(...words)]){
      line.insertCell().textContent=value;
    }
  }
  return table;
}
function readerError(result){if(result.error)throw new Error('unavailable');return result.data;}
function curatorPanel(client, checkScope, status) {
  const group=element('details');group.append(element('summary',tr('اعتماد مرجع مركزي','Approve a central reference')));
  const form=element('form');
  group.append(element('p',tr('اعتمد سعرًا صالحًا للمشاركة يدخل فيه النقل ويُستبعد منه الضريبة. يبقى مستند الاعتماد داخليًا.','Approve a shareable price including freight and excluding VAT. The approval evidence remains internal.')),form);
  for(const [k,ar,en] of [['item_key','رمز الصنف المعياري','Standard item code'],['spec_key','رمز المواصفة','Specification code'],['region','منطقة التسليم','Delivery region'],['currency','رمز العملة','Currency code'],['evidence_ref','مرجع الموافقة الداخلية','Internal approval evidence']]) field(form,k,ar,en);
  const unit=field(form,'base_unit','الوحدة القياسية','Base unit','select');
  for(const u of ['ea','kg','l','m'])unit.add(new Option(u,u));
  field(form,'delivered_net_unit_price','سعر الوحدة المعيارية مع النقل قبل الضريبة','Delivered net price per base unit','number');
  field(form,'min_qty','أدنى كمية معيارية','Minimum base quantity','number');
  field(form,'max_qty','أعلى كمية معيارية (اختياري)','Maximum base quantity (optional)','number',false);
  field(form,'valid_from','ساري من','Valid from','date');field(form,'valid_until','ساري حتى','Valid until','date');
  const b=submit(form,'اعتماد المرجع للمقارنة','Approve reference for comparison');
  form.addEventListener('submit',async e=>{e.preventDefault();if(b.disabled||!checkScope())return;b.disabled=true;
    try {const id=readerError(await client.rpc('draqon_approve_price_reference',{p_input:formData(form)}));
      if(checkScope()){form.reset();status.textContent=tr('اعتمد المرجع. احفظ معرفه لسحبه عند الحاجة. ','Reference approved. Keep the ID for retirement. ')+id;}
    } catch {if(checkScope())status.textContent=tr('تعذر تأكيد الاعتماد. تحقق من السجل قبل التكرار.','Approval not confirmed. Check the register before retrying.');} finally{b.disabled=false;}
  });
  const batch=element('form');
  const picker=field(batch,'staged','ملف المراجع المُراجع (JSON)','Reviewed reference file (JSON)','file');
  picker.accept='.json,application/json';const preview=element('div');batch.append(preview);
  const accept=submit(batch,'اعتماد المراجع المعروضة','Approve displayed references');accept.disabled=true;
  let staged=null,sequence=0;
  picker.addEventListener('change',async()=>{
    const current=++sequence;accept.disabled=true;staged=null;preview.replaceChildren();
    try {
      const file=picker.files?.[0];if(!file||file.size>300000)throw new Error();
      const values=JSON.parse(await file.text());
      if(!checkScope()||current!==sequence)return;
      if(!Array.isArray(values)||!values.length||values.length>200||values.some(r=>!r?.item_key||!r.spec_key||!r.evidence_ref))throw new Error();
      const rows=element('ul');
      for(const r of values)rows.append(element('li',[r.item_key,r.spec_key,r.region,r.currency,r.delivered_net_unit_price+'/'+r.base_unit,r.valid_from+'–'+r.valid_until].join(' · ')));
      preview.append(rows);staged=values;accept.disabled=false;
    } catch {if(checkScope()&&current===sequence)status.textContent=tr('اختر ملف مراجع صالحًا من أداة التهيئة.','Choose a valid file prepared by the staging utility.');}
  });
  batch.addEventListener('submit',async e=>{
    e.preventDefault();if(!staged||!checkScope()||accept.disabled)return;accept.disabled=true;
    try {const count=readerError(await client.rpc('draqon_approve_price_batch',{p_rows:staged}));
      if(checkScope()){status.textContent=tr('عولجت مراجع الأسعار المعتمدة: ','Approved references processed: ')+count;staged=null;preview.replaceChildren();batch.reset();}
    }catch{if(checkScope()){status.textContent=tr('تعذر تأكيد الدفعة. أعد تقديم الملف نفسه للتحقق.','Batch unconfirmed. Resubmit the same file to reconcile.');accept.disabled=false;}}
  });
  group.append(batch);
  return group;
}
export function setupFacilityBenchmark(client, panel) {
  const root=panel.querySelector('[data-content]'), org=document.getElementById('organization-select');
  let revision=0, enquiry=0, pendingSite='', identity=null;
  function reset(){revision++;enquiry++;pendingSite='';panel.open=false;root.replaceChildren();}
  async function load() {
    const organization=org.value;
    if(!panel.open||!organization)return;
    const version=++revision;
    const current=()=>version===revision&&organization===org.value&&panel.open;
    root.replaceChildren(element('p',tr('جارٍ تحميل المشتريات…','Loading purchases…')));
    try {
      const user=readerError(await client.auth.getUser()).user;
      const [sites,lines,catalog,operator,role]=await Promise.all([
        client.from('facilities').select('id,name').eq('organization_id',organization).order('name').limit(500),
        client.from('quote_lines').select('id,description,quantity,standard_qty,unit,pack_price,products(sku),quotes(currency,tax_rate)').eq('organization_id',organization).order('created_at',{ascending:false}).limit(100),
        client.rpc('draqon_price_catalog',{p_org:organization}),client.rpc('draqon_is_price_curator'),
        client.from('organization_members').select('role').eq('organization_id',organization).eq('user_id',user.id).eq('active',true).maybeSingle()
      ]);
      if(!current())return;
      const facilities=readerError(sites),quoteLines=readerError(lines),items=readerError(catalog);
      const canWrite=['owner','approver','analyst'].includes(readerError(role)?.role);
      const chosen=element('label',tr('المنشأة','Facility'));const select=element('select');chosen.append(select);
      select.add(new Option(tr('اختر المنشأة','Select facility'),''));
      facilities.forEach(f=>select.add(new Option(f.name,f.id)));
      const notice=element('p');notice.setAttribute('role','status');
      const results=element('div');results.className='table-wrap';results.style.overflowX='auto';
      const entry=element('details');entry.append(element('summary',tr('تسجيل بند شراء من فاتورة','Record an invoiced purchase line')));
      const input=element('form');entry.append(input);
      const lineSelect=field(input,'quote_line_id','تعبئة من عرض سابق (اختياري)','Prefill from a quotation (optional)','select',false);
      lineSelect.add(new Option(tr('إدخال الفاتورة مباشرة','Enter invoice directly'),''));
      quoteLines.forEach(x=>lineSelect.add(new Option(x.description,x.id)));
      field(input,'invoice_ref','مرجع الفاتورة الداخلي','Internal invoice reference');
      field(input,'invoice_line','رقم البند','Invoice line');
      field(input,'purchased_on','تاريخ الفاتورة','Invoice date','date');
      const item=field(input,'item_key','رمز الصنف المعياري','Standard item code');
      const spec=field(input,'spec_key','رمز المواصفة','Specification code');
      if(items.length){
        const list=element('datalist');list.id='facility-benchmark-items';
        for(const key of new Set(items.map(x=>x.item_key)))list.append(new Option(key,key));
        input.append(list);item.setAttribute('list',list.id);
        const specs=element('datalist');specs.id='facility-benchmark-specs';spec.setAttribute('list',specs.id);input.append(specs);
        item.addEventListener('input',()=>specs.replaceChildren(...items.filter(x=>x.item_key===item.value).map(x=>new Option(x.spec_key,x.spec_key))));
      }
      field(input,'region','منطقة التسليم','Delivery region');field(input,'currency','رمز العملة','Currency code');
      field(input,'unit','وحدة محتوى العبوة (مثلاً kg أو ml أو ea)','Pack contents unit (e.g. kg, ml, ea)');
      field(input,'packs','عدد العبوات المشتراة','Packs purchased','number');field(input,'units_per_pack','الكمية في العبوة','Contents per pack','number');
      field(input,'pack_price','سعر العبوة في الفاتورة','Invoice price per pack','number');
      const vat=field(input,'vat_mode','أساس سعر العبوة','Pack price VAT basis','select');
      for(const [k,ar,en] of [['unknown','غير معلوم','Unknown'],['excluded','قبل الضريبة','Excluding VAT'],['included','يشمل الضريبة','Including VAT']])vat.add(new Option(tr(ar,en),k));
      field(input,'tax_pct','ضريبة سعر العبوة (%)','Pack VAT rate (%)','number',false);
      field(input,'freight_net','نقل هذا البند قبل الضريبة','Net freight allocated to this line','number',false);
      field(input,'discount_net','خصم هذا البند قبل الضريبة','Net discount allocated to this line','number',false);
      input.append(element('p',tr('أدخل صفرًا عند التأكد من انعدام النقل أو الخصم. اترك التكلفة غير المؤكدة فارغة. راجع الكمية والسعر مقابل الفاتورة قبل الحفظ.','Enter zero only when freight or discount is confirmed zero. Leave unknown amounts blank. Verify the price and quantity against the invoice before saving.')));
      const save=submit(input,'حفظ بند الفاتورة','Save invoice line');
      lineSelect.addEventListener('change',()=>{
        const row=quoteLines.find(x=>x.id===lineSelect.value);if(!row)return;
        for(const [key,val] of Object.entries({packs:row.quantity,units_per_pack:row.standard_qty,unit:row.unit,pack_price:row.pack_price,currency:row.quotes?.currency,tax_pct:row.quotes?.tax_rate})){
          input.elements.namedItem(key).value=val??'';
        }
      });
      async function list() {
        const id=select.value,request=++enquiry;results.replaceChildren();entry.hidden=!id||!canWrite;
        if(!id)return;
        try{const rows=readerError(await client.rpc('draqon_facility_price_benchmark',{p_org:organization,p_facility:id}));
          if(!current()||request!==enquiry||select.value!==id)return;
          results.replaceChildren(rows.length?makeTable(rows):element('p',tr('لم تسجل بنود شراء لهذه المنشأة.','No invoiced purchases for this facility.')));
        }catch{if(current()&&request===enquiry)notice.textContent=tr('تعذر تحميل المقارنة.','Could not load comparison.');}
      }
      let retry=null;
      input.addEventListener('input',()=>{retry=null;});
      input.addEventListener('submit',async e=>{
        e.preventDefault();const id=select.value;if(!id||!current()||save.disabled)return;
        retry??=crypto.randomUUID();const key=retry;save.disabled=true;
        try{readerError(await client.rpc('draqon_record_facility_purchase',{p_org:organization,p_facility:id,p_input:{...formData(input),id:key}}));
          if(current()&&select.value===id){if(retry===key){input.reset();retry=null;}notice.textContent=tr('حُفظ بند الشراء.','Purchase line saved.');await list();}
        }catch{if(current()&&select.value===id)notice.textContent=tr('تعذر تأكيد الحفظ. راجع حالة الفاتورة قبل تعديل المدخلات.','Save not confirmed. Check the invoice before editing your entry.');}
        finally{save.disabled=false;}
      });
      select.addEventListener('change',()=>{input.reset();entry.open=false;retry=null;notice.textContent='';void list();});
      const scopeNote=element('p',tr('أحدث ٢٠٠ بند فاتورة. المرجع متوسط الأسعار المعتمدة المطابقة في بنك أصول، محسوب على وحدة واحدة بعد النقل وقبل الضريبة.','Latest 200 invoice lines. The reference is the mean of matching approved Osoul prices per base unit, including freight and excluding VAT.'));
      root.replaceChildren(chosen,scopeNote,notice,results,entry);
      if(readerError(operator))root.append(curatorPanel(client,current,notice));
      if(facilities.some(x=>x.id===pendingSite))select.value=pendingSite;
      else if(facilities.length===1)select.value=facilities[0].id;
      pendingSite='';await list();
    }catch{if(current())root.replaceChildren(element('p',tr('تعذر تحميل سجل المشتريات.','Could not load purchasing records.')));}
  }
  org.addEventListener('change',reset);
  client.auth.onAuthStateChange((event,session)=>{const uid=session?.user?.id??null;
    if(event==='SIGNED_OUT'||(identity!==null&&uid!==identity))reset();identity=uid;
  });
  panel.addEventListener('toggle',()=>{if(panel.open)void load();else{revision++;enquiry++;root.replaceChildren();}});
  document.addEventListener('draqon:facility-focus',e=>{
    const d=e.detail||{};if(d.panelId!==panel.id||d.orgId!==org.value)return;
    pendingSite=d.facilityId;if(panel.open)void load();else panel.open=true;
  });
}
