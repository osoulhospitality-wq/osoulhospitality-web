#!/usr/bin/env python3
"""Enrich public Riyadh event exhibitors into auditable B2B sales candidates.

Principles:
- Public, non-authenticated sources only.
- No guessed email addresses or private phone numbers.
- Event profile is the primary demand signal; official company site is source two.
- Named people must be supported by a public page/search result, never by email inference alone.
- Output separates accepted Gold/Platinum records from review/rejected records.
- No messages are sent.
"""
from __future__ import annotations

import csv
import json
import random
import re
import socket
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable
from urllib.parse import quote_plus, urljoin, urlparse

import dns.resolver
import requests
import tldextract
from bs4 import BeautifulSoup

RAW = Path("sales_intel_output/xporience_exhibitors_raw.csv")
OUT = Path("sales_intel_enriched")
OUT.mkdir(exist_ok=True)

UA = "Mozilla/5.0 (compatible; PublicCorporateHousingResearch/1.0; +https://osoulhospitality.com)"
TIMEOUT = 22
EXTRACT = tldextract.TLDExtract(suffix_list_urls=None)

SOCIAL = ("linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "tiktok.com")
ORGANIZER = ("dmgevents.com", "xporience.com", "ges.com", "informa.com")
ASSET_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".pdf", ".zip", ".doc", ".docx")
GENERIC_EMAIL = {
    "info", "contact", "sales", "support", "hello", "admin", "office", "marketing", "enquiry", "enquiries",
    "customer", "service", "customerservice", "export", "commercial", "business", "team", "accounts", "finance",
    "booking", "bookings", "reservation", "reservations", "reception", "careers", "career", "hr", "procurement",
    "operations", "projects", "project", "online", "web", "website", "mail", "general", "orders", "order",
}
ROLE_TERMS = [
    "procurement", "purchasing", "vendor", "contracts", "operations", "project director", "project manager",
    "country manager", "managing director", "general manager", "office manager", "administration", "corporate services",
    "shared services", "travel manager", "mobility", "logistics", "event director", "production manager", "sales director",
    "export manager", "business development", "commercial director", "ceo", "founder",
]
PHONE_RE = re.compile(r"(?:(?:\+|00)\d{1,3}[\s().\-]*)?(?:\d[\s().\-]*){7,14}")
EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
NAME_RE = re.compile(r"\b([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'`.-]{1,30}(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'`.-]{1,30}){1,3})\b")


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def root_domain(url_or_host: str) -> str:
    host = urlparse(url_or_host).netloc or url_or_host
    host = host.lower().split(":")[0].removeprefix("www.")
    ext = EXTRACT(host)
    return ".".join(x for x in (ext.domain, ext.suffix) if x) or host


def norm_company(name: str) -> str:
    name = re.sub(r"[^a-z0-9\u0600-\u06ff]+", " ", (name or "").lower())
    stop = {"company", "co", "ltd", "llc", "limited", "factory", "trading", "industries", "industrial", "group", "ksa", "saudi", "arabia", "for", "and", "the"}
    return " ".join(x for x in name.split() if x not in stop)


def email_local(email: str) -> str:
    return email.split("@", 1)[0].lower() if "@" in email else ""


def email_domain(email: str) -> str:
    return email.split("@", 1)[1].lower() if "@" in email else ""


def email_is_person_like(email: str) -> bool:
    local = email_local(email)
    if not local or local in GENERIC_EMAIL or any(x in GENERIC_EMAIL for x in re.split(r"[._+\-]", local)):
        return False
    if any(c.isdigit() for c in local):
        return False
    return len(re.sub(r"[^a-z]", "", local)) >= 4


def normalise_phone(value: str) -> str:
    value = clean(value)
    digits = re.sub(r"\D", "", value)
    if len(digits) < 7 or len(digits) > 16:
        return ""
    if digits in {"2026", "2025", "2024"}:
        return ""
    return value


def mx_valid(domain: str) -> bool:
    if not domain:
        return False
    try:
        answers = dns.resolver.resolve(domain, "MX", lifetime=5)
        return bool(list(answers))
    except Exception:
        return False


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,ar;q=0.7"})
    return s


def safe_get(s: requests.Session, url: str, timeout: int = TIMEOUT) -> tuple[str, str, int]:
    try:
        r = s.get(url, timeout=timeout, allow_redirects=True)
        ctype = r.headers.get("content-type", "")
        if r.status_code < 400 and ("text" in ctype or "html" in ctype or not ctype):
            return r.url, r.text[:3_500_000], r.status_code
        return r.url, "", r.status_code
    except Exception:
        return url, "", 0


def candidate_links(soup: BeautifulSoup, base: str) -> list[tuple[str, str]]:
    out = []
    for a in soup.find_all("a", href=True):
        href = urljoin(base, a.get("href"))
        text = clean(a.get_text(" "))
        out.append((text, href))
    return out


def profile_fields(profile_url: str, event_url: str) -> dict:
    s = session()
    final, html, status = safe_get(s, profile_url)
    result = {"profile_status": status, "website": "", "linkedin": "", "profile_phone": "", "profile_html_email": "", "profile_source": final}
    if not html:
        return result
    soup = BeautifulSoup(html, "lxml")
    links = candidate_links(soup, final)
    blocked_roots = {root_domain(profile_url), root_domain(event_url)}
    websites = []
    linkedin = []
    for text, href in links:
        low = href.lower()
        hostroot = root_domain(href)
        if low.startswith("mailto:"):
            continue
        if "linkedin.com" in low:
            if not any(b in low for b in ORGANIZER) and "dmgevents" not in low:
                score = 5 + (3 if "company" in low or "showcase" in low else 0)
                linkedin.append((score, href))
            continue
        if any(social in low for social in SOCIAL):
            continue
        if not low.startswith("http") or low.endswith(ASSET_EXT):
            continue
        if hostroot in blocked_roots or any(b in hostroot for b in ORGANIZER):
            continue
        score = 2
        if any(k in text.lower() for k in ("website", "visit", "web site", "company site")):
            score += 8
        if "redirect" not in low and "url=" not in low:
            score += 2
        websites.append((score, href))
    if websites:
        result["website"] = sorted(websites, reverse=True)[0][1]
    if linkedin:
        result["linkedin"] = sorted(linkedin, reverse=True)[0][1]
    text = soup.get_text(" ", strip=True)
    phones = [normalise_phone(x) for x in PHONE_RE.findall(text)]
    result["profile_phone"] = next((x for x in phones if x), "")
    emails = [x.lower() for x in EMAIL_RE.findall(html)]
    result["profile_html_email"] = next((x for x in emails if not any(b in email_domain(x) for b in ORGANIZER)), "")
    return result


def preferred_site_url(value: str) -> str:
    value = clean(value)
    if not value:
        return ""
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    return value


def crawl_official_site(website: str, event_email: str, company: str) -> dict:
    result = {
        "website": "", "site_status": 0, "site_title": "", "company_match": False, "phone": "", "site_email": "",
        "linkedin": "", "contact_page": "", "riyadh_text": "", "pages_checked": "", "event_email_context": "",
        "team_people": [],
    }
    website = preferred_site_url(website)
    if not website:
        return result
    s = session()
    final, html, status = safe_get(s, website)
    if not html and website.startswith("https://"):
        final, html, status = safe_get(s, "http://" + website[len("https://"):])
    result["website"], result["site_status"] = final, status
    if not html:
        return result
    root = f"{urlparse(final).scheme}://{urlparse(final).netloc}/"
    soup = BeautifulSoup(html, "lxml")
    result["site_title"] = clean(soup.title.get_text(" ") if soup.title else "")
    home_text = clean(soup.get_text(" "))[:500_000]
    tokens = [x for x in norm_company(company).split() if len(x) >= 4][:3]
    result["company_match"] = bool(tokens and sum(t in (home_text + " " + result["site_title"]).lower() for t in tokens) >= min(2, len(tokens)))
    links = candidate_links(soup, final)
    pages = [("home", final, html)]
    seen = {final.rstrip("/")}
    likely = []
    for text, href in links:
        if root_domain(href) != root_domain(final):
            continue
        low = (text + " " + href).lower()
        if any(k in low for k in ("contact", "about", "team", "management", "leadership", "office", "location", "who-we-are", "people")):
            score = sum(k in low for k in ("contact", "team", "management", "leadership", "office", "location", "people"))
            likely.append((score, href))
    for _, href in sorted(likely, reverse=True):
        key = href.split("#")[0].rstrip("/")
        if key in seen or len(pages) >= 5:
            continue
        seen.add(key)
        f, h, st = safe_get(s, href)
        if h:
            pages.append(("sub", f, h))
            if "contact" in href.lower() and not result["contact_page"]:
                result["contact_page"] = f
        time.sleep(0.08)
    all_phones, all_emails, all_linkedin, riyadh_bits, people = [], [], [], [], []
    for label, page_url, page_html in pages:
        psoup = BeautifulSoup(page_html, "lxml")
        ptext = clean(psoup.get_text(" "))
        if "riyadh" in ptext.lower() or "الرياض" in ptext:
            pos = max(ptext.lower().find("riyadh"), ptext.find("الرياض"))
            riyadh_bits.append(ptext[max(0, pos-180):pos+320])
        for a in psoup.find_all("a", href=True):
            href = urljoin(page_url, a.get("href"))
            low = href.lower()
            if low.startswith("tel:"):
                all_phones.append(normalise_phone(href[4:].split("?")[0]))
            elif low.startswith("mailto:"):
                all_emails.append(href[7:].split("?")[0].lower())
            elif "linkedin.com" in low and "/company/" in low:
                all_linkedin.append(href)
        all_emails.extend(x.lower() for x in EMAIL_RE.findall(page_html))
        all_phones.extend(normalise_phone(x) for x in PHONE_RE.findall(ptext))
        if event_email and event_email.lower() in page_html.lower():
            idx = page_html.lower().find(event_email.lower())
            context = BeautifulSoup(page_html[max(0, idx-1200):idx+1200], "lxml").get_text(" ", strip=True)
            result["event_email_context"] = clean(context)[:900]
        # Public team cards / headings near job titles.
        for node in psoup.find_all(["h2", "h3", "h4", "h5", "h6", "p", "li"]):
            txt = clean(node.get_text(" "))
            low = txt.lower()
            if 4 <= len(txt) <= 180 and any(role in low for role in ROLE_TERMS):
                nm = NAME_RE.search(txt)
                if nm:
                    name = clean(nm.group(1))
                    if 2 <= len(name.split()) <= 4 and name.lower() not in company.lower():
                        people.append({"name": name, "role": txt, "source": page_url})
    site_domain = root_domain(final)
    valid_emails = []
    for e in dict.fromkeys(clean(x) for x in all_emails):
        if not e or "example." in e or any(b in email_domain(e) for b in ORGANIZER):
            continue
        if root_domain(email_domain(e)) == site_domain:
            valid_emails.insert(0, e)
        else:
            valid_emails.append(e)
    result["phone"] = next((x for x in all_phones if x), "")
    result["site_email"] = next(iter(valid_emails), "")
    result["linkedin"] = next(iter(dict.fromkeys(all_linkedin)), "")
    result["riyadh_text"] = " | ".join(dict.fromkeys(riyadh_bits))[:1000]
    result["pages_checked"] = " | ".join(x[1] for x in pages)
    unique_people = []
    seen_people = set()
    for p in people:
        key = p["name"].lower()
        if key not in seen_people:
            seen_people.add(key); unique_people.append(p)
    result["team_people"] = unique_people[:5]
    return result


def bing_search(query: str, count: int = 8) -> list[dict]:
    s = session()
    url = "https://www.bing.com/search?q=" + quote_plus(query) + f"&count={count}&setlang=en-US"
    final, html, status = safe_get(s, url, timeout=25)
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    out = []
    for li in soup.select("li.b_algo")[:count]:
        a = li.select_one("h2 a")
        if not a:
            continue
        snippet_node = li.select_one(".b_caption p") or li.select_one("p")
        out.append({
            "title": clean(a.get_text(" ")),
            "url": a.get("href") or "",
            "snippet": clean(snippet_node.get_text(" ") if snippet_node else ""),
            "search_url": final,
        })
    return out


def extract_person_from_result(result: dict, company: str, email: str = "") -> dict | None:
    title = clean(result.get("title"))
    snippet = clean(result.get("snippet"))
    url = result.get("url", "")
    combined = f"{title} {snippet}"
    low = combined.lower()
    if not any(role in low for role in ROLE_TERMS) and "linkedin.com/in/" not in url.lower():
        return None
    # LinkedIn titles generally start with the person's name.
    head = re.split(r"\s[-|–—]\s", title)[0].strip()
    if "linkedin" in head.lower() or len(head.split()) < 2 or len(head.split()) > 5:
        m = NAME_RE.search(combined)
        head = clean(m.group(1)) if m else ""
    if not head or company.lower() in head.lower() or any(x in head.lower() for x in ("jobs", "careers", "company", "directory")):
        return None
    role = ""
    for part in re.split(r"\s[-|–—]\s", title)[1:]:
        if any(x in part.lower() for x in ROLE_TERMS):
            role = clean(part); break
    if not role:
        role = snippet[:220]
    return {"name": head, "role": role, "linkedin": url if "linkedin.com/in/" in url.lower() else "", "source": url, "search_source": result.get("search_url", ""), "email": email if email and email.lower() in low else ""}


def verify_email_person(company: str, email: str) -> dict | None:
    if not email or not email_is_person_like(email):
        return None
    results = bing_search(f'"{email}" "{company}"', 8)
    tokens = [x for x in re.split(r"[._+\-]", email_local(email)) if len(x) >= 3]
    for res in results:
        text = (res["title"] + " " + res["snippet"]).lower()
        if email.lower() in text or (tokens and all(t in text for t in tokens[:2])):
            p = extract_person_from_result(res, company, email)
            if p:
                p["email"] = email
                return p
    return None


def search_role_people(company: str, limit: int = 3) -> list[dict]:
    role_query = 'operations OR procurement OR "project manager" OR "managing director" OR "general manager" OR "sales director" OR "business development"'
    results = bing_search(f'site:linkedin.com/in "{company}" ({role_query})', 10)
    people = []
    seen = set()
    for res in results:
        p = extract_person_from_result(res, company)
        if p and p["name"].lower() not in seen:
            seen.add(p["name"].lower()); people.append(p)
        if len(people) >= limit:
            break
    return people


def phone_search(company: str, website: str) -> str:
    domain = root_domain(website)
    results = bing_search(f'site:{domain} "{company}" phone contact', 6)
    for res in results:
        for candidate in PHONE_RE.findall(res["title"] + " " + res["snippet"]):
            phone = normalise_phone(candidate)
            if phone:
                return phone
    return ""


def dedupe_raw(rows: list[dict]) -> list[dict]:
    out, seen = [], set()
    for row in rows:
        name = clean(row.get("company_name"))
        if not name or name.lower().startswith("dmg test"):
            continue
        key = norm_company(name)
        if not key:
            continue
        emaildom = email_domain(row.get("email", ""))
        dedupe = (key, emaildom)
        if dedupe in seen:
            continue
        seen.add(dedupe); out.append(row)
    return out


def enrich_one(row: dict) -> dict:
    profile = profile_fields(row["profile_url"], row["event_url"])
    website = profile["website"] or row.get("website", "")
    site = crawl_official_site(website, row.get("email", ""), row["company_name"])
    official_email = row.get("email", "") or profile.get("profile_html_email", "") or site.get("site_email", "")
    if official_email and not mx_valid(email_domain(official_email)):
        email_status = "Syntax only / MX failed"
    else:
        email_status = "Verified MX + official event profile" if official_email else "Missing"
    phone = site.get("phone") or profile.get("profile_phone")
    linkedin = profile.get("linkedin") or site.get("linkedin") or row.get("linkedin", "")
    if linkedin and any(x in linkedin.lower() for x in ("dmgevents", "xporience")):
        linkedin = ""
    people = []
    # Official site people first.
    for p in site.get("team_people", []):
        people.append({"name": p["name"], "role": p["role"], "linkedin": "", "email": "", "source": p["source"], "search_source": ""})
    email_person = verify_email_person(row["company_name"], official_email)
    if email_person and all(email_person["name"].lower() != p["name"].lower() for p in people):
        people.insert(0, email_person)
    # Search role people for all records needing a name, and up to 3 for high-event candidates.
    target_count = 3 if row.get("country") and "saudi" not in row.get("country", "").lower() else 2
    if len(people) < target_count:
        time.sleep(random.uniform(0.15, 0.35))
        for p in search_role_people(row["company_name"], target_count):
            if all(p["name"].lower() != x["name"].lower() for x in people):
                people.append(p)
            if len(people) >= target_count:
                break
    if not phone and site.get("website"):
        time.sleep(random.uniform(0.1, 0.25))
        phone = phone_search(row["company_name"], site["website"])
    website_active = bool(site.get("site_status") and site["site_status"] < 400 and site.get("website"))
    company_match = bool(site.get("company_match") or (official_email and root_domain(email_domain(official_email)) == root_domain(site.get("website", ""))))
    official_linkedin = bool(linkedin)
    named_person = people[0] if people else {}
    second_person = people[1] if len(people) > 1 else {}
    third_person = people[2] if len(people) > 2 else {}
    international = bool(row.get("country") and "saudi" not in row.get("country", "").lower())

    demand_score = 30 if international else 26
    fit_score = 19 if international else 16
    volume_score = 11 if international else 8
    access_score = 15 if named_person and official_email and phone else (11 if named_person and (official_email or phone) else 5)
    quality_score = sum([
        2 if website_active else 0, 2 if company_match else 0, 2 if official_email else 0,
        2 if phone else 0, 2 if official_linkedin else 0,
    ])
    timing_score = 10
    score = min(100, demand_score + fit_score + volume_score + access_score + quality_score + timing_score)

    core_ok = all([website_active, company_match, official_email, phone, official_linkedin, named_person, row.get("profile_url")])
    sources = [row.get("profile_url", ""), site.get("website", ""), named_person.get("source", "") or named_person.get("linkedin", "")]
    sources = [x for x in dict.fromkeys(sources) if x]
    if core_ok and score >= 80 and len(people) >= 2 and named_person.get("linkedin") and named_person.get("email"):
        quality = "Platinum"
    elif core_ok and score >= 65 and len(sources) >= 2:
        quality = "Gold"
    else:
        quality = "Review"
    tier = "A+" if score >= 90 else "A" if score >= 80 else "B" if score >= 65 else "C"

    result = dict(row)
    result.update({
        "official_website": site.get("website") or website,
        "website_status": site.get("site_status"),
        "company_site_match": company_match,
        "contact_page": site.get("contact_page"),
        "official_email": official_email,
        "email_status": email_status,
        "official_phone": phone,
        "official_linkedin": linkedin,
        "riyadh_site_text": site.get("riyadh_text"),
        "person_1_name": named_person.get("name", ""),
        "person_1_role": named_person.get("role", ""),
        "person_1_linkedin": named_person.get("linkedin", ""),
        "person_1_email": named_person.get("email", ""),
        "person_1_source": named_person.get("source", ""),
        "person_2_name": second_person.get("name", ""),
        "person_2_role": second_person.get("role", ""),
        "person_2_linkedin": second_person.get("linkedin", ""),
        "person_2_email": second_person.get("email", ""),
        "person_2_source": second_person.get("source", ""),
        "person_3_name": third_person.get("name", ""),
        "person_3_role": third_person.get("role", ""),
        "person_3_linkedin": third_person.get("linkedin", ""),
        "person_3_email": third_person.get("email", ""),
        "person_3_source": third_person.get("source", ""),
        "people_count": len(people),
        "demand_signal": f"Confirmed exhibitor at {row['event']} in Riyadh ({row['event_start']} to {row['event_end']})",
        "demand_signal_source": row.get("profile_url", ""),
        "demand_signal_type": "Confirmed Riyadh exhibition participation",
        "estimated_stay_type": "Event/project team stay; analytical estimate",
        "estimated_people": 8 if international else 4,
        "estimated_avg_nights": 6 if international else 4,
        "estimated_annual_unit_nights": 48 if international else 16,
        "estimate_label": "Analytical estimate — not stated by company",
        "score": score,
        "tier": tier,
        "data_quality": quality,
        "source_1": row.get("profile_url", ""),
        "source_2": site.get("website", ""),
        "source_3": named_person.get("source", "") or named_person.get("linkedin", ""),
        "qualification_reason": "" if quality in {"Gold", "Platinum"} else " | ".join(k for k,v in {
            "official website inactive/missing": website_active,
            "company/website match not confirmed": company_match,
            "email missing": bool(official_email),
            "phone missing": bool(phone),
            "company LinkedIn missing": official_linkedin,
            "named public person missing": bool(named_person),
            "fewer than two sources": len(sources) >= 2,
        }.items() if not v),
        "last_verified": time.strftime("%Y-%m-%d"),
    })
    return result


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields = list(dict.fromkeys(k for row in rows for k in row.keys()))
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)


def main() -> None:
    if not RAW.exists():
        raise SystemExit(f"Missing {RAW}; run sales_intel_scrape.py first")
    with RAW.open(encoding="utf-8-sig", newline="") as fh:
        raw = dedupe_raw(list(csv.DictReader(fh)))
    # Highest accommodation propensity first: international exhibitors, then large current directories.
    raw.sort(key=lambda x: ("saudi" in (x.get("country") or "").lower(), x.get("event") != "Big 5 Construct Saudi 2026", x.get("company_name", "")))
    # Research buffer above the 500-account target.
    raw = raw[:680]
    print(f"ENRICH START candidates={len(raw)}", flush=True)
    enriched = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(enrich_one, row): row for row in raw}
        for idx, fut in enumerate(as_completed(futures), 1):
            row = futures[fut]
            try:
                enriched.append(fut.result())
            except Exception as exc:
                failed = dict(row); failed.update({"data_quality": "Review", "qualification_reason": f"enrichment_error:{type(exc).__name__}", "last_verified": time.strftime("%Y-%m-%d")})
                enriched.append(failed)
            if idx % 25 == 0:
                q = Counter(x.get("data_quality") for x in enriched)
                print(f"PROGRESS {idx}/{len(raw)} {dict(q)}", flush=True)
    enriched.sort(key=lambda x: (-int(x.get("score") or 0), x.get("company_name", "")))
    accepted = [x for x in enriched if x.get("data_quality") in {"Gold", "Platinum"}]
    review = [x for x in enriched if x.get("data_quality") not in {"Gold", "Platinum"}]
    contacts = []
    for account in accepted:
        for n in (1, 2, 3):
            name = account.get(f"person_{n}_name")
            if name:
                contacts.append({
                    "account_name": account["company_name"], "event": account["event"], "person_name": name,
                    "role": account.get(f"person_{n}_role", ""), "linkedin": account.get(f"person_{n}_linkedin", ""),
                    "professional_email": account.get(f"person_{n}_email", ""), "source": account.get(f"person_{n}_source", ""),
                    "last_verified": account.get("last_verified", ""),
                })
    write_csv(OUT / "accounts_enriched_all.csv", enriched)
    write_csv(OUT / "accounts_gold_platinum.csv", accepted)
    write_csv(OUT / "accounts_review_rejected.csv", review)
    write_csv(OUT / "decision_makers_public.csv", contacts)
    diagnostics = {
        "raw_unique_researched": len(raw), "accepted": len(accepted), "review_rejected": len(review),
        "contacts": len(contacts), "quality": dict(Counter(x.get("data_quality") for x in enriched)),
        "events_accepted": dict(Counter(x.get("event") for x in accepted)),
        "with_phone": sum(bool(x.get("official_phone")) for x in enriched),
        "with_email": sum(bool(x.get("official_email")) for x in enriched),
        "with_linkedin": sum(bool(x.get("official_linkedin")) for x in enriched),
        "with_person": sum(bool(x.get("person_1_name")) for x in enriched),
    }
    (OUT / "diagnostics.json").write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(diagnostics, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
