
document.addEventListener('DOMContentLoaded', function(){
  const toggle=document.querySelector('.menu-toggle');
  const nav=document.querySelector('.main-nav');
  if(toggle&&nav){toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});}
  document.querySelectorAll('.faq-item').forEach((item,i)=>{const btn=item.querySelector('.faq-q'); if(!btn) return; if(i===0) item.classList.add('open'); btn.addEventListener('click',()=>item.classList.toggle('open'));});

  /* GA4 event tracking: CTA clicks, form submissions, capability deck downloads */
  function trackEvent(name, params){if(typeof gtag==='function'){gtag('event',name,params);}}
  document.querySelectorAll('.btn-primary:not([type="submit"])').forEach(btn=>{btn.addEventListener('click',()=>{trackEvent('cta_click',{button_text:btn.textContent.trim(),link:btn.getAttribute('href')||''});});});
  document.querySelectorAll('a[href*="calendly.com"]').forEach(btn=>{btn.addEventListener('click',()=>{trackEvent('calendly_click',{link:btn.href});});});
  document.querySelectorAll('a[href$=".pdf"],a[href*="capability-deck"],a[href*="كتيب"]').forEach(btn=>{btn.addEventListener('click',()=>{trackEvent('capability_deck_download',{link:btn.href});});});

  /* Form handler: Formspree POST + Turnstile spam protection.
     Replace YOUR_FORMSPREE_ID with the actual Formspree endpoint ID.
     Replace YOUR_TURNSTILE_SITEKEY with the actual Cloudflare Turnstile site key. */
  document.querySelectorAll('[data-formspree-form]').forEach(form=>{
    form.addEventListener('submit', function(e){
      e.preventDefault();
      const btn=form.querySelector('[type="submit"]');
      const originalText=btn?btn.textContent:'';
      if(btn){btn.disabled=true;btn.textContent='جارٍ الإرسال...';}
      const fd=new FormData(form);
      const tsToken=form.querySelector('[name="cf-turnstile-response"]');
      if(tsToken && tsToken.value){fd.set('cf-turnstile-response',tsToken.value);}
      fetch(form.action,{
        method:'POST',
        body:fd,
        headers:{'Accept':'application/json'}
      }).then(r=>r.json()).then(res=>{
        if(res.ok || res.id){
          if(btn){btn.textContent='تم الإرسال بنجاح ✓';btn.classList.add('sent');}
          trackEvent('form_submit',{form_id:form.getAttribute('action')||'',form_type:'intake'});
          form.reset();
          if(window.turnstile){window.turnstile.reset(form.querySelector('.cf-turnstile'));}
        } else {
          throw new Error('Formspree error');
        }
      }).catch(err=>{
        if(btn){btn.disabled=false;btn.textContent=originalText||'إرسال الطلب';}
        const notice=form.querySelector('.form-error');
        if(notice){notice.style.display='flex';}
        else if(btn){btn.textContent='حدث خطأ — حاول مرة أخرى';}
      });
    });
  });

  /* Insights filter: works on static cards (no fetch needed) */
  const chips=document.querySelectorAll('.chip[data-filter]');
  if(chips.length){
    const cards=document.querySelectorAll('.insight-card[data-category]');
    chips.forEach(chip=>chip.addEventListener('click',()=>{
      chips.forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      const f=chip.dataset.filter;
      cards.forEach(card=>{card.style.display=(f==='all'||card.dataset.category===f)?'':'none';});
    }));
  }
});
