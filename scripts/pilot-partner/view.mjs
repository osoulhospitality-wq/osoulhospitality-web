import {pilot} from './fixture.mjs';
import {renderFacilityPilot} from '../../command-center/enterprise/src/facility-pilot.js';

function mount(){
  const el=id=>document.getElementById(id);
  const en=document.documentElement.lang==='en', pick=(v)=>typeof v==='object' ? v[en?'en':'ar'] : v;
  document.title=en?'Facility operations lab | Osoul Hospitality':'مختبر تشغيل المرافق | أصول الضيافة';
  if(en){
    el('brand').textContent='Osoul Hospitality';
    el('headline').textContent='Facility operations lab';
    el('hint').textContent='Four fictional properties to try a site visit from field handoff to review.';
    el('scope').textContent='Contracts and costs are simulated. Reloading clears your changes.';
    el('portfolio-label').textContent='Viewing scope';
  }
  const language=el('language');language.textContent=en?'العربية':'English';language.lang=en?'ar':'en';
  language.addEventListener('click',()=>{location.hash=en?'ar':'en';location.reload()});
  const sites=pilot.sites.map(s=>({code:s.code,name:pick(s.name)})), select=el('site'),session=new Map();
  select.add(new Option(en?'Whole portfolio':'المحفظة كاملة',''));for(const site of sites)select.add(new Option(site.name,site.code));
  el('period').textContent=en?'29 Nov – 3 Dec 2026  ·  Riyadh':'٢٩ نوفمبر – ٣ ديسمبر ٢٠٢٦  ·  الرياض';
  function render(){el('workspace').replaceChildren(renderFacilityPilot(pilot,sites,select.value,session))}
  select.addEventListener('change',render);render();
}
mount();
