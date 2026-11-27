#!/usr/bin/env python3
"""Rebuild every place on the site that shows event prints, from content/events.txt.

Usage (from the repo root):
    python3 scripts/build-events.py          # normal run (GitHub Actions runs this on every push)
    python3 scripts/build-events.py --home   # also refresh the print walls now
    python3 scripts/build-events.py --pdf    # re-render the brochure PDF even if nothing changed

What it updates:
- public/images/gallery/   web versions of any new photo in src-images/gallery/
- public/gallery/          the landscape and portrait print grids
- public/links/            "Latest Events" (4 newest) and the header wall
- brochure/ + public/brochure/magic-mirror-brochure.pdf   page 5 "Prints from the mirror" (6 newest)
- public/index.html        "Your event, on paper": the 5 newest prints of each event type, on every run
- public/index.html + magic-mirror/   "They print" step (newest) and Magic Mirror page print (2nd), every run
- cta-collage.webp         "Ready to save your date?" collage of the 5 newest, every COLLAGE_EVERY events (--collage forces)
- og-gallery/og-image/og-template-gallery.png   link-share images, every SHARE_EVERY events (--share forces)
- public/index.html        print wall and its rotating pool, plus the /links header wall that copies it, only once
                           HOME_EVERY new events have been added since the last refresh (content/home-last-built.txt)

Needs Pillow. The PDF needs Node with Playwright (node scripts/render-brochure.js); without it the PDF is skipped.
"""
import hashlib, html, json, os, re, subprocess, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LIST = ROOT / "content" / "events.txt"
HOME_MARK = ROOT / "content" / "home-last-built.txt"
COLLAGE_MARK = ROOT / "content" / "collage-last-built.txt"
SHARE_MARK = ROOT / "content" / "share-last-built.txt"
OLD_UNLISTED = ROOT / "content" / "old-unlisted-photos.txt"   # old photos never meant for the list
UNLISTED_JSON = ROOT / "public" / "app" / "unlisted.json"     # Dashboard "Add to Event List" picker
SRC = ROOT / "src-images" / "gallery"
WEB = ROOT / "public" / "images" / "gallery"
BROCHURE = ROOT / "brochure"
PDF = ROOT / "public" / "brochure" / "magic-mirror-brochure.pdf"

TYPES = ["Weddings", "Birthdays", "Graduations & proms", "Galas & balls", "Campus nights", "Corporate", "Baby showers"]
HOME_EVERY = 4      # refresh the print walls after this many new events
COLLAGE_EVERY = 5   # "Ready to save your date?" collage
SHARE_EVERY = 3     # link-share images
WALL, POOL = 16, 14  # home page wall tiles, extra prints that rotate in
PICKS = 5           # prints per tab in "Your event, on paper"
LATEST = 4          # /links Latest Events
BROCHURE_N = 6      # brochure page 5
MONTH_SHORT = {"January": "Jan", "February": "Feb", "March": "Mar", "April": "Apr", "August": "Aug",
               "September": "Sept", "October": "Oct", "November": "Nov", "December": "Dec"}


def fail(msg):
    sys.exit(f"events.txt: {msg}")


def cap1(s):
    return s[:1].upper() + s[1:]


# ---------- read the list ----------
def read_list():
    events, seen = [], set()
    for n, line in enumerate(LIST.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        hide = bool(parts) and parts[-1].lower() == "hide"
        if hide:
            parts = parts[:-1]
        parts += [""] * (4 - len(parts))
        if len(parts) > 4:
            fail(f"line {n} has too many | separators: {line}")
        f, name, date, typ = parts
        if not (SRC / f).is_file():
            fail(f"line {n}: no photo named {f} in src-images/gallery/")
        if f in seen:
            fail(f"line {n}: {f} is listed twice")
        if typ and typ not in TYPES:
            fail(f"line {n}: event type '{typ}' should be one of: {', '.join(TYPES)}")
        if date and not re.fullmatch(r"[A-Z][a-z]+ \d{4}", date):
            fail(f"line {n}: write the date like 'May 2026', not '{date}'")
        seen.add(f)
        events.append(dict(file=f, stem=Path(f).stem, name=name, date=date, type=typ, hide=hide))
    return events


# ---------- images ----------
def make_web_images(events):
    made = 0
    for e in events:
        outs = [(WEB / f"{e['stem']}.webp", 1600), (WEB / f"{e['stem']}-thumb.webp", 800), (WEB / f"{e['stem']}-sm.webp", 480)]
        if all(p.exists() for p, _ in outs):
            continue
        im = Image.open(SRC / e["file"])
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        for dest, w in outs:
            x = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS) if im.width > w else im
            dest.parent.mkdir(parents=True, exist_ok=True)
            x.save(dest, "WEBP", quality=80, method=6)
        made += 1
    for e in events:
        with Image.open(WEB / f"{e['stem']}-thumb.webp") as t:
            e["tw"], e["th"] = t.size
        with Image.open(WEB / f"{e['stem']}.webp") as t:
            e["fw"], e["fh"] = t.size
        e["port"] = e["th"] > e["tw"]
    return made


def label(e):
    """Caption text, e.g. "Alla and Ibrahim’s wedding, May 2026"."""
    return ", ".join(x for x in (e["name"], e["date"]) if x)


def alt(e):
    return "Magic Mirror photo booth print from " + (label(e) or "an event in Greater Boston")


def esc(s):
    return html.escape(s, quote=True)


# ---------- page blocks ----------
def replace_block(path, name, body):
    s = path.read_text(encoding="utf-8")
    pat = re.compile(rf"(<!-- events:{re.escape(name)} [^\n]*-->\n).*?(\n<!-- /events:{re.escape(name)} -->)", re.S)
    if not pat.search(s):
        sys.exit(f"{path.relative_to(ROOT)}: marker events:{name} is missing")
    new = pat.sub(lambda m: m.group(1) + body + m.group(2), s, count=1)
    if new != s:
        path.write_text(new, encoding="utf-8")
        return True
    return False


def tilt(stem, n, old):
    """Keep a print's current tilt; new prints get a steady pseudo-random one."""
    if stem in old:
        return old[stem]
    h = hashlib.md5(stem.encode()).digest()
    r = (h[0] / 255 * 14 - 7)
    return f"--r:{r:.1f}deg;--dx:{h[1] % 15 - 7}px;--dy:{h[2] % 21 - 10}px;--z:{n % 7}"


def build_gallery(events):
    path = ROOT / "public" / "gallery" / "index.html"
    old = {stem: style for style, stem in re.findall(r'<li class="print" style="([^"]+)"><a href="/images/gallery/([^"]+)\.webp"', path.read_text(encoding="utf-8"))}
    changed = False
    for name, port in (("gallery-land", False), ("gallery-port", True)):
        rows = []
        for n, e in enumerate(x for x in events if x["port"] == port):
            g, st = "/images/gallery/", e["stem"]
            rows.append(f'<li class="print" style="{tilt(st, n, old)}"><a href="{g}{st}.webp" data-lightbox>'
                        f'<img width="{e["tw"]}" height="{e["th"]}" src="{g}{st}-thumb.webp" '
                        f'srcset="{g}{st}-sm.webp 480w, {g}{st}-thumb.webp 800w" sizes="(max-width: 640px) 46vw, 260px" '
                        f'alt="{esc(alt(e))}" loading="lazy"></a></li>')
        changed |= replace_block(path, name, "\n".join(rows))
    return changed


def shown(events):
    """Prints that may appear outside the gallery: not hidden, landscape."""
    return [e for e in events if not e["hide"] and not e["port"]]


def build_links(events):
    path = ROOT / "public" / "links" / "index.html"
    pool = shown(events)
    latest = pool[:LATEST]
    strip = "\n".join(f'    <a href="/gallery/"><img src="/images/gallery/{e["stem"]}-sm.webp" width="480" height="{round(e["th"] * 480 / e["tw"])}" '
                      f'alt="{esc(alt(e))}" loading="lazy"></a>' for e in latest)
    return replace_block(path, "links-latest", strip)


def build_walls(events):
    """Home page print wall (and the /links header wall). Refreshes every HOME_EVERY new events."""
    path = ROOT / "public" / "index.html"
    named = [e for e in shown(events) if e["name"]]
    g = "/images/gallery/"
    tiles = []
    for n, e in enumerate(named[:WALL]):
        lazy = ' loading="lazy"' if n >= 8 else ""
        tiles.append(f'<figure><img class="cur" fetchpriority="low" decoding="async" src="{g}{e["stem"]}-thumb.webp" '
                     f'srcset="{g}{e["stem"]}-sm.webp 480w, {g}{e["stem"]}-thumb.webp 800w" sizes="(max-width: 900px) 50vw, 25vw" '
                     f'width="{e["tw"]}" height="{e["th"]}" alt=""{lazy}></figure>')
    pool = [f"{g}{e['stem']}-thumb.webp" for e in named[WALL:WALL + POOL]]
    # The /links header wall copies the first 8 prints of the home page wall
    links_wall = "".join(f'<figure><img src="{g}{e['stem']}-sm.webp" width="480" height="{round(e['th'] * 480 / e['tw'])}" alt=""></figure>' for e in named[:8])
    a = replace_block(ROOT / "public" / "links" / "index.html", "links-wall", links_wall)
    b = replace_block(path, "home-wall", "\n".join(tiles))
    c = replace_block(path, "home-wall-pool", f"<script>window.WALL_POOL={json.dumps(pool)};</script>")
    return a or b or c


def build_picker(events):
    """ "Your event, on paper": the newest prints of each event type. Updates with every new typed event."""
    path = ROOT / "public" / "index.html"
    named = [e for e in shown(events) if e["name"]]
    g = "/images/gallery/"
    data = {}
    for t in TYPES:
        picks = [e for e in named if e["type"] == t][:PICKS]
        if picks:
            data[t] = [{"src": f"{g}{e['stem']}.webp", "cap": cap1(label(e))} for e in picks]
    if "Weddings" not in data:
        sys.exit("events.txt: the home page needs at least one Weddings print (it opens on that tab)")
    first = [e for e in named if e["type"] == "Weddings"][0]
    tabs = "\n".join(f'<li><button type="button" data-type="{esc(t)}" aria-pressed="{str(t == "Weddings").lower()}">{esc(t)}</button></li>' for t in data)
    fl = cap1(label(first))
    picker = f'''  <ul class="picker-tabs" aria-label="Event type">
{tabs}
  </ul>
  <div class="picker-view">
    <figure class="picker-print"><img src="{g}{first['stem']}.webp" srcset="{g}{first['stem']}-thumb.webp 800w, {g}{first['stem']}.webp 1600w" sizes="(max-width: 900px) 100vw, 66vw" width="{first['fw']}" height="{first['fh']}" alt="Photo booth print from {esc(fl)}" loading="lazy"></figure>
    <div class="picker-info">
      <p class="picker-intro">Every event gets its own print design with your names, date and theme. Pick your kind of event to see real prints we made for clients.</p>
      <div class="picker-detail">
        <h3 class="picker-type">Weddings</h3>
        <p class="picker-cap" aria-live="polite">{esc(fl)}</p>
        <div class="picker-more"><button type="button" class="pk-prev" aria-label="Previous print">‹</button><button type="button" class="pk-next" aria-label="Next print">›</button><span class="picker-count">1 / {len(data['Weddings'])}</span></div>
        <a class="btn" href="/booking/">Check your date</a>
      </div>
    </div>
  </div>
  <script type="application/json" id="picker-data">{json.dumps(data, ensure_ascii=False)}</script>'''
    return replace_block(path, "home-picker", picker)


# ---------- event-type landing pages ----------
EVENT_PAGES = {
    "wedding": ("wedding-photo-booth", ["Weddings"]),
    "corporate": ("corporate-photo-booth", ["Corporate", "Galas & balls"]),
    "campus": ("prom-and-campus-photo-booth", ["Graduations & proms", "Campus nights"]),
}
EVENT_PICKS = 6


def build_event_pages(events):
    """The newest prints of each event type on its landing page (/wedding-photo-booth/ and so on)."""
    changed = False
    g = "/images/gallery/"
    for key, (slug, types) in EVENT_PAGES.items():
        picks = [e for e in shown(events) if e["type"] in types][:EVENT_PICKS]
        rows = "\n".join(
            f'<li><a href="{g}{e["stem"]}.webp" data-lightbox><img width="{e["tw"]}" height="{e["th"]}" src="{g}{e["stem"]}-thumb.webp" '
            f'srcset="{g}{e["stem"]}-sm.webp 480w, {g}{e["stem"]}-thumb.webp 800w" sizes="(max-width: 640px) 92vw, 33vw" '
            f'alt="{esc(alt(e))}" loading="lazy"></a></li>' for e in picks)
        changed |= replace_block(ROOT / "public" / slug / "index.html", f"page-{key}", rows)
    return changed


def due(events, mark, every, force):
    """True once `every` new events sit above the one recorded in `mark` (then records the newest)."""
    last = mark.read_text().strip() if mark.exists() else ""
    files = [e["file"] for e in events]
    new = files.index(last) if last in files else len(files)
    if force or new >= every:
        mark.write_text(files[0] + "\n")
        return True, new
    return False, new


# ---------- single prints that always show the newest events ----------
def build_featured(events):
    """Home "They print" step (newest) and Magic Mirror page print (2nd newest).
    The home review photo stays with its review (BU ASO), so it is not changed here."""
    named = [e for e in shown(events) if e["name"]]
    g = "/images/gallery/"
    step, mm = named[0], named[1]
    a = replace_block(ROOT / "public" / "index.html", "home-step-print",
        f'<li><img src="{g}{step["stem"]}.webp" srcset="{g}{step["stem"]}-sm.webp 480w, {g}{step["stem"]}-thumb.webp 800w, {g}{step["stem"]}.webp 1600w" '
        f'sizes="(max-width: 900px) 38vw, 33vw" width="{step["fw"]}" height="{step["fh"]}" alt="A 4x6 print from {esc(label(step))}" loading="lazy"><h3>They print</h3>')
    c = replace_block(ROOT / "public" / "magic-mirror" / "index.html", "mm-print",
        f'<figure class="print"><img src="{g}{mm["stem"]}.webp" width="{mm["fw"]}" height="{mm["fh"]}" alt="A finished print from {esc(label(mm))}" loading="lazy"></figure>')
    return a or c


# ---------- images made from several prints ----------
def framed(e, width, border):
    im = Image.open(SRC / e["file"]).convert("RGB")
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = Image.new("RGB", (im.width + 2 * border, im.height + 2 * border), "white")
    out.paste(im, (border, border))
    return out


def shadowed(canvas, im, xy, angle=0.0, blur=18, alpha=150):
    from PIL import ImageFilter
    im = im.convert("RGBA").rotate(angle, resample=Image.BICUBIC, expand=True)
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh.putalpha(im.getchannel("A").point(lambda v: alpha if v else 0))
    pad = blur * 3
    big = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    big.paste(sh, (pad, pad))
    big = big.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(big, (xy[0] - pad + 6, xy[1] - pad + 14))
    canvas.alpha_composite(im, xy)


def bump_version(tag, paths, key):
    """Images under /images/ are cached for 30 days, so a rebuilt image gets a new ?v= in every page that uses it."""
    for page in (ROOT / "public").rglob("*.html"):
        t = page.read_text(encoding="utf-8")
        n = t
        for p in paths:
            n = re.sub(re.escape(p) + r"(\?v=[\w-]+)?", p + "?v=" + key, n)
        if n != t:
            page.write_text(n, encoding="utf-8")


def build_collage(events):
    """The "Ready to save your date?" collage: the 5 newest named prints."""
    picks = [e for e in shown(events) if e["name"]][:5]
    W, H = 1320, 742
    c = Image.new("RGBA", (W, H), (20, 12, 24, 255))
    spots = [((-110, -70), 3.0), ((850, -80), -3.5), ((-80, 380), -2.5), ((860, 400), 2.5)]
    for e, (xy, ang) in zip(picks[1:], spots):
        shadowed(c, framed(e, 560, 10), xy, ang)
    shadowed(c, framed(picks[0], 780, 12), (262, 118), 0, blur=24, alpha=190)
    c = c.convert("RGB")
    c.save(ROOT / "src-images" / "magic-mirror" / "cta-collage.jpg", "JPEG", quality=90)
    c.resize((1000, round(H * 1000 / W)), Image.LANCZOS).save(ROOT / "public" / "images" / "magic-mirror" / "cta-collage.webp", "WEBP", quality=82, method=6)
    names = [e["name"] for e in picks]
    altxt = "Finished prints from " + ", ".join(names[:-1]) + " and " + names[-1]
    for page in (ROOT / "public").rglob("*.html"):
        t = page.read_text(encoding="utf-8")
        n = re.sub(r'(<img src="/images/magic-mirror/cta-collage\.webp[^"]*" width="\d+" height="\d+" alt=")[^"]*(")', lambda m: m.group(1) + esc(altxt) + m.group(2), t)
        if n != t:
            page.write_text(n, encoding="utf-8")
    bump_version("collage", ["/images/magic-mirror/cta-collage.webp"], picks[0]["stem"])


SHARE_IMAGES = ["og-gallery.png", "og-image.png", "og-template-gallery.png"]


def build_share(events):
    """Link-share images (1200x630): logo on the left, one of the 3 newest prints tilted on the right."""
    base = Image.open(ROOT / "content" / "share-base.png").convert("RGBA")
    picks = [e for e in shown(events) if e["name"]][:3]
    for name, e, ang in zip(SHARE_IMAGES, picks, (3.0, -3.0, 2.0)):
        c = base.copy()
        im = framed(e, 500, 10)
        rot = im.convert("RGBA").rotate(ang, resample=Image.BICUBIC, expand=True)
        shadowed(c, im, (885 - rot.width // 2, 315 - rot.height // 2), ang, blur=14, alpha=170)
        out = c.convert("RGB")
        out.save(ROOT / "public" / "images" / "brand" / name, optimize=True)
        if name == "og-image.png":  # optimize-images.py copies this one from src-images
            out.save(ROOT / "src-images" / "brand" / name, optimize=True)
    bump_version("share", [f"/images/brand/{n}" for n in SHARE_IMAGES], picks[0]["stem"])


# ---------- brochure ----------
def build_brochure(events, force):
    picks = shown(events)[:BROCHURE_N]
    imgdir = BROCHURE / "prints"
    imgdir.mkdir(exist_ok=True)
    figs = []
    for n, e in enumerate(picks):
        name = esc(cap1(e["name"] or "Event in Greater Boston"))
        d = e["date"]
        if d:
            m, y = d.split()
            d = f" <span>· {MONTH_SHORT.get(m, m)} {y}</span>"
        figs.append(f'    <figure><img src="prints/{e["stem"]}.jpg"><figcaption>{name}{d}</figcaption></figure>')
    replace_block(BROCHURE / "brochure.html", "brochure-prints", "\n".join(figs))
    keep = {f"{e['stem']}.jpg" for e in picks}
    for p in imgdir.iterdir():
        if p.name not in keep:
            p.unlink()
    for e in picks:
        dest = imgdir / f"{e['stem']}.jpg"
        if not dest.exists():
            im = Image.open(SRC / e["file"]).convert("RGB")
            if im.width > 1600:
                im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
            im.save(dest, "JPEG", quality=88)

    # Re-render only when the brochure's content changed
    h = hashlib.sha256()
    for p in sorted(BROCHURE.rglob("*")):
        if p.is_file() and p.name != ".built-hash":
            h.update(p.relative_to(BROCHURE).as_posix().encode()); h.update(p.read_bytes())
    stamp = BROCHURE / ".built-hash"
    digest = h.hexdigest()
    if not force and stamp.exists() and stamp.read_text().strip() == digest:
        return False
    if os.environ.get("EVENTS_PDF") == "skip":  # GitHub Actions: install Playwright only when needed
        print("The brochure PDF needs rebuilding.")
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write("pdf=1\n")
        return False
    try:
        subprocess.run(["node", str(ROOT / "scripts" / "render-brochure.js")], check=True)
    except (OSError, subprocess.CalledProcessError) as err:
        print(f"Brochure PDF not rebuilt ({err}). Install Node and Playwright, or let GitHub Actions do it.")
        return False
    stamp.write_text(digest + "\n")
    return True


def write_unlisted(events):
    """Photos uploaded to src-images/gallery/ that are not on the list yet, for the Dashboard picker."""
    listed = {e["file"] for e in events}
    old = set(OLD_UNLISTED.read_text().split()) if OLD_UNLISTED.exists() else set()
    items = []
    for p in sorted(SRC.iterdir()):
        if p.suffix.lower() not in (".jpg", ".jpeg", ".png") or p.name in listed or p.name in old:
            continue
        thumb = WEB / f"{p.stem}-sm.webp"
        if not thumb.exists():
            im = Image.open(p).convert("RGB")
            im.resize((480, round(im.height * 480 / im.width)), Image.LANCZOS).save(thumb, "WEBP", quality=78, method=6)
        items.append({"file": p.name, "thumb": f"/images/gallery/{p.stem}-sm.webp"})
    text = json.dumps(items, indent=1) + "\n"
    if not UNLISTED_JSON.exists() or UNLISTED_JSON.read_text() != text:
        UNLISTED_JSON.write_text(text)
    return len(items)


def main():
    args = set(sys.argv[1:])
    events = read_list()
    made = make_web_images(events)
    report = [f"{len(events)} prints in the list, {made} new web image set(s), {write_unlisted(events)} uploaded photo(s) waiting to be listed"]
    if build_gallery(events):
        report.append("gallery updated")
    if build_links(events):
        report.append("/links updated")
    if build_picker(events):
        report.append('home "Your event, on paper" updated')
    if build_featured(events):
        report.append("home print step and Magic Mirror page print updated")
    if build_event_pages(events):
        report.append("event-type pages updated")
    ok, new = due(events, COLLAGE_MARK, COLLAGE_EVERY, "--collage" in args)
    if ok:
        build_collage(events)
        report.append("collage rebuilt")
    else:
        report.append(f"collage waits ({new} of {COLLAGE_EVERY})")
    ok, new = due(events, SHARE_MARK, SHARE_EVERY, "--share" in args)
    if ok:
        build_share(events)
        report.append("share images rebuilt")
    else:
        report.append(f"share images wait ({new} of {SHARE_EVERY})")
    ok, new = due(events, HOME_MARK, HOME_EVERY, "--home" in args)
    if ok:
        report.append("print walls updated" if build_walls(events) else "print walls already current")
    else:
        report.append(f"print walls wait ({new} of {HOME_EVERY} new events since their last refresh)")
    if build_brochure(events, "--pdf" in args):
        report.append("brochure PDF rebuilt")
    print("; ".join(report))


if __name__ == "__main__":
    main()
