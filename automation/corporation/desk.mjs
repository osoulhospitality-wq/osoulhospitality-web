import {AGENTS} from './registry.mjs';
import {groups,kpis} from './kpis.mjs';
import {feeds,readSnapshot} from './desk-evidence.mjs';
const $=id=>document.getElementById(id);
let lang='ar',snapshot=null,notice='',version=0;
const t=(ar,en)=>lang==='ar'?ar:en;
const cadence={day:['يومي','Daily'],week:['أسبوعي','Weekly'],month:['شهري','Monthly']};
const names={decisions:['الاعتمادات والقرارات','Approvals and decisions'],tasks:['المهام','Tasks'],projects:['المشاريع','Projects'],risks:['المخاطر','Risks'],content:['تقويم الحملات والمنشورات','Campaign and publishing calendar'],integrations:['الاتصالات والأنظمة','Integrations and systems'],agents:['أداء الوكلاء','Agent performance'],events:['سجل الأعمال والقرارات','Action and decision log'],alerts:['التنبيهات','Alerts']};
const states={pending:['معلق','Pending'],blocked:['متعثر','Blocked'],in_progress:['جارٍ','In progress'],completed:['مكتمل','Completed'],failed:['فشل','Failed'],scheduled:['مجدول','Scheduled'],paused:['موقوف','Paused'],measured:['مقاس','Measured'],unverified:['غير متحقق','Unverified']};
const messages={invalid:['تعذرت قراءة الملف أو التحقق من نطاقه أو بياناته.','The file, evidence or tenant scope could not be validated.'],none:['اختر لقطة مجمعة لعرض قياساتها.','Select an aggregate snapshot to view its measurements.']};
const units={count:['',''],SAR:['ر.س.','SAR'],days:['يوم','days'],h:['ساعة','h'],s:['ثانية','s'],min:['دقيقة','min'],per100:['لكل مئة خدمة','per 100 services'],'%':['٪','%'],'×':['×','×']};
function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n}
const local=pair=>pair[lang==='ar'?0:1];
const fmt=v=>new Intl.NumberFormat(lang==='ar'?'ar-SA':'en-GB',{maximumFractionDigits:2}).format(v);
const time=v=>new Intl.DateTimeFormat(lang==='ar'?'ar-SA-u-ca-gregory':'en-GB',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
function term(dl,title,value){dl.append(el('dt',title),el('dd',value))}
function choices(node,entries){const previous=node.value;node.replaceChildren(...entries.map(([key,value])=>new Option(value,key)));if(entries.some(([key])=>key===previous))node.value=previous}
function renderMetrics(){
 const selected=$('group').value, grid=$('metrics');grid.replaceChildren();
 for(const metric of kpis.filter(x=>x.group===selected)){
  const observed=snapshot?.metrics.get(metric.id),card=el('details'),summary=el('summary'),dl=el('dl');
  summary.append(el('span',metric[lang]),el('strong',observed?.value!=null?fmt(observed.value)+' '+local(units[metric.unit]):t('غير متاح','Unavailable')),el('small',t('التعريف والمصدر','Definition and source')));
  card.append(summary,el('p',lang==='ar'?metric.arDefinition:metric.enDefinition));
  term(dl,t('المسؤول','Owner'),metric.owner);term(dl,t('دورية القياس','Cadence'),local(cadence[metric.cadence]));
  term(dl,t('مصدر القياس المطلوب','Required source'),local(metric.source));
  term(dl,t('الهدف المعتمد','Approved target'),t('غير مسجل في القاموس','Not recorded in the dictionary'));
  if(observed){term(dl,t('مرجع الإثبات المرفق','Supplied evidence reference'),observed.sourceRef);term(dl,t('تاريخ القراءة','Observation time'),time(observed.observedAt));if(observed.coverage==='partial')term(dl,t('التغطية','Coverage'),t('جزئية','Partial'))}
  const formula=el('p',metric.formula);formula.className='formula';card.append(dl,formula);grid.append(card)
 }
}
function renderQueue(){
 const box=$('queue');box.replaceChildren();const items=snapshot?.items.filter(x=>x.feed===$('feed').value)??[];
 if(!items.length){box.append(el('p',t('لا توجد بنود واردة في اللقطة لهذا القسم.','No items supplied for this section.')));return}
 for(const item of items){const a=el('article');a.append(el('strong',item.title),el('p',local(states[item.status])+' · '+item.owner),el('p',item.sourceRef+' · '+time(item.observedAt)));if(item.due)a.append(el('p',t('الاستحقاق ','Due ')+time(item.due)));if(item.progress!=null)a.append(el('p',t('الإنجاز ','Progress ')+fmt(item.progress)+'%'));box.append(a)}
}
function render(){
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.title=t('مركز قيادة دراقون','DRAQON executive desk');
 $('language').textContent=t('English','العربية');$('title').textContent=t('مركز القيادة التنفيذي','Executive command center');
 $('scopeNote').textContent=t('تُقرأ اللقطة محليًا في المتصفح. مصدر كل بند وتاريخ رصده معروضان معه، وتظهر الأوقات بتوقيت الرياض.','The browser reads the snapshot locally. Entries carry their source and observation date. Times use Riyadh local time.');
 $('readTitle').textContent=t('لقطة أعمال الشركة','Company evidence snapshot');$('tenantLabel').textContent=t('معرّف الشركة المتوقّع','Expected tenant ID');$('fileLabel').textContent=t('ملف القياسات','Aggregate evidence file');$('loadButton').textContent=t('عرض اللقطة','Load snapshot');$('clear').textContent=t('مسح العرض','Clear view');
 $('measureTitle').textContent=t('مؤشرات الأداء','Performance indicators');$('queueTitle').textContent=t('قوائم المتابعة','Operational queues');$('groupLabel').textContent=t('الإدارة','Department');$('feedLabel').textContent=t('السجل','Register');
 $('status').textContent=snapshot? local({'local-ledger':['دفتر تشغيل محلي','Local operations ledger'],'operational-export':['تصدير تشغيلي يورده المستخدم','User-supplied operational export'],'synthetic':['بيانات اختبار','Synthetic data']}[snapshot.origin])+' · '+t('فترة القياس ','Measurement period ')+time(snapshot.from)+' — '+time(snapshot.to)+' · '+snapshot.tenant+' · '+t('إصدار اللقطة ','Snapshot issued ')+time(snapshot.asOf):local(messages[notice]??messages.none);
 $('registryTitle').textContent=t('دليل الأدوار','Role directory')+' ('+fmt(AGENTS.length)+')';
 $('registryNote').textContent=t('حالة التعريفات مستقلة عن سجل تنفيذ المهام.','Role definitions and task execution records are tracked separately.');
 $('agentList').replaceChildren(...AGENTS.map(a=>{const li=el('li');li.append(el('b',a.id+' · '+(lang==='ar'?a.nameAr:a.name)),el('span',' · '+a.manager));return li}));
 choices($('group'),Object.entries(groups).map(([key,v])=>[key,local(v)]));choices($('feed'),feeds.map(k=>[k,local(names[k])]));
 const links=$('links');links.replaceChildren();links.setAttribute('aria-label',t('بوابات الإنتاج الموثقة','Authenticated production portals'));
 for(const [ar,en,arUrl,enUrl] of [['فتح بوابة المالك','Open owner portal','/command-center/enterprise/','/en/command-center/enterprise/'],['فتح سجل القرارات','Open decision queue (Arabic)','/field-forms/#decisions','/field-forms/#decisions']]){const a=el('a',t(ar,en));a.href='https://osoulhospitality.com'+t(arUrl,enUrl);a.referrerPolicy='no-referrer';links.append(a)}
 renderMetrics();renderQueue();
}
function clearSnapshot(){version++;snapshot=null;notice='';render()}
$('tenant').oninput=clearSnapshot;$('file').onchange=clearSnapshot;
$('load').onsubmit=async e=>{e.preventDefault();const current=++version, file=$('file').files[0], tenant=$('tenant').value.trim();snapshot=null;notice='';render();try{if(!file||file.size>1024*1024)throw Error('size');const data=readSnapshot(JSON.parse(await file.text()),tenant);if(current!==version)return;snapshot=data}catch{if(current!==version)return;notice='invalid'}render()};
$('clear').onclick=()=>{$('load').reset();clearSnapshot()};$('language').onclick=()=>{lang=lang==='ar'?'en':'ar';render()};$('group').onchange=renderMetrics;$('feed').onchange=renderQueue;render();
