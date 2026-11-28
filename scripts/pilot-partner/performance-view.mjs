import {asOf,baseRate,comparePeriod,forecast,months} from './performance-model.mjs';

export function makePerformance(sites,en,onSite){
  const t=(ar,english)=>en?english:ar;
  const fmt=new Intl.NumberFormat(en?'en-GB':'ar-SA-u-nu-latn',{maximumFractionDigits:0});
  const num=n=>fmt.format(n), cash=n=>num(n)+' '+t('ر.س','SAR');
  const date=(value,opts={day:'numeric',month:'long'})=>new Intl.DateTimeFormat(en?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{...opts,timeZone:'Asia/Riyadh'}).format(new Date(value+'T12:00:00Z'));
  const mname=value=>date(value+'-01',{month:'long',year:'numeric'});
  const h=(tag,content,cls='')=>'<'+tag+(cls?' class="'+cls+'"':'')+'>'+content+'</'+tag+'>';
  const venue=code=>sites.find(s=>s.code===code);
  const codeList=sites.map(s=>s.code);
  const districts={court:t('حي الفناء','Courtyard district'),garden:t('حي الحدائق','Garden district'),terrace:t('حي الشرفات','Terraces district'),horizon:t('حي الأفق','Horizon district'),showcase:t('حي العرض','Showcase district')};
  const state={month:months.at(-1),night:0,rates:new Map()};
  const money=t('ر.س','SAR');
  const labels={sales:t('المبيعات والتسعير','Sales & pricing'),maintenance:t('أداء الصيانة','Maintenance performance'),risk:t('المخاطر والفرص','Risks & opportunities')};
  const chartLabels={revenue:t('إيراد الإقامة','Room revenue'),maintenance:t('مصروف الصيانة','Maintenance spending'),offline:t('ليالي الوحدات خارج الخدمة','Offline unit nights')};
  function kpi(title,value,old,unit='',goodWhenHigher=true){
    const change=value-old, sign=change>0?'+':'';
    const changeLabel=h('bdi',sign+num(change)+(unit==='%'?' '+t('نقطة مئوية','pp'):unit?' '+unit:''))+' '+t('عن الفترة السابقة','vs prior period');
    return '<article class="perf-stat">'+h('span',title)+h('strong',h('bdi',num(value)+(unit?' '+unit:'')))+h('small',changeLabel,change===0?'neutral':((change>0)===goodWhenHigher?'favorable':'unfavorable'))+'</article>';
  }
  function comparison(d,key){
    const max=Math.max(1,...d.weeks.concat(d.priorWeeks).map(w=>w[key]));
    const bars=d.weeks.map((w,i)=>{
      const a=w[key],b=d.priorWeeks[i][key];
      return '<div class="perf-week">'+h('span',(i*7+1)+'–'+(i*7+7))+
        '<div class="perf-bar-pair"><div><i style="width:'+a/max*100+'%"></i></div><div><i style="width:'+b/max*100+'%"></i></div></div>'+
        '<div class="perf-week-values"><bdi>'+num(a)+'</bdi><small>'+num(b)+'</small></div></div>';
    }).join('');
    return h('section',h('h3',chartLabels[key]+' · '+t('مقارنة أسبوعية','weekly comparison'))+
      '<p class="perf-legend"><span>'+mname(state.month)+'</span><span>'+mname(d.prior)+'</span></p>'+bars,'perf-panel');
  }
  function response(heading,items){
    return h('section',h('h3',heading)+items.map(([title,body,owner])=>
      h('article',h('h4',title)+h('p',body)+h('small',t('المسؤول','Owner')+' · '+owner),'perf-response')).join(''),'perf-panel');
  }
  function sales(d){
    const a=d.current,b=d.previous;
    return '<div class="perf-stat-grid">'+kpi(t('إيراد الإقامة','Room revenue'),a.revenue,b.revenue,money)+kpi(t('إشغال الليالي المتاحة','Available-night occupancy'),a.occupancy,b.occupancy,'%')+
      kpi(t('متوسط سعر الليلة المباعة','Average daily rate'),a.adr,b.adr,money)+kpi(t('الإيراد لكل ليلة متاحة','Revenue per available night'),a.revpar,b.revpar,money)+'</div>'+
      h('div',comparison(d,'revenue')+h('section',h('h3',t('الليالي التي كوّنت الإيراد','How revenue was earned'))+
        '<dl class="perf-ledger">'+[[t('ليالي الوحدات المتاحة للبيع','Available unit nights'),a.available],[t('الليالي المباعة','Nights sold'),a.sold],[t('ليالي الوحدات خارج الخدمة','Offline unit nights'),a.offline]].map(([key,v])=>h('div',h('dt',key)+h('dd',num(v)))).join('')+'</dl>'+
        h('p',t('الإشغال = الليالي المباعة ÷ الليالي المتاحة. تُستبعد الوحدات خارج الخدمة من المعروض وتُحسب أسعار الليالي من إيراد الإقامة فقط.','Occupancy is sold nights divided by available nights. Offline capacity is excluded. Rates use room revenue only.'),'perf-note'),'perf-panel'),'perf-pair');
  }
  function maintenance(d){
    const a=d.current,b=d.previous;
    return '<div class="perf-stat-grid">'+kpi(t('مصروف الصيانة','Maintenance spending'),a.maintenance,b.maintenance,money,false)+kpi(t('البلاغات المفتوحة خلال الفترة','Tickets raised in period'),a.opened,b.opened,'',false)+kpi(t('بلاغات أعيد فتحها','Reopened tickets'),a.repeat,b.repeat,'',false)+kpi(t('بلاغات تجاوزت موعدها','Tickets past due in period'),a.overdue,b.overdue,'',false)+'</div>'+
      h('div',comparison(d,'maintenance')+response(t('إجراءات المشغّل','Operator actions'),[
        [t('استعادة الليالي المتاحة','Recover available nights'),t('سجّل السيناريو ','The scenario recorded ')+num(a.offline)+t(' ليلة وحدة خارج الخدمة. طابق سجل الإغلاق ببلاغات الإصلاح قبل إعادة فتح الوحدات للحجز.',' offline unit nights. Match offline entries to repair tickets before returning units to sale.'),t('مدير المنشأة','Facility manager')],
        [t('تحقق من جودة الإصلاح','Verify repair quality'),t('راجع سبب إعادة فتح ','Review the cause of ')+num(a.repeat)+t(' بلاغًا، واربط الفحص الفني بأمر العمل قبل اعتماد الإغلاق.',' reopened tickets and attach inspection evidence before closure.'),t('مشرف الجودة','Quality supervisor')]
      ]),'perf-pair');
  }
  function risk(d){
    const a=d.current,b=d.previous;
    const roleOps=t('مدير العمليات','Operations manager'), roleSales=t('مدير الإيرادات','Revenue manager');
    const narrative=[
      [t('قوة · طلب الإقامة','Strength · room demand'),t('بيعت ','The scenario sold ')+num(a.sold)+t(' ليلة. حدّد الأيام التي تحافظ على هذا الطلب قبل تعديل السعر.',' nights. Identify which days sustain that demand before varying rates.'),roleSales],
      [t('ضعف · التوقف التشغيلي','Weakness · offline capacity'),num(a.offline)+t(' ليلة خارج الخدمة تحد من المعروض. أعطِ الإصلاحات ذات الأثر على إتاحة الوحدات أولوية.',' offline nights reduce supply. Prioritise repairs that can return units to sale.'),roleOps],
      [t('فرصة · مخزون غير مباع','Opportunity · unsold inventory'),num(a.available-a.sold)+t(' ليلة متاحة لم تُبع. اختبر عرضًا في الأيام الأضعف وقِس أثره على الإيراد لكل ليلة متاحة.',' available nights went unsold. Test an offer on softer days and measure its effect on revenue per available night.'),roleSales],
      [t('تهديد · تكرار الأعطال','Threat · recurring failures'),num(a.repeat)+t(' بلاغًا أعيد فتحه. راجع عينة مع مقدم الخدمة وتحقق من معالجة السبب قبل الإغلاق التالي.',' reopened tickets. Review a sample with the provider and verify the cause is addressed before the next closure.'),t('مدير جودة الخدمة','Service quality manager')]
    ];
    return '<div class="perf-stat-grid">'+kpi(t('ليالي الوحدات خارج الخدمة','Offline unit nights'),a.offline,b.offline,'',false)+kpi(t('ليالي متاحة لم تُبع','Unsold nights'),a.available-a.sold,b.available-b.sold,'',false)+kpi(t('إعادة فتح البلاغات','Reopened tickets'),a.repeat,b.repeat,'',false)+kpi(t('بلاغات تجاوزت موعدها','Overdue tickets'),a.overdue,b.overdue,'',false)+'</div>'+
      h('div',comparison(d,'offline')+response(t('تحليل SWOT وخطة الاستجابة','SWOT and response plan'),narrative),'perf-pair');
  }
  function pricing(code){
    if(!code)return '<section class="perf-panel"><h3>'+t('توقعات التسعير حسب المنشأة','Property-level pricing outlook')+'</h3><p>'+t('اختر منشأة لمقارنة سعر الليلة المعروضة مع خمس وحدات تجريبية من الفئة والحي نفسيهما.','Choose a property to compare the nightly rate with five fictional listings of the same district and class.')+'</p><label for="revenue-drill">'+t('حدد منشأة','Select a property')+'</label><select id="revenue-drill"><option value="">'+t('اختر المنشأة','Choose property')+'</option>'+sites.map(s=>'<option value="'+s.code+'">'+s.name+'</option>').join('')+'</select></section>';
    const rate=state.rates.get(code)??baseRate(code), f=forecast(code,rate), x=f[state.night];
    const reason=x.suggested>rate?t('الإشغال المحجوز والطلب الحديث مرتفعان، والسعر ضمن النطاق المقبول للمقارنة.','Booked occupancy and recent pickup are strong, and the trial rate is near or below the district median.'):
      x.suggested<rate?t('الطلب الحديث ضعيف وتوجد سعة، والسعر قريب من وسيط الحي أو أعلى منه.','Recent pickup is soft, spare capacity remains and the trial rate is near or above the district median.'):
      t('مؤشرات الطلب أو سعر المقارنة لا تدعم تغيير السعر ضمن قواعد التجربة.','Demand or comparative rate signals do not support a change under the trial rules.');
    const stat=(title,val)=>h('div',h('dt',title)+h('dd',val));
    return '<section id="rate-lab" class="perf-panel rate-lab"><div class="perf-rate-head"><div>'+h('p',t('آخر لقطة للحجوزات · ','Booking snapshot · ')+date(asOf),'perf-tag')+h('h3',t('توقع سبع ليالٍ وتسعيرها','Seven-night pricing outlook'))+'</div><form id="rate-trial"><label for="trial-rate">'+t('السعر التجريبي (ر.س)','Trial rate (SAR)')+'</label><div><input id="trial-rate" type="number" required min="120" max="900" step="1" value="'+rate+'"><button>'+t('احسب','Calculate')+'</button></div></form></div>'+
    h('p',t('مجموعة المقارنة التجريبية · ','Fictional comparison set · ')+districts[code]+' · '+t('استوديو، ليلة واحدة، إلغاء مرن، قبل الضريبة.','studio, one night, flexible cancellation, before tax.')+' '+t('توقع توضيحي باستخدام بيانات حجز مصطنعة. يغيّر الحساب السيناريو داخل هذه الجلسة فقط.','Illustrative outlook from synthetic booking records. Recalculation changes this session’s scenario only.'),'perf-note')+
    '<div class="perf-nights" aria-label="'+t('الليالي المتوقعة','Forecast nights')+'">'+f.map((row,i)=>'<button type="button" data-night="'+i+'" aria-pressed="'+(i===state.night)+'">'+h('span',date(row.date,{weekday:'short'}))+h('strong',date(row.date,{day:'numeric',month:'short'}))+h('span',cash(row.suggested))+'</button>').join('')+'</div>'+
    '<div class="perf-rate-body"><article class="rate-decision">'+h('p',date(x.date,{weekday:'long',day:'numeric',month:'long'}),'perf-tag')+h('h4',t('سعر الليلة المقترح','Suggested nightly rate'))+h('strong',cash(x.suggested))+h('p',reason)+h('small',t('صاحب القرار · مدير الإيرادات','Decision owner · Revenue manager'))+'</article>'+
    '<dl class="perf-ledger">'+stat(t('محجوز / متاح للبيع','Booked / available'),x.booked+' / '+x.available)+stat(t('صافي الحجوزات خلال 72 ساعة','Net bookings in 72 hours'),num(x.pickup72))+stat(t('أسعار مقارنة الحي والوسيط','District rates and median'),x.district.map(num).join(' · ')+' / '+cash(x.median))+stat(t('نطاق الليالي المباعة المتوقع','Projected sold nights'),num(x.soldLow)+'–'+num(x.soldHigh))+stat(t('نطاق إيراد الليلة المتوقع','Projected night revenue'),cash(x.revenueLow)+' – '+cash(x.revenueHigh))+'</dl></div>'+
    '<details class="perf-method"><summary>'+t('كيف حُسب التوقع والسعر؟','How are the forecast and rate calculated?')+'</summary><p>'+t('تقارن المحاكاة خمس وحدات تدريبية مماثلة من حيث الحي والفئة وشروط البيع. يزيد السعر 5 ريالات إذا بلغ الإشغال المحجوز 74%، وبلغ صافي الحجوزات الحديثة 6.5% من المعروض على الأقل، ولم يتجاوز السعر 105% من وسيط المقارنة. ينخفض 5 ريالات إذا قل الإشغال عن 64%، وكان صافي الحجوزات 8.5% من المعروض أو أقل بعد التقريب لأعلى، وبلغ السعر 95% من الوسيط على الأقل. يبقى السعر بين 120 و900 ريال.','Five fictional district listings share the same unit class and sale terms. The rate rises by SAR 5 when booked occupancy is at least 74%, recent net pickup is at least 6.5% of capacity, and the trial rate is at most 105% of the median. It falls by SAR 5 when occupancy is below 64%, pickup is at most 8.5% of capacity rounded up, and the rate is at least 95% of the median. Allowed rates are SAR 120–900.')+'</p><p>'+t('يضاف إلى الحجوزات المؤكدة أصغر وأكبر نمو إضافي مسجل خلال أربع ليالٍ مماثلة من نوفمبر، بعد ترجيح النمو بحسب عدد الأيام المتبقية للبيع (من 62.5% لليلة الغد إلى 107.5% بعد أسبوع)، وضمن الوحدات المتبقية. يجمع الإيراد قيمة المحجوز سابقًا مع قيمة الليالي الإضافية بالسعر المقترح. لا يقدّر النموذج أثر السعر على الطلب، والعينة محدودة.','The projection adds the minimum and maximum final pickup from four matching weekdays in November to firm bookings, weighted for the remaining sales window (62.5% for tomorrow to 107.5% for day seven) and capped by remaining inventory. Revenue preserves booked rates and prices only additional nights at the suggestion. Price elasticity is unmodelled and the sample is small.')+'</p></details></section>';
  }
  function show(container,mode,code,focus){
    const d=comparePeriod(code?[code]:codeList,state.month);
    container.innerHTML='<section class="perf-shell"><div class="perf-heading"><div>'+h('p',code?venue(code).name:t('جميع المنشآت','Whole portfolio'),'perf-tag')+h('h2',labels[mode])+'</div><label>'+t('فترة المقارنة','Comparison period')+'<select id="performance-month">'+months.slice(1).reverse().map(m=>'<option value="'+m+'" '+(m===state.month?'selected':'')+'>'+mname(m)+'</option>').join('')+'</select></label></div>'+
      h('p',t('مقارنة الأيام 1–28 من ','Comparing days 1–28 of ')+mname(state.month)+t(' والفترة نفسها من ',' with the same dates of ')+mname(d.prior)+' · '+t('سجلات تجريبية','Synthetic records'),'perf-context')+
      (mode==='sales'?sales(d)+pricing(code):mode==='maintenance'?maintenance(d):risk(d))+'</section>';
    const refresh=target=>show(container,mode,code,target);
    container.querySelector('#performance-month').onchange=e=>{state.month=e.target.value;refresh('#performance-month')};
    container.querySelector('#revenue-drill')?.addEventListener('change',e=>{if(e.target.value)onSite(e.target.value)});
    container.querySelector('#rate-trial')?.addEventListener('submit',e=>{e.preventDefault();state.rates.set(code,Number(container.querySelector('#trial-rate').value));refresh('#trial-rate')});
    container.querySelectorAll('[data-night]').forEach(button=>{button.onclick=()=>{state.night=Number(button.dataset.night);refresh('[data-night="'+state.night+'"]')}});
    if(focus)container.querySelector(focus)?.focus({preventScroll:true});
  }
  return show;
}
