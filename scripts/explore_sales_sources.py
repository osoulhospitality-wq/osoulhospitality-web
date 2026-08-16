#!/usr/bin/env python3
"""Explore public official directories and capture links/frames/network endpoints.
No authentication, form submission, or personal-data collection is performed.
Each source is isolated so one unstable page cannot abort the complete run.
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

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
    ("saudi_event_show_exhibitors", "https://informaconnect.com/saudi-event-show/sponsors-and-exhibitors/"),
    ("saudi_film_confex", "https://saudifilmconfex.com/"),
    ("pif_portfolio", "https://www.pif.gov.sa/en/our-investments/our-portfolio/"),
    ("leap", "https://onegiantleap.com/"),
]

KEYWORDS = re.compile(r"api|exhibit|partner|supplier|provider|director|agency|agencies|company|companies|search|graphql|json|portfolio", re.I)


async def stable_content(page) -> str:
    for _ in range(8):
        try:
            return await page.content()
        except Exception:
            await page.wait_for_timeout(1200)
    return ""


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
            error = ""
            try:
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=80000)
                except PlaywrightTimeoutError:
                    status = "timeout"
                await page.wait_for_timeout(4500)
                for _ in range(4):
                    try:
                        await page.mouse.wheel(0, 5000)
                        await page.wait_for_timeout(1200)
                    except Exception:
                        break
                html = await stable_content(page)
                try:
                    links = await page.locator("a").evaluate_all("els => els.map(e => ({text:(e.innerText||'').trim(), href:e.href})).filter(x=>x.href)")
                except Exception:
                    links = []
                try:
                    buttons = await page.locator("button").evaluate_all("els => els.map(e => (e.innerText||e.getAttribute('aria-label')||'').trim()).filter(Boolean)")
                except Exception:
                    buttons = []
                frames = [f.url for f in page.frames]
                try:
                    title = await page.title()
                except Exception:
                    title = ""
            except Exception as exc:
                status = "error"
                error = repr(exc)
                html, links, buttons, frames, title = "", [], [], [], ""
            record = {
                "name": name, "url": url, "status": status, "error": error, "title": title,
                "frames": frames, "links": links, "buttons": buttons,
                "network": list({x['url']: x for x in network}.values()),
            }
            (OUT / f"{name}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            if html:
                (OUT / f"{name}.html").write_text(html, encoding="utf-8")
            item = {"name": name, "status": status, "links": len(links), "frames": len(frames), "network": len(record["network"]), "error": error}
            summary.append(item)
            (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
            print(item, flush=True)
            await page.close()
        await browser.close()
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
