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
SRC = ROOT / "src-images" / "gallery"
WEB = ROOT / "public" / "images" / "gallery"
BROCHURE = ROOT / "brochure"
PDF = ROOT / "public" / "brochure" / "magic-mirror-brochure.pdf"

TYPES = ["Weddings", "Birthdays", "Graduations & proms", "Galas & balls", "Campus nights", "Corporate", "Baby showers"]
HOME_EVERY = 4      # refresh the home page after this many new events
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


def home_due(events, force):
    last = HOME_MARK.read_text().strip() if HOME_MARK.exists() else ""
    files = [e["file"] for e in events]
    new = files.index(last) if last in files else len(files)
    if force or new >= HOME_EVERY:
        HOME_MARK.write_text(files[0] + "\n")
        return True, new
    return False, new


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


def main():
    args = set(sys.argv[1:])
    events = read_list()
    made = make_web_images(events)
    report = [f"{len(events)} prints in the list, {made} new web image set(s)"]
    if build_gallery(events):
        report.append("gallery updated")
    if build_links(events):
        report.append("/links updated")
    if build_picker(events):
        report.append('home "Your event, on paper" updated')
    due, new = home_due(events, "--home" in args)
    if due:
        report.append("print walls updated" if build_walls(events) else "print walls already current")
    else:
        report.append(f"print walls wait ({new} of {HOME_EVERY} new events since their last refresh)")
    if build_brochure(events, "--pdf" in args):
        report.append("brochure PDF rebuilt")
    print("; ".join(report))


if __name__ == "__main__":
    main()
