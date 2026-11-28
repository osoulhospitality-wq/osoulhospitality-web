import {pilot} from './fixture.mjs';
import {renderFacilityPilot} from '../../command-center/enterprise/src/facility-pilot.js';

function mount() {
  const el=id=>document.getElementById(id);
  const en=document.documentElement.lang==='en';
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
  language.addEventListener('click',()=>{location.hash=en?'ar':'en';location.reload()});
  const sites=pilot.sites.map(site=>({code:site.code,name:pick(site.name)}));
  const selector=el('site'),session=new Map();
  selector.add(new Option(en?'Whole portfolio':'جميع المنشآت',''));
  for(const site of sites)selector.add(new Option(site.name,site.code));
  function selectSite(code) {
    if(!sites.some(site=>site.code===code) && code!=='')return;
    selector.value=code;
    render();
    selector.focus({preventScroll:true});
    el('lab').scrollIntoView({block:'start'});
  }
  function render(){
    el('workspace').replaceChildren(renderFacilityPilot(pilot,sites,selector.value,session,selectSite));
  }
  selector.addEventListener('change',render);
  render();
}
mount();
