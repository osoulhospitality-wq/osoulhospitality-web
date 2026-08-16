#!/usr/bin/env python3
"""Collect public exhibitor data from official Riyadh event directories.

Uses only public, non-authenticated pages, rate-limited requests, and saves source URLs.
No outreach is performed and no private/personal data is collected.
"""
from __future__ import annotations

import asyncio
import csv
import json
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

OUT = Path("sales_intel_output")
OUT.mkdir(exist_ok=True)

EVENTS = [
    {
        "event": "Big 5 Construct Saudi 2026",
        "url": "https://exhibitors.big5constructsaudi.com/big-5-construct-saudi-2026/Exhibitor/",
        "sector": "المقاولات والهندسة والمشاريع",
        "event_start": "2026-08-30",
        "event_end": "2026-09-02",
        "venue": "Riyadh Front Exhibition & Conference Center",
    },
    {
        "event": "FSB Sports Show Riyadh 2026",
        "url": "https://exhibitors.fsb-riyadh.com/fsb-sports-show-riyadh-2026/Exhibitor",
        "sector": "الرياضة والترفيه والإعلام",
        "event_start": "2026",
        "event_end": "2026",
        "venue": "Riyadh",
    },
    {
        "event": "International Hardware Fair Saudi Arabia 2026",
        "url": "https://exhibitors.fsb-riyadh.com/international-hardware-fair-saudi-arabia-2026/Exhibitor",
        "sector": "المقاولات والهندسة والمشاريع",
        "event_start": "2026",
        "event_end": "2026",
        "venue": "Riyadh",
    },
    {
        "event": "Smart Cities Saudi Expo 2026",
        "url": "https://exhibitors.smartcitiessaudiexpo.com/smart-cities-saudi-expo-2026/Exhibitor",
        "sector": "التقنية والتدريب والتوظيف والتنفيذ المؤقت",
        "event_start": "2026",
        "event_end": "2026",
        "venue": "Riyadh",
    },
    {
        "event": "Orgatec Workspace Saudi Arabia 2026",
        "url": "https://exhibitors.orgatec-workspace-saudi.com/orgatec-workspace-saudi-arabia-2026/Exhibitor",
        "sector": "فرص إضافية مثبتة بالبيانات",
        "event_start": "2026",
        "event_end": "2026",
        "venue": "Riyadh",
    },
    {
        "event": "Saudi Warehousing & Logistics Expo 2026",
        "url": "https://exhibitors.saudilogisticsexpo.com/saudi-warehousing-and-logistics-expo-2026/Exhibitor",
        "sector": "السفر وإدارة الوجهات والوفود",
        "event_start": "2026",
        "event_end": "2026",
        "venue": "Riyadh",
    },
    {
        "event": "Saudi Wood Expo 2026",
        "url": "https://exhibitors.saudiwoodexpo.com/saudi-wood-expo-2026/Exhibitor",
        "sector": "المقاولات والهندسة والمشاريع",
        "event_start": "2026",
        "event_end": "2026",
        "venue": "Riyadh",
    },
    {
        "event": "Hotel and Hospitality Expo Saudi Arabia 2026",
        "url": "https://exhibitors.thehotelshowsaudiarabia.com/hotel-and-hospitality-expo-saudi-arabia-2026/Exhibitor",
        "sector": "الشركات الاستشارية والخدمات المهنية",
        "event_start": "2026",
        "event_end": "2026",
        "venue": "Riyadh",
    },
    {
        "event": "IFAT Saudi Arabia 2026",
        "url": "https://exhibitors.ifat-saudiarabia.com/ifat-saudi-arabia-2026/Exhibitor",
        "sector": "المقاولات والهندسة والمشاريع",
        "event_start": "2026",
        "event_end": "2026",
        "venue": "Riyadh",
    },
]

PROFILE_TOKEN = "/Exhibitor/ExbDetails/"
EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(?:(?:\+|00)\d{1,3}[\s().\-]*)?(?:\d[\s().\-]*){7,14}")


@dataclass
class Exhibitor:
    event: str
    event_url: str
    event_start: str
    event_end: str
    venue: str
    sector_seed: str
    profile_url: str
    company_name: str = ""
    country: str = ""
    booth: str = ""
    product_sectors: str = ""
    description: str = ""
    website: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    facebook: str = ""
    instagram: str = ""
    twitter: str = ""
    youtube: str = ""
    scrape_status: str = ""


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def is_profile(href: str | None) -> bool:
    return bool(href and PROFILE_TOKEN.lower() in href.lower())


async def collect_links(page, event: dict) -> list[str]:
    url = event["url"]
    print(f"COLLECT {event['event']} {url}", flush=True)
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(2500)
    except PlaywrightTimeoutError:
        print(f"WARN initial timeout {url}", flush=True)
    links: set[str] = set()
    signatures: set[str] = set()
    for step in range(1, 160):
        hrefs = await page.locator(f'a[href*="{PROFILE_TOKEN}"]').evaluate_all(
            "els => els.map(e => e.href)"
        )
        for href in hrefs:
            if is_profile(href):
                links.add(href.split("#")[0])
        sig = "|".join(sorted(hrefs)[:4])
        if sig in signatures and step > 2:
            break
        signatures.add(sig)
        if step % 10 == 0:
            print(f"  page {step}: {len(links)} profiles", flush=True)

        # Find an enabled next-page control. Xporience sites vary by theme.
        candidates = [
            'a[aria-label="Next"]',
            'button[aria-label="Next"]',
            'li.next:not(.disabled) a',
            'a:has-text("Next")',
            'a:has-text("»")',
            'a:has-text("›")',
        ]
        clicked = False
        for selector in candidates:
            loc = page.locator(selector)
            count = await loc.count()
            for idx in range(count):
                item = loc.nth(idx)
                try:
                    if not await item.is_visible():
                        continue
                    cls = (await item.get_attribute("class") or "").lower()
                    parent_cls = ""
                    try:
                        parent_cls = (await item.locator("xpath=..").get_attribute("class") or "").lower()
                    except Exception:
                        pass
                    if "disabled" in cls or "disabled" in parent_cls:
                        continue
                    old = sig
                    await item.click(timeout=8000)
                    await page.wait_for_timeout(1600)
                    new_hrefs = await page.locator(f'a[href*="{PROFILE_TOKEN}"]').evaluate_all(
                        "els => els.map(e => e.href)"
                    )
                    new_sig = "|".join(sorted(new_hrefs)[:4])
                    if new_sig and new_sig != old:
                        clicked = True
                        break
                except Exception:
                    continue
            if clicked:
                break
        if not clicked:
            # Try the numeric page immediately following the active page.
            active = page.locator("li.active, .page-item.active")
            try:
                if await active.count():
                    txt = clean(await active.first.inner_text())
                    if txt.isdigit():
                        nxt = str(int(txt) + 1)
                        numeric = page.locator(f'a:text-is("{nxt}")')
                        for idx in range(await numeric.count()):
                            item = numeric.nth(idx)
                            if await item.is_visible():
                                await item.click(timeout=8000)
                                await page.wait_for_timeout(1600)
                                clicked = True
                                break
            except Exception:
                pass
        if not clicked:
            break
    print(f"DONE LINKS {event['event']}: {len(links)}", flush=True)
    return sorted(links)


def choose_external(links: list[str], event_host: str) -> str:
    blocked = (event_host, "dmgevents.com", "xporience.com", "amazonaws.com", "google.com")
    for href in links:
        host = urlparse(href).netloc.lower().removeprefix("www.")
        if href.startswith("http") and host and not any(b in host for b in blocked):
            if not any(s in host for s in ("linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com")):
                return href
    return ""


def parse_profile(event: dict, url: str, html: str) -> Exhibitor:
    row = Exhibitor(
        event=event["event"], event_url=event["url"], event_start=event["event_start"],
        event_end=event["event_end"], venue=event["venue"], sector_seed=event["sector"], profile_url=url,
    )
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text("\n", strip=True)
    h1 = soup.find("h1")
    row.company_name = clean(h1.get_text(" ") if h1 else "")
    booth_m = re.search(r"Stand\s*No\s*[-:]?\s*([^\n]+)", text, re.I)
    row.booth = clean(booth_m.group(1) if booth_m else "")

    # Country is commonly the short heading after the stand heading.
    headings = [clean(x.get_text(" ")) for x in soup.find_all(["h5", "h6"])]
    for value in headings:
        if value and "stand" not in value.lower() and len(value) < 80:
            if any(token in value.lower() for token in ("saudi", "arab emirates", "italy", "turkiye", "china", "germany", "qatar", "bahrain", "oman", "india", "france", "spain", "uk", "united kingdom", "usa", "egypt", "jordan", "kuwait")):
                row.country = value
                break

    anchors = [(clean(a.get_text(" ")), a.get("href") or "") for a in soup.find_all("a")]
    abs_links = [urljoin(url, href) for _, href in anchors if href]
    event_host = urlparse(event["url"]).netloc.lower().removeprefix("www.")
    row.website = choose_external(abs_links, event_host)
    for href in abs_links:
        low = href.lower()
        if "linkedin.com" in low and not row.linkedin: row.linkedin = href
        elif "facebook.com" in low and not row.facebook: row.facebook = href
        elif "instagram.com" in low and not row.instagram: row.instagram = href
        elif ("twitter.com" in low or "x.com" in low) and not row.twitter: row.twitter = href
        elif "youtube.com" in low and not row.youtube: row.youtube = href
    mailtos = [href[7:].split("?")[0] for _, href in anchors if href.lower().startswith("mailto:")]
    emails = mailtos + EMAIL_RE.findall(html)
    emails = [e for e in dict.fromkeys(clean(x) for x in emails) if e and "example." not in e.lower()]
    row.email = emails[0] if emails else ""
    phones = [clean(p) for p in PHONE_RE.findall(text)]
    phones = [p for p in phones if sum(ch.isdigit() for ch in p) >= 7 and "2026" not in p]
    row.phone = phones[0] if phones else ""

    # Identify sector/category text and a concise description from main paragraphs.
    sector_tokens = []
    for node in soup.find_all(["h5", "h6", "p", "div"]):
        val = clean(node.get_text(" "))
        if 3 < len(val) < 220 and any(k in val.lower() for k in (
            "construction", "building", "facility", "smart", "hospitality", "logistics", "sport", "water", "wood", "hardware", "hvac", "interior", "technology"
        )):
            sector_tokens.append(val)
    row.product_sectors = " | ".join(dict.fromkeys(sector_tokens[:5]))
    paragraphs = [clean(p.get_text(" ")) for p in soup.find_all("p")]
    paragraphs = [p for p in paragraphs if 40 <= len(p) <= 1200 and "lorem ipsum" not in p.lower()]
    row.description = max(paragraphs, key=len, default="")[:1200]
    row.scrape_status = "ok" if row.company_name else "missing_name"
    return row


def fetch_profiles(event: dict, links: Iterable[str]) -> list[Exhibitor]:
    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0 (compatible; PublicSalesResearch/1.0; +https://osoulhospitality.com)"})
    result: list[Exhibitor] = []
    for idx, url in enumerate(links, 1):
        try:
            resp = sess.get(url, timeout=35)
            resp.raise_for_status()
            result.append(parse_profile(event, url, resp.text))
        except Exception as exc:
            item = Exhibitor(event=event["event"], event_url=event["url"], event_start=event["event_start"], event_end=event["event_end"], venue=event["venue"], sector_seed=event["sector"], profile_url=url, scrape_status=f"error:{type(exc).__name__}")
            result.append(item)
        if idx % 50 == 0:
            print(f"  profiles {event['event']}: {idx}/{len(list(links))}", flush=True)
        time.sleep(0.08)
    return result


async def main() -> None:
    all_rows: list[Exhibitor] = []
    diagnostics = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1100}, locale="en-US")
        page = await context.new_page()
        for event in EVENTS:
            try:
                links = await collect_links(page, event)
                diagnostics.append({"event": event["event"], "url": event["url"], "profiles": len(links)})
                if links:
                    all_rows.extend(fetch_profiles(event, links))
            except Exception as exc:
                diagnostics.append({"event": event["event"], "url": event["url"], "profiles": 0, "error": repr(exc)})
                print(f"ERROR EVENT {event['event']}: {exc!r}", flush=True)
        await browser.close()

    fields = list(Exhibitor.__dataclass_fields__.keys())
    with (OUT / "xporience_exhibitors_raw.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(asdict(r) for r in all_rows)
    (OUT / "diagnostics.json").write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"total_rows": len(all_rows), "events": diagnostics}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
