#!/usr/bin/env python3
"""Revalidate the legacy 221-account target universe against the strict protocol.

Public sources only. No outreach and no guessed contact data.
"""
from __future__ import annotations

import base64
import csv
import gzip
import json
import random
import re
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from enrich_sales_intel import (
    ORGANIZER,
    bing_search,
    clean,
    crawl_official_site,
    email_domain,
    mx_valid,
    norm_company,
    root_domain,
    search_role_people,
)

SEED = Path("seeds/old221.json.gz.b64")
OUT = Path("legacy_enriched")
OUT.mkdir(exist_ok=True)

BAD_HOSTS = {
    "linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com", "wikipedia.org",
    "bloomberg.com", "crunchbase.com", "zoominfo.com", "signalhire.com", "theorg.com", "glassdoor.com",
    "indeed.com", "pitchbook.com", "dnb.com", "google.com", "yahoo.com", "bing.com", "maps.google.com",
}

SECTOR_MAP = {
    "المشاريع الكبرى والتطوير العقاري": "المقاولات والهندسة والمشاريع",
    "الاستشارات والهندسة وإدارة المشاريع": "الشركات الاستشارية والخدمات المهنية",
    "الصحة والدواء والتأمين": "المستشفيات والمجموعات الطبية",
    "التقنية والاتصالات والتحول الرقمي": "التقنية والتدريب والتوظيف والتنفيذ المؤقت",
    "القطاع المالي والتقنية المالية": "فرص إضافية مثبتة بالبيانات",
    "المقاولات والبنية التحتية": "المقاولات والهندسة والمشاريع",
    "الفعاليات والمعارض والسفر المؤسسي": "الفعاليات والمعارض والمؤتمرات",
    "التوظيف والانتقال والموارد البشرية": "التقنية والتدريب والتوظيف والتنفيذ المؤقت",
    "الطيران والنقل والخدمات اللوجستية": "السفر وإدارة الوجهات والوفود",
}


def load_seed() -> list[dict]:
    value = "".join(SEED.read_text(encoding="utf-8").split())
    value += "=" * (-len(value) % 4)
    raw = gzip.decompress(base64.b64decode(value))
    return json.loads(raw.decode("utf-8"))


def official_site_search(name: str) -> tuple[str, str]:
    queries = [f'"{name}" Riyadh Saudi Arabia official', f'"{name}" official website Saudi Arabia']
    for q in queries:
        for r in bing_search(q, 10):
            url = r.get("url", "")
            host = root_domain(url)
            if not url.startswith("http") or host in BAD_HOSTS or any(b in host for b in ORGANIZER):
                continue
            title_text = (r.get("title", "") + " " + r.get("snippet", "")).lower()
            tokens = [x for x in norm_company(name).split() if len(x) >= 4][:3]
            if tokens and sum(t in title_text for t in tokens) >= min(1, len(tokens)):
                return url, r.get("search_url", "")
    return "", ""


def linkedin_company_search(name: str) -> str:
    for r in bing_search(f'site:linkedin.com/company "{name}"', 8):
        if "linkedin.com/company/" in r.get("url", "").lower():
            return r["url"]
    return ""


def demand_search(name: str) -> dict:
    queries = [
        f'"{name}" Riyadh project contract 2026',
        f'"{name}" Riyadh office expansion Saudi 2025 2026',
        f'"{name}" Riyadh event conference exhibition 2026',
        f'"{name}" Riyadh jobs project manager 2026',
    ]
    for q in queries:
        for r in bing_search(q, 8):
            text = clean(r.get("title", "") + " " + r.get("snippet", ""))
            low = text.lower()
            if "riyadh" not in low and "الرياض" not in text:
                continue
            if any(k in low for k in ("project", "contract", "office", "event", "conference", "exhibition", "expansion", "jobs", "opening", "headquarters", "regional headquarters", "partnership")):
                return {"description": text[:900], "source": r.get("url", ""), "search_source": r.get("search_url", ""), "query": q}
    return {}


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields = list(dict.fromkeys(k for row in rows for k in row.keys()))
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def enrich(record: dict) -> dict:
    name = clean(record.get("اسم الحساب"))
    target_sector = SECTOR_MAP.get(record.get("القطاع"), record.get("القطاع", ""))
    official_url, official_search = official_site_search(name)
    site = crawl_official_site(official_url, "", name) if official_url else {}
    website = site.get("website") or official_url
    linkedin = site.get("linkedin") or linkedin_company_search(name)
    phone = site.get("phone", "")
    email = site.get("site_email", "")
    people = site.get("team_people", [])[:3]
    if len(people) < 2:
        time.sleep(random.uniform(0.15, 0.35))
        for p in search_role_people(name, 3):
            if all(p.get("name", "").lower() != x.get("name", "").lower() for x in people):
                people.append(p)
            if len(people) >= 3:
                break
    signal = demand_search(name)
    site_active = bool(site.get("site_status") and site.get("site_status") < 400 and website)
    company_match = bool(site.get("company_match") or (email and root_domain(email_domain(email)) == root_domain(website)))
    email_ok = bool(email and mx_valid(email_domain(email)))
    named = bool(people)
    source_count = len({x for x in [website, signal.get("source"), people[0].get("source") if people else ""] if x})
    demand_score = 27 if signal else 8
    fit_score = 18 if target_sector in {
        "المقاولات والهندسة والمشاريع", "الشركات الاستشارية والخدمات المهنية", "الفعاليات والمعارض والمؤتمرات",
        "المستشفيات والمجموعات الطبية", "السفر وإدارة الوجهات والوفود", "التقنية والتدريب والتوظيف والتنفيذ المؤقت"
    } else 14
    volume_score = 11 if record.get("حجم الفرصة المبدئي") == "مرتفع" else 8
    access_score = 15 if named and email and phone else (10 if named and (email or phone) else 4)
    quality_score = sum([2 if site_active else 0, 2 if company_match else 0, 2 if email_ok else 0, 2 if phone else 0, 2 if linkedin else 0])
    timing_score = 9 if signal else 3
    score = min(100, demand_score + fit_score + volume_score + access_score + quality_score + timing_score)
    core = all([site_active, company_match, email_ok, phone, linkedin, named, signal, source_count >= 2])
    quality = "Platinum" if core and score >= 85 and len(people) >= 2 and people[0].get("linkedin") else "Gold" if core and score >= 65 else "Review"
    tier = "A+" if score >= 90 else "A" if score >= 80 else "B" if score >= 65 else "C"
    out = dict(record)
    out.update({
        "target_sector": target_sector, "official_website": website, "website_status": site.get("site_status", 0),
        "company_site_match": company_match, "contact_page": site.get("contact_page", ""), "official_phone": phone,
        "official_email": email, "email_status": "Verified MX + official site" if email_ok else "Missing/failed",
        "official_linkedin": linkedin, "riyadh_site_text": site.get("riyadh_text", ""),
        "person_1_name": people[0].get("name", "") if len(people)>0 else "", "person_1_role": people[0].get("role", "") if len(people)>0 else "", "person_1_linkedin": people[0].get("linkedin", "") if len(people)>0 else "", "person_1_source": people[0].get("source", "") if len(people)>0 else "",
        "person_2_name": people[1].get("name", "") if len(people)>1 else "", "person_2_role": people[1].get("role", "") if len(people)>1 else "", "person_2_linkedin": people[1].get("linkedin", "") if len(people)>1 else "", "person_2_source": people[1].get("source", "") if len(people)>1 else "",
        "person_3_name": people[2].get("name", "") if len(people)>2 else "", "person_3_role": people[2].get("role", "") if len(people)>2 else "", "person_3_linkedin": people[2].get("linkedin", "") if len(people)>2 else "", "person_3_source": people[2].get("source", "") if len(people)>2 else "",
        "people_count": len(people), "demand_signal": signal.get("description", ""), "demand_signal_source": signal.get("source", ""),
        "demand_signal_query": signal.get("query", ""), "estimated_stay_type": record.get("العرض الأنسب", "Corporate/project stay"),
        "estimated_people": 12 if record.get("حجم الفرصة المبدئي") == "مرتفع" else 6,
        "estimated_avg_nights": 30 if "شهر" in record.get("العرض الأنسب", "") else 10,
        "estimated_annual_unit_nights": 360 if record.get("حجم الفرصة المبدئي") == "مرتفع" else 120,
        "estimate_label": "Analytical estimate — not stated by company", "score": score, "tier": tier,
        "data_quality": quality, "source_1": website, "source_2": signal.get("source", ""),
        "source_3": people[0].get("source", "") if people else "", "official_search_source": official_search,
        "qualification_reason": "" if quality in {"Gold", "Platinum"} else "Strict gate not fully met",
        "last_verified": time.strftime("%Y-%m-%d"),
    })
    return out


def main() -> None:
    seed = load_seed()
    unique, seen = [], set()
    for record in seed:
        key = norm_company(record.get("اسم الحساب", ""))
        if key and key not in seen:
            seen.add(key)
            unique.append(record)
    print(f"LEGACY REVALIDATION START {len(unique)}", flush=True)
    rows = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(enrich, record): record for record in unique}
        for idx, future in enumerate(as_completed(futures), 1):
            try:
                rows.append(future.result())
            except Exception as exc:
                failed = dict(futures[future])
                failed.update({"data_quality":"Review", "qualification_reason":f"error:{type(exc).__name__}", "last_verified":time.strftime("%Y-%m-%d")})
                rows.append(failed)
            if idx % 20 == 0:
                print(f"LEGACY PROGRESS {idx}/{len(unique)} {dict(Counter(x.get('data_quality') for x in rows))}", flush=True)
    rows.sort(key=lambda x: (-int(x.get("score") or 0), x.get("اسم الحساب", "")))
    accepted = [x for x in rows if x.get("data_quality") in {"Gold", "Platinum"}]
    rejected = [x for x in rows if x.get("data_quality") not in {"Gold", "Platinum"}]
    contacts = []
    for account in accepted:
        for n in (1,2,3):
            if account.get(f"person_{n}_name"):
                contacts.append({"account_name":account.get("اسم الحساب"),"person_name":account.get(f"person_{n}_name"),"role":account.get(f"person_{n}_role"),"linkedin":account.get(f"person_{n}_linkedin"),"source":account.get(f"person_{n}_source"),"last_verified":account.get("last_verified")})
    write_csv(OUT/"legacy_all.csv",rows)
    write_csv(OUT/"legacy_gold_platinum.csv",accepted)
    write_csv(OUT/"legacy_review_rejected.csv",rejected)
    write_csv(OUT/"legacy_decision_makers.csv",contacts)
    diagnostics={"researched":len(rows),"accepted":len(accepted),"rejected":len(rejected),"contacts":len(contacts),"quality":dict(Counter(x.get("data_quality") for x in rows)),"sector_accepted":dict(Counter(x.get("target_sector") for x in accepted))}
    (OUT/"diagnostics.json").write_text(json.dumps(diagnostics,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(diagnostics,ensure_ascii=False),flush=True)


if __name__ == "__main__":
    main()
