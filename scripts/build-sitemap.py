#!/usr/bin/env python3
"""Keep public/sitemap.xml current.

Lists every public page (public/<page>/index.html, minus the pages in SKIP) and sets each
page's <lastmod> to today whenever its HTML changed since the last run. The fingerprints are
kept in content/sitemap-hashes.json. Runs on every deploy (see .github/workflows/deploy.yml).
"""
import datetime, hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
SITE = "https://www.magicmirrorrentalservices.com"
SKIP = {"app", "links"}   # dashboard and link-in-bio are noindex
# Order in the sitemap: main pages first, then anything new in alphabetical order.
ORDER = ["", "about-us", "magic-mirror", "wedding-photo-booth", "corporate-photo-booth",
         "prom-and-campus-photo-booth", "template-gallery", "pricing", "gallery", "faq",
         "contact-us", "booking", "privacy", "terms"]
MAP = PUB / "sitemap.xml"
HASHES = ROOT / "content" / "sitemap-hashes.json"


def pages():
    found = []
    for f in PUB.rglob("index.html"):
        rel = f.parent.relative_to(PUB).as_posix()
        rel = "" if rel == "." else rel
        if rel in SKIP or any(rel.startswith(s + "/") for s in SKIP):
            continue
        if re.search(r'<meta name="robots" content="[^"]*noindex', f.read_text(encoding="utf-8")):
            continue
        found.append(rel)
    return sorted(found, key=lambda r: (ORDER.index(r) if r in ORDER else len(ORDER), r))


def main():
    today = datetime.date.today().isoformat()
    old = dict(re.findall(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", MAP.read_text(encoding="utf-8"))) if MAP.exists() else {}
    seen = json.loads(HASHES.read_text()) if HASHES.exists() else {}
    rows, now = [], {}
    for rel in pages():
        url = f"{SITE}/{rel}/" if rel else f"{SITE}/"
        h = hashlib.sha256((PUB / rel / "index.html").read_bytes()).hexdigest()[:16]
        now[rel or "/"] = h
        date = old.get(url, today) if seen.get(rel or "/") in (h, None) and url in old else today
        rows.append(f"  <url><loc>{url}</loc><lastmod>{date}</lastmod></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n"
    changed = xml != (MAP.read_text(encoding="utf-8") if MAP.exists() else "")
    MAP.write_text(xml, encoding="utf-8")
    HASHES.write_text(json.dumps(now, indent=1) + "\n")
    print(f"sitemap: {len(rows)} pages" + (", updated" if changed else ", no change"))


if __name__ == "__main__":
    main()
