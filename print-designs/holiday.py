#!/usr/bin/env python3
"""Holiday print designs: Christmas and winter, New Year's Eve, Halloween and general holiday parties.
Same pipeline as the Wedding (build.py) and Birthday (birthday.py) sets. Writes one HTML page per design,
photo count and mode into out-holiday/html/. Then:
  PD_OUT=out-holiday node render.js
  PD_OUT=out-holiday PD_FINAL=final-holiday python3 finish.py
Every design is 4x6 at 300 dpi. Every photo window is landscape."""
import json, math, os, random

import build
from build import paper, windows, box, caps, k, sparkle, gold_defs
from birthday import _clear, grow, text_core, scatter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out-holiday", "html")
FONTS = build.FONTS

# ---------- style guide: claret, spruce and midnight, with frost, snow and two foils ----------
C = dict(claret="#7B1E2B", berry="#A8323E", spruce="#1F4A3C", pine="#2F6553", sage="#6F9686", frost="#C9D8DE",
         ice="#EEF3F4", snow="#FAF8F4", midnight="#0E1724", navy="#17263A", ink="#1B1E24", gold="#C9A04A",
         gold_lt="#E8CF8E", silver="#C7CED3", night="#150D19", plum="#3A1E3F", ember="#D9692B", bone="#EEE4D1",
         kraft="#C8A77E", white="#FFFFFF")
GOLD = "linear-gradient(100deg,#9c7a32 0%,#ecd595 30%,#c9a04a 50%,#f6e6b4 68%,#a9853b 100%)"
SILVER = "linear-gradient(100deg,#8f989f 0%,#eef2f4 30%,#b7c0c6 50%,#ffffff 66%,#9aa3aa 100%)"
foil = lambda g: f"background:{g};-webkit-background-clip:text;background-clip:text;color:transparent"

FONT_CSS = build.FONT_CSS + "".join(
    f"@font-face{{font-family:'{n}';src:url('{FONTS}/{f}');font-style:{s};font-weight:100 900}}"
    for n, f, s in [("Cinzel", "Cinzel.ttf", "normal"), ("Poiret", "PoiretOne-Regular.ttf", "normal"),
                    ("Playfair", "PlayfairDisplay.ttf", "normal"), ("Playfair", "PlayfairDisplay-Italic.ttf", "italic")])


def pf(size, wt=500, ital=True, extra=""):
    """Playfair Display, the high-contrast serif used for names."""
    return f"font:{'italic ' if ital else ''}{wt} {size}px/1.05 Playfair;{extra}"


def cz(t, size, color, ls=".12em", wt=500, extra=""):
    """Cinzel engraved capitals."""
    return f'<div style="font:{wt} {size}px/1.1 Cinzel;letter-spacing:{ls};padding-left:{ls};color:{color};{extra}">{t}</div>'


# ---------- layouts: windows [x,y,w,h,shape], all landscape ----------
L, P = (1800, 1200), (1200, 1800)
LAYOUTS = {
    "band": build.LAYOUTS["band"],     # landscape, photos on top, words in a band below
    "panel": build.LAYOUTS["panel"],   # landscape, a panel holds the art and words beside the photos
    "card": build.LAYOUTS["card"],     # portrait, photos stacked, words at the foot
    "tag": dict(size=P, n={            # portrait, words on top, rounded windows on a tag or label
        1: dict(wins=[[110, 660, 980, 735, "o"]], text=[60, 150, 1080, 470], foot=[60, 1430, 1080, 280]),
        2: dict(wins=[[110, 470, 980, 600, "o"], [110, 1110, 980, 600, "o"]], text=[60, 120, 1080, 320]),
        3: dict(wins=[[110, 440, 980, 400, "o"], [110, 880, 980, 400, "o"], [110, 1320, 980, 400, "o"]], text=[60, 110, 1080, 300])}),
}
for lay in LAYOUTS.values():
    for v in lay["n"].values():
        assert all(w > h for _, _, w, h, _ in v["wins"]), "every photo window must be landscape"


# ---------- ornaments, all drawn in code ----------
def svg(W, H, inner, cls="tex", style=""):
    return f'<svg class="{cls}" width="{W}" height="{H}" style="{style}">{inner}</svg>'


def pine(x, by, h, color, tiers=4, seed=0):
    """A papercut spruce: stacked, slightly ragged tiers on a short trunk."""
    rnd = random.Random(seed)
    top, body = by - h, h * .9
    R, Lf = [], []
    for t in range(1, tiers + 1):
        yb = top + body * (t / tiers) ** .92
        w = h * .3 * (.35 + .65 * t / tiers) * rnd.uniform(.94, 1.06)
        R.append((x + w, yb))
        Lf.append((x - w * rnd.uniform(.95, 1.05), yb))
        if t < tiers:
            yi = yb - body / tiers * .22
            R.append((x + w * .5, yi)); Lf.append((x - w * .5, yi))
    tw = h * .045
    pts = [(x, top)] + R + [(x + tw, R[-1][1]), (x + tw, by), (x - tw, by), (x - tw, Lf[-1][1])] + Lf[::-1]
    return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}" fill="{color}"/>'


def forest(W, H, avoid, rows, seed=1):
    """Layered paper forest along the bottom edge. rows: (count, hmin, hmax, color) from back to front.
    Trees that would touch a photo or the words are left out."""
    rnd = random.Random(seed)
    out = []
    for ri, (count, h0, h1, col) in enumerate(rows):
        g = []
        for i in range(count):
            x = (i + rnd.uniform(.15, .85)) * W / count
            for _ in range(6):
                h = rnd.uniform(h0, h1)
                w = h * .32
                if _clear(x, H - h / 2, 0, [[a - w, b - h / 2, c + 2 * w, d + h] for a, b, c, d in avoid]):
                    g.append(pine(x, H + 6, h, col, rnd.choice([3, 4, 4, 5]), seed * 100 + ri * 10 + i)); break
                h0, h1 = h0 * .9, h1 * .9
        out.append(f'<g style="filter:drop-shadow(0 {4+3*ri}px {5+3*ri}px rgba(10,30,25,.22))">{"".join(g)}</g>')
    return svg(W, H, "".join(out))


def snowfall(W, H, avoid, count, color, seed=3, gap=40):
    rnd = random.Random(seed); pts = []; tries = 0
    while len(pts) < count and tries < 20000:
        tries += 1
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        if _clear(x, y, 14, avoid) and all((x - a) ** 2 + (y - b) ** 2 > gap ** 2 for a, b in pts): pts.append((x, y))
    return svg(W, H, "".join(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rnd.uniform(2.5, 7):.1f}" fill="{color}" opacity="{rnd.uniform(.45, .95):.2f}"/>' for x, y in pts))


def snowflake(cx, cy, r, color, sw=2.2, seed=0, rot=0):
    """A six-armed ice crystal in fine line, its branches varied by seed."""
    rnd = random.Random(seed)
    branches = [(rnd.uniform(.3, .45), rnd.uniform(.22, .34)), (rnd.uniform(.55, .68), rnd.uniform(.16, .26))]
    if rnd.random() < .6: branches.append((rnd.uniform(.78, .86), rnd.uniform(.08, .13)))
    ang = rnd.choice([45, 55, 60])
    arm = [f"M0 0 L0 {-r:.1f}"]
    for f, ln in branches:
        y = -r * f; b = r * ln
        for sgn in (-1, 1):
            a = math.radians(ang) * sgn
            arm.append(f"M0 {y:.1f} L{b*math.sin(a):.1f} {y - b*math.cos(a):.1f}")
    d = " ".join(arm)
    arms = "".join(f'<path d="{d}" transform="rotate({i*60})"/>' for i in range(6))
    hexr = r * rnd.uniform(.1, .16)
    hexa = " ".join(f"{hexr*math.cos(math.radians(30+60*i)):.1f},{hexr*math.sin(math.radians(30+60*i)):.1f}" for i in range(6))
    tips = "".join(f'<circle cx="0" cy="{-r:.1f}" r="{sw*1.1:.1f}" transform="rotate({i*60})"/>' for i in range(6))
    return (f'<g transform="translate({cx:.1f} {cy:.1f}) rotate({rot})" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round">'
            f'{arms}<polygon points="{hexa}"/><g fill="{color}" stroke="none">{tips}</g></g>')


def burst(cx, cy, r, color, rays=28, seed=0, sw=2.4):
    """A firework in fine line: rays of two lengths with a bead at each tip, and a faint inner ring."""
    rnd = random.Random(seed); out = []
    for i in range(rays):
        a = 2 * math.pi * i / rays + rnd.uniform(-.03, .03)
        r0, r1 = r * .2, r * (1 if i % 2 == 0 else .72) * rnd.uniform(.92, 1.04)
        c, s = math.cos(a), math.sin(a)
        out.append(f'<line x1="{cx+c*r0:.1f}" y1="{cy+s*r0:.1f}" x2="{cx+c*r1:.1f}" y2="{cy+s*r1:.1f}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" opacity=".9"/>'
                   f'<circle cx="{cx+c*(r1+sw*3):.1f}" cy="{cy+s*(r1+sw*3):.1f}" r="{sw*1.15:.1f}" fill="{color}"/>')
        if i % 2 == 0:
            out.append(f'<circle cx="{cx+c*r*1.18:.1f}" cy="{cy+s*r*1.18:.1f}" r="{sw*.7:.1f}" fill="{color}" opacity=".55"/>')
    return "".join(out)


def wreath(R, band, seed=4):
    """An evergreen wreath: overlapping sprigs, each a stem with paired needles, set round the ring
    in three greens with a touch of frost, and claret berries at the foot."""
    rnd = random.Random(seed); c = R + band; out = []
    cols = [C["spruce"], C["pine"], "#244f41", C["sage"], C["pine"]]
    nl = max(1.6, band * .032)
    for ring, (off, cnt) in enumerate([(-.32, 46), (.32, 46), (0, 40)]):
        for i in range(cnt):
            a = 2 * math.pi * (i + rnd.uniform(0, .6)) / cnt
            rr = R + off * band + rnd.uniform(-band * .08, band * .08)
            x, y = c + rr * math.cos(a), c + rr * math.sin(a)
            t = a + math.pi / 2 + rnd.uniform(-.35, .35) + off * .6   # stem runs clockwise, splayed out or in
            Ls = band * rnd.uniform(.62, .8)
            col = cols[rnd.randrange(len(cols))] if ring < 2 or rnd.random() < .88 else C["sage"]
            ct, st = math.cos(t), math.sin(t)
            g = [f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x+ct*Ls:.1f}" y2="{y+st*Ls:.1f}"/>']
            for j in range(1, 11):
                f = j / 11; px, py = x + ct * Ls * f, y + st * Ls * f
                ln = band * .3 * (1 - .5 * f)
                for sg in (-1, 1):
                    q = t + sg * 0.7
                    g.append(f'<line x1="{px:.1f}" y1="{py:.1f}" x2="{px+math.cos(q)*ln:.1f}" y2="{py+math.sin(q)*ln:.1f}"/>')
            out.append(f'<g stroke="{col}" stroke-width="{nl:.1f}" stroke-linecap="round">{"".join(g)}</g>')
    for a0 in (100, 76, 124):
        for j in range(3):
            a = math.radians(a0 + rnd.uniform(-7, 7)); rr = R + rnd.uniform(-band * .3, band * .3)
            x, y, br = c + rr * math.cos(a), c + rr * math.sin(a), band * rnd.uniform(.12, .16)
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{br:.1f}" fill="{C["claret"]}"/>'
                       f'<circle cx="{x-br*.35:.1f}" cy="{y-br*.35:.1f}" r="{br*.28:.1f}" fill="#fff" opacity=".35"/>')
    S = 2 * c
    return f'<svg width="{S:.0f}" height="{S:.0f}" viewBox="0 0 {S:.0f} {S:.0f}" style="display:block;overflow:visible">{"".join(out)}</svg>'


def clock(R, color):
    """A minimal clock face at one minute to midnight: minute ticks, Roman numerals, slim hands."""
    c = R; out = [f'<circle cx="{c}" cy="{c}" r="{R-2}" fill="none" stroke="{color}" stroke-width="2.5"/>',
                  f'<circle cx="{c}" cy="{c}" r="{R*.9:.1f}" fill="none" stroke="{color}" stroke-width="1" opacity=".5"/>']
    for i in range(60):
        a = math.radians(i * 6 - 90); big = i % 5 == 0
        r0 = R * (.8 if big else .85)
        out.append(f'<line x1="{c+r0*math.cos(a):.1f}" y1="{c+r0*math.sin(a):.1f}" x2="{c+R*.88*math.cos(a):.1f}" y2="{c+R*.88*math.sin(a):.1f}" '
                   f'stroke="{color}" stroke-width="{R*(.016 if big else .007):.1f}" stroke-linecap="round"/>')
    for i, t in enumerate(["XII", "III", "VI", "IX"]):
        a = math.radians(i * 90 - 90); rr = R * .66
        out.append(f'<text x="{c+rr*math.cos(a):.1f}" y="{c+rr*math.sin(a)+R*.045:.1f}" text-anchor="middle" fill="{color}" '
                   f'style="font:500 {R*.13:.0f}px Cinzel;letter-spacing:.04em">{t}</text>')
    def hand(deg, ln, w, back=.12):
        a = math.radians(deg - 90); ca, sa = math.cos(a), math.sin(a)
        return (f'<path d="M{c-ca*R*back-sa*w:.1f} {c-sa*R*back+ca*w:.1f} L{c+ca*R*ln:.1f} {c+sa*R*ln:.1f} '
                f'L{c-ca*R*back+sa*w:.1f} {c-sa*R*back-ca*w:.1f}Z" fill="{color}"/>')
    out += [hand(-0.5, .5, R * .03), hand(-6, .78, R * .018), f'<circle cx="{c}" cy="{c}" r="{R*.035:.1f}" fill="{color}"/>']
    return f'<svg width="{2*R}" height="{2*R}" style="display:block">{gold_defs()}{"".join(out)}</svg>'


def moon(R, seed=8):
    """A full moon: a warm bone disc with soft mottled seas, shaded toward the limb."""
    rnd = random.Random(seed)
    seas = "".join(f'<ellipse cx="{R+R*rnd.uniform(-.55,.55):.1f}" cy="{R+R*rnd.uniform(-.55,.55):.1f}" rx="{R*rnd.uniform(.12,.3):.1f}" '
                   f'ry="{R*rnd.uniform(.1,.25):.1f}" fill="#b9a98d" opacity="{rnd.uniform(.18,.35):.2f}" filter="url(#mb)"/>' for _ in range(9))
    return (f'<svg width="{2*R}" height="{2*R}" style="display:block;overflow:visible"><defs>'
            f'<radialGradient id="mg" cx=".42" cy=".4" r=".62"><stop offset="0" stop-color="#f6eedd"/><stop offset=".75" stop-color="{C["bone"]}"/><stop offset="1" stop-color="#cdbfa4"/></radialGradient>'
            f'<radialGradient id="mh"><stop offset=".55" stop-color="{C["bone"]}" stop-opacity=".16"/><stop offset="1" stop-color="{C["bone"]}" stop-opacity="0"/></radialGradient>'
            f'<filter id="mb"><feGaussianBlur stdDeviation="{R*.04:.1f}"/></filter>'
            f'<filter id="mt"><feTurbulence type="fractalNoise" baseFrequency="{3/R:.4f}" numOctaves="4" seed="{seed}"/>'
            f'<feColorMatrix values="0 0 0 0 .45 0 0 0 0 .4 0 0 0 0 .32 0 0 0 .7 -.2"/></filter>'
            f'<clipPath id="mc"><circle cx="{R}" cy="{R}" r="{R}"/></clipPath></defs>'
            f'<circle cx="{R}" cy="{R}" r="{R*1.5}" fill="url(#mh)"/>'
            f'<circle cx="{R}" cy="{R}" r="{R}" fill="url(#mg)"/><g clip-path="url(#mc)">{seas}'
            f'<rect width="{2*R}" height="{2*R}" filter="url(#mt)" opacity=".45"/></g></svg>')


def branch(x, y, a, ln, w, depth, rnd, out, color):
    """A bare, twisting branch drawn by recursion: each limb forks into two thinner ones."""
    if depth == 0 or ln < 8: return
    bend = rnd.uniform(-.35, .35)
    x1, y1 = x + ln * math.cos(a), y + ln * math.sin(a)
    mx, my = x + ln * .5 * math.cos(a + bend), y + ln * .5 * math.sin(a + bend)
    out.append(f'<path d="M{x:.1f} {y:.1f} Q{mx:.1f} {my:.1f} {x1:.1f} {y1:.1f}" fill="none" stroke="{color}" stroke-width="{w:.1f}" stroke-linecap="round"/>')
    for s in (-1, 1):
        if rnd.random() < (.95 if depth > 2 else .8):
            branch(x1, y1, a + s * rnd.uniform(.25, .65), ln * rnd.uniform(.62, .8), w * .66, depth - 1, rnd, out, color)


def knit(W, H, color, alpha=.12):
    """Tone-on-tone knit: rows of V stitches."""
    st = (f'<pattern id="kn" width="18" height="16" patternUnits="userSpaceOnUse">'
          f'<path d="M2 1 Q4.5 10 9 15 M16 1 Q13.5 10 9 15" fill="none" stroke="{color}" stroke-width="3.2" stroke-linecap="round" opacity="{alpha}"/></pattern>')
    return svg(W, H, f'<defs>{st}</defs><rect width="{W}" height="{H}" fill="url(#kn)"/>')


MOTIFS = {  # fair isle charts: x = stitch, . = ground
    "star": ["...x...", "x..x..x", ".x.x.x.", "..xxx..", "xxx.xxx", "..xxx..", ".x.x.x.", "x..x..x", "...x..."],
    "tree": ["...x...", "..xxx..", ".xxxxx.", "..xxx..", ".xxxxx.", "xxxxxxx", "...x..."],
    "peerie": ["x.x", ".x.", "x.x"],
}


def fairisle(W, y, rows, color, cell=(18, 16)):
    """A fair isle band, stitch by stitch: zigzag edges with a row of motifs between. rows: list of (kind, height)."""
    cw, ch = cell; out = []; cols = W // cw + 2
    ox = (W - cols * cw) / 2

    def stitch(i, j, col):
        x, yy = ox + i * cw, y + j * ch
        out.append(f'<path d="M{x+2:.1f} {yy+1:.1f} Q{x+4.5:.1f} {yy+10:.1f} {x+9:.1f} {yy+15:.1f} M{x+16:.1f} {yy+1:.1f} Q{x+13.5:.1f} {yy+10:.1f} {x+9:.1f} {yy+15:.1f}" '
                   f'fill="none" stroke="{col}" stroke-width="4" stroke-linecap="round"/>')
    j = 0
    for kind, h in rows:
        if kind == "zig":
            for r in range(h):
                for i in range(cols):
                    p = 2 * h - 2
                    if r == abs(i % p - (h - 1)): stitch(i, j + r, color)
        elif kind == "line":
            for i in range(cols): stitch(i, j, color)
        elif kind == "dots":
            for i in range(0, cols, 4): stitch(i + (j % 2) * 2, j, color)
        elif kind in MOTIFS:
            m = MOTIFS[kind]; mw = len(m[0]); pitch = mw + 3
            start = (cols - (cols // pitch) * pitch) // 2 + 1
            for r, line in enumerate(m):
                for i in range(start, cols - mw + 1, pitch):
                    for q, ch_ in enumerate(line):
                        if ch_ == "x": stitch(i + q, j + r, color)
            h = len(m)
        j += h
    return "".join(out), j * ch


def stripes(W, H, bw, c1, c2, sw=34):
    """A diagonal candy-stripe border, bw px wide, round the edge of the print."""
    pat = (f'<pattern id="cs" width="{2*sw}" height="{2*sw}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
           f'<rect width="{2*sw}" height="{2*sw}" fill="{c2}"/><rect width="{sw}" height="{2*sw}" fill="{c1}"/></pattern>')
    return svg(W, H, f'<defs>{pat}<mask id="bm"><rect width="{W}" height="{H}" fill="#fff"/><rect x="{bw}" y="{bw}" width="{W-2*bw}" height="{H-2*bw}" fill="#000"/></mask></defs>'
                     f'<rect width="{W}" height="{H}" fill="url(#cs)" mask="url(#bm)"/>')


# ---------- sample words ----------
XMAS = dict(head="Merry Christmas", name="The Hendersons", date="December 20, 2026")
NYE = dict(year="2027", date="December 31, 2026", host="The Parkers")
HALL = dict(name="The Morgans", date="October 31, 2027")
HOL = dict(name="The Miller Co.", date="December 12, 2026")


# ---------- the 10 designs ----------
def papercut_pines(n, mode):  # Christmas and winter
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    s = k(n, 1, 1.2, .95)
    txt = (cz(XMAS["head"], 30 * s, C["claret"], ".32em", 600) +
           f'<div style="{pf(118*s, 500)};color:{C["spruce"]};margin:{12*s}px 0 {16*s}px">{XMAS["name"]}</div>' +
           caps(XMAS["date"], 20 * s, C["pine"], ".42em", 600))
    avoid = [grow(w, 18) for w in lay["wins"]] + [text_core(lay["text"], 1040 * s, 300 * s)]
    hmax = k(n, 360, 470, 380)
    trees = forest(W, H, avoid, [(16, hmax * .55, hmax * .95, "#B9CEC9"), (13, hmax * .45, hmax * .8, C["sage"]),
                                 (10, hmax * .35, hmax * .65, C["pine"]), (8, hmax * .25, hmax * .5, C["spruce"])], seed=k(n, 3, 5, 7))
    snow = snowfall(W, H, [grow(w, 10) for w in lay["wins"]] + [text_core(lay["text"], 1040 * s, 300 * s)], 70, C["white"], seed=4, gap=70)
    return dict(bg=f"linear-gradient(180deg,#e2ebec,{C['ice']} 55%,#f7f8f6)", body=paper(.10, .05) + snow + trees +
                windows(lay["wins"], mode, mat=(14, "background:#fff;box-shadow:0 5px 16px rgba(20,50,45,.18)")) + box(lay["text"], txt))


def fireworks(n, mode):  # New Year's Eve
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    s = k(n, 1, 1.2, .95)
    txt = (caps("Happy New Year", 22 * s, C["gold_lt"], ".5em", 500) +
           f'<div style="font:{170*s}px/1 Poiret;letter-spacing:.16em;padding-left:.16em;{foil(GOLD)};margin:{10*s}px 0 {14*s}px">{NYE["year"]}</div>' +
           caps(f'{NYE["host"]} · {NYE["date"]}', 18 * s, C["silver"], ".42em", 500, "Montserrat", "opacity:.85"))
    avoid = [grow(w, 26) for w in lay["wins"]] + [text_core(lay["text"], 900 * s, 320 * s)]
    spots = {1: [(150, 300, 120, 0), (1650, 520, 110, 1), (170, 1010, 95, 1), (1620, 1030, 120, 0), (1660, 180, 60, 1), (140, 640, 55, 0)],
             2: [(240, 860, 130, 0), (1560, 840, 150, 1), (380, 1080, 60, 1), (1420, 1080, 55, 0)],
             3: [(190, 975, 140, 1), (1600, 980, 140, 0), (1600, 1150, 0, 0)]}[n]
    art = "".join(burst(x, y, r, "url(#g)" if i % 2 == 0 else C["silver"], 28 if r > 90 else 20, i + n, 2.6 if r > 90 else 2)
                  for i, (x, y, r, _) in enumerate(spots) if r)
    dust = scatter(W, H, avoid, 46, [C["gold_lt"], C["silver"]], ["fleck"], seed=n + 2, gap=70, scale=.7, opacity=.7)
    return dict(bg=f"radial-gradient(120% 90% at 50% 30%,{C['navy']},{C['midnight']} 60%,#070b12)",
                body=paper(.08, .08) + svg(W, H, gold_defs() + art) + dust +
                windows(lay["wins"], mode, [(12, f'border:2px solid {C["gold"]}')]) + box(lay["text"], txt))


def evergreen_wreath(n, mode):  # Christmas
    lay = LAYOUTS["panel"]["n"][n]
    px, py, pw, ph = lay["panel"]
    R = k(n, 170, 230, 138); band = k(n, 58, 74, 48)
    wr = wreath(R, band, 4)
    D = 2 * (R + band)
    inner = (f'<div style="font:{k(n,92,124,80)}px/1 Pinyon;color:{C["claret"]}">Merry</div>'
             f'<div style="font:{k(n,64,86,56)}px/1 Pinyon;color:{C["claret"]};margin-top:-.1em">Christmas</div>')
    words = (f'<div style="{pf(k(n,58,84,44), 500)};color:{C["ink"]}">{XMAS["name"]}</div>' +
             caps(XMAS["date"], k(n, 16, 20, 16), C["pine"], ".4em", 600, "Montserrat", f"margin-top:{k(n,18,22,16)}px"))
    if n < 3:
        wx, wy = px + (pw - D) / 2, py + k(n, 200, 150, 0)
        ring = f'<div class="fr" style="left:{wx}px;top:{wy}px">{wr}</div>'
        text = box([wx, wy, D, D], inner) + box([px, wy + D + 10, pw, ph - (wy + D) - 120], words)
    else:
        wx, wy = px + 20, py + (ph - D) / 2
        ring = f'<div class="fr" style="left:{wx}px;top:{wy}px">{wr}</div>'
        text = box([wx, wy, D, D], inner) + box([wx + D, py, pw - D - 20, ph], words)
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{C["snow"]}">{paper(.10, .05)}</div>'
    return dict(bg=f"radial-gradient(120% 100% at 30% 40%,#2a5a4a,{C['spruce']} 60%,#173a2f)",
                body=paper(.10, .10) + panel + ring + windows(lay["wins"], mode, [(10, f'border:2px solid {C["gold"]}')]) + text)


def midnight_clock(n, mode):  # New Year's Eve
    lay = LAYOUTS["panel"]["n"][n]
    px, py, pw, ph = lay["panel"]
    R = k(n, 200, 255, 190)
    face = clock(R, "url(#g)")
    words = (f'<div style="font:{k(n,120,150,96)}px/1 Poiret;letter-spacing:.1em;padding-left:.1em;{foil(GOLD)}">{NYE["year"]}</div>' +
             cz("Happy New Year", k(n, 30, 36, 26), C["gold_lt"], ".22em", 500, f"margin-top:{k(n,16,18,12)}px") +
             caps(f'{NYE["host"]} · {NYE["date"]}' if n == 2 else NYE["date"], k(n, 16, 18, 15), C["silver"], ".4em", 500, "Montserrat", f"margin-top:{k(n,18,22,16)}px;opacity:.8"))
    if n < 3:
        cx, cy = px + pw / 2 - R, py + k(n, 150, 110, 0)
        dial = f'<div class="fr" style="left:{cx}px;top:{cy}px">{face}</div>'
        text = box([px, cy + 2 * R + 20, pw, ph - (cy + 2 * R) - k(n, 110, 100, 0)], words)
    else:
        cx, cy = px + 50, py + (ph - 2 * R) / 2
        dial = f'<div class="fr" style="left:{cx}px;top:{cy}px">{face}</div>'
        text = box([cx + 2 * R + 10, py, pw - 2 * R - 70, ph], words)
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:radial-gradient(80% 60% at 50% 35%,#1c2a3e,{C["midnight"]})">'
             f'{paper(.08, .08)}</div>')
    edge = f'<div class="fr" style="inset:22px;border:1px solid {C["gold"]};opacity:.4"></div>'
    return dict(bg="#090e16", body=paper(.08, .06) + edge + panel + dial + windows(lay["wins"], mode, [(12, f'border:2px solid {C["gold"]}')]) + text)


def harvest_moon(n, mode):  # Halloween
    lay = LAYOUTS["panel"]["n"][n]
    px, py, pw, ph = lay["panel"]
    R = k(n, 170, 240, 150)
    if n < 3:
        mx, my = px + pw / 2 - R, py + k(n, 120, 100, 0)
    else:
        mx, my = px + 40, py + (ph - 2 * R) / 2 - 10
    rnd = random.Random(11 + n); br = []
    # one bough reaching in from the panel's top corner, across the moon
    sx, sy = (px + pw + 10, py + k(n, 40, 30, 20)) if n < 3 else (px - 10, py + 30)
    a = math.radians(158 if n < 3 else 22)
    branch(sx, sy, a, k(n, 170, 240, 130), k(n, 22, 28, 18), 7, rnd, br, "#0b070d")
    bough = f'<svg class="fr" style="left:0;top:0" width="{px+pw}" height="{py+ph}"><g clip-path="url(#pc)">{"".join(br)}</g>' \
            f'<defs><clipPath id="pc"><rect x="{px}" y="{py}" width="{pw}" height="{ph}"/></clipPath></defs></svg>'
    words = (cz("Halloween", k(n, 60, 100, 50), C["bone"], ".12em", 600) +
             f'<div style="{pf(k(n,50,62,42), 500)};color:{C["ember"]};margin-top:{k(n,10,12,8)}px">at {HALL["name"].replace("The ", "the ")}\'</div>' +
             caps(HALL["date"], k(n, 16, 18, 15), C["bone"], ".42em", 500, "Montserrat", f"margin-top:{k(n,18,20,14)}px;opacity:.75"))
    if n < 3:
        text = box([px, my + 2 * R + 20, pw, ph - (my + 2 * R) - k(n, 100, 90, 0)], words)
    else:
        text = box([mx + 2 * R + 10, py, pw - 2 * R - 60, ph], words)
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:radial-gradient(90% 70% at 50% 30%,#3b2240,{C["night"]})">'
             f'{paper(.10, .10)}</div>')
    stars = scatter(px + pw, py + ph, [grow([mx, my, 2 * R, 2 * R], 40), [px - 999, 0, 999, 9999], [px + pw, 0, 9999, 9999]], 22,
                    [C["bone"]], ["fleck"], seed=5, gap=80, scale=.6, opacity=.6)
    return dict(bg=C["night"], body=paper(.10, .08) + panel + stars +
                f'<div class="fr" style="left:{mx}px;top:{my}px">{moon(R)}</div>' + bough +
                windows(lay["wins"], mode, [(12, f'border:2px solid {C["ember"]};opacity:.85')]) + text)


def nordic_knit(n, mode):  # Christmas and winter, cosy
    lay = LAYOUTS["card"]["n"][n]; W, H = P
    tx, ty, tw, th = lay["text"]
    if n == 1:
        top, h1 = fairisle(W, ty + 20, [("line", 1), ("zig", 3), ("peerie", 3), ("dots", 1), ("star", 9), ("dots", 1), ("zig", 3), ("line", 1)], C["snow"])
        bot, h2 = fairisle(W, H - 7 * 16 - 24, [("line", 1), ("zig", 3), ("tree", 7)][:2] + [("line", 1)], C["snow"])
        txt = (cz("Merry & Bright", 34, C["snow"], ".3em", 600) +
               f'<div style="{pf(124, 500)};color:{C["white"]};margin:18px 0 20px">{XMAS["name"]}</div>' +
               caps(XMAS["date"], 22, C["gold_lt"], ".42em", 600))
        tb = [0, ty + 20 + h1, W, H - 5 * 16 - 24 - (ty + 20 + h1)]
    else:
        top, h1 = fairisle(W, ty - 6, [("line", 1), ("zig", 3), ("line", 1)], C["snow"])
        bot, h2 = "", 0
        txt = (f'<div style="display:flex;align-items:baseline;gap:30px">{cz("Merry & Bright", 26, C["snow"], ".26em", 600)}</div>' +
               f'<div style="{pf(96, 500)};color:{C["white"]};margin:10px 0 12px">{XMAS["name"]}</div>' +
               caps(XMAS["date"], 19, C["gold_lt"], ".42em", 600))
        tb = [0, ty - 6 + h1, W, H - (ty - 6 + h1) - 30]
    return dict(bg=f"radial-gradient(120% 90% at 50% 30%,#8c2432,{C['claret']} 60%,#5e1520)",
                body=knit(W, H, "#ffffff", .07) + knit(W, H, "#000000", .06).replace('class="tex"', 'class="tex" style="transform:translate(9px,8px)"') +
                paper(.08, .08) + svg(W, H, top + bot) +
                windows(lay["wins"], mode, mat=(14, f"background:{C['snow']};box-shadow:0 5px 16px rgba(40,0,10,.3)")) + box(tb, txt))


def candy_stripe(n, mode):  # any holiday party
    lay = LAYOUTS["card"]["n"][n]; W, H = P
    bw = 46
    if n == 1:
        txt = (caps("You're invited to", 22, C["claret"], ".46em", 600) +
               f'<div style="font:150px/1.15 Pinyon;color:{C["claret"]};margin:22px 0 6px">Happy Holidays</div>' +
               f'<div style="{pf(52, 500)};color:{C["ink"]}">{HOL["name"]} holiday party</div>' +
               caps(HOL["date"], 20, C["gold"], ".42em", 600, "Montserrat", "margin-top:30px"))
    else:
        txt = (f'<div style="font:{k(n,0,112,104)}px/1.15 Pinyon;color:{C["claret"]}">Happy Holidays</div>' +
               caps(f'{HOL["name"]} · {HOL["date"]}', 19, C["ink"], ".4em", 600, "Montserrat", "margin-top:14px"))
    inner = (f'<div class="fr" style="inset:{bw+12}px;border:1.5px solid {C["gold"]}"></div>')
    return dict(bg=C["snow"], body=paper(.10, .05) + stripes(W, H, bw, C["claret"], C["snow"]) + inner +
                windows(lay["wins"], mode, [(1, f'border:1px solid {C["claret"]};opacity:.25')]) + box(lay["text"], txt))


def frost(n, mode):  # winter, or a formal holiday party
    lay = LAYOUTS["card"]["n"][n]; W, H = P
    if n == 1:
        txt = (cz("A winter celebration", 26, C["silver"], ".3em", 500) +
               f'<div style="{pf(140, 500)};{foil(SILVER)};margin:24px 0 22px;padding:0 .1em">The Carters</div>' +
               caps("January 16, 2027", 22, C["frost"], ".44em", 500, "Montserrat", "opacity:.85"))
        core = text_core(lay["text"], 980, 420)
    else:
        txt = (cz("A winter celebration", 22, C["silver"], ".3em", 500) +
               f'<div style="{pf(100, 500)};{foil(SILVER)};margin:12px 0 14px;padding:0 .1em">The Carters</div>' +
               caps("January 16, 2027", 18, C["frost"], ".44em", 500, "Montserrat", "opacity:.85"))
        core = text_core(lay["text"], 1000, 300)
    avoid = [grow(w, 16) for w in lay["wins"]] + [core]
    rnd = random.Random(2 + n); flakes = []; pts = []
    for big in (True,) * 7 + (False,) * 30:
        for _ in range(400):
            r = rnd.uniform(60, 96) if big else rnd.uniform(16, 30)
            x, y = rnd.uniform(-r * .3, W + r * .3), rnd.uniform(-r * .3, H + r * .3)
            if all(_clear(x, y, r * .9, [a]) for a in avoid) and all(math.hypot(x - a, y - b) > r + c + 26 for a, b, c in pts):
                pts.append((x, y, r)); break
    for i, (x, y, r) in enumerate(pts):
        flakes.append(snowflake(x, y, r, C["frost"] if r > 50 else C["silver"], 3 if r > 50 else 2.2, i, rnd.uniform(0, 30)))
    edge = f'<div class="fr" style="inset:28px;border:1px solid {C["silver"]};opacity:.35"></div>'
    return dict(bg=f"radial-gradient(110% 80% at 50% 30%,#213752,{C['navy']} 55%,{C['midnight']})",
                body=paper(.08, .08) + edge + svg(W, H, "".join(flakes), style="opacity:.85") +
                windows(lay["wins"], mode, [(12, f'border:1.5px solid {C["silver"]};opacity:.8')]) + box(lay["text"], txt))


def gift_tag(n, mode):  # Christmas or any holiday party
    lay = LAYOUTS["tag"]["n"][n]; W, H = P
    m, cut = 50, 150
    tag = (f'<div class="fr" style="left:{m}px;top:{m}px;right:{m}px;bottom:{m}px;background:{C["snow"]};'
           f'clip-path:polygon({cut}px 0,calc(100% - {cut}px) 0,100% {cut}px,100% 100%,0 100%,0 {cut}px);'
           f'filter:drop-shadow(0 6px 10px rgba(0,0,0,.25))">{paper(.10, .06)}</div>')
    hx, hy = W / 2, m + 58
    eyelet = (f'<svg class="tex" width="{W}" height="{H}">{gold_defs()}'
              f'<path d="M{hx-6} {hy} C{hx-60} {hy-40} {hx-170} {hy-30} {hx-260} -10" fill="none" stroke="{C["kraft"]}" stroke-width="7" stroke-linecap="round"/>'
              f'<path d="M{hx+6} {hy} C{hx+70} {hy-50} {hx+120} {hy-20} {hx+210} -10" fill="none" stroke="#b48f62" stroke-width="7" stroke-linecap="round"/>'
              f'<circle cx="{hx}" cy="{hy}" r="28" fill="none" stroke="url(#g)" stroke-width="9"/><circle cx="{hx}" cy="{hy}" r="23" fill="{C["claret"]}"/>'
              f'<rect x="{m+26}" y="{m+26}" width="{W-2*m-52}" height="{H-2*m-52}" fill="none"/></svg>')
    rule = (f'<div class="fr" style="left:{m+24}px;top:{m+24}px;right:{m+24}px;bottom:{m+24}px;border:1.5px solid {C["gold"]};opacity:.7;'
            f'clip-path:polygon({cut-14}px 0,calc(100% - {cut-14}px) 0,100% {cut-14}px,100% 100%,0 100%,0 {cut-14}px)"></div>'
            f'<svg class="tex" width="{W}" height="{H}"><path d="M{m+24+cut-24} {m+24} L{m+24} {m+24+cut-24} M{W-m-24-cut+24} {m+24} L{W-m-24} {m+24+cut-24}" '
            f'stroke="{C["gold"]}" stroke-width="1.5" opacity=".7"/></svg>')
    to = f'<div style="display:flex;align-items:baseline;gap:16px">{caps("To", k(n,22,18,17), C["gold"], ".4em", 600)}<span style="{pf(k(n,40,30,28), 500)};color:{C["ink"]}">all our guests</span></div>'
    head = (to + f'<div style="font:{k(n,150,108,100)}px/1.1 Pinyon;color:{C["claret"]};margin:{k(n,18,4,2)}px 0 {k(n,6,0,0)}px">Happy Holidays</div>')
    sign = f'<div style="display:flex;align-items:baseline;gap:16px">{caps("From", k(n,20,16,16), C["gold"], ".4em", 600)}<span style="{pf(k(n,40,28,26), 500)};color:{C["ink"]}">the Bennetts</span></div>'
    date = caps("December 2026", k(n, 18, 15, 15), C["pine"], ".44em", 600, "Montserrat", "margin-top:14px")
    if n == 1:
        text = box(lay["text"], head) + box(lay["foot"], sign + date)
    else:
        head = f'<div style="font:{k(n,0,124,116)}px/1.1 Pinyon;color:{C["claret"]}">Happy Holidays</div>'
        text = box(lay["text"], head + f'<div style="display:flex;gap:34px;align-items:baseline;margin-top:6px">{sign}<i class="hl" style="width:1.5px;height:22px;background:{C["gold"]}"></i>{date.replace("margin-top:14px", "")}</div>')
    return dict(bg=f"radial-gradient(120% 90% at 50% 30%,#8c2432,{C['claret']} 60%,#5e1520)",
                body=paper(.10, .10) + tag + rule + eyelet + windows(lay["wins"], mode, mat=(12, "background:#fff;box-shadow:0 2px 8px rgba(60,20,20,.15)")) + text)


def apothecary(n, mode):  # Halloween, grown-up
    lay = LAYOUTS["tag"]["n"][n]; W, H = P
    m, r = 52, 56
    label = (f'<div class="fr" style="left:{m}px;top:{m}px;right:{m}px;bottom:{m}px;background:{C["bone"]};'
             f'-webkit-mask:radial-gradient(circle at 0 0,transparent {r}px,#000 {r+1}px) top left/51% 51% no-repeat,'
             f'radial-gradient(circle at 100% 0,transparent {r}px,#000 {r+1}px) top right/51% 51% no-repeat,'
             f'radial-gradient(circle at 0 100%,transparent {r}px,#000 {r+1}px) bottom left/51% 51% no-repeat,'
             f'radial-gradient(circle at 100% 100%,transparent {r}px,#000 {r+1}px) bottom right/51% 51% no-repeat">{paper(.14, .12)}</div>')
    i1, i2 = m + 22, m + 34
    def frame(i, sw, op):
        x0, y0, x1, y1 = i, i, W - i, H - i; rr = r + (i - m)
        d = (f"M{x0+rr} {y0} L{x1-rr} {y0} A{rr} {rr} 0 0 0 {x1} {y0+rr} L{x1} {y1-rr} A{rr} {rr} 0 0 0 {x1-rr} {y1} "
             f"L{x0+rr} {y1} A{rr} {rr} 0 0 0 {x0} {y1-rr} L{x0} {y0+rr} A{rr} {rr} 0 0 0 {x0+rr} {y0}Z")
        return f'<path d="{d}" fill="none" stroke="{C["ink"]}" stroke-width="{sw}" opacity="{op}"/>'
    rules = svg(W, H, frame(i1, 2.5, .85) + frame(i2, 1, .6))
    head = (f'<div style="display:flex;align-items:center;gap:22px">'
            f'<i class="hl" style="width:{k(n,120,90,90)}px;background:{C["ember"]}"></i>{caps("Elixir No. 31", k(n,22,18,17), C["ember"], ".46em", 700)}'
            f'<i class="hl" style="width:{k(n,120,90,90)}px;background:{C["ember"]}"></i></div>' +
            cz("Halloween", k(n, 150, 104, 96), C["ink"], ".08em", 700, f"margin:{k(n,22,8,6)}px 0 {k(n,6,0,0)}px") +
            f'<div style="{pf(k(n,54,38,36), 500)};color:{C["ink"]}">at the Morgans\'</div>')
    date = caps(f'{HALL["date"]} · take after dark', k(n, 18, 16, 15), C["ember"], ".4em", 600, "Montserrat", f"margin-top:{k(n,0,14,12)}px")
    if n == 1:
        text = box(lay["text"], head) + box(lay["foot"], date + caps("Shake well before the party", 15, C["ink"], ".42em", 500, "Montserrat", "margin-top:18px;opacity:.6"))
    else:
        text = box(lay["text"], head + date)
    return dict(bg="#0d0a0e", body=paper(.10, .08) + label + rules +
                windows(lay["wins"], mode, [(10, f'border:2px solid {C["ink"]};opacity:.85')]) + text)


DESIGNS = [  # id, name, base layout, builder
    ("papercut-pines", "Papercut Pines", "band", papercut_pines),
    ("fireworks", "Fireworks", "band", fireworks),
    ("evergreen-wreath", "Evergreen Wreath", "panel", evergreen_wreath),
    ("midnight-clock", "Midnight Clock", "panel", midnight_clock),
    ("harvest-moon", "Harvest Moon", "panel", harvest_moon),
    ("nordic-knit", "Nordic Knit", "card", nordic_knit),
    ("candy-stripe", "Candy Stripe", "card", candy_stripe),
    ("frost", "Frost", "card", frost),
    ("gift-tag", "Gift Tag", "tag", gift_tag),
    ("apothecary", "Apothecary", "tag", apothecary),
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
    for d in DESIGNS:
        did, name, base, _ = d
        W, H = LAYOUTS[base]["size"]
        for n in (1, 2, 3):
            for mode in ("preview", "overlay", "blank"):
                with open(os.path.join(OUT, f"{did}-{n}-{mode}.html"), "w") as f:
                    f.write(page(d, n, mode))
            manifest.append(dict(id=did, name=name, base=base, n=n, size=[W, H], category="holiday",
                                 wins=[w[:4] for w in LAYOUTS[base]["n"][n]["wins"]],
                                 shapes=[w[4] for w in LAYOUTS[base]["n"][n]["wins"]]))
    with open(os.path.join(HERE, "out-holiday", "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(len(manifest), "design versions")


if __name__ == "__main__":
    main()
