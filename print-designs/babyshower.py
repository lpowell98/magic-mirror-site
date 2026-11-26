#!/usr/bin/env python3
"""Baby shower print designs, also for gender reveals, sip-and-sees and christenings.
Same pipeline as the Wedding (build.py), Birthday, Holiday and Graduation sets. Writes one HTML page per design,
photo count and mode into out-babyshower/html/. Then:
  PD_OUT=out-babyshower node render.js
  PD_OUT=out-babyshower PD_FINAL=final-babyshower python3 finish.py
Every design is 4x6 at 300 dpi. Every photo window is landscape.
Each design is grounded in a real nursery object: a muslin swaddle, a letter bead bracelet, a gingham crib sheet
with a sewn label, wooden alphabet blocks, a felt mobile, christening lace, a cross-stitch sampler,
pressed baby's breath and an airmail envelope."""
import json, math, os, random

import build
from build import paper, windows, box, caps, k
from birthday import _clear, grow, text_core
import graduation

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out-babyshower", "html")
FONTS = build.FONTS

# ---------- style guide: soft nursery colors, with pink, blue and neutral options ----------
C = dict(oat="#EEE6D8", muslin="#E7DDCC", cream="#FBF7F0", cotton="#FDFBF7", cocoa="#4B3B34", cocoa_lt="#8A766B",
         blush="#F1D8D2", rose="#C98D8E", rose_dk="#A86B6E", powder="#D5E2EB", dusk="#6F8CA4", dusk_dk="#4E6A82",
         sage="#D8E0CE", sage_md="#A9B79A", sage_dk="#6F8265", butter="#F4E6B8", honey="#C9A24C", maple="#E2C79A",
         maple_dk="#B8945E", white="#FFFFFF")
SILVER = "linear-gradient(100deg,#8e959c 0%,#e9edf0 30%,#a7aeb5 50%,#f4f6f7 68%,#8f979e 100%)"

FONT_CSS = graduation.FONT_CSS + "".join(
    f"@font-face{{font-family:'{n}';src:url('{FONTS}/{f}');font-style:{s};font-weight:{w}}}"
    for n, f, s, w in [("Instrument", "InstrumentSerif-Regular.ttf", "normal", "400"),
                       ("Instrument", "InstrumentSerif-Italic.ttf", "italic", "400"),
                       ("Quicksand", "Quicksand.ttf", "normal", "300 700")])

# Sample words. Each family's own names and date replace them.
G = dict(baby="Baby Bennett", mom="Claire Bennett", parents="Claire &amp; Sam", date="April 18, 2027",
         date_dots="04 · 18 · 2027", due="Arriving May 2027", christen="Theodore James", christen_date="May 2, 2027")


def ser(size, ital=True, extra=""):
    """Instrument Serif, the soft, slightly condensed serif used for names."""
    return f"font:{'italic ' if ital else ''}400 {size}px/1.04 Instrument;{extra}"


def qs(t, size, color, wt=600, ls=".2em", extra=""):
    return f'<div style="font:{wt} {size}px/1.2 Quicksand;letter-spacing:{ls};padding-left:{ls};text-transform:uppercase;color:{color};{extra}">{t}</div>'


def svg(W, H, inner, cls="tex", style=""):
    return f'<svg class="{cls}" width="{W}" height="{H}" style="{style}">{inner}</svg>'


def uri(s):
    return "data:image/svg+xml;utf8," + s.replace("#", "%23").replace('"', "'")


# ---------- layouts: windows [x,y,w,h,shape], all landscape ----------
L, P = (1800, 1200), (1200, 1800)
LAYOUTS = {
    "band": build.LAYOUTS["band"],      # landscape, photos on top, words in a band below
    "panel": build.LAYOUTS["panel"],    # landscape, a panel holds the art and words beside the photos
    "card": build.LAYOUTS["card"],      # portrait, photos stacked, words at the foot
    "tag": graduation.LAYOUTS["tag"],   # portrait, words on top, rounded windows below
    "lace": dict(size=P, n={            # portrait, like card but narrower windows so lace can run down both sides
        1: dict(wins=[[170, 140, 860, 645, "r"]], text=[130, 840, 940, 880]),
        2: dict(wins=[[170, 120, 860, 580, "r"], [170, 740, 860, 580, "r"]], text=[130, 1350, 940, 380]),
        3: dict(wins=[[170, 110, 860, 400, "r"], [170, 550, 860, 400, "r"], [170, 990, 860, 400, "r"]], text=[130, 1420, 940, 320])}),
}
for lay in LAYOUTS.values():
    for v in lay["n"].values():
        assert all(w > h for _, _, w, h, _ in v["wins"]), "every photo window must be landscape"


# ---------- textures ----------
def weave(op=.35, f=".55 .035", seed=3, tone=".35"):
    """Plain cotton weave: fine threads one way, then the other."""
    t = lambda bf, s: (f"<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='w'>"
                       f"<feTurbulence type='fractalNoise' baseFrequency='{bf}' numOctaves='2' seed='{s}' stitchTiles='stitch'/>"
                       f"<feColorMatrix values='0 0 0 0 {tone} 0 0 0 0 {tone} 0 0 0 0 {tone} 0 0 0 .55 0'/></filter>"
                       f"<rect width='100%' height='100%' filter='url(#w)'/></svg>")
    a, b = f.split()
    return (f'<div class="tex" style="background-image:url(&quot;{uri(t(f"{a} {b}", seed))}&quot;);opacity:{op}"></div>'
            f'<div class="tex" style="background-image:url(&quot;{uri(t(f"{b} {a}", seed + 1))}&quot;);opacity:{op*.8:.2f}"></div>')


def crinkle(W, H, seed=4, op=.55, freq=".006 .011", scale=5):
    """Soft folds and crinkles, lit from the top left, multiplied over the cloth."""
    return (f'<svg class="tex" width="{W}" height="{H}" style="opacity:{op};mix-blend-mode:multiply">'
            f'<filter id="ck{seed}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="4" seed="{seed}"/>'
            f'<feDiffuseLighting surfaceScale="{scale}" lighting-color="#fff" diffuseConstant="1.15"><feDistantLight azimuth="225" elevation="52"/></feDiffuseLighting></filter>'
            f'<rect width="{W}" height="{H}" filter="url(#ck{seed})"/></svg>')


FILTERS = graduation.FILTERS + (
    # felt: fuzzy edges and a fine fibre grain
    '<filter id="felt" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="5" result="d"/>'
    '<feDisplacementMap in="SourceGraphic" in2="d" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="f"/>'
    '<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="8" result="g"/>'
    '<feColorMatrix in="g" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -.9 .5" result="ga"/>'
    '<feComposite in="ga" in2="f" operator="in" result="sh"/><feMerge><feMergeNode in="f"/><feMergeNode in="sh"/></feMerge></filter>'
    # deckle: a torn, uneven paper edge
    '<filter id="deckle" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="4" seed="12" result="d"/>'
    '<feDisplacementMap in="SourceGraphic" in2="d" scale="16" xChannelSelector="R" yChannelSelector="G"/></filter>'
    # washi: torn tape ends
    '<filter id="torn" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="2" seed="3" result="d"/>'
    '<feDisplacementMap in="SourceGraphic" in2="d" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>'
    # wax: a little unevenness in the poured seal edge
    '<filter id="wax" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="6" result="d"/>'
    '<feDisplacementMap in="SourceGraphic" in2="d" scale="10" xChannelSelector="R" yChannelSelector="G"/></filter>'
)


def spread(W, H, avoid, count, r, gap, seed, edge=40):
    """Evenly spread points that stay clear of the photos and the words."""
    rnd = random.Random(seed); pts = []
    for _ in range(30000):
        if len(pts) >= count: break
        x, y = rnd.uniform(edge, W - edge), rnd.uniform(edge, H - edge)
        if _clear(x, y, r, avoid) and all((x - a) ** 2 + (y - b) ** 2 > gap ** 2 for a, b in pts):
            pts.append((x, y))
    return pts, rnd


def star4(x, y, s, col, rot=0, op=1):
    p = f"M0 {-s} C{s*.12} {-s*.12} {s*.12} {-s*.12} {s} 0 C{s*.12} {s*.12} {s*.12} {s*.12} 0 {s} C{-s*.12} {s*.12} {-s*.12} {s*.12} {-s} 0 C{-s*.12} {-s*.12} {-s*.12} {-s*.12} 0 {-s}Z"
    return f'<path d="{p}" fill="{col}" opacity="{op}" transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f})"/>'


# ---------- a 5x7 stitch alphabet for cross-stitch ----------
PIX = {
    "A": ".###.|#...#|#...#|#####|#...#|#...#|#...#", "B": "####.|#...#|#...#|####.|#...#|#...#|####.",
    "C": ".###.|#...#|#....|#....|#....|#...#|.###.", "D": "###..|#..#.|#...#|#...#|#...#|#..#.|###..",
    "E": "#####|#....|#....|####.|#....|#....|#####", "F": "#####|#....|#....|####.|#....|#....|#....",
    "G": ".###.|#...#|#....|#.###|#...#|#...#|.####", "H": "#...#|#...#|#...#|#####|#...#|#...#|#...#",
    "I": ".###.|..#..|..#..|..#..|..#..|..#..|.###.", "J": "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
    "K": "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#", "L": "#....|#....|#....|#....|#....|#....|#####",
    "M": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#", "N": "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#",
    "O": ".###.|#...#|#...#|#...#|#...#|#...#|.###.", "P": "####.|#...#|#...#|####.|#....|#....|#....",
    "Q": ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#", "R": "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    "S": ".####|#....|#....|.###.|....#|....#|####.", "T": "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    "U": "#...#|#...#|#...#|#...#|#...#|#...#|.###.", "V": "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
    "W": "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.", "X": "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    "Y": "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..", "Z": "#####|....#|...#.|..#..|.#...|#....|#####",
    "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.", "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
    "2": ".###.|#...#|....#|...#.|..#..|.#...|#####", "3": "####.|....#|....#|.###.|....#|....#|####.",
    "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.", "5": "#####|#....|####.|....#|....#|#...#|.###.",
    "6": ".###.|#....|#....|####.|#...#|#...#|.###.", "7": "#####|....#|...#.|..#..|.#...|.#...|.#...",
    "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.", "9": ".###.|#...#|#...#|.####|....#|....#|.###.",
    ".": ".|.|.|.|.|.|#", "&": ".##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#", " ": "...|...|...|...|...|...|...",
    "♥": ".#.#.|#####|#####|.###.|..#..|.....|.....",
}


def xstitch(text, x0, y0, cell, color, shade, out, gap=1):
    """Cross-stitches a line of text: each filled cell is two crossed strands of floss. Returns its width."""
    x = x0
    for ch in text:
        rows = PIX[ch].split("|")
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c == "#": out.append(xcell(x + i * cell, y0 + j * cell, cell, color, shade))
        x += (len(rows[0]) + gap) * cell
    return x - x0 - gap * cell


def text_w(text, cell, gap=1):
    return sum((len(PIX[c].split("|")[0]) + gap) * cell for c in text) - gap * cell


def xcell(x, y, c, color, shade):
    a, b = c * .16, c * .84
    sw = c * .3
    return (f'<path d="M{x+a:.1f} {y+a:.1f}L{x+b:.1f} {y+b:.1f}" stroke="{shade}" stroke-width="{sw:.1f}" stroke-linecap="round"/>'
            f'<path d="M{x+b:.1f} {y+a:.1f}L{x+a:.1f} {y+b:.1f}" stroke="{color}" stroke-width="{sw:.1f}" stroke-linecap="round"/>'
            f'<path d="M{x+b-c*.12:.1f} {y+a+c*.06:.1f}L{x+a+c*.18:.1f} {y+b-c*.24:.1f}" stroke="#fff" stroke-opacity=".28" stroke-width="{sw*.3:.1f}" stroke-linecap="round"/>')


# ---------- ornaments, all drawn in code ----------
def bead_string(text, cx, cy, width, cube, sag, uid, letter_cols=(C["rose_dk"], C["dusk_dk"]), seed=3):
    """A letter bead bracelet: white letter cubes between pearl, pastel and gold spacer beads, strung on a cord that sags a little."""
    rnd = random.Random(seed)
    yat = lambda x: cy + sag * (1 - ((x - cx) / (width / 2)) ** 2)
    ang = lambda x: math.degrees(math.atan(-2 * sag * (x - cx) / (width / 2) ** 2))
    out = [f'<path d="M{cx-width/2:.1f} {yat(cx-width/2):.1f} Q{cx:.1f} {cy+2*sag:.1f} {cx+width/2:.1f} {yat(cx+width/2):.1f}" fill="none" stroke="#cdbfae" stroke-width="3"/>']
    pearl = lambda x, r: (f'<circle cx="{x:.1f}" cy="{yat(x):.1f}" r="{r:.1f}" fill="url(#{uid}p)" style="filter:drop-shadow(0 2px 2px rgba(80,60,50,.25))"/>')
    pastel = lambda x, r, c: (f'<circle cx="{x:.1f}" cy="{yat(x):.1f}" r="{r:.1f}" fill="{c}" style="filter:drop-shadow(0 2px 2px rgba(80,60,50,.25))"/>'
                              f'<circle cx="{x-r*.32:.1f}" cy="{yat(x)-r*.36:.1f}" r="{r*.32:.1f}" fill="#fff" opacity=".55"/>')
    gold = lambda x, r: f'<ellipse cx="{x:.1f}" cy="{yat(x):.1f}" rx="{r*.55:.1f}" ry="{r:.1f}" fill="url(#{uid}g)" transform="rotate({ang(x):.1f} {x:.1f} {yat(x):.1f})"/>'
    s = cube; step = s * 1.22
    n = len(text)
    x0 = cx - (n - 1) * step / 2
    # filler beads from the letters out to the ends of the cord
    pal = [C["blush"], C["powder"], C["butter"], C["sage"]]
    def fill(xa, xb, dirn):
        x = xa
        i = 0
        while (x < xb) if dirn > 0 else (x > xb):
            kind = i % 4
            r = s * (.24 if kind in (0, 2) else .3)
            if kind == 1: out.append(pastel(x, r, pal[(i // 4) % 4]))
            elif kind == 3: out.append(pearl(x, r))
            else: out.append(gold(x, s * .16))
            x += dirn * (r * 2 + s * .1); i += 1
    fill(x0 - s * .72, cx - width / 2 + 30, -1)
    fill(x0 + (n - 1) * step + s * .72, cx + width / 2 - 30, 1)
    for i, ch in enumerate(text):
        x = x0 + i * step; y = yat(x)
        if ch == " ":
            out.append(pastel(x, s * .3, C["blush"])); continue
        a = ang(x) + rnd.uniform(-4, 4)
        col = letter_cols[i % len(letter_cols)]
        out.append(f'<g transform="translate({x:.1f} {y:.1f}) rotate({a:.1f})" style="filter:drop-shadow(0 3px 3px rgba(80,60,50,.3))">'
                   f'<rect x="{-s/2:.1f}" y="{-s/2:.1f}" width="{s:.1f}" height="{s:.1f}" rx="{s*.14:.1f}" fill="url(#{uid}c)"/>'
                   f'<rect x="{-s/2+2:.1f}" y="{-s/2+2:.1f}" width="{s-4:.1f}" height="{s*.3:.1f}" rx="{s*.12:.1f}" fill="#fff" opacity=".55"/>'
                   f'<text x="0" y="{s*.25:.1f}" text-anchor="middle" fill="{col}" style="font:700 {s*.7:.1f}px Quicksand">{ch}</text></g>')
        if i < n - 1 and text[i + 1] != " " and ch != " ":
            out.append(gold(x + step / 2, s * .14))
    defs = (f'<defs><radialGradient id="{uid}p" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f3ede4"/><stop offset="1" stop-color="#d6c9b8"/></radialGradient>'
            f'<linearGradient id="{uid}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#f4f1ec"/><stop offset="1" stop-color="#e0d8cc"/></linearGradient>'
            f'<linearGradient id="{uid}g" x1="0" x2="1"><stop offset="0" stop-color="#a8843f"/><stop offset=".45" stop-color="#ecdcaa"/><stop offset="1" stop-color="#9a7738"/></linearGradient></defs>')
    return defs + "".join(out)


def gingham(color, sq=40, alpha=.38):
    """Gingham: the same stripe woven both ways, darker where the stripes cross."""
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    c = f"rgba({r},{g},{b},{alpha})"
    return (f"repeating-linear-gradient(0deg,{c} 0 {sq}px,transparent {sq}px {2*sq}px),"
            f"repeating-linear-gradient(90deg,{c} 0 {sq}px,transparent {sq}px {2*sq}px)")


def twill(op=.16):
    """Fine diagonal thread lines, so the gingham reads as woven cotton."""
    s = ("<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><path d='M-3 3L3 -3M0 12L12 0M9 15L15 9' stroke='#000' stroke-width='1.6' opacity='.5'/></svg>")
    return f'<div class="tex" style="background-image:url(&quot;{uri(s)}&quot;);opacity:{op}"></div>'


def label(w, h, inner, fold=26, uid="lb"):
    """A sewn cotton name label: ends folded under, a stitched edge, a soft shadow."""
    return (f'<div style="position:relative;width:{w}px;height:{h}px;filter:drop-shadow(0 6px 10px rgba(60,50,40,.25))">'
            f'<div style="position:absolute;inset:0 {fold}px;background:{C["cotton"]}"></div>'
            f'<div style="position:absolute;left:0;top:6px;bottom:6px;width:{fold+2}px;background:#e9e1d4;clip-path:polygon(0 0,100% 0,100% 100%,0 100%,40% 50%)"></div>'
            f'<div style="position:absolute;right:0;top:6px;bottom:6px;width:{fold+2}px;background:#e9e1d4;clip-path:polygon(0 0,100% 0,60% 50%,100% 100%,0 100%)"></div>'
            f'<div style="position:absolute;inset:0 {fold}px;overflow:hidden">{weave(.3, ".6 .04", 7)}</div>'
            f'<div style="position:absolute;inset:14px {fold+14}px;border:2.5px dashed {C["dusk"]};opacity:.6;border-radius:2px"></div>'
            f'<div style="position:absolute;inset:0 {fold}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">{inner}</div></div>')


def block(x, y, s, letter, col, top_col, side_mark, uid, rot=0):
    """A wooden alphabet block, seen a little from above and to the right: a carved letter in a painted border."""
    d = s * .26
    wood = f"url(#{uid}w)"
    grain = "".join(f'<path d="M{x+2:.1f} {y+s*t:.1f} Q{x+s*.5:.1f} {y+s*t+s*.04*((i%3)-1):.1f} {x+s-2:.1f} {y+s*t+s*.02:.1f}" stroke="{C["maple_dk"]}" stroke-width="1.4" fill="none" opacity=".35"/>'
                    for i, t in enumerate((.18, .33, .52, .7, .86)))
    top = f"M{x:.1f} {y:.1f} L{x+d:.1f} {y-d:.1f} L{x+s+d:.1f} {y-d:.1f} L{x+s:.1f} {y:.1f}Z"
    side = f"M{x+s:.1f} {y:.1f} L{x+s+d:.1f} {y-d:.1f} L{x+s+d:.1f} {y+s-d:.1f} L{x+s:.1f} {y+s:.1f}Z"
    i = s * .09; bw = s * .055
    # a small shape painted on the top face, skewed onto it
    tm = (f'<g transform="matrix(1 0 1 -1 0 0) translate(0 0)"></g>')
    tx, ty = x + s / 2 + d / 2, y - d / 2
    top_mark = f'<ellipse cx="{tx:.1f}" cy="{ty:.1f}" rx="{s*.2:.1f}" ry="{d*.26:.1f}" fill="none" stroke="{top_col}" stroke-width="{bw*.9:.1f}"/>'
    sx, sy = x + s + d / 2, y + s / 2 - d / 2
    if side_mark == "star":
        sm = f'<g transform="translate({sx:.1f} {sy:.1f}) skewY(-45) scale(.5 1)">{star4(0, 0, s*.17, top_col)}</g>'
    else:
        sm = f'<g transform="translate({sx:.1f} {sy:.1f}) skewY(-45) scale(.5 1)"><circle r="{s*.13:.1f}" fill="{top_col}"/></g>'
    return (f'<g transform="rotate({rot:.1f} {x+s/2:.1f} {y+s/2:.1f})" style="filter:drop-shadow(4px 8px 8px rgba(70,50,30,.28))">'
            f'<path d="{top}" fill="#f1dfbd"/><path d="{side}" fill="#c9a874"/>'
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{s:.1f}" height="{s:.1f}" fill="{wood}"/>{grain}'
            f'<rect x="{x+i:.1f}" y="{y+i:.1f}" width="{s-2*i:.1f}" height="{s-2*i:.1f}" fill="none" stroke="{col}" stroke-width="{bw:.1f}"/>'
            f'<text x="{x+s/2+2:.1f}" y="{y+s*.75+3:.1f}" text-anchor="middle" fill="#7d5d33" opacity=".45" style="font:700 {s*.66:.1f}px Quicksand">{letter}</text>'
            f'<text x="{x+s/2:.1f}" y="{y+s*.75:.1f}" text-anchor="middle" fill="{col}" style="font:700 {s*.66:.1f}px Quicksand">{letter}</text>'
            f'{top_mark}{sm}'
            f'<path d="{top}" fill="none" stroke="#b08a55" stroke-width="1.2" opacity=".5"/></g>')


def wood_defs(uid):
    return (f'<defs><linearGradient id="{uid}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecd5ab"/>'
            f'<stop offset=".6" stop-color="{C["maple"]}"/><stop offset="1" stop-color="#d3b483"/></linearGradient></defs>')


CLOUD = "M12 70 C0 70 0 48 16 46 C14 30 34 22 44 34 C50 16 78 14 84 36 C100 34 106 54 96 64 C100 72 94 78 86 78 L20 78 C14 78 12 74 12 70Z"
MOON = "M60 6 C30 10 12 36 18 62 C24 86 52 100 76 92 C56 88 40 70 40 50 C40 30 50 14 60 6Z"


def felt(path, x, y, sc, fill, stitch, rot=0):
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.1f}) scale({sc:.3f})" style="filter:drop-shadow(0 {6/sc:.1f}px {6/sc:.1f}px rgba(40,50,60,.25))">'
            f'<path d="{path}" fill="{fill}" filter="url(#felt)"/>'
            f'<path d="{path}" fill="none" stroke="{stitch}" stroke-width="{2.4/sc:.2f}" stroke-dasharray="{6/sc:.1f} {5/sc:.1f}" transform="translate(50 50) scale(.86) translate(-50 -50)" opacity=".75"/></g>')


def star5(r):
    return "M" + " L".join(f"{50 + (r if i % 2 == 0 else r*.45)*math.cos(math.radians(-90+i*36)):.1f} {50 + (r if i % 2 == 0 else r*.45)*math.sin(math.radians(-90+i*36)):.1f}" for i in range(10)) + "Z"


def mobile(cx, top, hang, sc, uid):
    """A felt nursery mobile: a wooden hoop on a cord, with felt clouds, a moon, stars and felt balls on threads."""
    rx, ry = 230 * sc, 40 * sc
    hy = top + hang
    out = []
    # cords up to a single knot
    ky = top
    for a in (200, 340, 270 + 1):
        pass
    for px in (cx - rx * .96, cx + rx * .96, cx - rx * .3, cx + rx * .3):
        out.append(f'<line x1="{cx}" y1="{ky}" x2="{px:.1f}" y2="{hy + (ry*.6 if abs(px-cx) < rx*.5 else 0):.1f}" stroke="#bfae98" stroke-width="2"/>')
    out.append(f'<line x1="{cx}" y1="{ky-400}" x2="{cx}" y2="{ky}" stroke="#bfae98" stroke-width="2.2"/>')
    out.append(f'<circle cx="{cx}" cy="{ky}" r="{6*sc:.1f}" fill="#e7dccb"/>')
    # back half of the hoop
    out.append(f'<path d="M{cx-rx:.1f} {hy:.1f} A{rx:.1f} {ry:.1f} 0 0 1 {cx+rx:.1f} {hy:.1f}" fill="none" stroke="#c7a676" stroke-width="{13*sc:.1f}"/>')
    hangs = [(-.92, 150, "cloud", C["cotton"], C["dusk"], 1.25, -4), (-.5, 300, "star", C["butter"], C["honey"], .95, 8),
             (0, 200, "moon", C["butter"], C["honey"], 1.25, 0), (.5, 170, "balls", None, None, 1, 0), (.92, 160, "cloud", C["blush"], C["rose_dk"], 1.1, 5)]
    front = []
    for f, ln, kind, fill, st, s2, rot in hangs:
        x = cx + f * rx; y0 = hy + ry * math.sqrt(max(0, 1 - f * f))
        y1 = y0 + ln * sc
        front.append(f'<line x1="{x:.1f}" y1="{y0:.1f}" x2="{x:.1f}" y2="{y1:.1f}" stroke="#bfae98" stroke-width="1.8"/>')
        S = sc * s2 * 1.3
        if kind == "cloud": front.append(felt(CLOUD, x - 55 * S, y1 - 40 * S, S, fill, st, rot))
        elif kind == "moon": front.append(felt(MOON, x - 50 * S, y1 - 8 * S, S, fill, st, rot))
        elif kind == "star": front.append(felt(star5(44), x - 50 * S, y1 - 10 * S, S, fill, st, rot))
        else:
            yy = y1
            for j, c in enumerate((C["sage"], C["cotton"], C["blush"])):
                r = 26 * sc
                front.append(f'<circle cx="{x:.1f}" cy="{yy + r:.1f}" r="{r:.1f}" fill="{c}" filter="url(#felt)" style="filter:url(#felt) drop-shadow(0 4px 4px rgba(40,50,60,.25))"/>')
                yy += 2 * r + 14 * sc
                if j < 2: front.append(f'<line x1="{x:.1f}" y1="{yy-14*sc:.1f}" x2="{x:.1f}" y2="{yy:.1f}" stroke="#bfae98" stroke-width="1.8"/>')
    # front half of the hoop, over the threads' tops
    hoop = (f'<path d="M{cx-rx:.1f} {hy:.1f} A{rx:.1f} {ry:.1f} 0 0 0 {cx+rx:.1f} {hy:.1f}" fill="none" stroke="url(#{uid}w)" stroke-width="{14*sc:.1f}" style="filter:drop-shadow(0 4px 4px rgba(60,40,20,.3))"/>'
            f'<path d="M{cx-rx:.1f} {hy-3:.1f} A{rx:.1f} {ry:.1f} 0 0 0 {cx+rx:.1f} {hy-3:.1f}" fill="none" stroke="#f3e2c2" stroke-width="{3*sc:.1f}" opacity=".7"/>')
    return wood_defs(uid) + "".join(out) + "".join(front) + hoop


def hoop(cx, cy, R, uid):
    """A wooden embroidery hoop with its brass screw at the top."""
    return (f'<circle cx="{cx}" cy="{cy}" r="{R+6}" fill="none" stroke="rgba(60,40,20,.18)" stroke-width="30" style="filter:blur(8px)"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="url(#{uid}w)" stroke-width="34"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{R-17}" fill="none" stroke="#a98652" stroke-width="2" opacity=".6"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{R+17}" fill="none" stroke="#a98652" stroke-width="2" opacity=".6"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{R-4}" fill="none" stroke="#f4e4c6" stroke-width="5" opacity=".6"/>'
            f'<rect x="{cx-34}" y="{cy-R-44}" width="68" height="40" rx="6" fill="url(#{uid}w)" stroke="#a98652" stroke-width="2"/>'
            f'<rect x="{cx-60}" y="{cy-R-34}" width="120" height="20" rx="10" fill="url(#{uid}b)"/>'
            f'<circle cx="{cx+64}" cy="{cy-R-24}" r="14" fill="url(#{uid}b)"/>'
            f'<defs><linearGradient id="{uid}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efd9b1"/><stop offset=".5" stop-color="{C["maple"]}"/><stop offset="1" stop-color="#c9a671"/></linearGradient>'
            f'<linearGradient id="{uid}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1dea6"/><stop offset=".5" stop-color="#b79443"/><stop offset="1" stop-color="#8a6c2a"/></linearGradient></defs>')


def aida(cell, op=.55):
    """Aida cloth: a square weave with a hole at every stitch."""
    s = (f"<svg xmlns='http://www.w3.org/2000/svg' width='{cell}' height='{cell}'>"
         f"<rect width='{cell}' height='{cell}' fill='none'/><rect x='0' y='0' width='{cell*.22:.1f}' height='{cell*.22:.1f}' fill='#7a6a55' opacity='.55'/>"
         f"<path d='M{cell*.22:.1f} {cell*.11:.1f}H{cell}' stroke='#fff' stroke-width='{cell*.16:.1f}' opacity='.35'/>"
         f"<path d='M{cell*.11:.1f} {cell*.22:.1f}V{cell}' stroke='#7a6a55' stroke-width='{cell*.08:.1f}' opacity='.18'/></svg>")
    return f'<div class="tex" style="background-image:url(&quot;{uri(s)}&quot;);opacity:{op}"></div>'


def sprig(x, y, length, ang, seed, sc=1.0):
    """A pressed sprig of baby's breath: a fine forked stem, each fork ending in a cluster of tiny dried florets."""
    rnd = random.Random(seed); stems = []; flowers = []
    def grow_b(x0, y0, a, ln, depth):
        x1 = x0 + math.cos(math.radians(a)) * ln; y1 = y0 + math.sin(math.radians(a)) * ln
        mx = (x0 + x1) / 2 + rnd.uniform(-6, 6); my = (y0 + y1) / 2 + rnd.uniform(-6, 6)
        stems.append(f'<path d="M{x0:.1f} {y0:.1f} Q{mx:.1f} {my:.1f} {x1:.1f} {y1:.1f}" stroke="{"#8d9a6f" if depth < 2 else "#a3a578"}" stroke-width="{max(1.2, 3.6 - depth*.8)*sc:.1f}" fill="none" stroke-linecap="round"/>')
        if depth >= 5 or ln < 14 * sc:
            for _ in range(rnd.randint(2, 4)):
                fx, fy = x1 + rnd.uniform(-8, 8) * sc, y1 + rnd.uniform(-8, 8) * sc
                r = rnd.uniform(5.5, 9) * sc
                petals = "".join(f'<circle cx="{fx + math.cos(t)*r*.48:.1f}" cy="{fy + math.sin(t)*r*.48:.1f}" r="{r*.55:.1f}" fill="#fbf8ef"/>' for t in [rnd.uniform(0, 6.3) + j * 1.257 for j in range(5)])
                flowers.append(f'<g opacity="{rnd.uniform(.85,1):.2f}">{petals}<circle cx="{fx:.1f}" cy="{fy:.1f}" r="{r*.28:.1f}" fill="#d8cfae"/></g>')
            return
        for b in range(3 if depth in (0, 2, 3) else 2):
            grow_b(x1, y1, a + rnd.uniform(-34, 34) + (b - 1) * 20, ln * rnd.uniform(.55, .74), depth + 1)
    grow_b(x, y, ang, length, 0)
    return (f'<g style="filter:drop-shadow(1px 2px 1.5px rgba(70,70,50,.28))">{"".join(stems)}{"".join(flowers)}</g>')


def washi(x, y, w, h, rot, col, op=.72):
    return (f'<div class="fr" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;transform:rotate({rot}deg);background:{col};opacity:{op};'
            f'filter:url(#torn);background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.22) 0 6px,transparent 6px 22px)"></div>')


def postage_stamp(w, h, uid):
    """A postage stamp with perforated edges: an engraved frame around a crescent moon and stars, BABY POST and 2027."""
    p = 9; holes = []
    for i in range(int(w / (2 * p)) + 1):
        holes += [f'<circle cx="{i*2*p + p/2:.1f}" cy="0" r="{p*.55:.1f}"/>', f'<circle cx="{i*2*p + p/2:.1f}" cy="{h}" r="{p*.55:.1f}"/>']
    for i in range(int(h / (2 * p)) + 1):
        holes += [f'<circle cx="0" cy="{i*2*p + p/2:.1f}" r="{p*.55:.1f}"/>', f'<circle cx="{w}" cy="{i*2*p + p/2:.1f}" r="{p*.55:.1f}"/>']
    m = 16
    iw, ih = w - 2 * m, h - 2 * m
    cx, cy = w / 2, m + ih * .42
    moon = f'<g transform="translate({cx-38:.1f} {cy-50:.1f}) scale(.95)"><path d="{MOON}" fill="{C["butter"]}" stroke="{C["dusk_dk"]}" stroke-width="2"/></g>'
    stars = "".join(star4(cx + dx, cy + dy, s, C["cream"]) for dx, dy, s in ((38, -30, 10), (52, 10, 6), (-56, -34, 7), (-40, 30, 5)))
    hatch = "".join(f'<line x1="{m}" x2="{w-m}" y1="{m + j*5}" y2="{m + j*5}" stroke="#fff" stroke-opacity=".08" stroke-width="1.5"/>' for j in range(int(ih / 5)))
    return (f'<svg width="{w}" height="{h}" style="display:block;overflow:visible;filter:drop-shadow(0 3px 5px rgba(60,50,40,.25))">'
            f'<defs><mask id="{uid}"><rect width="{w}" height="{h}" fill="#fff"/><g fill="#000">{"".join(holes)}</g></mask></defs>'
            f'<g mask="url(#{uid})"><rect width="{w}" height="{h}" fill="#fbfaf6"/>'
            f'<rect x="{m}" y="{m}" width="{iw}" height="{ih}" fill="{C["dusk"]}"/>{hatch}'
            f'<rect x="{m+7}" y="{m+7}" width="{iw-14}" height="{ih-14}" fill="none" stroke="{C["cream"]}" stroke-width="1.5" opacity=".7"/>'
            f'{moon}{stars}'
            f'<text x="{cx}" y="{m+ih*.84:.1f}" text-anchor="middle" fill="{C["cream"]}" style="font:700 {w*.11:.1f}px Quicksand;letter-spacing:.16em">BABY POST</text>'
            f'<text x="{m+12}" y="{m+30}" fill="{C["cream"]}" style="font:700 {w*.1:.1f}px Quicksand">27</text></g></svg>')


def postmark(r, text, col, uid, waves=5, wave_len=420):
    """A round postmark with the date in the middle and wavy cancellation lines running off to the left."""
    c = r + 4
    wl = "".join(f'<path d="M{c - r - 10:.1f} {c - r*.55 + j*r*.28:.1f} ' + " ".join(f"q{-26} {-14 if (i % 2 == 0) else 14} {-52} 0" for i in range(int(wave_len / 52))) + f'" fill="none" stroke="{col}" stroke-width="3"/>' for j in range(waves))
    ring = graduation.ring_text(c, c, r * .74, text, f"font:700 {r*.2:.1f}px Quicksand;letter-spacing:.12em", col, uid)
    return (f'<svg width="{2*c}" height="{2*c}" style="display:block;overflow:visible;filter:url(#stamp)">'
            f'<circle cx="{c}" cy="{c}" r="{r}" fill="none" stroke="{col}" stroke-width="3.5"/>'
            f'<circle cx="{c}" cy="{c}" r="{r*.52:.1f}" fill="none" stroke="{col}" stroke-width="2"/>{ring}'
            f'<text x="{c}" y="{c - 4:.1f}" text-anchor="middle" fill="{col}" style="font:700 {r*.24:.1f}px Quicksand">APR 18</text>'
            f'<text x="{c}" y="{c + r*.26:.1f}" text-anchor="middle" fill="{col}" style="font:700 {r*.22:.1f}px Quicksand">2027</text>{wl}</svg>')


def airmail_border(W, H, bw, a, b):
    """The striped edge of an airmail envelope, here in blush and powder blue."""
    st = 46
    g = f"repeating-linear-gradient(-45deg,{a} 0 {st}px,{C['cotton']} {st}px {st*1.5}px,{b} {st*1.5}px {st*2.5}px,{C['cotton']} {st*2.5}px {st*3}px)"
    return (f'<div class="fr" style="inset:0;background:{g};-webkit-mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);'
            f'mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);padding:{bw}px"></div>')


def eyelets(W, H, side, uid):
    """Broderie anglaise down one edge: a scalloped satin-stitched hem with flower eyelets and round eyelets cut through."""
    x_edge = 58 if side < 0 else W - 58
    out = []
    sc = 70  # scallop pitch
    n = int(H / sc) + 2
    # the white cloth with a scalloped edge
    d = f"M{W/2:.0f} -10 L{x_edge:.1f} -10 "
    for i in range(n):
        y0 = i * sc - 10
        d += f"Q{x_edge + side*40:.1f} {y0 + sc/2:.1f} {x_edge:.1f} {y0 + sc:.1f} "
    d += f"L{W/2:.0f} {n*sc:.0f}Z"
    out.append(f'<path d="{d}" fill="{C["cotton"]}"/>')
    # satin-stitched scallop rim
    rim = f"M{x_edge:.1f} -10 " + "".join(f"Q{x_edge + side*40:.1f} {i*sc - 10 + sc/2:.1f} {x_edge:.1f} {i*sc - 10 + sc:.1f} " for i in range(n))
    out.append(f'<path d="{rim}" fill="none" stroke="#efe9df" stroke-width="9"/><path d="{rim}" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>')
    hole = lambda cx, cy, rx, ry, rot=0: (f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx+3.5:.1f}" ry="{ry+3.5:.1f}" fill="#ece6dc" transform="rotate({rot} {cx:.1f} {cy:.1f})"/>'
                                          f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="#C8D8E5" transform="rotate({rot} {cx:.1f} {cy:.1f})"/>')
    col_x = x_edge - side * 34
    for i in range(n):
        cy = i * sc - 10 + sc / 2
        out.append(hole(x_edge + side * 6, cy, 6, 6))
        if i % 2 == 0:
            fx = col_x - side * 10
            out.append(hole(fx, cy + sc / 2, 4.5, 4.5))
            for j in range(6):
                t = j * 60
                out.append(hole(fx + math.cos(math.radians(t)) * 15, cy + sc / 2 + math.sin(math.radians(t)) * 15, 4, 8.5, t + 90))
            # stem and leaf in padded satin stitch
            out.append(f'<path d="M{fx - side*4:.1f} {cy + sc/2 + 20:.1f} q{-side*10} 22 {-side*4} 44" stroke="#ece6dc" stroke-width="4" fill="none"/>')
    return "".join(out)


# ---------- the 10 designs ----------
def muslin_swaddle(n, mode):  # neutral; showers, sip-and-sees
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    s = k(n, 1, 1.2, .95)
    txt = (caps("Oh baby", 22 * s, C["dusk"], ".5em", 600) +
           f'<div style="{ser(150*s)};color:{C["cocoa"]};margin:{8*s}px 0 {14*s}px">{G["baby"]}</div>' +
           caps(f'A shower for {G["parents"]} &nbsp;·&nbsp; {G["date"]}', 19 * s, C["cocoa_lt"], ".32em", 600))
    hem = 34
    avoid = [grow(w, 40) for w in lay["wins"]] + [text_core(lay["text"], 1150 * s, 260 * s)] + [[0, 0, W, hem + 30], [0, H - hem - 30, W, 60], [0, 0, hem + 30, H], [W - hem - 30, 0, 60, H]]
    pts, rnd = spread(W, H, avoid, 120, 16, 92, 5 + n)
    print_ = "".join(star4(x, y, rnd.uniform(11, 15), C["dusk"], rnd.uniform(-15, 15), .55) if i % 3 else
                     f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{C["rose"]}" opacity=".6"/>' for i, (x, y) in enumerate(pts))
    hemline = (f'<div class="fr" style="inset:0;border:{hem}px solid rgba(120,100,80,.07)"></div>'
               f'<div class="fr" style="inset:{hem-6}px;border:2.5px dashed rgba(120,100,80,.32)"></div>'
               f'<div class="fr" style="inset:{hem}px;box-shadow:0 0 0 1.5px rgba(120,100,80,.12),inset 0 2px 5px rgba(120,100,80,.12)"></div>')
    return dict(bg=C["oat"], body=weave(.45, ".7 .05", 3) + svg(W, H, print_) + crinkle(W, H, 4, .5) + paper(.08, .05) + hemline +
                windows(lay["wins"], mode, mat=(14, f"background:{C['cotton']};box-shadow:0 5px 14px rgba(90,70,50,.18)")) + box(lay["text"], txt))


def letter_beads(n, mode):  # neutral, pink and blue together; showers, sip-and-sees, reveals
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    tx, ty, tw, th = lay["text"]
    s = k(n, .95, 1.2, .92)
    cube = 74 * s
    bh = cube * 2.0
    beads = svg(tw, bh, bead_string("OH BABY", tw / 2, cube * .7, k(n, 1500, 1600, 1500), cube, cube * .32, f"bd{n}"), "", "display:block;overflow:visible")
    txt = (f'<div style="width:{tw}px">{beads}</div>' +
           f'<div style="{ser(62*s)};color:{C["cocoa"]};margin:{-cube*.2:.0f}px 0 {12*s}px">a shower for {G["parents"]}</div>' +
           caps(G["date"], 19 * s, C["rose_dk"], ".42em", 600))
    return dict(bg=f"linear-gradient(180deg,{C['cream']},#f7efe6)", body=weave(.22, ".6 .04", 9) + paper(.10, .05) +
                windows(lay["wins"], mode, [(14, f'border:2px solid {C["blush"]}'), (24, f'border:1px solid {C["powder"]}')]) + box(lay["text"], txt))


def gingham_label(n, mode):  # blue (swaps to pink, sage or butter); showers
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    tx, ty, tw, th = lay["text"]
    s = k(n, .9, 1.12, .92)
    lw, lh = k(n, 1060, 1180, 1080), k(n, 226, 320, 290)
    inner = (caps("Oh baby", 19 * s, C["dusk"], ".5em", 600) +
             f'<div style="{ser(118*s)};color:{C["cocoa"]};margin:{4*s}px 0 {10*s}px">{G["baby"]}</div>' +
             caps(f'{G["parents"]} &nbsp;·&nbsp; {G["date"]}', 17 * s, C["cocoa_lt"], ".34em", 600))
    return dict(bg=f"{gingham('#7f9fbc', 36, .36)},{C['cotton']}",
                body=twill(.10) + weave(.25, ".7 .05", 11) + crinkle(W, H, 9, .32, ".004 .008", 3) + paper(.06, .04) +
                windows(lay["wins"], mode, mat=(16, f"background:{C['cotton']};box-shadow:0 6px 16px rgba(40,60,80,.25)")) +
                box(lay["text"], label(lw, lh, inner)))


def alphabet_blocks(n, mode):  # neutral pastels; showers, first birthdays too
    lay = LAYOUTS["panel"]["n"][n]; W, H = L
    px, py, pw, ph = lay["panel"]
    cols = [C["rose_dk"], C["dusk_dk"], C["sage_dk"], C["honey"]]
    tops = [C["dusk"], C["rose"], C["honey"], C["sage_dk"]]
    out = [wood_defs("ab")]
    if n == 1:
        bs = 150; x0 = px + pw / 2 - bs / 2 - 20; y = py + 150
        for i, (ch, rot, dx) in enumerate(zip("BABY", (-4, 3, -2, 4), (-14, 10, -8, 6))):
            out.append(block(x0 + dx, y + i * (bs + 2), bs, ch, cols[i], tops[i], "star" if i % 2 else "dot", "ab", rot))
        out = [out[0]] + out[1:][::-1]  # draw the bottom block first so each sits on the one below
        wb = [px, py + 150 + 4 * bs + 70, pw, ph - (150 + 4 * bs + 70) - 70]
        sc = .95
    elif n == 2:
        bs = 168; gap = 30; tot = 4 * bs + 3 * gap
        x0 = px + (pw - tot) / 2 - 20; y = py + 330
        for i, (ch, rot, dy) in enumerate(zip("BABY", (-5, 3, -3, 5), (10, -12, 6, -6))):
            out.append(block(x0 + i * (bs + gap), y + dy, bs, ch, cols[i], tops[i], "star" if i % 2 else "dot", "ab", rot))
        wb = [px, y + bs + 60, pw, 300]
        sc = 1.18
    else:
        bs = 104; gap = 22; tot = 4 * bs + 3 * gap
        x0 = px + (pw - tot) / 2 - 12; y = py + 92
        for i, (ch, rot, dy) in enumerate(zip("BABY", (-5, 3, -3, 5), (6, -8, 4, -4))):
            out.append(block(x0 + i * (bs + gap), y + dy, bs, ch, cols[i], tops[i], "star" if i % 2 else "dot", "ab", rot))
        wb = [px, y + bs + 30, pw, ph - (y + bs + 30 - py) - 30]
        sc = .9
    words = (f'<div style="{ser(96*sc)};color:{C["cocoa"]}">{G["baby"]}</div>' +
             caps(f'A shower for {G["parents"]}', 17 * sc, C["cocoa_lt"], ".32em", 600, "Montserrat", f"margin-top:{14*sc}px") +
             caps(G["date"], 17 * sc, C["dusk_dk"], ".42em", 600, "Montserrat", f"margin-top:{10*sc}px"))
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{C["powder"]}">{weave(.3, ".6 .04", 5)}{paper(.08, .06)}</div>'
    return dict(bg=C["cream"], body=paper(.10, .05) + weave(.18) + panel + svg(W, H, "".join(out)) +
                windows(lay["wins"], mode, [(12, f'border:2px solid {C["maple"]}')]) + box(wb, words))


def nursery_mobile(n, mode):  # neutral; showers, sip-and-sees, christenings
    lay = LAYOUTS["panel"]["n"][n]; W, H = L
    px, py, pw, ph = lay["panel"]
    if n == 1:
        mob = mobile(px + pw / 2, py + 190, 90, .82, "nm"); wb = [px, py + 740, pw, 380]; sc = .9
    elif n == 2:
        mob = mobile(px + pw / 2, py + 40, 100, 1.3, "nm"); wb = [px, py + 840, pw, ph - 900]; sc = 1.15
    else:
        mob = mobile(px + 200, py + 20, 50, .62, "nm"); wb = [px + 390, py, pw - 410, ph]; sc = .78
    words = (caps("Oh baby", 18 * sc, C["dusk_dk"], ".5em", 600) +
             f'<div style="{ser(100*sc)};color:{C["cocoa"]};margin:{8*sc}px 0 {12*sc}px">{G["baby"]}</div>' +
             caps(f'A shower for {G["parents"]}', 16 * sc, C["cocoa_lt"], ".3em", 600) +
             caps(G["date"], 16 * sc, C["dusk_dk"], ".42em", 600, "Montserrat", f"margin-top:{8*sc}px"))
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:radial-gradient(90% 70% at 50% 30%,#e3ebf1,{C["powder"]} 70%,#c6d6e2);overflow:hidden">'
             f'{weave(.25, ".6 .04", 2)}{paper(.08, .06)}{svg(pw, ph, mob, "tex", f"left:{-px}px;top:{-py}px;width:{W}px;height:{H}px")}</div>')
    return dict(bg=C["cream"], body=paper(.10, .05) + weave(.18) + panel +
                windows(lay["wins"], mode, [(12, f'border:1.5px solid {C["dusk"]};opacity:.55')]) + box(wb, words))


def oh_baby(n, mode):  # typographic; blush (swaps to blue or sage); showers, reveals
    lay = LAYOUTS["panel"]["n"][n]
    px, py, pw, ph = lay["panel"]
    fs = k(n, 150, 200, 112)
    rows = k(n, 4, 4, 3)
    hi = k(n, 1, 1, 1)
    rws = "".join(
        f'<div style="{ser(fs)};line-height:.92;' +
        (f"color:{C['cocoa']}" if i == hi else f"color:transparent;-webkit-text-stroke:2px {C['rose_dk']};opacity:{.8 - abs(i-hi)*.2:.2f}") + '">oh baby</div>'
        for i in range(rows))
    sc = k(n, .9, 1.1, .8)
    txt = (f'<div style="display:flex;flex-direction:column;align-items:center">{rws}</div>' +
           caps(f'A shower for {G["parents"]}', 19 * sc, C["cocoa"], ".34em", 600, "Montserrat", f"margin-top:{34*sc}px") +
           caps(G["date"], 19 * sc, C["rose_dk"], ".42em", 600, "Montserrat", f"margin-top:{12*sc}px"))
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{C["blush"]}">{weave(.25)}{paper(.08, .06)}</div>'
    return dict(bg="#F8ECE8", body=paper(.08, .05) + panel + windows(lay["wins"], mode, [(12, f'border:2px solid {C["rose"]};opacity:.7')]) + box([px, py, pw, ph], txt))


def christening_lace(n, mode):  # blue ribbon (swaps to blush or ivory); christenings, baptisms, showers
    lay = LAYOUTS["lace"]["n"][n]; W, H = P
    s = k(n, 1, .95, .9)
    silver = graduation.foil(SILVER)
    rib = ""
    if n == 1:
        # beading lace: a satin ribbon threaded through a row of slots
        slots = []; rw = 760; x0 = (W - rw) / 2
        for i in range(12):
            x = i * rw / 12
            slots.append(f'<rect x="{x+8:.1f}" y="0" width="{rw/12-16:.1f}" height="40" rx="6" fill="{C["cotton"]}" stroke="#e6dfd3" stroke-width="5"/>' if i % 2 else
                         f'<rect x="{x+3:.1f}" y="6" width="{rw/12-6:.1f}" height="28" rx="4" fill="url(#rb)"/>')
        rib = (f'<svg width="{rw}" height="44" style="display:block;overflow:visible;margin:0 auto 46px"><defs><linearGradient id="rb" x1="0" y1="0" x2="0" y2="1">'
               f'<stop offset="0" stop-color="#e6eef4"/><stop offset=".5" stop-color="{C["powder"]}"/><stop offset="1" stop-color="#a9bdcc"/></linearGradient></defs>'
               f'{"".join(slots)}</svg>')
    txt = (rib + caps("The christening of", 20 * s, C["dusk"], ".5em", 600) +
           f'<div style="{ser(k(n,150,118,108))};color:{C["dusk_dk"]};margin:{10*s}px 0 {16*s}px">{G["christen"]}</div>' +
           caps(G["christen_date"], 20 * s, C["dusk"], ".42em", 600) +
           (f'<div style="{ser(46)};color:{C["cocoa_lt"]};margin-top:34px">welcome, little one</div>' if n == 1 else ""))
    lace = svg(W, H, eyelets(W, H, -1, "l") + eyelets(W, H, 1, "r"))
    return dict(bg="#C8D8E5", body=lace + weave(.28, ".7 .05", 13) + paper(.07, .04) +
                windows(lay["wins"], mode, [(14, f'border:1.5px solid {C["powder"]}'), (22, f'border:1px solid {C["powder"]};opacity:.6')]) + box(lay["text"], txt))


def cross_stitch(n, mode):  # rose and sage floss (swaps to blue); showers, sip-and-sees
    lay = LAYOUTS["card"]["n"][n]; W, H = P
    cell = 18
    st = []
    # a stitched border of tiny hearts and dots, on the cloth's grid
    bx0, by0 = 2 * cell, 2 * cell
    cols_n, rows_n = int((W - 4 * cell) / cell), int((H - 4 * cell) / cell)
    for i in range(0, cols_n, 4):
        for yy in (by0, by0 + (rows_n - 1) * cell):
            st.append(xcell(bx0 + i * cell, yy, cell, C["sage_dk"], "#566650"))
    for j in range(4, rows_n - 4, 4):
        for xx in (bx0, bx0 + (cols_n - 1) * cell):
            st.append(xcell(xx, by0 + j * cell, cell, C["sage_dk"], "#566650"))
    hoop_svg = ""
    if n == 1:
        cx, cy, R = 600, 1305, 372
        c2 = 14
        hearts = "♥ ♥ ♥"
        w1 = text_w("OH BABY", 16); xstitch("OH BABY", round((cx - w1 / 2) / 2) * 2, 1130, 16, C["rose_dk"], "#86524f", st)
        w2 = text_w(hearts, c2); xstitch(hearts, round(cx - w2 / 2), 1272, c2, C["rose"], "#a66f6f", st)
        w3 = text_w("BENNETT", c2); xstitch("BENNETT", round(cx - w3 / 2), 1356, c2, C["sage_dk"], "#566650", st)
        w4 = text_w("4.18.27", 10); xstitch("4.18.27", round(cx - w4 / 2), 1494, 10, C["cocoa_lt"], "#6c5a50", st)
        hoop_svg = (f'<circle cx="{cx}" cy="{cy}" r="{R-10}" fill="#f6f0e4"/>' )
        hoop_ring = hoop(cx, cy, R, "hp")
        words = ""
    else:
        c1 = 14
        w1 = text_w("BABY BENNETT", c1)
        y1 = lay["text"][1] + 40
        xstitch("BABY BENNETT", round(W / 2 - w1 / 2), y1, c1, C["rose_dk"], "#86524f", st)
        w2 = text_w("♥", 12)
        for xx in (W / 2 - w1 / 2 - 70, W / 2 + w1 / 2 + 70 - w2):
            xstitch("♥", round(xx), y1 + 20, 12, C["sage_dk"], "#566650", st)
        hoop_ring = ""
        words = box([0, y1 + 7 * c1 + 30, W, 120], caps(f'A shower for {G["parents"]} &nbsp;·&nbsp; {G["date"]}', 19, C["cocoa_lt"], ".32em", 600))
    backstitch = "".join(f'<rect x="{x-14}" y="{y-14}" width="{w+28}" height="{h+28}" fill="none" stroke="{C["rose"]}" stroke-width="3" stroke-dasharray="14 6" opacity=".8"/>' for x, y, w, h, _ in lay["wins"])
    return dict(bg="#F1EADC", body=aida(cell, .5) + svg(W, H, hoop_svg) + aida(cell, .0) + weave(.18, ".5 .5", 4) + paper(.08, .06) +
                svg(W, H, hoop_ring + "".join(st) + backstitch) + windows(lay["wins"], mode) + words)


def babys_breath(n, mode):  # sage (swaps to blush); showers, christenings, sip-and-sees
    lay = LAYOUTS["tag"]["n"][n]; W, H = P
    inset = 40
    sheet = (f'<div class="fr" style="inset:{inset}px;background:#F6F4EC;filter:url(#deckle);box-shadow:0 4px 14px rgba(60,70,50,.25)"></div>'
             f'<div class="fr" style="inset:{inset+6}px;overflow:hidden;filter:url(#deckle)">{paper(.16, .08)}{weave(.12, ".3 .3", 6)}</div>')
    t = lay["text"]
    s = k(n, 1, .86, .82)
    head = (caps("A baby shower for", 20 * s, C["sage_dk"], ".46em", 600) +
            f'<div style="{ser(k(n,136,112,104))};color:{C["cocoa"]};margin:{10*s}px 0 {14*s}px">{G["mom"]}</div>' +
            caps(G["date"], 19 * s, C["cocoa_lt"], ".42em", 600))
    sp = []
    if n == 1:
        sp.append(sprig(250, 600, 170, -112, 4, 1.0)); sp.append(sprig(960, 600, 170, -70, 9, 1.0))
        tapes = washi(150, 520, 190, 46, -24, C["blush"]) + washi(880, 520, 190, 46, 22, C["blush"])
        foot = box(lay["foot"], f'<div style="{ser(58, True)};color:{C["sage_dk"]}">baby&rsquo;s breath &amp; brunch</div>')
    else:
        y0 = t[1] + t[3] - 10
        sp.append(sprig(140, y0, 130, -80, 4, .85)); sp.append(sprig(1060, y0, 130, -100, 9, .85))
        tapes = washi(80, y0 - 50, 140, 36, -18, C["blush"]) + washi(990, y0 - 50, 140, 36, 18, C["blush"])
        foot = ""
    return dict(bg=C["sage_md"], body=paper(.08, .08) + sheet + svg(W, H, "".join(sp)) + tapes +
                windows(lay["wins"], mode, [(10, f'border:1.5px solid {C["sage_dk"]};opacity:.6')]) + box(t, head) + foot)


def airmail(n, mode):  # pink and blue; gender reveals, showers
    lay = LAYOUTS["tag"]["n"][n]; W, H = P
    bw = 42
    t = lay["text"]
    hand = lambda txt, fs, col=C["dusk_dk"], extra="": f'<div style="font:600 {fs}px/1.05 Caveat;color:{col};{extra}">{txt}</div>'
    etiquette = lambda fs: (f'<div style="display:inline-block;background:{C["dusk"]};color:{C["cotton"]};font:700 {fs}px/1 Quicksand;letter-spacing:.16em;'
                            f'padding:{fs*.5:.0f}px {fs*.8:.0f}px {fs*.42:.0f}px {fs*.96:.0f}px;border-radius:4px;box-shadow:inset 0 0 0 {fs*.14:.0f}px {C["cotton"]},inset 0 0 0 {fs*.22:.0f}px {C["dusk"]}">BOY OR GIRL?</div>')
    sw, sh = k(n, 190, 150, 140), k(n, 230, 180, 170)
    stamp = f'<div class="fr" style="left:{W - bw - 60 - sw}px;top:{bw + k(n,62,40,34)}px;transform:rotate(3deg)">{postage_stamp(sw, sh, f"ps{n}")}</div>'
    pr = k(n, 104, 84, 80)
    pm = (f'<div class="fr" style="left:{W - bw - 60 - sw - pr*1.2:.0f}px;top:{bw + k(n,62,40,34) + sh*.32:.0f}px;transform:rotate(-8deg);opacity:.85">'
          f'{postmark(pr, "SPECIAL DELIVERY · SPECIAL DELIVERY ·", "#6d6a7c", f"pm{n}", 4, k(n,150,110,100))}</div>')
    if n == 1:
        addr = (f'<div style="text-align:left;margin-left:40px">' + caps("Special delivery for", 18, C["rose_dk"], ".4em", 600, "Montserrat", "padding-left:0") +
                hand(G["baby"], 128, C["dusk_dk"], "margin-top:14px") + hand(f'c/o {G["parents"]}', 64, C["cocoa"], "margin-top:4px;opacity:.85") +
                hand(G["due"], 64, C["cocoa"], "margin-top:0;opacity:.85") + '</div>')
        text = (f'<div class="tb" style="left:{t[0]}px;top:{t[1]}px;width:{t[2]}px;height:{t[3]}px;align-items:flex-start">{addr}</div>' +
                box(lay["foot"], etiquette(40) + caps(f'Gender reveal &nbsp;·&nbsp; {G["date"]}', 19, C["cocoa_lt"], ".36em", 600, "Montserrat", "margin-top:26px")))
    else:
        addr = (f'<div style="text-align:left;margin-left:30px">' + caps("Special delivery for", 15, C["rose_dk"], ".4em", 600, "Montserrat", "padding-left:0") +
                hand(G["baby"], k(n, 0, 100, 94), C["dusk_dk"], "margin-top:8px") +
                f'<div style="display:flex;align-items:center;gap:26px;margin-top:14px">{etiquette(k(n,0,24,22))}'
                f'{caps(G["date"], 15, C["cocoa_lt"], ".34em", 600, "Montserrat", "padding-left:0")}</div></div>')
        text = f'<div class="tb" style="left:{t[0]}px;top:{t[1]}px;width:{t[2]}px;height:{t[3]}px;align-items:flex-start">{addr}</div>'
    return dict(bg=C["cotton"], body=weave(.2) + paper(.10, .05) + airmail_border(W, H, bw, C["blush"], C["powder"]) +
                f'<div class="fr" style="inset:{bw}px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)"></div>' + stamp + pm +
                windows(lay["wins"], mode, [(10, f'border:1.5px solid {C["dusk"]};opacity:.5')]) + text)


DESIGNS = [  # id, name, base layout, builder
    ("muslin-swaddle", "Muslin Swaddle", "band", muslin_swaddle),
    ("letter-beads", "Letter Beads", "band", letter_beads),
    ("gingham-label", "Gingham", "band", gingham_label),
    ("alphabet-blocks", "Alphabet Blocks", "panel", alphabet_blocks),
    ("nursery-mobile", "Nursery Mobile", "panel", nursery_mobile),
    ("oh-baby", "Oh Baby", "panel", oh_baby),
    ("christening-lace", "Christening Lace", "lace", christening_lace),
    ("cross-stitch", "Cross-Stitch", "card", cross_stitch),
    ("babys-breath", "Baby's Breath", "tag", babys_breath),
    ("airmail", "Airmail Reveal", "tag", airmail),
]


def page(d, n, mode):
    did, name, base, fn = d
    W, H = LAYOUTS[base]["size"]
    r = fn(n, mode)
    return (f'<!doctype html><meta charset="utf-8"><style>{FONT_CSS}{build.BASE_CSS}body{{width:{W}px;height:{H}px;background:{r["bg"]}}}</style>'
            f'<svg width="0" height="0" style="position:absolute">{build.gold_defs()}<defs>{FILTERS}</defs></svg><body>{r["body"]}</body>')


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    only = os.sys.argv[1:]
    for d in DESIGNS:
        did, name, base, _ = d
        W, H = LAYOUTS[base]["size"]
        for n in (1, 2, 3):
            for mode in ("preview", "overlay", "blank"):
                if only and did not in only: continue
                with open(os.path.join(OUT, f"{did}-{n}-{mode}.html"), "w") as f:
                    f.write(page(d, n, mode))
            manifest.append(dict(id=did, name=name, base=base, n=n, size=[W, H], category="babyshower",
                                 wins=[w[:4] for w in LAYOUTS[base]["n"][n]["wins"]],
                                 shapes=[w[4] for w in LAYOUTS[base]["n"][n]["wins"]]))
    with open(os.path.join(HERE, "out-babyshower", "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(len(manifest), "design versions")


if __name__ == "__main__":
    main()
