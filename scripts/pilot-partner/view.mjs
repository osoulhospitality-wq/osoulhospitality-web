import {makePerformance} from './performance-view.mjs';
import {pilot} from './fixture.mjs';
import {renderFacilityPilot} from '../../command-center/enterprise/src/facility-pilot.js';

function mount() {
  const el=id=>document.getElementById(id);
  const [route,initialSite]=location.hash.slice(1).split('/');
  const en=route==='en'||route.startsWith('en-');
  document.documentElement.lang=en?'en':'ar';
  document.documentElement.dir=en?'ltr':'rtl';
  const keys=['operations','sales','maintenance','risk'];
  const modes=en?['Operations dashboard','Sales & pricing','Maintenance','Risks & SWOT']:['لوحة التشغيل','المبيعات والتسعير','الصيانة','المخاطر وSWOT'];
  const requestMode=route.replace(/^en-?/,'');
  let mode=keys.includes(requestMode)?requestMode:'operations';
  const routeHash=(nextEn,site)=>'#'+(nextEn?(mode==='operations'?'en':'en-'+mode):(mode==='operations'?'ar':mode))+(site?'/'+site:'');
  const pick=value=>typeof value==='object' ? value[en?'en':'ar'] : value;
  document.title=en?'Facility operations | Osoul Hospitality':'غرفة عمليات المرافق | أصول الضيافة';
  if(en) {
    el('brand').textContent='Osoul Hospitality';
    el('department').textContent='Training portfolio · fictional data';
    el('headline').textContent='Facility operations';
    el('scope').textContent='Exercise progress lasts until you reload this session.';
    el('portfolio-label').textContent='Facility';
    el('skip-workspace').textContent='Skip to operations dashboard';
  }
  const language=el('language');
  language.textContent=en?'العربية':'English';
  language.lang=en?'ar':'en';
  language.addEventListener('click',()=>{location.hash=routeHash(!en,selector.value);location.reload()});
  const sites=pilot.sites.map(site=>({code:site.code,name:pick(site.name)}));
  const selector=el('site'),session=new Map();
  selector.add(new Option(en?'Whole portfolio':'جميع المنشآت',''));
  for(const site of sites)selector.add(new Option(site.name,site.code));
  if(sites.some(site=>site.code===initialSite))selector.value=initialSite;
  const nav=el('work-modes');
  nav.setAttribute('aria-label',en?'Dashboard areas':'مساحات اللوحة');
  const buttons=keys.map((key,i)=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=modes[i];
    button.dataset.mode=key;
    button.addEventListener('click',()=>{mode=key;render();saveRoute()});
    nav.append(button);
    return button;
  });
  const performanceView=makePerformance(sites,en,selectSite);
  function saveRoute(){
    const hash=routeHash(en,selector.value);
    if(location.hash!==hash)history.replaceState(null,'',hash);
  }
  function selectSite(code) {
    if(!sites.some(site=>site.code===code) && code!=='')return;
    selector.value=code;
    render();
    saveRoute();
    selector.focus({preventScroll:true});
    el('lab').scrollIntoView({block:'start'});
  }
  function render(){
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
    el('workspace').hidden=mode!=='operations';
    el('performance').hidden=mode==='operations';
    if(mode==='operations')el('workspace').replaceChildren(renderFacilityPilot(pilot,sites,selector.value,session,selectSite));
    else performanceView(el('performance'),mode,selector.value);
  }
  selector.addEventListener('change',()=>{render();saveRoute()});
  render();
}
mount();
