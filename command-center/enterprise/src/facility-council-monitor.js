import {uiText as tr} from './locale.js';

const labels={
  occupancy_pct:['إشغال الغرف','Room occupancy'],lead_conversion_pct:['تحويل فرص البيع','Lead conversion'],
  qualified_leads:['فرص البيع المؤهلة','Qualified leads'],guest_complaints:['شكاوى النزلاء','Guest complaints'],
  cash_balance_sar:['الرصيد النقدي','Cash balance'],operating_cost_sar:['تكلفة التشغيل','Operating cost'],
  capex_variance_sar:['انحراف الإنفاق الرأسمالي','Capital spending variance'],late_milestones:['المراحل المتأخرة','Late milestones'],
  overdue_pm:['الصيانة الوقائية المتأخرة','Overdue preventive maintenance'],repeat_faults:['الأعطال المتكررة','Repeat faults'],
  energy_kwh:['استهلاك الطاقة','Energy use'],staff_shortfall:['العجز في الطاقم','Staff shortfall'],
  vendor_sla_pct:['التزام الموردين بمستوى الخدمة','Vendor SLA attainment'],compliance_open:['ملاحظات الامتثال المفتوحة','Open compliance items']
};
const states={no_records:['لم يُسجل شهر مكتمل','No closed-month records'],outdated:['آخر شهر مسجل أقدم من المطلوب','Latest month is stale'],
  partial:['أدلة الشهر غير مكتملة','Partial monthly evidence'],verified:['تغطية الشهر مكتملة','Monthly coverage complete'],conflict:['تعارض في أدلة الشهر','Conflicting monthly evidence']};
function txt(words){return tr(words[0],words[1]);}
function el(tag,text){const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;}
function metricName(key){return labels[key]?txt(labels[key]):key;}
function signalText(s){
  switch(s.code){
    case 'pm_due':return tr('خطط صيانة مستحقة حتى يوم الرصد','Maintenance plans due by the observation day')+' · '+s.count;
    case 'pm_overdue':return tr('منها خطط متأخرة','Of these, overdue plans')+' · '+s.count;
    case 'monthly_missing':return tr('بيانات الشهر المطلوب غائبة','Expected month missing')+' · '+s.month;
    case 'monthly_partial':return tr('مؤشرات الشهر الموثقة','Verified monthly indicators')+' · '+s.verified+'/'+s.expected;
    case 'monthly_conflicts':return tr('فترات مؤشرات ذات أدلة متعارضة','Metric periods with conflicting evidence')+' · '+s.count;
    case 'metric_below_minimum':case 'metric_above_maximum':
      return metricName(s.metric)+' · '+s.value+' · '+(s.code==='metric_below_minimum'?tr('أقل من الحد الأدنى','below approved minimum'):tr('أعلى من الحد الأقصى','above approved maximum'))+' '+s.bound+' · '+s.month;
    case 'forecast_below_minimum':case 'forecast_above_maximum':
      return tr('خطر متوقع','Forecast risk')+' · '+metricName(s.metric)+' · '+s.nextMonth+' · '+s.estimate+' · '+
        (s.code==='forecast_below_minimum'?tr('أدنى من الحد','below bound'):tr('أعلى من الحد','above bound'))+' '+s.bound+
        ' · '+tr('المصادر حتى','Sources through')+' '+s.sourceThrough+' · '+tr('متوسط الخطأ المطلق','Mean absolute error')+' '+s.mae;
    default:return s.code;
  }
}
function snapshotView(r){
  const wrap=el('div'), local=new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}).format(new Date(r.observedAt));
  wrap.append(el('p',r.businessDay+' · '+local+' ('+tr('توقيت الرياض','Riyadh time')+') · '+(r.runSource==='scheduled'?tr('تشغيل مجدول','Scheduled run'):tr('تشغيل يدوي','Manual run'))));
  const h=r.sourceHealth;
  wrap.append(el('p',txt(states[h.state]||states.no_records)+' · '+tr('الشهر المطلوب','Expected month')+' '+h.expectedMonth+
    ' · '+tr('أحدث شهر مسجل','Latest recorded month')+' '+(r.latestClosedMonth||'—')+' · '+h.verifiedMetrics+'/'+h.expectedMetrics));
  if(r.signals.length){
    const list=el('ul');for(const s of r.signals)list.append(el('li',signalText(s)));wrap.append(list);
  }else wrap.append(el('p',tr('لم ترصد القواعد إشارة في هذه اللقطة.','No rule raised a signal in this snapshot.')));
  const forecasts=(r.outlook||[]).filter(o=>o.status==='forecast');
  if(forecasts.length){
    const details=el('details');details.append(el('summary',tr('التوقعات المحفوظة لهذا اليوم','Forecasts saved on this day')));
    const list=el('ul');for(const f of forecasts)list.append(el('li',metricName(f.metric)+' · '+f.nextMonth+' · '+f.estimate+
      ' · '+tr('خطأ تاريخي / خط أساس','Historical error / baseline')+' '+f.mae+' / '+f.baselineMae));details.append(list);wrap.append(details);
  }
  return wrap;
}
export function setupFacilityCouncilMonitor(client,panel){
  if(!panel)return;
  const root=panel.querySelector('[data-content]'),org=document.getElementById('organization-select');
  let generation=0,request=0,requestedFacility='',identity=null;
  const reset=()=>{generation++;request++;requestedFacility='';panel.open=false;root.replaceChildren();};
  async function open(){
    const organization=org.value,g=++generation;
    if(!organization||!panel.open)return;
    const current=()=>generation===g&&panel.open&&org.value===organization;
    root.replaceChildren(el('p',tr('جارٍ تحميل المنشآت…','Loading facilities…')));
    const label=el('label',tr('المنشأة','Facility')),choose=el('select');label.append(choose);
    const message=el('p');message.setAttribute('role','status');const result=el('div');
    try{
      const {data,error}=await client.from('facilities').select('id,name').eq('organization_id',organization).order('name').limit(500);
      if(!current())return;if(error)throw error;
      choose.add(new Option(tr('اختر المنشأة','Choose facility'),''));
      for(const site of data)choose.add(new Option(site.name,site.id));
      if(data.some(s=>s.id===requestedFacility))choose.value=requestedFacility;else if(data.length===1)choose.value=data[0].id;
      requestedFacility='';
      root.replaceChildren(label,message,result);
    }catch{if(current())root.replaceChildren(el('p',tr('تعذر تحميل المنشآت.','Facilities could not be loaded.')));return;}
    async function refresh(feedback=''){
      const site=choose.value,n=++request;result.replaceChildren();message.textContent=feedback;
      if(!site)return;
      const valid=()=>current()&&request===n&&choose.value===site;
      try{
        const args={p_org:organization,p_facility:site};
        const r=await client.rpc('facility_council_monitor_status',args);if(!valid())return;if(r.error)throw r.error;
        const d=r.data,actions=el('fieldset');actions.append(el('legend',tr('إدارة الرصد','Manage monitoring')));
        const scheduler=d.scheduler==='installed'?tr('المجدول مسجل','Scheduler registered'):d.scheduler==='unavailable'?tr('المجدول غير متاح','Scheduler unavailable'):tr('المجدول غير مفعل','Scheduler not active');
        result.append(el('p',(d.enabled?tr('الرصد مفعّل','Monitoring enabled'):tr('الرصد متوقف','Monitoring disabled'))+' · '+scheduler));
        result.append(el('p',tr('يفحص المجدول المنشآت المشتركة كل ساعة ويحفظ أول نتيجة لكل يوم بتوقيت الرياض. يحفظ الرصد القياسات والتوقعات المقبولة وقت التنفيذ، وتُحدَّث دراسة المجلس عند فتحها.','The scheduler checks enrolled facilities hourly and saves the first result for each Riyadh day. Each snapshot saves observed facts and eligible forecasts at run time; opening the council study recalculates its outlook.')));
        if(d.lastFailure&&!d.lastFailure.recoveredAt)result.append(el('p',tr('أحدث محاولة دورية متعثرة','Latest failed scheduled attempt')+' · '+d.lastFailure.businessDay+' · '+d.lastFailure.attempts));
        if(d.latest)result.append(el('h4',tr('آخر رصد مسجل','Latest recorded observation')),snapshotView(d.latest));
        else result.append(el('p',tr('لا توجد لقطة مسجلة لهذه المنشأة.','No saved observation for this facility.')));
        if(d.history.length>1){
          const section=el('details');section.append(el('summary',tr('سجل الرصد السابق','Previous observations')));
          for(const h of d.history.slice(1))section.append(snapshotView(h));result.append(section);
        }
        if(d.limits.length){const list=el('ul');for(const l of d.limits)list.append(el('li',metricName(l.metric)+' · '+tr('من','From')+' '+(l.minimum??'—')+' '+tr('إلى','to')+' '+(l.maximum??'—')));result.append(el('h4',tr('الحدود المعتمدة للمنشأة','Approved site thresholds')),list);}
        if(!d.canManage)return;
        async function perform(name,fields,feedback){
          if(!valid()||actions.disabled)return;actions.disabled=true;
          try{const rpc=await client.rpc(name,{...args,...fields});if(!valid())return;if(rpc.error)throw rpc.error;
            await refresh(feedback);
          }catch{if(valid()){actions.disabled=false;message.textContent=tr('تعذر تأكيد الإجراء. أعد تحميل الرصد للتحقق من حالته.','Action unconfirmed. Reload monitoring to reconcile its state.');}}
        }
        const toggle=el('button',d.enabled?tr('إيقاف رصد هذه المنشأة','Stop monitoring this facility'):tr('تفعيل رصد هذه المنشأة','Enable monitoring for this facility'));
        toggle.type='button';toggle.addEventListener('click',()=>perform('facility_council_monitor_set',{p_enabled:!d.enabled},tr('حُدّث إعداد الرصد.','Monitoring setting updated.')));actions.append(toggle);
        if(d.enabled){
          const run=el('button',tr('تسجيل رصد اليوم','Capture today’s observation'));run.type='button';
          run.addEventListener('click',()=>perform('facility_council_monitor_run',{},tr('تم التحقق من لقطة اليوم.','Today’s snapshot is confirmed.')));actions.append(run);
          const form=el('form'),selection=el('select'),metric=el('label',tr('المؤشر','Indicator'));
          for(const m of d.metrics)selection.add(new Option(metricName(m.metric)+' · '+m.unit,m.metric));
          metric.append(selection);form.append(metric);
          const bound=(ar,en)=>{const label=el('label',tr(ar,en)),input=el('input');input.type='number';input.step='any';label.append(input);form.append(label);return input;};
          const lo=bound('الحد الأدنى المعتمد','Approved minimum'),hi=bound('الحد الأقصى المعتمد','Approved maximum');
          function selected(){const limit=d.limits.find(l=>l.metric===selection.value);lo.value=limit?.minimum??'';hi.value=limit?.maximum??'';}
          selection.addEventListener('change',selected);selected();
          const submit=el('button',tr('حفظ حدود المؤشر','Save indicator thresholds'));submit.type='submit';form.append(submit);
          form.append(el('p',tr('اترك الحدين فارغين لسحب قاعدة المؤشر. تنطبق التعديلات على اللقطات الجديدة.','Clear both bounds to withdraw the rule. Changes apply to new snapshots.')));
          form.addEventListener('submit',e=>{e.preventDefault();if(lo.value&&hi.value&&Number(lo.value)>Number(hi.value)){message.textContent=tr('تحقق من ترتيب الحدين.','Check the order of the bounds.');return;}
            void perform('facility_council_monitor_limit',{p_metric:selection.value,p_min:lo.value||null,p_max:hi.value||null},tr('حُدّثت قاعدة المؤشر.','Indicator rule updated.'));});
          actions.append(form);
        }
        result.append(actions);
      }catch{if(valid())message.textContent=tr('تعذر تحميل الرصد.','Monitoring status could not be loaded.');}
    }
    choose.addEventListener('change',()=>{void refresh();});await refresh();
  }
  org.addEventListener('change',reset);
  panel.addEventListener('toggle',()=>{if(panel.open)void open();else{generation++;request++;root.replaceChildren();}});
  document.addEventListener('draqon:facility-focus',e=>{
    const d=e.detail||{};if(d.panelId!==panel.id||d.orgId!==org.value)return;
    requestedFacility=d.facilityId;if(panel.open)void open();else panel.open=true;
  });
  client.auth.onAuthStateChange((event,session)=>{const uid=session?.user?.id||null;if(event==='SIGNED_OUT'||(identity!==null&&uid!==identity))reset();identity=uid;});
}
