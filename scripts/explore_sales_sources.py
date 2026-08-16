#!/usr/bin/env python3
"""Explore public official directories and capture links/frames/network endpoints.
No authentication, form submission, or personal-data collection is performed.
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from urllib.parse import urljoin

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path("source_exploration")
OUT.mkdir(exist_ok=True)

SOURCES = [
    ("film_saudi", "https://film.moc.gov.sa/en/Film-Saudi"),
    ("film_commission", "https://film.moc.gov.sa/en"),
    ("global_health_exhibitors", "https://www.globalhealthsaudi.com/exhibit/exhibitor-list/"),
    ("visit_saudi_partners", "https://partner.visitsaudi.com/en/partner-tools/directory.html"),
    ("gov_agencies", "https://my.gov.sa/en/agencies"),
    ("saudi_event_show", "https://informaconnect.com/saudi-event-show/"),
    ("saudi_film_confex", "https://saudifilmconfex.com/"),
]

KEYWORDS = re.compile(r"api|exhibit|partner|supplier|provider|director|agency|agencies|company|companies|search|graphql|json", re.I)


async def main() -> None:
    summary = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1200}, locale="en-US")
        for name, url in SOURCES:
            page = await context.new_page()
            network = []

            async def on_response(resp):
                try:
                    ctype = resp.headers.get("content-type", "")
                    if KEYWORDS.search(resp.url) or "json" in ctype.lower():
                        network.append({"url": resp.url, "status": resp.status, "content_type": ctype})
                except Exception:
                    pass

            page.on("response", on_response)
            status = "ok"
            try:
                await page.goto(url, wait_until="networkidle", timeout=90000)
            except PlaywrightTimeoutError:
                status = "timeout"
            await page.wait_for_timeout(5000)
            try:
                await page.mouse.wheel(0, 6000)
                await page.wait_for_timeout(2500)
            except Exception:
                pass
            html = await page.content()
            links = await page.locator("a").evaluate_all("els => els.map(e => ({text:(e.innerText||'').trim(), href:e.href})).filter(x=>x.href)")
            frames = [f.url for f in page.frames]
            buttons = await page.locator("button").evaluate_all("els => els.map(e => (e.innerText||e.getAttribute('aria-label')||'').trim()).filter(Boolean)")
            record = {
                "name": name,
                "url": url,
                "status": status,
                "title": await page.title(),
                "frames": frames,
                "links": links,
                "buttons": buttons,
                "network": list({x['url']: x for x in network}.values()),
            }
            (OUT / f"{name}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            (OUT / f"{name}.html").write_text(html, encoding="utf-8")
            summary.append({"name": name, "status": status, "links": len(links), "frames": len(frames), "network": len(record['network'])})
            print(summary[-1], flush=True)
            await page.close()
        await browser.close()
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
