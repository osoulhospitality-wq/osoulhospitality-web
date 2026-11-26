"""Render the bilingual public website from the reviewed editorial content."""
from pathlib import Path
from html import escape
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'content/fm'
BASE = 'https://osoulhospitality.com'
SOURCE = json.loads((DATA/'sources.json').read_text())
METADATA = json.loads((DATA/'metadata.json').read_text())
CATALOG = json.loads((DATA/'catalog.json').read_text())
SETTINGS = json.loads((DATA/'company.json').read_text())
BASEFIELDS = [('legal','الاسم النظامي','Legal entity'),('cr','السجل التجاري','Commercial registration'),('vat','الرقم الضريبي إن انطبق','VAT registration if applicable'),('address','العنوان الوطني','National address'),('direct','الهاتف المباشر','Direct phone'),('urgent','مناوب الأعطال','Duty phone'),('hours','ساعات العمل','Office hours'),('coverage','تغطية الأعطال','Duty coverage')]
TITLES = {'tour':('وزارة السياحة · مرافق الضيافة','Ministry of Tourism · accommodation licensing'),'bal':('بلدي · دليل تجديد الرخصة التجارية','Balady · commercial licence renewal guide'),'fire':('الدفاع المدني · بوابة سلامة','Civil Defense · Salamah'),'saso':('هيئة المواصفات · اللائحة الفنية للمصاعد الكهربائية','SASO · electric lifts technical regulation'),'sbc':('كود البناء السعودي · الكود الميكانيكي، إصدار ٢٠٢٤','Saudi Building Code · mechanical code, 2024'),'pdpl':('سدايا · اللائحة التنفيذية لنظام حماية البيانات الشخصية','SDAIA · PDPL implementing regulations'),'asset':('ISO 55001:2024 · إدارة الأصول','ISO 55001:2024 · asset management'),'iso':('ISO 41001:2018 · نظم إدارة المرافق','ISO 41001:2018 · FM management systems'),'ifma':('IFMA · تعريف إدارة المرافق','IFMA · what is facility management?'),'iwfm':('IWFM · إدارة المرافق وبيئة العمل','IWFM · workplace and facilities management'),'hvac':('ASHRAE · نطاق معيار صيانة أنظمة التكييف 180','ASHRAE · scope of HVAC maintenance Standard 180'),'water':('EPA WaterSense · كشف التسربات وإصلاحها','EPA WaterSense · leak detection and repair'),'clean':('CDC · تنظيف المرافق وتطهيرها','CDC · cleaning and disinfecting a facility'),'civil':('هيئة الخبراء · نظام المعاملات المدنية','Bureau of Experts · Civil Transactions Law')}
def t(ar,en): return (ar,en)[L]
def route(key,lang):
    root = '/en/' if lang else '/'
    return root+key+('/' if key and not key.endswith('.html') else '')
def link(url,label,cls=''):
    return f'<a class="{cls}" href="{escape(url,quote=True)}">{escape(label)}</a>'
def page_link(key,label,cls=''): return link(route(key,L),label,cls)
def bullets(items): return '<ul>'+''.join('<li>'+escape(x)+'</li>' for x in items)+'</ul>'
def config(key): return SETTINGS[key][L]
def source_links(keys):
    return '<section><h2>'+t('المراجع','References')+'</h2><p>'+t('تاريخ الاطلاع على المراجع: ٢٦ نوفمبر ٢٠٢٦.','Sources consulted on 26 November 2026.')+'</p><ul>'+''.join('<li>'+link(SOURCE[k],TITLES[k][L])+'</li>' for k in keys)+'</ul></section>'
def prose(lines):
    chunks=[]; items=[]
    for line in lines:
        if line.startswith('• '):
            items.append(line[2:]); continue
        if items: chunks.append(bullets(items)); items=[]
        if line.startswith('# '): chunks.append('<h2>'+escape(line[2:])+'</h2>')
        elif line: chunks.append('<p>'+escape(line)+'</p>')
    if items: chunks.append(bullets(items))
    return ''.join(chunks)
pages={}
for block in (DATA/'pages.txt').read_text().strip('\n').split('@ ')[1:]:
    key,*rows=block.rstrip('\n').splitlines()
    pairs=[r.split(' | ',1) for r in rows if r]
    assert all(len(p)==2 for p in pairs),key
    pages[key.strip()]=[[p[i].removeprefix('# ') if j==0 else ('# '+p[i].removeprefix('# ') if p[0].startswith('# ') else p[i]) for j,p in enumerate(pairs)] for i in (0,1)]
articles={}
for i in range(1,9):
    hdr,*ar=(DATA/f'a{i}.txt').read_text().splitlines()
    slug,at,et,refs=hdr.split('|')
    key='insights/'+slug
    en=(DATA/f'e{i}.txt').read_text().splitlines()
    articles[key]=refs.split()
    pages[key]=[[at,*ar],[et,*en]]
labels={
'':('الرئيسية','Home'),'solutions':('الخدمات','Services'),'solutions/technical':('الصيانة والأنظمة الفنية','Technical services'),'solutions/site-services':('النظافة وخدمات الموقع','Site services'),'solutions/assets-contracts':('إدارة الأصول والعقود','Assets and contracts'),'how-we-work':('كيف نعمل','Delivery model'),'outputs':('نظام أصول','Osoul platform'),'about':('من نحن','Our team'),'sectors':('القطاعات','Sectors'),'scenarios':('مكتبة الدليل','Evidence library'),'insights':('دليل المالك','Owner guides'),'contact':('التواصل','Contact'),'terms':('شروط الخدمة','Service terms'),'privacy':('الخصوصية','Privacy'),'accessibility':('إتاحة الاستخدام','Accessibility')}
SVC=['solutions/technical','solutions/site-services','solutions/assets-contracts']
def tiles(keys):
    return '<div class="grid">'+''.join(page_link(k,labels[k][L] if k in labels else pages[k][L][0],'card') for k in keys)+'</div>'
def disclosures():
    return '<dl class="disclosures">'+''.join('<div><dt>'+t(ar,en)+'</dt><dd>'+escape(config(k))+'</dd></div>' for k,ar,en in BASEFIELDS)+'</dl>'
PHOTOS = json.loads((DATA/'photos.json').read_text())
def photo(slot):
    item=PHOTOS[slot]
    if not item['file']: return ''
    file=ROOT/item['file'].lstrip('/')
    if not file.is_file() or not item.get('approved'): raise ValueError('Unapproved or missing image: '+slot)
    return '<img class="sectorpic" loading="lazy" src="/'+escape(item['file'].lstrip('/'),quote=True)+'" alt="'+escape(item['alt'][L],quote=True)+'">'

def boards():
    data=[(t('قرار ينتظر الاعتماد','Decision awaiting approval'),t('الخدمة المتأثرة · تبريد شقة','Affected service · apartment cooling'),t('المطلوب · اعتماد زيارة تشخيص','Action · approve diagnostic visit')),
    (t('تاريخ أصل','Asset history'),t('المعدة · مضخة تغذية','Equipment · supply pump'),t('ملاحظة · عودة ضعف الضغط بعد زيارة','Observation · pressure fell again after service')),
    (t('استلام العمل','Work acceptance'),t('الحالة · أصلح مصدر التسرب','Status · leak source repaired'),t('الخطوة التالية · التحقق قبل إعادة التشطيب','Next step · verify before reinstatement'))]
    return '<section class="demo"><h2>'+t('معاينة توضيحية لنظام أصول','Illustrative platform preview')+'</h2><p>'+t('بيانات توضيحية لشرح طريقة قراءة الشاشات.','Example records illustrating how to read the screens.')+'</p><div class="grid">'+''.join('<figure>'+photo(slot)+'<b>'+x+'</b><span>'+y+'</span><span>'+z+'</span></figure>' for slot,(x,y,z) in zip(('owner-board','asset-history','closeout'),data))+'</div></section>'
def more(key):
    if key=='': return photo('cover')+boards()+tiles(SVC)+tiles(['how-we-work','outputs','sectors'])
    if key=='solutions':
        ids=('technical-services','property-services','operations-support')
        return '<div class="grid">'+''.join('<a class="card" id="'+i+'" href="'+route(k,L)+'">'+labels[k][L]+'</a>' for k,i in zip(SVC,ids))+'</div>'
    if key in SVC:
        lo,hi=[(0,8),(8,15),(15,28)][SVC.index(key)]
        return '<section><h2>'+t('الخدمات المشمولة بحسب العقد','Services available by agreement')+'</h2>'+''.join('<details class="service"><summary>'+escape(a)+'</summary>'+photo('service-'+str(i+1))+'<p>'+escape(b)+'</p></details>' for i,(a,b) in enumerate(CATALOG[L][lo:hi],lo))+'</section>'
    if key=='outputs': return ''.join(photo(slot) for slot in ('owner-board','asset-history','closeout'))+'<p>'+page_link('command-center/enterprise',t('دخول العملاء','Client sign-in'),'btn')+'</p><p>'+link('/downloads/Osoul-FM-'+('EN' if L else 'AR')+'.pdf',t('تنزيل موجز الخدمة','Download the service brief'))+'</p>'
    if key=='how-we-work': return tiles(['outputs','scenarios'])
    if key=='about': return photo('team')+'<section><div class="grid">'+''.join('<div class="card"><h3>'+role+'</h3><p>'+escape(SETTINGS['team_profiles'][row][L])+'</p></div>' for row,role in enumerate([t('مسؤول العقد','Contract lead'),t('المسؤول الفني','Technical lead'),t('مشرف الموقع','Site supervisor')]))+'</div></section>'
    if key=='sectors': return tiles(SVC)
    if key=='insights': return tiles(articles)
    if key=='contact':
        duty=config('urgent')
        direct=link('tel:'+re.sub(r'[^+0-9]','',duty),duty) if re.fullmatch(r'\+?[\d ()-]{7,24}',duty) else escape(duty)
        return '<section id="duty"><h2>'+t('اتصال المناوبة','Duty contact')+'</h2><p>'+direct+' · '+escape(config('coverage'))+'</p></section><section id="project-brief"><h2>'+CTA+'</h2>'+(DATA/f'form-{L}.htmlfrag').read_text()+'</section><section><h2>'+t('بيانات مقدم الخدمة','Provider details')+'</h2><div class="contact-data">'+disclosures()+'</div><p>'+link('mailto:info@osoulhospitality.com','info@osoulhospitality.com')+' · '+link('https://wa.me/966544384132',t('واتساب الاستفسارات','General WhatsApp enquiries'))+'</p></section>'
    if key=='terms': return source_links(['civil'])
    if key=='privacy': return '<section><h2>'+t('تفاصيل المعالجة وطلبات الحقوق','Processing details and rights requests')+'</h2>'+bullets([config(k) for k in ('privacy','retention','basis','recipients')])+'</section>'+source_links(['pdpl'])
    if key=='404.html': return tiles(['','solutions','contact'])
    if key=='accessibility': return link('mailto:info@osoulhospitality.com','info@osoulhospitality.com')
    return ''
urls=[]
for L in (0,1):
    CTA=t('اطلب عرض خدمة','Request a service proposal')
    brand=t('أصول الضيافة','Osoul Hospitality')
    for key,both in pages.items():
        title,lead,*body=both[L]; p=route(key,L); other=route(key,1-L)
        public=key not in ('404.html','thank-you')
        url=BASE+p
        if public: urls.append(url)
        nav=''.join(page_link(k,labels[k][L]) for k in ('solutions','how-we-work','outputs','insights','contact'))
        lang=link(other,t('English','العربية'))
        org={'@type':'Organization','@id':BASE+'/#company','name':'Osoul Hospitality','url':BASE+'/','areaServed':{'@type':'Country','name':'Saudi Arabia'}}
        obj={'@type':('Article' if key in articles else 'ContactPage' if key=='contact' else 'AboutPage' if key=='about' else 'WebPage'),'@id':url+'#page','url':url,'name':title,'inLanguage':t('ar-SA','en-SA'),'publisher':{'@id':org['@id']}}
        if key in articles:
            obj.update(headline=title,citation=[SOURCE[s] for s in articles[key]])
            author=SETTINGS['authors'][key.split('/')[-1]][L]
            if '[' not in author: obj['author']={'@type':'Person','name':author}
        graph=[org,obj]
        if key in SVC or key in ('','solutions'):
            svc={'@type':'Service','@id':url+'#service','serviceType':t('إدارة المرافق','Facilities management'),'name':title,'provider':{'@id':org['@id']},'areaServed':'SA'};graph.append(svc);obj['about']={'@id':svc['@id']}
        ld=json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False)
        desc=METADATA[key][L]
        ttl=title+' | '+brand
        alternate=''.join(f'<link rel="alternate" hreflang="{loc}" href="{BASE+route(key,i)}">' for loc,i in [('ar-SA',0),('en-SA',1),('x-default',0)])
        meta=f'<title>{escape(ttl)}</title><meta name="description" content="{escape(desc,quote=True)}"><meta property="og:title" content="{escape(ttl,quote=True)}"><meta property="og:description" content="{escape(desc,quote=True)}"><meta property="og:url" content="{url}"><link rel="canonical" href="{url}">{alternate}<meta name="robots" content="'+('index,follow' if public else 'noindex,nofollow')+'">'
        cta=link(route('contact',L)+'#project-brief',CTA,'btn')
        actions='' if key in ('contact','404.html','thank-you','terms','privacy','accessibility') else '<div class="actions">'+cta+'</div>'
        if key=='contact': actions='<div class="actions"><a class="btn" href="#project-brief">'+CTA+'</a><a href="#urgent">'+t('أبلغ عن عطل عاجل','Report an urgent fault')+'</a></div>'
        if key in articles:
            by=t('الكاتب','Author')+' · '+escape(SETTINGS['authors'][key.split('/')[-1]][L])
            main='<article class="read"><p class="note">'+by+'</p>'+prose(body)+source_links(articles[key])+'</article>'+actions
        else:
            extra=more(key)
            if key in ('solutions','insights'): main=extra+'<section>'+prose(body)+'</section>'
            else: main='<section>'+prose(body)+'</section>'+extra
            if key=='contact':
                urgent=t('أبلغ عن عطل عاجل','Report an urgent fault')
                main=main.replace('<h2>'+urgent,'<h2 id="urgent">'+urgent).replace('</h2><p>'+t('للعملاء المتعاقدين','Contracted clients'),'</h2><p>'+link('#duty',t('بيانات المناوب','Duty contact details'))+'</p><p>'+t('للعملاء المتعاقدين','Contracted clients'))
        foot=''.join(page_link(k,lab[L]) for k,lab in labels.items() if '/' not in k)
        hdr='<header class="top"><div class="shell bar"><a class="wordmark" href="'+route('',L)+'"><img src="/brand/osool-mark-v8.svg" alt="" width="40" height="40"><span>'+brand+'</span></a><nav class="links">'+nav+'</nav><div class="actions">'+lang+'<details class="menu"><summary>'+t('القائمة','Menu')+'</summary><nav>'+nav+'</nav></details></div></div></header>'
        footer='<footer><div class="shell"><b>'+t('أصول الضيافة لإدارة المرافق والأصول','Osoul Hospitality · Facilities and Asset Management')+'</b><nav class="links">'+foot+'</nav>'+disclosures()+'<div class="links">'+link('mailto:info@osoulhospitality.com','info@osoulhospitality.com')+page_link('command-center/enterprise',t('دخول العملاء','Client sign-in'))+'</div></div></footer>'
        out='<!doctype html><html lang="'+t('ar-SA','en-SA')+'" dir="'+t('rtl','ltr')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+meta+'<link rel="icon" href="/brand/osool-mark-v8.svg"><link rel="manifest" href="/manifest.webmanifest"><link rel="stylesheet" href="/brand/fm-2026.css"><script type="application/ld+json">'+ld+'</script><script defer src="/site-hostinger-v16.js?v=21"></script></head><body><a class="skip" href="#main">'+t('انتقل إلى المحتوى','Skip to content')+'</a>'+hdr+'<main id="main" class="shell"><div class="hero"><h1>'+escape(title)+'</h1><p class="lead">'+escape(lead)+'</p>'+actions+'</div>'+main+'</main>'+footer+'</body></html>'
        dest=ROOT/p.lstrip('/')
        if not p.endswith('.html'): dest=dest/'index.html'
        dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(out)
(ROOT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+u+'</loc></url>' for u in urls)+'</urlset>\n')

