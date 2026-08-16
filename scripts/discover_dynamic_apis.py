#!/usr/bin/env python3
"""Discover public endpoints used by official Riyadh industry directories.

This script only fetches public pages and public API responses. It does not authenticate
as a real user, submit forms, or access non-public data.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

OUT = Path("dynamic_api_discovery")
OUT.mkdir(exist_ok=True)
UA = "Mozilla/5.0 (compatible; PublicSalesResearch/1.0; +https://osoulhospitality.com)"
S = requests.Session(); S.headers.update({"User-Agent": UA, "Accept": "*/*"})


def save_text(name: str, text: str) -> None:
    (OUT / name).write_text(text, encoding="utf-8", errors="ignore")


def fetch(url: str, method: str = "GET", **kwargs):
    try:
        r = S.request(method, url, timeout=45, allow_redirects=True, **kwargs)
        return {"url": r.url, "status": r.status_code, "content_type": r.headers.get("content-type", ""), "text": r.text[:8_000_000], "headers": dict(r.headers)}
    except Exception as exc:
        return {"url": url, "status": 0, "content_type": "", "text": "", "error": repr(exc), "headers": {}}


def discover_film_confex() -> dict:
    root = "https://saudifilmconfex.com/"
    page = fetch(root)
    save_text("film_root.html", page["text"])
    soup = BeautifulSoup(page["text"], "lxml")
    scripts = [urljoin(page["url"], s.get("src")) for s in soup.find_all("script", src=True)]
    js_records = []
    patterns = set()
    for idx, url in enumerate(scripts):
        if "saudifilmconfex" not in url and "static/js" not in url:
            continue
        response = fetch(url)
        save_text(f"film_script_{idx}.js", response["text"])
        for match in re.findall(r"(?:https://restful\.saudifilmconfex\.com)?/public/api/[A-Za-z0-9_?&=./{}:\-]+", response["text"]):
            patterns.add(match.rstrip("'\"`),];}"))
        for match in re.findall(r"https://restful\.saudifilmconfex\.com/[A-Za-z0-9_?&=./{}:\-]+", response["text"]):
            if "/public/api/" in match:
                patterns.add(match.rstrip("'\"`),];}"))
        js_records.append({"url": response["url"], "status": response["status"], "size": len(response["text"])})

    base = "https://restful.saudifilmconfex.com"
    common = {
        "/public/api/settings", "/public/api/home", "/public/api/exhibition", "/public/api/exhibitors",
        "/public/api/sponsors", "/public/api/partners", "/public/api/conference", "/public/api/speakers",
        "/public/api/workshops", "/public/api/events", "/public/api/contact-us", "/public/api/exhibition/map",
    }
    endpoints = sorted(patterns | common)
    endpoint_results = []
    # Public guest endpoint; capture only anonymous public token if returned and use it solely for public read endpoints.
    guest = fetch(base + "/public/api/login/guests", method="POST", json={})
    save_text("film_guest_response.txt", guest["text"])
    token = ""
    try:
        data = json.loads(guest["text"])
        def walk(obj):
            nonlocal token
            if isinstance(obj, dict):
                for k,v in obj.items():
                    if k.lower() in {"token", "access_token", "authorization"} and isinstance(v,str) and len(v)>10:
                        token=v
                    walk(v)
            elif isinstance(obj,list):
                for x in obj: walk(x)
        walk(data)
    except Exception:
        pass
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    for idx, endpoint in enumerate(endpoints):
        if "{" in endpoint or ":" in endpoint.split("?")[0]:
            continue
        url = endpoint if endpoint.startswith("http") else base + endpoint
        response = fetch(url, headers=headers)
        name = re.sub(r"[^A-Za-z0-9]+", "_", endpoint).strip("_")[:100] or f"endpoint_{idx}"
        save_text(f"film_api_{name}.txt", response["text"])
        endpoint_results.append({"endpoint": endpoint, "url": response["url"], "status": response["status"], "content_type": response["content_type"], "size": len(response["text"]), "preview": response["text"][:500]})
    return {"root": {k:v for k,v in page.items() if k != "text"}, "scripts": js_records, "discovered_patterns": endpoints, "guest_status": guest["status"], "anonymous_token_obtained": bool(token), "endpoint_results": endpoint_results}


def discover_widget(name: str, url: str) -> dict:
    page = fetch(url)
    save_text(f"{name}_root.html", page["text"])
    soup = BeautifulSoup(page["text"], "lxml")
    scripts = [urljoin(page["url"], s.get("src")) for s in soup.find_all("script", src=True)]
    records=[]; candidates=set()
    embedded=[]
    for idx, url_ in enumerate(scripts):
        response=fetch(url_)
        if response["status"] and len(response["text"])<15_000_000:
            save_text(f"{name}_script_{idx}.js", response["text"])
        for pattern in [
            r"https?://[^\"'`\s]+(?:api|graphql|exhibitor|partner|search)[^\"'`\s]*",
            r"/[A-Za-z0-9_.\-/]+(?:api|graphql|exhibitor|partner|search)[A-Za-z0-9_?&=./{}:\-]*",
        ]:
            for m in re.findall(pattern, response["text"], flags=re.I):
                if len(m)<700: candidates.add(m.rstrip("'\"`),];}"))
        records.append({"url":response["url"],"status":response["status"],"size":len(response["text"])})
    # Embedded JSON in script tags.
    for script in soup.find_all("script"):
        text=script.string or script.get_text() or ""
        if text.strip().startswith(("{","[")) and len(text)>50:
            embedded.append(text[:2_000_000])
    for idx,text in enumerate(embedded): save_text(f"{name}_embedded_{idx}.json",text)
    return {"page":{k:v for k,v in page.items() if k!="text"},"scripts":records,"candidates":sorted(candidates),"embedded_count":len(embedded)}


def main():
    result={
        "film_confex":discover_film_confex(),
        "global_health":discover_widget("global_health","https://connections.globalhealthsaudi.com/widget/event/global-health-exhibition-2025/exhibitors/RXZlbnRWaWV3XzEwNzcwNDg"),
        "visit_saudi":discover_widget("visit_saudi","https://partner.visitsaudi.com/en/partner-tools/directory.html"),
    }
    (OUT/"discovery.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({
        "film_patterns":len(result["film_confex"]["discovered_patterns"]),
        "film_live_endpoints":sum(x["status"]==200 for x in result["film_confex"]["endpoint_results"]),
        "global_candidates":len(result["global_health"]["candidates"]),
        "visit_candidates":len(result["visit_saudi"]["candidates"]),
    },ensure_ascii=False),flush=True)


if __name__=="__main__":
    main()
