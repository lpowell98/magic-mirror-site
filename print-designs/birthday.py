#!/usr/bin/env python3
"""Birthday print designs. Same pipeline as the Wedding set (build.py): writes one HTML page per design,
photo count and mode into out-birthday/html/. Then:
  PD_OUT=out-birthday node render.js
  PD_OUT=out-birthday PD_FINAL=final-birthday python3 finish.py
Every design is 4x6 at 300 dpi. Every photo window is landscape."""
import json, math, os, random

import build
from build import paper, windows, box, caps, k, sparkle, gold_defs, NOISE

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out-birthday", "html")
FONTS = build.FONTS

# ---------- style guide: the brand's plum, orchid and gold, with black and cream ----------
C = dict(plum="#6E266C", orchid="#884C9E", lilac="#EADFF0", lilac_dk="#C9B3D6", gold="#FBA924", honey="#FDD486",
         amber="#C7811A", rose="#E9A3A6", rose_lt="#F7DCD8", cream="#FBF6EE", paper="#F6EFE3", ink="#24172A",
         black="#121014", white="#FFFFFF")
FOIL = "linear-gradient(100deg,#b9761a 0%,#fdd486 30%,#e39b22 50%,#ffe3a6 68%,#c7811a 100%)"
FOIL_TXT = f"background:{FOIL};-webkit-background-clip:text;background-clip:text;color:transparent"

FONT_CSS = build.FONT_CSS + "".join(
    f"@font-face{{font-family:'{n}';src:url('{FONTS}/{f}');font-style:{s};font-weight:100 900}}"
    for n, f, s in [("Fraunces", "Fraunces.ttf", "normal"), ("Fraunces", "Fraunces-Italic.ttf", "italic"),
                    ("Shrikhand", "Shrikhand-Regular.ttf", "normal"), ("Yellowtail", "Yellowtail-Regular.ttf", "normal")])


def fr(size, wt=700, soft=100, wonk=0, ital=False, opsz=144, extra=""):
    """Fraunces, the soft display serif used for names and ages."""
    return (f"font:{'italic ' if ital else ''}{wt} {size}px/1 Fraunces;"
            f"font-variation-settings:'SOFT' {soft},'WONK' {wonk},'opsz' {opsz};{extra}")


# ---------- layouts: windows [x,y,w,h,shape], all landscape ----------
L, P = (1800, 1200), (1200, 1800)
LAYOUTS = {
    "band": build.LAYOUTS["band"],    # landscape, photos on top, name in a band below
    "age": build.LAYOUTS["panel"],    # landscape, a colored panel holds the age beside the photos
    "card": build.LAYOUTS["card"],    # portrait, photos stacked, name at the foot
    "ticket": dict(size=P, n={        # portrait, name on top, rounded windows inside a card
        1: dict(wins=[[110, 660, 980, 735, "o"]], text=[60, 110, 1080, 500], foot=[60, 1430, 1080, 280]),
        2: dict(wins=[[110, 460, 980, 600, "o"], [110, 1100, 980, 600, "o"]], text=[60, 80, 1080, 340]),
        3: dict(wins=[[110, 430, 980, 400, "o"], [110, 870, 980, 400, "o"], [110, 1310, 980, 400, "o"]], text=[60, 70, 1080, 320])}),
}
for lay in LAYOUTS.values():
    for v in lay["n"].values():
        assert all(w > h for _, _, w, h, _ in v["wins"]), "every photo window must be landscape"


# ---------- ornaments, all drawn in code ----------
def _clear(x, y, r, avoid):
    return not any(ax - r < x < ax + aw + r and ay - r < y < ay + ah + r for ax, ay, aw, ah in avoid)


def scatter(W, H, avoid, count, colors, kinds, seed=1, scale=1.0, gap=70, edge=-10, opacity=1):
    """Evenly spread confetti that stays clear of the photos and the name."""
    rnd = random.Random(seed)
    pts, tries = [], 0
    while len(pts) < count and tries < 20000:
        tries += 1
        x, y = rnd.uniform(edge, W - edge), rnd.uniform(edge, H - edge)
        if _clear(x, y, 26 * scale, avoid) and all((x - a) ** 2 + (y - b) ** 2 > gap ** 2 for a, b in pts):
            pts.append((x, y))
    out = []
    for i, (x, y) in enumerate(pts):
        col, kind, rot = colors[i % len(colors)], kinds[rnd.randrange(len(kinds))], rnd.uniform(0, 180)
        s = scale * rnd.uniform(.8, 1.2)
        t = f'transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f}) scale({s:.2f})"'
        if kind == "dot":
            out.append(f'<circle r="11" fill="{col}" {t}/>')
        elif kind == "ring":
            out.append(f'<circle r="12" fill="none" stroke="{col}" stroke-width="5" {t}/>')
        elif kind == "dash":
            out.append(f'<line x1="-17" x2="17" stroke="{col}" stroke-width="10" stroke-linecap="round" {t}/>')
        elif kind == "tri":
            out.append(f'<path d="M0 -15 13 9 -13 9Z" fill="{col}" stroke="{col}" stroke-width="3" stroke-linejoin="round" {t}/>')
        elif kind == "squig":
            out.append(f'<path d="M-27 0q6.75 -10 13.5 0t13.5 0 13.5 0 13.5 0" fill="none" stroke="{col}" stroke-width="5.5" stroke-linecap="round" {t}/>')
        elif kind == "sprinkle":
            out.append(f'<line x1="-14" x2="14" stroke="{col}" stroke-width="11" stroke-linecap="round" {t}/>')
        elif kind == "star":
            out.append(f'<path d="M0 -20C1 -6 6 -1 20 0 6 1 1 6 0 20 -1 6 -6 1 -20 0 -6 -1 -1 -6 0 -20Z" fill="{col}" {t}/>')
        elif kind == "fleck":
            out.append(f'<circle r="4" fill="{col}" {t}/>')
    return f'<svg class="tex" width="{W}" height="{H}" style="opacity:{opacity}">{gold_defs()}{"".join(out)}</svg>'


def grow(r, g):
    x, y, w, h = r[:4]
    return [x - g, y - g, w + 2 * g, h + 2 * g]


def streamer(x0, y0, dx, dy, loops, r, color, sw=9):
    """A curled paper streamer: a ribbon that loops along a line (a trochoid), with a lighter edge."""
    pts = []
    steps = loops * 40
    for i in range(steps + 1):
        t = i / steps
        a = t * loops * 2 * math.pi
        pts.append((x0 + dx * t + r * math.cos(a) * (1 - .3 * t), y0 + dy * t + r * math.sin(a) * (1 - .3 * t)))
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="{sw*.3:.1f}" stroke-linecap="round" transform="translate(-1.5 -1.5)"/>')


def bunting(W, y, sag, flags, colors, fw=64, fh=78, x0=0, x1=None):
    """A string of pennant flags hanging in a gentle curve."""
    x1 = W if x1 is None else x1
    cy = lambda x: y + sag * (1 - ((x - (x0 + x1) / 2) / ((x1 - x0) / 2)) ** 2)
    pts = " ".join(f"{x:.0f},{cy(x):.1f}" for x in range(int(x0), int(x1) + 1, 10))
    out = [f'<polyline points="{pts}" fill="none" stroke="{C["ink"]}" stroke-opacity=".55" stroke-width="2.2"/>']
    for i in range(flags):
        fx = x0 + (x1 - x0) * (i + .5) / flags
        y1 = cy(fx - fw / 2); y2 = cy(fx + fw / 2)
        col = colors[i % len(colors)]
        out.append(f'<path d="M{fx-fw/2:.1f} {y1:.1f} L{fx+fw/2:.1f} {y2:.1f} L{fx:.1f} {(y1+y2)/2+fh:.1f}Z" fill="{col}"/>')
    return f'<svg class="tex" width="{W}" height="{y+sag+fh+10}">{"".join(out)}</svg>'


def rings(w, colors, band):
    """Retro rainbow: concentric half rings rising from the bottom edge."""
    out = []
    for i, col in enumerate(colors):
        r = w / 2 - i * band - band / 2
        if r <= band / 2: break
        out.append(f'<path d="M{w/2-r:.1f} {w/2} A{r:.1f} {r:.1f} 0 0 1 {w/2+r:.1f} {w/2}" fill="none" stroke="{col}" stroke-width="{band}"/>')
    return f'<svg width="{w}" height="{w/2:.0f}" viewBox="0 0 {w} {w/2}" style="display:block">{"".join(out)}</svg>'


def bulbs(x, y, w, h, r, step, color):
    """Marquee light bulbs around a rounded rectangle: each bulb a warm dot with a soft glow."""
    per = 2 * (w + h - 4 * r) + 2 * math.pi * r
    n = int(per // step)
    out = ['<defs><radialGradient id="bulb"><stop offset="0" stop-color="#fff7dd"/><stop offset=".45" stop-color="' + color +
           '"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></radialGradient></defs>']

    def at(s):
        segs = [("l", x + r, y, w - 2 * r, 0), ("a", x + w - r, y + r, -90), ("l", x + w, y + r, 0, h - 2 * r), ("a", x + w - r, y + h - r, 0),
                ("l", x + w - r, y + h, -(w - 2 * r), 0), ("a", x + r, y + h - r, 90), ("l", x, y + h - r, 0, -(h - 2 * r)), ("a", x + r, y + r, 180)]
        for sg in segs:
            ln = math.hypot(sg[3], sg[4]) if sg[0] == "l" else math.pi * r / 2
            if s <= ln:
                if sg[0] == "l":
                    f = s / ln if ln else 0
                    return sg[1] + sg[3] * f, sg[2] + sg[4] * f
                a = math.radians(sg[3] + 90 * s / ln)
                return sg[1] + r * math.cos(a), sg[2] + r * math.sin(a)
            s -= ln
        return x + r, y
    for i in range(n):
        px, py = at(i * per / n)
        out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{step*.42:.1f}" fill="url(#bulb)"/>'
                   f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{step*.14:.1f}" fill="#fffaf0"/>')
    return "".join(out)


def candles(n, h, color, flame):
    """A row of slim striped candles with teardrop flames."""
    w = n * 46
    out = [f'<defs><clipPath id="cb"><rect width="{w}" height="{h}"/></clipPath></defs>']
    for i in range(n):
        cx = 23 + i * 46
        ch = h * (.62 if i % 2 else .74) if n > 1 else h * .7
        top = h - ch
        out.append(f'<rect x="{cx-9}" y="{top}" width="18" height="{ch}" rx="4" fill="none" stroke="{color}" stroke-width="2.4"/>')
        for j in range(int(ch // 22)):
            yy = top + 12 + j * 22
            out.append(f'<line x1="{cx-9}" y1="{yy+8}" x2="{cx+9}" y2="{yy}" stroke="{color}" stroke-width="2" opacity=".7"/>')
        out.append(f'<line x1="{cx}" y1="{top}" x2="{cx}" y2="{top-9}" stroke="{color}" stroke-width="2"/>')
        fy = top - 12
        out.append(f'<path d="M{cx} {fy-30} C{cx+11} {fy-14} {cx+10} {fy} {cx} {fy} C{cx-10} {fy} {cx-11} {fy-14} {cx} {fy-30}Z" fill="{flame}"/>')
    return f'<svg width="{w}" height="{h}" viewBox="0 -44 {w} {h+44}" style="overflow:visible;height:{h+44}px">{"".join(out)}</svg>'


def text_core(lay, w, h):
    """The middle of a text box, where confetti must not go."""
    x, y, bw, bh = lay
    return [x + (bw - w) / 2, y + (bh - h) / 2, w, h]


# ---------- the 10 designs ----------
def confetti_pop(n, mode):  # kids and teens
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    s = k(n, 1, 1.2, .95)
    txt = (caps("Happy birthday", 24 * s, C["orchid"], ".44em", 600) +
           f'<div style="{fr(150*s, 800, 100, 1)};color:{C["plum"]};margin:{10*s}px 0 {14*s}px;letter-spacing:-.01em">Mia is seven</div>' +
           caps("March 8, 2027", 24 * s, C["amber"], ".38em", 600))
    avoid = [grow(w, 34) for w in lay["wins"]] + [text_core(lay["text"], 1150 * s, 300 * s)]
    conf = scatter(W, H, avoid, 70, [C["gold"], C["plum"], C["rose"], C["orchid"], C["honey"]],
                   ["dot", "dash", "tri", "squig", "ring"], seed=4, gap=k(n, 82, 64, 70))
    return dict(bg=C["cream"], body=paper(.10, .04) + conf +
                windows(lay["wins"], mode, mat=(14, "background:#fff;box-shadow:0 4px 14px rgba(60,30,60,.16)")) + box(lay["text"], txt))


def party_streamers(n, mode):  # tweens and teens
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    s = k(n, 1, 1.2, .95)
    tx, ty, tw, th = lay["text"]
    txt = (f'<div style="font:{140*s}px/1 Yellowtail;color:{C["plum"]};margin-bottom:{6*s}px">Jordan</div>' +
           f'<div style="display:flex;align-items:center;gap:{26*s}px">'
           f'<i class="hl" style="width:{110*s}px;background:{C["orchid"]};opacity:.5"></i>'
           f'{caps("Turns thirteen", 30*s, C["ink"], ".42em", 700)}'
           f'<i class="hl" style="width:{110*s}px;background:{C["orchid"]};opacity:.5"></i></div>' +
           caps("March 8, 2027", 20 * s, C["orchid"], ".4em", 500, "Montserrat", f"margin-top:{18*s}px"))
    cy = ty + th / 2
    st = "".join([
        streamer(-40, cy - 50 * s, 380, 90, 3, 34 * s, C["gold"]),
        streamer(-30, cy + 80 * s, 340, -20, 3, 26 * s, C["plum"]),
        streamer(W + 40, cy - 20 * s, -380, 80, 3, 34 * s, C["orchid"]),
        streamer(W + 30, cy + 100 * s, -340, -30, 3, 26 * s, C["gold"]),
    ])
    flecks = scatter(W, H, [grow(w, 24) for w in lay["wins"]] + [text_core(lay["text"], 1050 * s, 330 * s)], 46,
                     [C["gold"], C["orchid"], C["plum"]], ["fleck", "dot"], seed=9, gap=60, scale=.8)
    return dict(bg=C["lilac"], body=paper(.10, .06) + f'<svg class="tex" width="{W}" height="{H}">{st}</svg>' + flecks +
                windows(lay["wins"], mode, mat=(12, "background:#fff")) + box(lay["text"], txt))


def midnight_sparkle(n, mode):  # 21st to 40th
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    s = k(n, 1, 1.2, .95)
    txt = (f'<div style="display:flex;align-items:baseline;gap:{30*s}px">'
           f'<div style="font:{120*s}px/1 Italiana;letter-spacing:.14em;padding-left:.14em;{FOIL_TXT}">THIRTY</div>'
           f'<div style="font:{96*s}px/1 Yellowtail;color:{C["honey"]};transform:translateY({6*s}px)">Ava</div></div>' +
           caps("Cheers to thirty years · March 8, 2027", 20 * s, C["honey"], ".42em", 500, "Montserrat", f"margin-top:{24*s}px;opacity:.85"))
    avoid = [grow(w, 30) for w in lay["wins"]] + [text_core(lay["text"], 1250 * s, 260 * s)]
    st = scatter(W, H, avoid, 60, ["url(#g)", C["honey"], "url(#g)", C["gold"]], ["star", "fleck", "fleck"], seed=12, gap=56, scale=.9)
    border = f'<div class="fr" style="inset:24px;border:1.5px solid {C["gold"]};opacity:.55"></div>'
    return dict(bg=f"radial-gradient(110% 90% at 50% 25%,#2a1f30,{C['black']} 62%,#09080a)",
                body=paper(.09, .08) + border + st + windows(lay["wins"], mode, [(12, f'border:2px solid {C["gold"]}')]) + box(lay["text"], txt),
                defs=True)


def big_number(n, mode):  # 30th to 70th
    lay = LAYOUTS["age"]["n"][n]
    s = k(n, .9, 1.15, .62)
    num = f'<div style="{fr(k(n,400,460,460)*s, 800, 50, 0, opsz=60)};line-height:.8;{FOIL_TXT};letter-spacing:-.03em">40</div>'
    txt = (caps("Happy birthday", 22 * s, C["honey"], ".44em", 500, "Montserrat", f"margin-bottom:{32*s}px;opacity:.9") + num +
           f'<div style="font:{110*s}px/1 Yellowtail;color:{C["cream"]};margin-top:{18*s}px">Marcus</div>' +
           caps("March 8, 2027", 20 * s, C["honey"], ".4em", 500, "Montserrat", f"margin-top:{22*s}px;opacity:.85"))
    px, py, pw, ph = lay["panel"]
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;'
             f'background:radial-gradient(90% 70% at 50% 40%,#83367f,{C["plum"]} 70%,#561c54)">{paper(.12, .1)}</div>')
    return dict(bg=C["cream"], body=paper(.10, .04) + panel + windows(lay["wins"], mode, [(12, f'border:2px solid {C["gold"]}')]) + box(lay["text"], txt))


def retro_sunset(n, mode):  # sweet sixteen, or a 70s-themed party at any age
    lay = LAYOUTS["age"]["n"][n]
    px, py, pw, ph = lay["panel"]
    s = k(n, .82, 1.1, .5)
    rw = min(pw - k(n, 60, 140, 120), k(n, 760, 760, 380))
    arc = rings(rw, [C["plum"], C["orchid"], C["rose"], C["gold"], C["honey"]], rw * .075)
    txt = (f'<div style="font:{150*s}px/.95 Shrikhand;color:{C["plum"]}">Sweet</div>'
           f'<div style="font:{150*s}px/1 Shrikhand;color:{C["gold"]};-webkit-text-stroke:{3*s}px {C["plum"]}">sixteen</div>' +
           f'<div style="font:{86*s}px/1 Yellowtail;color:{C["orchid"]};margin-top:{18*s}px">Sofia</div>' +
           caps("03 · 08 · 2027", 22 * s, C["plum"], ".4em", 600, "Montserrat", f"margin-top:{16*s}px"))
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{C["rose_lt"]};overflow:hidden">{paper(.12, .08)}'
             f'<div style="position:absolute;left:{(pw-rw)/2}px;bottom:0">{arc}</div></div>')
    tb = [px, py, pw, ph - rw / 2 + k(n, 40, 60, 10)]
    return dict(bg=C["cream"], body=paper(.10, .04) + panel +
                windows(lay["wins"], mode, mat=(12, f"background:{C['white']};box-shadow:0 3px 10px rgba(60,30,60,.14)")) + box(tb, txt))


def marquee_lights(n, mode):  # 50th, or any big milestone
    lay = LAYOUTS["age"]["n"][n]
    px, py, pw, ph = lay["panel"]
    s = k(n, .86, 1.1, .6)
    ins = k(n, 46, 56, 26)
    b = bulbs(px + ins, py + ins, pw - 2 * ins, ph - 2 * ins, 40 * s + 10, 46 * s + 8, C["gold"])
    sign = (f'<svg class="tex" width="{px+pw}" height="{py+ph}">'
            f'<rect x="{px+ins}" y="{py+ins}" width="{pw-2*ins}" height="{ph-2*ins}" rx="{40*s+10}" fill="none" stroke="{C["amber"]}" stroke-width="2" opacity=".7"/>'
            f'{b}</svg>')
    txt = (caps("Fabulous at", 24 * s, C["honey"], ".46em", 500) +
           f'<div style="{fr(380*s, 800, 30, 0)};line-height:.85;{FOIL_TXT};margin:{14*s}px 0 {4*s}px;letter-spacing:-.02em">50</div>' +
           f'<div style="font:{96*s}px/1 Yellowtail;color:{C["cream"]}">Denise</div>' +
           caps("March 8, 2027", 20 * s, C["honey"], ".4em", 500, "Montserrat", f"margin-top:{18*s}px;opacity:.85"))
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:radial-gradient(80% 70% at 50% 45%,#2b2030,#151017)"></div>'
    return dict(bg=f"linear-gradient(160deg,#1d1720,{C['black']})", body=paper(.09, .07) + panel + sign +
                windows(lay["wins"], mode, [(12, f'border:2px solid {C["gold"]}')]) + box(lay["text"], txt))


def sprinkles(n, mode):  # little kids
    lay = LAYOUTS["card"]["n"][n]; W, H = P
    tx, ty, tw, th = lay["text"]
    if n == 1:
        txt = (caps("Happy birthday", 26, C["orchid"], ".44em", 600) +
               f'<div style="font:190px/1.05 Shrikhand;color:{C["plum"]};margin:18px 0 6px">Leo</div>' +
               f'<div style="{fr(64, 600, 100, 1, True)};color:{C["amber"]}">is five!</div>' +
               caps("March 8, 2027", 22, C["orchid"], ".4em", 600, "Montserrat", "margin-top:34px"))
        core = text_core(lay["text"], 760, 560)
    else:
        txt = (f'<div style="display:flex;align-items:baseline;gap:26px"><div style="font:120px/1.1 Shrikhand;color:{C["plum"]}">Leo</div>'
               f'<div style="{fr(56, 600, 100, 1, True)};color:{C["amber"]}">is five!</div></div>' +
               caps("March 8, 2027", 20, C["orchid"], ".4em", 600, "Montserrat", "margin-top:14px"))
        core = text_core(lay["text"], 900, 250)
    avoid = [grow(w, 26) for w in lay["wins"]] + [core]
    sp = scatter(W, H, avoid, 90, [C["gold"], C["plum"], C["rose"], C["orchid"], C["white"]], ["sprinkle"], seed=21, gap=46, scale=.95)
    return dict(bg=C["lilac"], body=paper(.10, .05) + sp + windows(lay["wins"], mode, mat=(14, "background:#fff;box-shadow:0 4px 14px rgba(60,30,60,.16)")) + box(lay["text"], txt))


def plum_velvet(n, mode):  # 60th and up
    lay = LAYOUTS["card"]["n"][n]
    if n == 1:
        txt = (candles(5, 190, C["honey"], "url(#g)") +
               f'<div style="{fr(150, 500, 100, 0, True)};color:{C["cream"]};margin-top:40px">Grace</div>' +
               f'<div style="font:{72}px/1.2 Italiana;letter-spacing:.2em;padding-left:.2em;{FOIL_TXT};margin-top:18px">SIXTY YEARS</div>' +
               caps("March 8, 2027", 22, C["honey"], ".42em", 500, "Montserrat", "margin-top:26px;opacity:.85"))
    else:
        txt = (f'<div style="display:flex;align-items:center;gap:34px">'
               f'<div style="{fr(108, 500, 100, 0, True)};color:{C["cream"]}">Grace</div>'
               f'<i class="hl" style="width:1.5px;height:84px;background:{C["gold"]};opacity:.7"></i>'
               f'<div style="font:58px/1.1 Italiana;letter-spacing:.2em;padding-left:.2em;{FOIL_TXT};text-align:left">SIXTY<br>YEARS</div></div>' +
               caps("March 8, 2027", 20, C["honey"], ".42em", 500, "Montserrat", "margin-top:22px;opacity:.85"))
    border = (f'<div class="fr" style="inset:30px;border:1.5px solid {C["gold"]};opacity:.6"></div>'
              f'<div class="fr" style="inset:40px;border:1px solid {C["gold"]};opacity:.35"></div>')
    return dict(bg=f"radial-gradient(110% 80% at 50% 35%,#7d2f7a,{C['plum']} 55%,#4a1748)",
                body=paper(.12, .12) + border + windows(lay["wins"], mode, [(12, f'border:2px solid {C["gold"]}')]) + box(lay["text"], txt), defs=True)


def _ticket_card(n):
    """A cream ticket inset on the ground, with notches and a perforation under the header."""
    lay = LAYOUTS["ticket"]["n"][n]
    W, H = P
    y = lay["wins"][0][1] - k(n, 70, 52, 46)
    notch = 34
    return (f'<div class="fr" style="left:44px;top:44px;right:44px;bottom:44px;background:{C["cream"]};border-radius:22px;'
            f'-webkit-mask:radial-gradient(circle at 0 {y-44}px,transparent {notch}px,#000 {notch+1}px) left/51% 100% no-repeat,'
            f'radial-gradient(circle at 100% {y-44}px,transparent {notch}px,#000 {notch+1}px) right/51% 100% no-repeat">{paper(.10, .05)}</div>'
            f'<div class="fr" style="left:{44+notch+18}px;right:{44+notch+18}px;top:{y-1.5}px;border-top:3px dashed {C["plum"]};opacity:.35"></div>')


def party_ticket(n, mode):  # 18th, 21st, 25th
    lay = LAYOUTS["ticket"]["n"][n]
    tx, ty, tw, th = lay["text"]
    perf = lay["wins"][0][1] - k(n, 70, 52, 46)
    tb = [tx, ty, tw, perf - ty - 14] if n > 1 else lay["text"]
    star = sparkle(k(n, 22, 16, 15), C["gold"])
    head = (f'<div style="display:flex;align-items:center;gap:18px">{star}{caps("Admit one · VIP", k(n,24,18,17), C["plum"], ".46em", 700)}{star}</div>' +
            f'<div style="{fr(k(n,190,124,112), 900, 0, 0)};color:{C["ink"]};margin:{k(n,26,10,8)}px 0 {k(n,10,4,4)}px;letter-spacing:-.02em">Chris</div>' +
            f'<div style="{fr(k(n,64,44,40), 500, 0, 0, True)};color:{C["plum"]}">turns twenty-one</div>')
    date = caps("Saturday · March 8, 2027", k(n, 24, 18, 17), C["amber"], ".4em", 700, "Montserrat", f"margin-top:{k(n,0,14,10)}px")
    text = box(tb, head) + box(lay["foot"], date + caps("No. 0021", 18, C["plum"], ".5em", 500, "Montserrat", "margin-top:20px;opacity:.6")) if n == 1 \
        else box(tb, head + date)
    return dict(bg=f"linear-gradient(160deg,#7b2d78,{C['plum']} 60%,#561c54)", body=paper(.10, .08) + _ticket_card(n) +
                windows(lay["wins"], mode, [(10, f'border:2.5px solid {C["gold"]}')]) + text)


def bunting_party(n, mode):  # first birthdays and little kids
    lay = LAYOUTS["ticket"]["n"][n]; W, H = P
    flags = bunting(W, k(n, 40, 30, 26), k(n, 60, 40, 36), k(n, 11, 13, 13), [C["plum"], C["gold"], C["rose"], C["orchid"], C["honey"]],
                    fw=k(n, 74, 64, 60), fh=k(n, 92, 72, 66), x0=-20, x1=W + 20)
    tx, ty, tw, th = lay["text"]
    tb = [tx, ty + k(n, 90, 66, 60), tw, th - k(n, 60, 50, 50)]
    head = (f'<div style="font:{k(n,200,138,124)}px/1 Shrikhand;color:{C["plum"]}">Ella</div>' +
            f'<div style="{fr(k(n,68,50,46), 600, 100, 1, True)};color:{C["amber"]};margin-top:{k(n,8,4,2)}px">is one!</div>')
    date = caps("March 8, 2027", k(n, 24, 20, 19), C["orchid"], ".42em", 600, "Montserrat", f"margin-top:{k(n,0,12,10)}px")
    text = box(tb, head) + box(lay["foot"], date) if n == 1 else box(tb, head + date)
    dots = (f'<div class="tex" style="background-image:radial-gradient({C["lilac_dk"]} 6px,transparent 7px);'
            f'background-size:56px 56px;background-position:0 0;opacity:.45"></div>')
    return dict(bg=C["cream"], body=paper(.10, .04) + dots + flags +
                windows(lay["wins"], mode, mat=(14, "background:#fff;box-shadow:0 4px 14px rgba(60,30,60,.15)")) + text)


def bubbles(w, h, seed, count, color, fill):
    """Champagne bubbles rising from the bottom: more and bigger near the bottom, a highlight on each."""
    rnd = random.Random(seed); out, pts = [], []
    tries = 0
    while len(pts) < count and tries < 8000:
        tries += 1
        y = h * (1 - rnd.random() ** 1.8)
        r = 4 + 22 * (y / h) ** 1.5 * rnd.uniform(.5, 1)
        x = rnd.uniform(r + 6, w - r - 6)
        if all(math.hypot(x - a, y - b) > r + c + 8 for a, b, c in pts):
            pts.append((x, y, r))
    for x, y, r in pts:
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{fill}" stroke="{color}" stroke-width="{max(1.6, r*.12):.1f}"/>')
        if r > 8: out.append(f'<path d="M{x-r*.55:.1f} {y-r*.1:.1f} A{r*.6:.1f} {r*.6:.1f} 0 0 1 {x-r*.1:.1f} {y-r*.55:.1f}" fill="none" stroke="#fff" stroke-width="{max(1.2, r*.1):.1f}" stroke-linecap="round" opacity=".8"/>')
    return f'<svg width="{w}" height="{h}" style="display:block">{"".join(out)}</svg>'


def chips(W, H, avoid, count, colors, seed=1, gap=58, rmin=9, rmax=26):
    """Terrazzo chips: small irregular stones, evenly spread, kept clear of the photos and the name."""
    rnd = random.Random(seed); pts, out, tries = [], [], 0
    while len(pts) < count and tries < 30000:
        tries += 1
        x, y = rnd.uniform(-10, W + 10), rnd.uniform(-10, H + 10)
        if _clear(x, y, rmax, avoid) and all(math.hypot(x - a, y - b) > gap for a, b in pts):
            pts.append((x, y))
    for i, (x, y) in enumerate(pts):
        r = rnd.uniform(rmin, rmax) * (1.6 if rnd.random() < .12 else 1)
        nv = rnd.randint(5, 7); a0 = rnd.uniform(0, 6.28)
        poly = " ".join(f"{x + math.cos(a0 + j * 6.283 / nv) * r * rnd.uniform(.6, 1.1):.1f},{y + math.sin(a0 + j * 6.283 / nv) * r * rnd.uniform(.5, 1):.1f}" for j in range(nv))
        out.append(f'<polygon points="{poly}" fill="{colors[i % len(colors)]}" stroke="{colors[i % len(colors)]}" stroke-width="2.5" stroke-linejoin="round"/>')
    return f'<svg class="tex" width="{W}" height="{H}">{"".join(out)}</svg>'


def champagne_bubbles(n, mode):  # 30th to 70th
    lay = LAYOUTS["age"]["n"][n]
    px, py, pw, ph = lay["panel"]
    s = k(n, .9, 1.1, .6)
    bh = k(n, 420, 420, 150)
    bub = bubbles(pw, bh, 5, k(n, 40, 56, 22), C["amber"], "rgba(253,212,134,.28)")
    txt = (caps("Cheers to", 24 * s, C["amber"], ".46em", 700) +
           f'<div style="{fr(330*s, 800, 100, 0, opsz=72)};color:{C["plum"]};line-height:.9;margin:{12*s}px 0 {4*s}px;letter-spacing:-.02em">40</div>' +
           f'<div style="{fr(64*s, 500, 100, 1, True)};color:{C["plum"]}">years of Marcus</div>' +
           caps("March 8, 2027", 20 * s, C["amber"], ".4em", 600, "Montserrat", f"margin-top:{22*s}px"))
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;overflow:hidden;'
             f'background:linear-gradient(180deg,#fbf1dc,#f4dfb3)">{paper(.12, .08)}'
             f'<div style="position:absolute;left:0;bottom:0">{bub}</div></div>')
    tb = [px, py, pw, ph - k(n, 300, 300, 150)]
    return dict(bg=C["plum"], body=paper(.12, .10) + panel + windows(lay["wins"], mode, [(12, f'border:2px solid {C["gold"]}')]) + box(tb, txt))


def terrazzo(n, mode):  # any age, modern
    lay = LAYOUTS["card"]["n"][n]; W, H = P
    if n == 1:
        txt = (caps("Happy birthday", 24, C["orchid"], ".46em", 700) +
               f'<div style="{fr(170, 700, 100, 0)};color:{C["ink"]};margin:22px 0 4px">Grace</div>' +
               f'<div style="{fr(62, 500, 100, 1, True)};color:{C["plum"]}">turns sixty</div>' +
               caps("March 8, 2027", 22, C["amber"], ".42em", 700, "Montserrat", "margin-top:32px"))
        core = text_core(lay["text"], 820, 520)
    else:
        txt = (f'<div style="display:flex;align-items:baseline;gap:26px"><div style="{fr(112, 700, 100, 0)};color:{C["ink"]}">Grace</div>'
               f'<div style="{fr(54, 500, 100, 1, True)};color:{C["plum"]}">turns sixty</div></div>' +
               caps("March 8, 2027", 20, C["amber"], ".42em", 700, "Montserrat", "margin-top:16px"))
        core = text_core(lay["text"], 1000, 240)
    avoid = [grow(w, 30) for w in lay["wins"]] + [core]
    stones = chips(W, H, avoid, 120, [C["plum"], C["gold"], C["rose"], C["orchid"], C["lilac_dk"], C["honey"]], seed=31, gap=k(n, 62, 50, 46))
    return dict(bg="#F7F2EA", body=paper(.12, .06) + stones +
                windows(lay["wins"], mode, mat=(14, "background:#fff;box-shadow:0 4px 14px rgba(40,20,40,.14)")) + box(lay["text"], txt))


def starburst(n, mode):  # 30th to 70th
    lay = LAYOUTS["age"]["n"][n]
    px, py, pw, ph = lay["panel"]
    s = k(n, .82, 1.05, .56)
    cx, cy = pw / 2, ph * k(n, .4, .42, .46)
    R = math.hypot(pw, ph)
    rays = "".join(f'<path d="M{cx} {cy} L{cx+R*math.cos(math.radians(a)):.1f} {cy+R*math.sin(math.radians(a)):.1f} '
                   f'L{cx+R*math.cos(math.radians(a+7.5)):.1f} {cy+R*math.sin(math.radians(a+7.5)):.1f}Z" fill="#7f317c"/>'
                   for a in range(0, 360, 15))
    br = 210 * s
    badge = (f'<circle cx="{cx}" cy="{cy}" r="{br+26*s:.1f}" fill="none" stroke="{C["gold"]}" stroke-width="{3*s:.1f}" stroke-dasharray="{2*s:.1f} {9*s:.1f}" stroke-linecap="round"/>'
             f'<circle cx="{cx}" cy="{cy}" r="{br+10*s:.1f}" fill="{C["gold"]}"/><circle cx="{cx}" cy="{cy}" r="{br:.1f}" fill="{C["cream"]}"/>')
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;overflow:hidden;background:{C["plum"]}">'
             f'<svg width="{pw}" height="{ph}" style="position:absolute;inset:0">{rays}{badge}</svg>{paper(.12, .08)}</div>')
    inner = (caps("Cheers to", 20 * s, C["amber"], ".42em", 700) +
             f'<div style="{fr(200*s, 800, 100, 0, opsz=72)};color:{C["plum"]};line-height:.95;letter-spacing:-.02em">40</div>' +
             caps("years", 20 * s, C["amber"], ".42em", 700))
    badge_box = box([px + cx - br, py + cy - br, 2 * br, 2 * br], inner)
    below = (f'<div style="font:{110*s}px/1 Yellowtail;color:{C["cream"]}">Marcus</div>' +
             caps("March 8, 2027", 20 * s, C["honey"], ".4em", 600, "Montserrat", f"margin-top:{14*s}px"))
    top = py + cy + br + 30 * s
    below_box = box([px, top, pw, py + ph - top - k(n, 50, 50, 14)], below)
    return dict(bg=C["cream"], body=paper(.10, .04) + panel + windows(lay["wins"], mode, [(12, f'border:2px solid {C["gold"]}')]) + badge_box + below_box)


def _age_text(s, name_col, date_col, gap=14):
    return (f'<div style="font:{104*s}px/1 Yellowtail;color:{name_col}">Marcus</div>' +
            caps("March 8, 2027", 20 * s, date_col, ".4em", 600, "Montserrat", f"margin-top:{gap*s}px"))


def color_block(n, mode):  # 30th to 70th, modern
    lay = LAYOUTS["age"]["n"][n]
    px, py, pw, ph = lay["panel"]
    s = k(n, .82, 1.05, .5)
    u = k(n, 150, 170, 72)  # grid unit
    ox, oy = (pw - 2 * u) / 2, k(n, 130, 110, 40)
    shapes = (f'<rect x="{ox}" y="{oy}" width="{u}" height="{u}" fill="{C["gold"]}"/>'
              f'<path d="M{ox+u} {oy} L{ox+2*u} {oy} A{u} {u} 0 0 1 {ox+u} {oy+u}Z" fill="{C["rose"]}"/>'
              f'<path d="M{ox} {oy+u} A{u} {u} 0 0 0 {ox+u} {oy+2*u} L{ox+u} {oy+u}Z" fill="{C["orchid"]}"/>'
              f'<rect x="{ox+u}" y="{oy+u}" width="{u}" height="{u}" fill="{C["plum"]}"/>'
              f'<circle cx="{ox+1.5*u}" cy="{oy+1.5*u}" r="{u*.3}" fill="{C["honey"]}"/>')
    art = f'<svg class="tex" width="{pw}" height="{ph}">{shapes}</svg>'
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{C["cream"]};overflow:hidden">{paper(.10, .05)}{art}</div>'
    top = py + oy + 2 * u
    below = (f'<div style="{fr(250*s, 900, 0, 0, opsz=72)};color:{C["ink"]};line-height:.9;letter-spacing:-.03em">40</div>' +
             f'<div style="{fr(84*s, 600, 100, 0, True)};color:{C["plum"]};margin-top:{6*s}px">Marcus</div>' +
             caps("March 8, 2027", 20 * s, C["amber"], ".4em", 700, "Montserrat", f"margin-top:{14*s}px"))
    return dict(bg="#EDE6DA", body=paper(.10, .05) + panel + windows(lay["wins"], mode) + box([px, top, pw, py + ph - top - k(n, 40, 40, 6)], below))


def party_awning(n, mode):  # 30th to 70th, festive
    lay = LAYOUTS["age"]["n"][n]
    px, py, pw, ph = lay["panel"]
    s = k(n, .82, 1.05, .56)
    nst = k(n, 6, 9, 9)
    sw = pw / nst
    ah = ph * k(n, .3, .3, .34)
    st = "".join(f'<rect x="{i*sw:.1f}" y="0" width="{sw:.1f}" height="{ah:.1f}" fill="{C["plum"] if i % 2 == 0 else C["cream"]}"/>' for i in range(nst))
    sc = "".join(f'<path d="M{i*sw:.1f} {ah:.1f} A{sw/2:.1f} {sw/2:.1f} 0 0 0 {(i+1)*sw:.1f} {ah:.1f}Z" fill="{C["plum"] if i % 2 == 0 else C["cream"]}"/>' for i in range(nst))
    shade = f'<rect x="0" y="{ah-6:.1f}" width="{pw}" height="6" fill="#000" opacity=".08"/>'
    art = f'<svg class="tex" width="{pw}" height="{ph}">{st}{shade}{sc}</svg>'
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{C["rose_lt"]};overflow:hidden">{paper(.10, .06)}{art}</div>'
    tb = [px, py + ah + sw / 2, pw, ph - ah - sw / 2]
    txt = (caps("It's a party", 20 * s, C["plum"], ".44em", 700) +
           f'<div style="{fr(250*s, 900, 100, 1, opsz=72)};color:{C["plum"]};line-height:.95;margin:{6*s}px 0;letter-spacing:-.02em">40</div>' +
           _age_text(s, C["amber"], C["plum"], 6))
    return dict(bg=C["cream"], body=paper(.10, .04) + panel + windows(lay["wins"], mode, mat=(12, "background:#fff;box-shadow:0 3px 10px rgba(60,30,60,.14)")) + box(tb, txt))


def echo(n, mode):  # 30th to 70th, typographic
    lay = LAYOUTS["age"]["n"][n]
    px, py, pw, ph = lay["panel"]
    s = k(n, .82, 1.05, .56)
    fs = k(n, 122, 190, 104)
    rows = k(n, 4, 4, 3)
    hi = 1 if rows == 3 else 2
    words = "".join(
        f'<div style="{fr(fs, 900, 0, 0, opsz=72)};line-height:.92;letter-spacing:.01em;'
        + (f"color:{C['gold']}" if i == hi else f"color:transparent;-webkit-text-stroke:{2.2}px {C['gold']};opacity:.7") + '">FORTY</div>'
        for i in range(rows))
    stack = f'<div style="display:flex;flex-direction:column;align-items:center">{words}</div>'
    txt = (stack + f'<div style="font:{96*s}px/1 Yellowtail;color:{C["cream"]};margin-top:{30*s}px">Marcus</div>' +
           caps("March 8, 2027", 20 * s, C["honey"], ".4em", 600, "Montserrat", f"margin-top:{12*s}px"))
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:radial-gradient(90% 70% at 50% 40%,#2a1c2e,{C["black"]})">{paper(.10, .08)}</div>'
    return dict(bg="#1a141c", body=paper(.10, .06) + panel + windows(lay["wins"], mode, [(12, f'border:2px solid {C["gold"]}')]) + box([px, py, pw, ph], txt))


OPTIONS = [("color-block", "Color Block", "age", color_block), ("party-awning", "Party Awning", "age", party_awning), ("starburst", "Starburst", "age", starburst)]  # rejected alternatives, PD_OPTIONS=1


DESIGNS = [  # id, name, base layout, builder
    ("confetti-pop", "Confetti Pop", "band", confetti_pop),
    ("party-streamers", "Party Streamers", "band", party_streamers),
    ("midnight-sparkle", "Midnight Sparkle", "band", midnight_sparkle),
    ("echo", "Echo", "age", echo),
    ("retro-sunset", "Retro Sunset", "age", retro_sunset),
    ("marquee-lights", "Marquee Lights", "age", marquee_lights),
    ("sprinkles", "Sprinkles", "card", sprinkles),
    ("terrazzo", "Terrazzo", "card", terrazzo),
    ("party-ticket", "Party Ticket", "ticket", party_ticket),
    ("bunting-party", "Bunting Party", "ticket", bunting_party),
]


def page(d, n, mode):
    did, name, base, fn = d
    W, H = LAYOUTS[base]["size"]
    r = fn(n, mode)
    return (f'<!doctype html><meta charset="utf-8"><style>{FONT_CSS}{build.BASE_CSS}body{{width:{W}px;height:{H}px;background:{r["bg"]}}}</style>'
            f'<svg width="0" height="0" style="position:absolute">{gold_defs()}</svg><body>{r["body"]}</body>')


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for d in DESIGNS + (OPTIONS if os.environ.get('PD_OPTIONS') else []):
        did, name, base, _ = d
        W, H = LAYOUTS[base]["size"]
        for n in (1, 2, 3):
            for mode in ("preview", "overlay", "blank"):
                with open(os.path.join(OUT, f"{did}-{n}-{mode}.html"), "w") as f:
                    f.write(page(d, n, mode))
            manifest.append(dict(id=did, name=name, base=base, n=n, size=[W, H], category="birthday",
                                 wins=[w[:4] for w in LAYOUTS[base]["n"][n]["wins"]],
                                 shapes=[w[4] for w in LAYOUTS[base]["n"][n]["wins"]]))
    with open(os.path.join(HERE, "out-birthday", "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(len(manifest), "design versions")


if __name__ == "__main__":
    main()
