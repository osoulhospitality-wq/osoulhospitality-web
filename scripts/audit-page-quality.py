"""Audit the shipped HTML text, metadata, accessibility labels and quote routes.

Run python3 scripts/audit-page-quality.py [--json] from any directory.
The audit uses the release tree and sitemap, without contacting customers or providers.
"""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = 'https://osoulhospitality.com'
OLD_BUTTONS = {'ناقش احتياج منشأتك', 'ابدأ مشروعك', 'Discuss your project', 'Start your project'}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.labels = []
        self.active = None
        self.label = []

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        self.tags.append((tag, attr))
        if tag in {'a', 'h1', 'title'}:
            self.active = (tag, attr)
            self.label = []

    def handle_data(self, data):
        if self.active:
            self.label.append(data)

    def handle_endtag(self, tag):
        if self.active and self.active[0] == tag:
            label = ' '.join(''.join(self.label).split())
            self.labels.append((*self.active, label))
            self.active = None

    def attrs(self, tag):
        return [attrs for name, attrs in self.tags if name == tag]


def audit(file, indexed):
    path = '/' + file.relative_to(ROOT).as_posix().removesuffix('index.html')
    page = Page()
    page.feed(file.read_text(encoding='utf-8'))
    problems = []
    english = path.startswith('/en/')
    for attrs in page.attrs('img'):
        if 'alt' not in attrs:
            problems.append('missing alt attribute: ' + attrs.get('src', 'unknown source'))
    if path not in indexed:
        return path, 'outside sitemap', problems
    canonical = [a.get('href') for a in page.attrs('link') if 'canonical' in a.get('rel', '').split()]
    if canonical != [DOMAIN + path]:
        problems.append('expected one canonical matching this page')
    for tag in ['title', 'h1']:
        labels = [label for t, _, label in page.labels if t == tag]
        if len(labels) != 1 or not labels[0]:
            problems.append('expected one nonempty ' + tag)
    if not any(a.get('name', '').lower() == 'description' and a.get('content', '').strip() for a in page.attrs('meta')):
        problems.append('missing page description')
    quotes = []
    for tag, attrs, label in page.labels:
        if tag != 'a':
            continue
        if label in OLD_BUTTONS:
            problems.append('superseded call to action: ' + label)
        if label in {'اطلب عرض خدمة', 'Request a service quote'}:
            target = urlsplit(urljoin(DOMAIN + path, attrs.get('href', '')))
            if target.netloc != 'osoulhospitality.com' or not (target.path.rstrip('/') == ('/en/contact' if english else '/contact') or target.fragment == 'project-brief'):
                problems.append('quote destination: ' + attrs.get('href', ''))
            quotes.append(label)
    if path.startswith(('/solutions/', '/en/solutions/')) and not quotes:
        problems.append('missing standardized service quote CTA')
    return path, 'in sitemap', list(dict.fromkeys(problems))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', action='store_true', help='emit every route and its findings')
    options = parser.parse_args()
    indexed = {urlsplit(node.text).path for node in ET.parse(ROOT/'sitemap.xml').iterfind('.//{*}loc')}
    rows = [audit(file, indexed) for file in sorted(ROOT.rglob('*.html'))
            if not {'node_modules', '.git', 'automation', 'scripts'}.intersection(file.relative_to(ROOT).parts)]
    missing = indexed - {row[0] for row in rows}
    findings = [(path, issue) for path, _, issues in rows for issue in issues]
    if options.json:
        print(json.dumps(dict(pages=[dict(route=p, visibility=v, findings=f) for p,v,f in rows],
                              missing=sorted(missing)), ensure_ascii=False, indent=2))
    else:
        print(f'{len(rows)} HTML pages checked; {len(indexed)} sitemap entries; {len(findings)} findings.')
        for (path, issue) in findings:
            print(f'{path}  {issue}')
        for path in sorted(missing):
            print(f'{path}  sitemap entry without HTML')
    return int(bool(findings or missing))


if __name__ == '__main__':
    raise SystemExit(main())
