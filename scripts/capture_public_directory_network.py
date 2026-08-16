#!/usr/bin/env python3
"""Capture public network calls made by official industry directory pages.

No authentication or form submission. Sensitive headers/cookies are excluded from output.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

OUT=Path('public_directory_network'); OUT.mkdir(exist_ok=True)
PAGES=[
 ('global_health','https://connections.globalhealthsaudi.com/widget/event/global-health-exhibition-2025/exhibitors/RXZlbnRWaWV3XzEwNzcwNDg'),
 ('visit_saudi','https://partner.visitsaudi.com/en/partner-tools/directory.html'),
 ('film_exhibition','https://saudifilmconfex.com/exhibition'),
 ('film_map','https://saudifilmconfex.com/exhibition/map'),
]
SAFE_HEADERS={'content-type','accept','x-application-id','x-client-version','x-api-key','origin','referer','user-agent','apollographql-client-name','apollographql-client-version'}

async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1440,'height':1600},locale='en-US')
  summaries=[]
  for name,url in PAGES:
   page=await context.new_page(); records=[]; tasks=[]
   def relevant(u,ct=''):
    low=u.lower()
    return any(k in low for k in ['api.swapcard.com','/api/','graphql','partner','exhibitor','restful.saudifilmconfex']) or 'json' in ct.lower()
   async def store_response(resp):
    try:
     ct=resp.headers.get('content-type','')
     if not relevant(resp.url,ct): return
     req=resp.request
     body=''
     if 'json' in ct.lower() or 'graphql' in resp.url.lower() or '/api/' in resp.url.lower():
      try: body=(await resp.body()).decode('utf-8','replace')[:12_000_000]
      except Exception: body=''
     hdr={k:v for k,v in (await req.all_headers()).items() if k.lower() in SAFE_HEADERS}
     records.append({'url':resp.url,'status':resp.status,'content_type':ct,'method':req.method,'post_data':req.post_data,'request_headers':hdr,'response_body':body})
    except Exception as exc:
     records.append({'url':getattr(resp,'url',''),'error':repr(exc)})
   def on_response(resp): tasks.append(asyncio.create_task(store_response(resp)))
   page.on('response',on_response)
   status='ok'; error=''
   try:
    await page.goto(url,wait_until='domcontentloaded',timeout=90000)
    await page.wait_for_timeout(7000)
    for _ in range(8):
     await page.mouse.wheel(0,5000); await page.wait_for_timeout(1200)
    # Try visible Load more/Next controls without submitting data.
    for text in ['Load more','Show more','See more','عرض المزيد','Next']:
     loc=page.get_by_text(text,exact=False)
     for i in range(min(await loc.count(),3)):
      try:
       if await loc.nth(i).is_visible():
        await loc.nth(i).click(timeout=3000); await page.wait_for_timeout(2500)
      except Exception: pass
   except Exception as exc:
    status='error'; error=repr(exc)
   await asyncio.gather(*tasks,return_exceptions=True)
   # Deduplicate while preserving materially different POST bodies.
   unique=[]; seen=set()
   for r in records:
    key=(r.get('url'),r.get('method'),r.get('post_data'))
    if key not in seen: seen.add(key); unique.append(r)
   (OUT/f'{name}.json').write_text(json.dumps({'name':name,'page':url,'status':status,'error':error,'records':unique},ensure_ascii=False,indent=2),encoding='utf-8')
   summaries.append({'name':name,'status':status,'records':len(unique),'json_bodies':sum(bool(x.get('response_body')) for x in unique)})
   print(summaries[-1],flush=True)
   await page.close()
  await browser.close()
  (OUT/'summary.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__': asyncio.run(main())
