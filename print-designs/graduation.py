#!/usr/bin/env python3
"""Graduation print designs: high school, college and grad school.
Same pipeline as the Wedding (build.py), Birthday and Holiday sets. Writes one HTML page per design,
photo count and mode into out-graduation/html/. Then:
  PD_OUT=out-graduation node render.js
  PD_OUT=out-graduation PD_FINAL=final-graduation python3 finish.py
Every design is 4x6 at 300 dpi. Every photo window is landscape.
Each design is grounded in a real object from school life: a diploma, a chalkboard, a felt pennant,
a tassel, an embossed seal, a varsity letter, a composition book, a library card and a commencement program."""
import json, math, os, random

import build
from build import paper, windows, box, caps, k, gold_defs
from birthday import _clear, grow, text_core

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out-graduation", "html")
FONTS = build.FONTS

# ---------- style guide: academic colors (they swap for the school's own) on parchment, slate and wool ----------
C = dict(parchment="#F2EADA", vellum="#E6D9BF", stock="#F5F0E6", ink="#1D1D1F", blue="#22396B", blue_dk="#15264A",
         ivy="#24452F", ivy_dk="#172E1F", cardinal="#9B1B30", cardinal_dk="#6E1222", brass="#A8873A", tassel="#E2B33C",
         slate="#263330", chalk="#ECEBE4", manila="#EBDDB8", stamp="#5B3A8C", oak="#7A5230", cream="#F4EAD3",
         marble_ink="#151515", rule_blue="#9DB7D0", rule_red="#C9505A", white="#FFFFFF")
GOLD = "linear-gradient(100deg,#8f6f2a 0%,#e9cf86 30%,#b8933e 50%,#f3dfa2 68%,#9b7a31 100%)"
foil = lambda g: f"background:{g};-webkit-background-clip:text;background-clip:text;color:transparent"

FONT_CSS = build.FONT_CSS + "".join(
    f"@font-face{{font-family:'{n}';src:url('{FONTS}/{f}');font-style:{s};font-weight:{w}}}"
    for n, f, s, w in [("Cinzel", "Cinzel.ttf", "normal", "100 900"), ("Garamond", "EBGaramond.ttf", "normal", "100 900"),
                       ("Garamond", "EBGaramond-Italic.ttf", "italic", "100 900"), ("Fraktur", "UnifrakturMaguntia-Book.ttf", "normal", "100 900"),
                       ("Varsity", "Graduate-Regular.ttf", "normal", "100 900"), ("Courier", "CourierPrime-Regular.ttf", "normal", "400"),
                       ("Courier", "CourierPrime-Bold.ttf", "normal", "700"), ("Caveat", "Caveat.ttf", "normal", "100 900")])

# Sample words. Each graduate's own name, school and date replace them.
G = dict(name="Maya Johnson", first="Maya", ini="M", year="2027", cls="Class of 2027", hs="Northfield High School",
         uni="Harbor University", degree="Master of Science", date="June 12, 2027", date_short="06 · 12 · 2027")


def gar(size, wt=500, ital=True, extra=""):
    """EB Garamond, the bookish serif used for names."""
    return f"font:{'italic ' if ital else ''}{wt} {size}px/1.08 Garamond;{extra}"


def cz(t, size, color, ls=".14em", wt=500, extra=""):
    return f'<div style="font:{wt} {size}px/1.15 Cinzel;letter-spacing:{ls};padding-left:{ls};color:{color};{extra}">{t}</div>'


def svg(W, H, inner, cls="tex", style=""):
    return f'<svg class="{cls}" width="{W}" height="{H}" style="{style}">{inner}</svg>'


# ---------- layouts: windows [x,y,w,h,shape], all landscape ----------
L, P = (1800, 1200), (1200, 1800)
LAYOUTS = {
    "band": build.LAYOUTS["band"],     # landscape, photos on top, words in a band below
    "panel": build.LAYOUTS["panel"],   # landscape, a panel holds the art and words beside the photos
    "card": build.LAYOUTS["card"],     # portrait, photos stacked, words at the foot
    "tag": dict(size=P, n={            # portrait, words on top, rounded windows below
        1: dict(wins=[[110, 660, 980, 735, "o"]], text=[60, 150, 1080, 470], foot=[60, 1430, 1080, 280]),
        2: dict(wins=[[110, 470, 980, 600, "o"], [110, 1110, 980, 600, "o"]], text=[60, 120, 1080, 320]),
        3: dict(wins=[[110, 440, 980, 400, "o"], [110, 880, 980, 400, "o"], [110, 1320, 980, 400, "o"]], text=[60, 110, 1080, 300])}),
}
for lay in LAYOUTS.values():
    for v in lay["n"].values():
        assert all(w > h for _, _, w, h, _ in v["wins"]), "every photo window must be landscape"


# ---------- filters shared by the designs ----------
FILTERS = (
    # chalk: the stroke breaks up into grain, with slightly wobbly edges
    '<filter id="chalk" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>'
    '<feColorMatrix in="n" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3.2 0 0 0 -1.05" result="m"/>'
    '<feComposite in="SourceGraphic" in2="m" operator="in" result="t"/>'
    '<feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="9" result="d"/>'
    '<feDisplacementMap in="t" in2="d" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter>'
    # rubber stamp: uneven ink, a few bare patches
    '<filter id="stamp" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="3" seed="2" result="n"/>'
    '<feColorMatrix in="n" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2.6 0 0 0 -.62" result="m"/>'
    '<feComposite in="SourceGraphic" in2="m" operator="in" result="t"/>'
    '<feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="1" seed="5" result="d"/>'
    '<feDisplacementMap in="t" in2="d" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter>'
    # chenille: a soft, fuzzy pile
    '<filter id="pile" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".5" numOctaves="2" seed="7" result="d"/>'
    '<feDisplacementMap in="SourceGraphic" in2="d" scale="7" xChannelSelector="R" yChannelSelector="G" result="f"/>'
    '<feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="3" result="g"/>'
    '<feColorMatrix in="g" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.4 -.25" result="ga"/>'
    '<feComposite in="f" in2="ga" operator="in" result="s"/><feMerge><feMergeNode in="f"/><feMergeNode in="s"/></feMerge></filter>'
)


def wool(W, H, light=.07, dark=.08, seed=3):
    """Felted wool: a dense fine fibre noise in light and dark."""
    t = lambda c, a, s: (f"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>"
                         f"<filter id='w'><feTurbulence type='fractalNoise' baseFrequency='.9 .6' numOctaves='3' seed='{s}' stitchTiles='stitch'/>"
                         f"<feColorMatrix values='0 0 0 0 {c} 0 0 0 0 {c} 0 0 0 0 {c} 0 0 0 1.6 -.6'/></filter>"
                         f"<rect width='100%' height='100%' filter='url(%23w)'/></svg>")
    return (f'<div class="tex" style="background-image:url(&quot;{t(1, 0, seed)}&quot;);opacity:{light}"></div>'
            f'<div class="tex" style="background-image:url(&quot;{t(0, 0, seed+1)}&quot;);opacity:{dark}"></div>')


# ---------- ornaments, all drawn in code ----------
def guilloche(W, H, inset, bw, color, sw=1.1, lines=6, wl=46):
    """A banknote-style engraved border: interlaced sine waves running round the edge of the print."""
    out = []
    def strip(x0, y0, length, horiz):
        for j in range(lines):
            ph = j * math.pi / lines * 2
            pts = []
            for i in range(int(length / 3) + 1):
                t = i * 3
                o = bw / 2 + (bw / 2 - 2) * math.sin(2 * math.pi * t / wl + ph) * (.55 + .45 * math.cos(2 * math.pi * t / (wl * 3.3) + ph / 2))
                pts.append((x0 + t, y0 + o) if horiz else (x0 + o, y0 + t))
            out.append(f'<polyline points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}" fill="none" stroke="{color}" stroke-width="{sw}"/>')
    i = inset
    strip(i + bw, i, W - 2 * i - 2 * bw, True); strip(i + bw, H - i - bw, W - 2 * i - 2 * bw, True)
    strip(i, i + bw, H - 2 * i - 2 * bw, False); strip(W - i - bw, i + bw, H - 2 * i - 2 * bw, False)
    for cx, cy in ((i + bw / 2, i + bw / 2), (W - i - bw / 2, i + bw / 2), (i + bw / 2, H - i - bw / 2), (W - i - bw / 2, H - i - bw / 2)):
        for r in range(12):
            a = r * 15
            out.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{bw*.48:.1f}" ry="{bw*.16:.1f}" transform="rotate({a} {cx:.1f} {cy:.1f})" fill="none" stroke="{color}" stroke-width="{sw}"/>')
    edges = (f'<rect x="{i-6}" y="{i-6}" width="{W-2*i+12}" height="{H-2*i+12}" fill="none" stroke="{color}" stroke-width="2"/>'
             f'<rect x="{i+bw+6}" y="{i+bw+6}" width="{W-2*i-2*bw-12}" height="{H-2*i-2*bw-12}" fill="none" stroke="{color}" stroke-width="1.2"/>')
    return "".join(out) + edges


def ring_text(cx, cy, r, text, style, color, uid, start=0):
    """Text set round a circle, reading clockwise from the top."""
    d = f"M{cx:.1f} {cy-r:.1f} A{r:.1f} {r:.1f} 0 1 1 {cx-.01:.2f} {cy-r:.1f}"
    return (f'<defs><path id="{uid}" d="{d}"/></defs><text fill="{color}" style="{style}">'
            f'<textPath href="#{uid}" startOffset="{start}%" textLength="{2*math.pi*r*.985:.0f}" lengthAdjust="spacing">{text}</textPath></text>')


def seal(R, uid, school, motto="Veritas · Scientia · Lux"):
    """A gold foil certificate seal: a scalloped rosette with ringed lettering and a star, over two ribbon tails."""
    c = R * 1.6; S = 2 * c
    out = []
    # ribbon tails, notched
    for sg in (-1, 1):
        a = math.radians(90 + sg * 22)
        x0, y0 = c, c + R * .3
        x1, y1 = c + math.cos(a) * R * 1.55 - sg * R * .1, c + math.sin(a) * R * 1.55
        w = R * .34; nx, ny = -math.sin(a), math.cos(a)
        p = [(x0 + nx * w, y0 + ny * w), (x1 + nx * w, y1 + ny * w), (x1 - math.cos(a) * w * .8, y1 - math.sin(a) * w * .8), (x1 - nx * w, y1 - ny * w), (x0 - nx * w, y0 - ny * w)]
        col = C["cardinal"] if sg < 0 else C["cardinal_dk"]
        out.append(f'<polygon points="{" ".join(f"{a_:.1f},{b_:.1f}" for a_, b_ in p)}" fill="{col}"/>')
        out.append(f'<polyline points="{p[0][0]:.1f},{p[0][1]:.1f} {p[1][0]:.1f},{p[1][1]:.1f}" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>')
    # scalloped rosette
    n = 44
    pts = []
    for i in range(n * 8):
        a = 2 * math.pi * i / (n * 8)
        rr = R * (1 - .045 * (1 - math.cos(2 * math.pi * (i % 8) / 8)) / 2 * 2)
        pts.append((c + rr * math.cos(a), c + rr * math.sin(a)))
    out.append(f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}" fill="url(#{uid}g)" '
               f'style="filter:drop-shadow(0 {R*.03:.1f}px {R*.04:.1f}px rgba(60,40,10,.35))"/>')
    # fine radial reeding
    for i in range(120):
        a = 2 * math.pi * i / 120
        out.append(f'<line x1="{c+R*.78*math.cos(a):.1f}" y1="{c+R*.78*math.sin(a):.1f}" x2="{c+R*.9*math.cos(a):.1f}" y2="{c+R*.9*math.sin(a):.1f}" stroke="#6d5420" stroke-width="{R*.008:.2f}" opacity=".55"/>')
    for rr, sw in ((.92, .012), (.76, .012), (.5, .009), (.46, .006)):
        out.append(f'<circle cx="{c}" cy="{c}" r="{R*rr:.1f}" fill="none" stroke="#6d5420" stroke-width="{R*sw:.2f}" opacity=".75"/>')
    out.append(ring_text(c, c, R * .58, f'{school} · {G["cls"]} ·', f"font:600 {R*.105:.1f}px Cinzel;letter-spacing:.06em", "#5a4419", uid))
    # five-point star
    st = " ".join(f"{c + R*(.3 if i%2==0 else .12)*math.cos(math.radians(-90+i*36)):.1f},{c + R*(.3 if i%2==0 else .12)*math.sin(math.radians(-90+i*36)):.1f}" for i in range(10))
    out.append(f'<polygon points="{st}" fill="#6d5420" opacity=".8"/>')
    grad = (f'<defs><linearGradient id="{uid}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3dfa2"/>'
            f'<stop offset=".35" stop-color="#c9a44b"/><stop offset=".55" stop-color="#f0d891"/><stop offset=".8" stop-color="#a8873a"/>'
            f'<stop offset="1" stop-color="#d9bc6c"/></linearGradient></defs>')
    return f'<svg width="{S:.0f}" height="{S:.0f}" style="display:block;overflow:visible">{grad}{"".join(out)}</svg>', c


def emboss_seal(R, uid, school, base):
    """A blind-embossed seal: no ink, only the paper raised, lit from the top left."""
    c = R + 6; S = 2 * c; parts = []
    parts.append(f'<circle cx="{c}" cy="{c}" r="{R}" fill="none" stroke-width="{R*.03:.1f}"/>')
    parts.append(f'<circle cx="{c}" cy="{c}" r="{R*.94:.1f}" fill="none" stroke-width="{R*.008:.1f}"/>')
    for i in range(72):
        a = 2 * math.pi * i / 72
        parts.append(f'<circle cx="{c+R*.89*math.cos(a):.1f}" cy="{c+R*.89*math.sin(a):.1f}" r="{R*.012:.1f}" stroke="none" class="f"/>')
    parts.append(f'<circle cx="{c}" cy="{c}" r="{R*.6:.1f}" fill="none" stroke-width="{R*.012:.1f}"/>')
    # an open book with a flame above it, in line
    bw, bh, by = R * .42, R * .2, c + R * .12
    parts.append(f'<path d="M{c} {by} C{c-bw*.4} {by-bh*.6} {c-bw*.8} {by-bh*.5} {c-bw} {by-bh*.2} L{c-bw} {by+bh} C{c-bw*.8} {by+bh*.7} {c-bw*.4} {by+bh*.75} {c} {by+bh*1.15}Z" fill="none" stroke-width="{R*.014:.1f}"/>')
    parts.append(f'<path d="M{c} {by} C{c+bw*.4} {by-bh*.6} {c+bw*.8} {by-bh*.5} {c+bw} {by-bh*.2} L{c+bw} {by+bh} C{c+bw*.8} {by+bh*.7} {c+bw*.4} {by+bh*.75} {c} {by+bh*1.15}Z" fill="none" stroke-width="{R*.014:.1f}"/>')
    for j in range(1, 4):
        f = j / 4
        parts.append(f'<path d="M{c-bw*.12} {by+bh*(.15+f*.7)} C{c-bw*.45} {by+bh*(f*.7-.3)} {c-bw*.75} {by+bh*(f*.7-.2)} {c-bw*.9} {by+bh*(f*.7+.05)}" fill="none" stroke-width="{R*.006:.1f}"/>')
        parts.append(f'<path d="M{c+bw*.12} {by+bh*(.15+f*.7)} C{c+bw*.45} {by+bh*(f*.7-.3)} {c+bw*.75} {by+bh*(f*.7-.2)} {c+bw*.9} {by+bh*(f*.7+.05)}" fill="none" stroke-width="{R*.006:.1f}"/>')
    fy = by - bh * .9
    parts.append(f'<path d="M{c} {fy-R*.26:.1f} C{c+R*.1:.1f} {fy-R*.14:.1f} {c+R*.09:.1f} {fy-R*.03:.1f} {c} {fy:.1f} C{c-R*.09:.1f} {fy-R*.03:.1f} {c-R*.1:.1f} {fy-R*.14:.1f} {c} {fy-R*.26:.1f}Z" class="f" stroke="none"/>')
    parts.append(f'<text x="{c}" y="{c+R*.47:.1f}" text-anchor="middle" class="f" stroke="none" style="font:600 {R*.075:.1f}px Cinzel;letter-spacing:.2em">MMXXVII</text>')
    body = "".join(parts)
    ring = lambda col, uidx: ring_text(c, c, R * .7, f'{school.upper()} · SIGILLUM ·', f"font:600 {R*.115:.1f}px Cinzel;letter-spacing:.08em", col, uid + uidx)
    lay = lambda col, dx, dy, op, ux: (f'<g transform="translate({dx} {dy})" stroke="{col}" fill="{col}" opacity="{op}"><style>.f{{fill:{col}}}</style>'
                                         f'{body}{ring(col, ux)}</g>')
    # shadow (bottom right), highlight (top left), then the raised paper itself
    return (f'<svg width="{S}" height="{S}" style="display:block;overflow:visible">'
            f'<g fill="none">{lay("#5c4a2c", 2.2, 2.6, .38, "s")}{lay("#ffffff", -1.8, -2, .9, "h")}{lay(base, 0, 0, 1, "b")}</g></svg>')


def tassel(W, H, x, top, cord, head, skirt, colors=("#8a6a1e", "#c99a2e", "#e2b33c", "#f3d27a"), seed=5, charm=True):
    """A graduation tassel hung from a cord: a domed, bound head and a skirt of fine threads, with a year charm."""
    rnd = random.Random(seed); out = []
    hw = head * .62
    hy = top + cord
    out.append(f'<line x1="{x}" y1="{top}" x2="{x}" y2="{hy+6}" stroke="{colors[1]}" stroke-width="{head*.09:.1f}" stroke-linecap="round"/>')
    out.append(f'<line x1="{x-head*.02:.1f}" y1="{top}" x2="{x-head*.02:.1f}" y2="{hy+6}" stroke="{colors[3]}" stroke-width="{head*.025:.1f}" opacity=".7"/>')
    # skirt
    sy = hy + head * .95
    for i in range(170):
        f = rnd.random()
        x0 = x + (f - .5) * hw * 1.3
        x1 = x + (f - .5) * hw * 2.05 + rnd.uniform(-6, 6)
        y1 = sy + skirt * rnd.uniform(.9, 1.0)
        col = colors[min(3, int(rnd.random() ** .8 * 4))]
        out.append(f'<path d="M{x0:.1f} {sy:.1f} Q{(x0+x1)/2 + rnd.uniform(-4,4):.1f} {sy+skirt*.5:.1f} {x1:.1f} {y1:.1f}" fill="none" stroke="{col}" stroke-width="{rnd.uniform(1.6,3.2):.1f}" stroke-linecap="round" opacity="{rnd.uniform(.75,1):.2f}"/>')
    # head: a dome with a binding below
    out.append(f'<path d="M{x-hw*.5:.1f} {hy+head*.62:.1f} C{x-hw*.55:.1f} {hy+head*.1:.1f} {x-hw*.25:.1f} {hy:.1f} {x} {hy} C{x+hw*.25:.1f} {hy:.1f} {x+hw*.55:.1f} {hy+head*.1:.1f} {x+hw*.5:.1f} {hy+head*.62:.1f}Z" fill="url(#tg{seed})"/>')
    for j in range(7):
        a = j / 6
        out.append(f'<path d="M{x-hw*.12*(1-a)*2:.1f} {hy+head*.06:.1f} Q{x-hw*.5+a*hw:.1f} {hy+head*.3:.1f} {x-hw*.47+a*hw*.94:.1f} {hy+head*.6:.1f}" fill="none" stroke="{colors[0]}" stroke-width="1.6" opacity=".45"/>')
    out.append(f'<rect x="{x-hw*.55:.1f}" y="{hy+head*.6:.1f}" width="{hw*1.1:.1f}" height="{head*.36:.1f}" rx="{head*.05:.1f}" fill="url(#tb{seed})"/>')
    for j in range(5):
        yy = hy + head * (.64 + j * .07)
        out.append(f'<line x1="{x-hw*.55:.1f}" y1="{yy:.1f}" x2="{x+hw*.55:.1f}" y2="{yy:.1f}" stroke="{colors[0]}" stroke-width="1.4" opacity=".55"/>')
    if charm:
        cx, cy, cw, ch = x + head * .18, hy - cord * .32, head * 1.0, head * .44
        out.append(f'<path d="M{x} {cy-ch*.5:.1f} Q{x+head*.08:.1f} {cy-ch*.9:.1f} {cx+cw*.2:.1f} {cy-ch*.52:.1f}" fill="none" stroke="{colors[1]}" stroke-width="3"/>')
        out.append(f'<g transform="rotate(-6 {cx:.1f} {cy:.1f})"><rect x="{cx:.1f}" y="{cy-ch*.5:.1f}" width="{cw:.1f}" height="{ch:.1f}" rx="{ch*.16:.1f}" fill="url(#tb{seed})" '
                   f'style="filter:drop-shadow(0 3px 3px rgba(0,0,0,.3))"/>'
                   f'<rect x="{cx+4:.1f}" y="{cy-ch*.5+4:.1f}" width="{cw-8:.1f}" height="{ch-8:.1f}" rx="{ch*.12:.1f}" fill="none" stroke="#7a5d1a" stroke-width="1.2" opacity=".7"/>'
                   f'<text x="{cx+cw/2:.1f}" y="{cy+ch*.2:.1f}" text-anchor="middle" fill="#5e4612" style="font:700 {ch*.56:.0f}px Cinzel;letter-spacing:.04em">{G["year"]}</text></g>')
    defs = (f'<defs><linearGradient id="tg{seed}" x1="0" x2="1"><stop offset="0" stop-color="{colors[0]}"/><stop offset=".35" stop-color="{colors[3]}"/>'
            f'<stop offset=".7" stop-color="{colors[1]}"/><stop offset="1" stop-color="{colors[0]}"/></linearGradient>'
            f'<linearGradient id="tb{seed}" x1="0" x2="1"><stop offset="0" stop-color="#9c7a2a"/><stop offset=".3" stop-color="#f1d991"/>'
            f'<stop offset=".55" stop-color="#c79f45"/><stop offset=".8" stop-color="#f6e2a4"/><stop offset="1" stop-color="#9c7a2a"/></linearGradient></defs>')
    return svg(W, H, defs + "".join(out), "fr", f"left:0;top:0;filter:drop-shadow(0 6px 8px rgba(0,0,0,.28))")


def pennant(w, h, color, strip, text, sub, ink, uid):
    """A felt pennant: a long triangle with a stitched edge, a sewn strip at the hoist and felt letters."""
    sw = h * .2
    tri = f"M{sw} 0 L{w} {h/2} L{sw} {h}Z"
    ins = 10
    stitch = f"M{sw+ins} {ins*1.6} L{w-ins*3.2} {h/2} L{sw+ins} {h-ins*1.6}"
    return (f'<svg width="{w+40}" height="{h+20}" style="display:block;overflow:visible;filter:drop-shadow(0 8px 10px rgba(0,0,0,.35))">'
            f'<defs><clipPath id="{uid}"><path d="{tri}"/></clipPath></defs>'
            f'<path d="{tri}" fill="{color}"/>'
            f'<rect x="0" y="0" width="{sw}" height="{h}" fill="{strip}"/>'
            f'<line x1="{sw*.25}" y1="4" x2="{sw*.25}" y2="{h-4}" stroke="{ink}" stroke-width="2" stroke-dasharray="7 6" opacity=".55"/>'
            f'<line x1="{sw*.85}" y1="4" x2="{sw*.85}" y2="{h-4}" stroke="{ink}" stroke-width="2" stroke-dasharray="7 6" opacity=".55"/>'
            f'<path d="{stitch}" fill="none" stroke="{ink}" stroke-width="2.4" stroke-dasharray="9 7" opacity=".6"/>'
            f'<text x="{sw + (w-sw)*.37:.0f}" y="{h*.53:.0f}" text-anchor="middle" fill="{ink}" style="font:400 {h*.34:.0f}px Varsity;letter-spacing:.06em;filter:drop-shadow(1px 2px 0 rgba(0,0,0,.25))">{text}</text>'
            f'<text x="{sw + (w-sw)*.33:.0f}" y="{h*.71:.0f}" text-anchor="middle" fill="{ink}" style="font:400 {h*.095:.0f}px Varsity;letter-spacing:.24em">{sub}</text>'
            f'<circle cx="{sw*.55}" cy="{h*.12}" r="{h*.05:.1f}" fill="#c9a44b" stroke="#7a5d1a" stroke-width="1.5"/>'
            f'<circle cx="{sw*.55}" cy="{h*.88}" r="{h*.05:.1f}" fill="#c9a44b" stroke="#7a5d1a" stroke-width="1.5"/></svg>')


def chenille(letter, size, felt, outline, pile):
    """A varsity chenille letter: fuzzy pile on a felt backing with a gold felt edge and a chain stitch."""
    w = size * 1.0; h = size * 1.1
    t = lambda extra: f'<text x="{w/2}" y="{h*.82:.0f}" text-anchor="middle" style="font:400 {size}px Varsity" {extra}>{letter}</text>'
    return (f'<svg width="{w:.0f}" height="{h:.0f}" style="display:block;overflow:visible;filter:drop-shadow(0 6px 8px rgba(0,0,0,.35))">'
            + t(f'fill="{outline}" stroke="{outline}" stroke-width="{size*.2:.0f}" stroke-linejoin="round"')
            + t(f'fill="{felt}" stroke="{felt}" stroke-width="{size*.1:.0f}" stroke-linejoin="round"')
            + t(f'fill="none" stroke="{outline}" stroke-width="2.4" stroke-dasharray="6 5" stroke-linejoin="round" transform="translate(0 0)" opacity=".0"')
            + t(f'fill="{pile}" filter="url(#pile)"')
            + t(f'fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2.2" stroke-dasharray="5 4"')
            + '</svg>')


def marble(W, H, seed=11):
    """Composition-book marble: black ground broken by white flecks and veins."""
    return (f'<svg class="tex" width="{W}" height="{H}"><filter id="mb" x="0" y="0" width="100%" height="100%">'
            f'<feTurbulence type="fractalNoise" baseFrequency=".011 .016" numOctaves="5" seed="{seed}"/>'
            f'<feColorMatrix type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1"/>'
            f'<feComponentTransfer><feFuncR type="discrete" tableValues="0 0 0 .9 0 0 .85 0 0 .9 0 0 0 .8 0 0"/>'
            f'<feFuncG type="discrete" tableValues="0 0 0 .9 0 0 .85 0 0 .9 0 0 0 .8 0 0"/>'
            f'<feFuncB type="discrete" tableValues="0 0 0 .9 0 0 .85 0 0 .9 0 0 0 .8 0 0"/></feComponentTransfer></filter>'
            f'<rect width="{W}" height="{H}" filter="url(#mb)"/></svg>')


# ---------- the 10 designs ----------
def diploma(n, mode):  # college, grad school
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    s = k(n, 1, 1.22, .95)
    txt = (caps("Congratulations", 20 * s, C["brass"], ".5em", 600) +
           f'<div style="font:{118*s}px/1.05 Fraktur;color:{C["ink"]};margin:{12*s}px 0 {12*s}px">{G["name"]}</div>' +
           f'<div style="{gar(34*s, 500)};color:{C["ink"]}">{G["uni"]} &middot; {G["cls"]}</div>')
    R = k(n, 96, 128, 104)
    sx, sy = k(n, 1560, 1530, 1560), k(n, 1000, 870, 950)
    sl, c = seal(R, f"ds{n}", G["uni"].upper())
    stamp = f'<div class="fr" style="left:{sx-c:.0f}px;top:{sy-c:.0f}px;transform:rotate(-8deg)">{sl}</div>'
    border = svg(W, H, guilloche(W, H, 30, 26, C["brass"]), style="opacity:.75")
    return dict(bg=f"radial-gradient(120% 100% at 50% 40%,#f7f1e4,{C['parchment']} 60%,#e6d8bb)",
                body=paper(.14, .12) + border + windows(lay["wins"], mode, [(12, f'border:1.5px solid {C["brass"]}')]) + box(lay["text"], txt) + stamp)


NOTES = ["E = mc²", "a² + b² = c²", "∫ x dx = x²/2", "H₂O", "π ≈ 3.14159", "1776", "To be, or not to be", "photosynthesis",
         "F = ma", "y = mx + b", "Avogadro 6.022 × 10²³", "√2", "mitochondria", "Σ", "c'est la vie", "x = (−b ± √(b²−4ac)) / 2a",
         "carpe diem", "NaCl", "sin²θ + cos²θ = 1", "DNA", "Δ", "Q.E.D.", "1492", "∞", "λ = h/p"]


def chalk_notes(n, mode):  # high school
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    s = k(n, 1, 1.2, .95)
    chalk = "filter:url(#chalk)"
    txt = (caps(G["hs"], 22 * s, C["chalk"], ".42em", 600, "Montserrat", f"opacity:.85;{chalk}") +
           f'<div style="font:600 {150*s}px/1 Caveat;color:{C["chalk"]};margin:{4*s}px 0 {0}px;{chalk}">{G["name"]}</div>' +
           f'<svg width="{560*s:.0f}" height="{30*s:.0f}" style="{chalk};margin:{-6*s}px 0 {10*s}px"><path d="M8 {20*s:.0f} C{150*s:.0f} {6*s:.0f} {380*s:.0f} {4*s:.0f} {552*s:.0f} {14*s:.0f}" stroke="{C["tassel"]}" stroke-width="{7*s:.1f}" fill="none" stroke-linecap="round"/></svg>' +
           caps(f'{G["cls"]}', 26 * s, C["tassel"], ".46em", 600, "Montserrat", chalk))
    frame = 34
    avoid = [grow(w, 26) for w in lay["wins"]] + [text_core(lay["text"], 1000 * s, 300 * s), [0, 0, W, frame + 20], [0, H - frame - 30, W, 60], [0, 0, frame + 30, H], [W - frame - 30, 0, 60, H]]
    rnd = random.Random(7 + n); notes = []; boxes = []
    for i in range(400):
        t = NOTES[len(notes) % len(NOTES)]
        fs = rnd.uniform(30, 46); w = len(t) * fs * .48; h = fs * 1.1
        x, y = rnd.uniform(frame, W - frame - w), rnd.uniform(frame, H - frame - h)
        b = [x, y, w, h]
        if any(not (x + w < a[0] or a[0] + a[2] < x or y + h < a[1] or a[1] + a[3] < y) for a in avoid + boxes): continue
        boxes.append(grow(b, 18))
        notes.append(f'<div class="fr" style="left:{x:.0f}px;top:{y:.0f}px;font:500 {fs:.0f}px/1 Caveat;color:{C["chalk"]};white-space:nowrap;'
                     f'transform:rotate({rnd.uniform(-5,5):.1f}deg);opacity:{rnd.uniform(.16,.26):.2f};{chalk}">{t}</div>')
        if len(notes) >= k(n, 16, 14, 12): break
    smudge = (f'<div class="tex" style="background:radial-gradient(40% 30% at 22% 30%,rgba(255,255,255,.06),transparent 70%),'
              f'radial-gradient(35% 25% at 78% 70%,rgba(255,255,255,.05),transparent 70%),radial-gradient(50% 20% at 50% 90%,rgba(255,255,255,.05),transparent 70%)"></div>')
    wood = (f'<div class="fr" style="inset:0;border:{frame}px solid {C["oak"]};box-shadow:inset 0 0 0 2px rgba(0,0,0,.35),inset 0 6px 14px rgba(0,0,0,.45)"></div>'
            f'<div class="fr" style="inset:0;border:{frame}px solid transparent;border-image:repeating-linear-gradient(90deg,rgba(0,0,0,.18) 0 3px,transparent 3px 11px,rgba(255,255,255,.06) 11px 13px,transparent 13px 23px) {frame}"></div>')
    return dict(bg=f"radial-gradient(110% 90% at 50% 40%,#30403b,{C['slate']} 60%,#1b2421)",
                body=paper(.10, .14) + smudge + "".join(notes) + wood +
                windows(lay["wins"], mode, [(12, f'border:3px solid {C["chalk"]};opacity:.55;{chalk}')]) + box(lay["text"], txt))


def felt_pennant(n, mode):  # high school, college
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    tx, ty, tw, th = lay["text"]
    pw = k(n, 700, 860, 740); ph = round(pw * .3)
    pen = pennant(pw, ph, C["tassel"], "#c99a2e", "HARBOR", G["cls"].upper(), C["blue_dk"], f"pn{n}")
    nm = (f'<div style="text-align:left">' + caps("Congratulations", k(n, 18, 22, 18), C["tassel"], ".44em", 600) +
          f'<div style="{gar(k(n,92,112,88), 500)};color:{C["cream"]};margin:{k(n,8,10,6)}px 0 {k(n,10,12,8)}px">{G["name"]}</div>' +
          caps(G["date"], k(n, 18, 22, 18), C["cream"], ".42em", 500, "Montserrat", "opacity:.8") + '</div>')
    txt = f'<div style="display:flex;align-items:center;gap:{k(n,80,90,80)}px">{nm}<div style="transform:rotate(-4deg)">{pen}</div></div>'
    return dict(bg=f"radial-gradient(120% 100% at 50% 35%,#2b4880,{C['blue']} 55%,{C['blue_dk']})",
                body=wool(W, H, .06, .10) + paper(.06, .08) +
                windows(lay["wins"], mode, mat=(14, f"background:{C['cream']};box-shadow:0 6px 16px rgba(0,0,0,.35)")) + box(lay["text"], txt))


def gold_tassel(n, mode):  # high school, college
    lay = LAYOUTS["panel"]["n"][n]; W, H = L
    px, py, pw, ph = lay["panel"]
    if n < 3:
        x = px + pw / 2; top = py
        cord, head, skirt = k(n, 170, 160, 0), k(n, 96, 120, 0), k(n, 300, 340, 0)
        tl = tassel(W, H, x, top, cord, head, skirt, seed=5)
        ty0 = top + cord + head + skirt + k(n, 60, 50, 0)
        words_box = [px, ty0, pw, py + ph - ty0 - k(n, 70, 60, 0)]
        sc = k(n, 1, 1.25, 1)
    else:
        x = px + 190; top = py
        tl = tassel(W, H, x, top, 100, 84, 250, seed=5)
        words_box = [px + 330, py, pw - 350, ph]
        sc = .85
    words = (caps("Congratulations", 18 * sc, C["tassel"], ".44em", 600) +
             f'<div style="{gar(78*sc, 500)};color:{C["cream"]};margin:{12*sc}px 0 {12*sc}px">{G["name"]}</div>' +
             cz(G["cls"], 30 * sc, C["tassel"], ".2em", 600) +
             caps(G["date"], 16 * sc, C["cream"], ".42em", 500, "Montserrat", f"margin-top:{16*sc}px;opacity:.75"))
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:radial-gradient(90% 70% at 50% 35%,#2f5a3d,{C["ivy"]} 60%,{C["ivy_dk"]})">'
             f'{wool(pw, ph, .05, .08)}{paper(.08, .08)}</div>')
    return dict(bg=C["parchment"], body=paper(.12, .06) + panel + tl +
                windows(lay["wins"], mode, [(12, f'border:2px solid {C["brass"]}')]) + box(words_box, words))


def grad_stack(n, mode):  # high school, college; typographic
    lay = LAYOUTS["panel"]["n"][n]
    px, py, pw, ph = lay["panel"]
    fs = k(n, 84, 128, 76)
    rows = k(n, 5, 4, 3)
    hi = k(n, 2, 2, 1)
    words = "".join(
        f'<div style="font:400 {fs}px/1 Varsity;letter-spacing:.02em;' +
        (f"color:{C['tassel']}" if i == hi else f"color:transparent;-webkit-text-stroke:2px {C['tassel']};opacity:{.75 - abs(i-hi)*.18:.2f}") + '">GRADUATE</div>'
        for i in range(rows))
    sc = k(n, .9, 1.1, .8)
    txt = (f'<div style="display:flex;flex-direction:column;align-items:center;gap:{fs*.08:.0f}px">{words}</div>' +
           f'<div style="{gar(84*sc, 500)};color:{C["white"]};margin-top:{30*sc}px">{G["name"]}</div>' +
           caps(f'{G["cls"]}', 20 * sc, C["tassel"], ".46em", 600, "Montserrat", f"margin-top:{12*sc}px"))
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:radial-gradient(90% 70% at 50% 40%,#2b4880,{C["blue_dk"]})">{paper(.08, .08)}</div>'
    return dict(bg=C["blue_dk"], body=paper(.08, .06) + panel + windows(lay["wins"], mode, [(12, f'border:2px solid {C["tassel"]}')]) + box([px, py, pw, ph], txt))


def embossed_seal(n, mode):  # grad school, formal
    lay = LAYOUTS["panel"]["n"][n]
    px, py, pw, ph = lay["panel"]
    base = C["stock"]
    R = k(n, 170, 220, 170)
    sl = emboss_seal(R, f"es{n}", G["uni"], base)
    sc = k(n, 1, 1.2, .9)
    words = (f'<div style="{gar(76*sc, 500)};color:{C["blue_dk"]}">{G["name"]}</div>' +
             f'<div style="{gar(34*sc, 400, False)};color:{C["ink"]};margin-top:{14*sc}px;letter-spacing:.02em">{G["degree"]}</div>' +
             f'<i class="hl" style="width:{80*sc}px;background:{C["brass"]};margin:{22*sc}px 0"></i>' +
             cz(G["uni"], 22 * sc, C["blue_dk"], ".22em", 600) +
             caps(G["date"], 15 * sc, C["ink"], ".42em", 500, "Montserrat", f"margin-top:{12*sc}px;opacity:.7"))
    if n < 3:
        wh = k(n, 330, 400, 0); gap = k(n, 50, 60, 0)
        sy = py + (ph - (2 * R + 12 + gap + wh)) / 2; sx = px + pw / 2 - (R + 6)
        wb = [px, sy + 2 * R + 12 + gap, pw, wh]
    else:
        sx, sy = px + 30, py + ph / 2 - (R + 6)
        wb = [px + 2 * R + 50, py, pw - 2 * R - 70, ph]
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{base};box-shadow:0 8px 24px rgba(0,0,0,.35)">'
             f'{paper(.10, .06, .25)}</div>')
    return dict(bg=f"radial-gradient(120% 100% at 60% 40%,#2b4880,{C['blue']} 55%,{C['blue_dk']})",
                body=paper(.08, .08) + panel + f'<div class="fr" style="left:{sx:.0f}px;top:{sy:.0f}px">{sl}</div>' +
                windows(lay["wins"], mode, [(10, f'border:1.5px solid {C["cream"]};opacity:.7')]) + box(wb, words))


def varsity_letter(n, mode):  # high school
    lay = LAYOUTS["card"]["n"][n]; W, H = P
    trim = 64
    rib = (f'<div class="fr" style="left:0;right:0;bottom:0;height:{trim}px;background:linear-gradient(180deg,{C["cardinal_dk"]} 0 12px,{C["cream"]} 12px 26px,'
           f'{C["cardinal_dk"]} 26px 36px,{C["tassel"]} 36px 50px,{C["cardinal_dk"]} 50px)"></div>'
           f'<div class="fr" style="left:0;right:0;bottom:0;height:{trim}px;background:repeating-linear-gradient(90deg,rgba(0,0,0,.22) 0 3px,transparent 3px 9px,rgba(255,255,255,.08) 9px 11px,transparent 11px 14px)"></div>')
    if n == 1:
        let = chenille(G["ini"], 360, C["cream"], C["tassel"], C["cardinal_dk"])
        txt = (f'<div>{let}</div>' +
               f'<div style="font:400 74px/1 Varsity;color:{C["cream"]};letter-spacing:.04em;margin-top:26px">{G["name"].upper()}</div>' +
               caps(f'{G["hs"]} · {G["cls"]}', 20, C["tassel"], ".36em", 600, "Montserrat", "margin-top:22px"))
        tb = [0, 860, W, 1800 - 860 - trim - 20]
    else:
        let = chenille(G["ini"], 230, C["cream"], C["tassel"], C["cardinal_dk"])
        txt = (f'<div style="display:flex;align-items:center;gap:46px"><div style="margin-top:-18px">{let}</div><div style="text-align:left">'
               f'<div style="font:400 64px/1 Varsity;color:{C["cream"]};letter-spacing:.04em">{G["name"].upper()}</div>' +
               caps(G["hs"], 18, C["tassel"], ".36em", 600, "Montserrat", "margin-top:18px;padding-left:0") +
               caps(G["cls"], 18, C["cream"], ".36em", 600, "Montserrat", "margin-top:10px;padding-left:0;opacity:.8") + '</div></div>')
        tb = [0, lay["text"][1] - 10, W, H - trim - lay["text"][1]]
    return dict(bg=f"radial-gradient(120% 90% at 50% 30%,#b0243b,{C['cardinal']} 55%,{C['cardinal_dk']})",
                body=wool(W, H, .09, .14) + paper(.06, .10) + rib +
                windows(lay["wins"], mode, mat=(12, f"background:{C['cream']};box-shadow:0 5px 14px rgba(40,0,10,.35)")) + box(tb, txt))


def composition_book(n, mode):  # high school
    lay = LAYOUTS["card"]["n"][n]; W, H = P
    spine = 70
    sp = (f'<div class="fr" style="left:0;top:0;bottom:0;width:{spine}px;background:linear-gradient(90deg,#0b0b0b,#1e1e1e 60%,#0e0e0e);box-shadow:3px 0 8px rgba(0,0,0,.5)">'
          f'{wool(spine, H, .05, .0)}</div>'
          f'<div class="fr" style="left:{spine-10}px;top:0;bottom:0;width:2px;background:rgba(255,255,255,.12)"></div>')
    hand = lambda t, fs: f'<span style="font:500 {fs}px/1 Caveat;color:#1f3a8a">{t}</span>'
    def field(lbl, val, fs, lw):
        return (f'<div style="display:flex;align-items:flex-end;gap:16px;width:{lw}px;margin-top:{fs*.22:.0f}px">'
                f'<span style="font:600 {fs*.34:.0f}px Montserrat;letter-spacing:.2em;color:{C["ink"]}">{lbl}</span>'
                f'<span style="flex:1;border-bottom:2px solid {C["ink"]};text-align:left;padding:0 0 2px 10px">{hand(val, fs)}</span></div>')
    if n == 1:
        lw = 700
        inner = (f'<div style="font:600 64px/1 Garamond;letter-spacing:.22em;padding-left:.22em;color:{C["ink"]};margin-bottom:22px">COMPOSITION</div>'
                 + field("NAME", G["name"], 72, lw) + field("SCHOOL", "Northfield High", 60, lw) + field("CLASS", G["year"], 60, lw))
        lb = (760, 470)
    else:
        lw = 820
        inner = (f'<div style="font:600 40px/1 Garamond;letter-spacing:.22em;padding-left:.22em;color:{C["ink"]};margin-bottom:6px">COMPOSITION</div>'
                 + field("NAME", G["name"], 56, lw) + field("CLASS", f'{G["year"]} · Northfield High', 46, lw))
        lb = (880, 270)
    label = (f'<div style="width:{lb[0]}px;height:{lb[1]}px;background:#fbfaf6;border:4px solid {C["ink"]};outline:2px solid #fbfaf6;'
             f'box-shadow:0 0 0 8px {C["ink"]},0 10px 20px rgba(0,0,0,.4);display:flex;flex-direction:column;align-items:center;justify-content:center;'
             f'position:relative">{inner}</div>')
    tx, ty, tw, th = lay["text"]
    tb = [spine, ty, W - spine, th] if n > 1 else [spine, ty, W - spine, th - 20]
    return dict(bg="#111", body=marble(W, H, 11 + n) + paper(.10, .06) + sp +
                windows(lay["wins"], mode, mat=(12, "background:#fbfaf6;box-shadow:0 6px 16px rgba(0,0,0,.5)")) + box(tb, label))


def library_card(n, mode):  # college, grad school
    lay = LAYOUTS["tag"]["n"][n]; W, H = P
    lines = "".join(f'<line x1="0" x2="{W}" y1="{y}" y2="{y}" stroke="{C["rule_blue"]}" stroke-width="2" opacity=".55"/>' for y in range(k(n, 300, 260, 250), H, 62))
    margin = f'<line x1="150" x2="150" y1="0" y2="{H}" stroke="{C["rule_red"]}" stroke-width="2" opacity=".55"/><line x1="158" x2="158" y1="0" y2="{H}" stroke="{C["rule_red"]}" stroke-width="2" opacity=".55"/>'
    hole = f'<circle cx="{W/2}" cy="58" r="22" fill="#2a2a2a"/><circle cx="{W/2}" cy="58" r="22" fill="none" stroke="#a89060" stroke-width="2" opacity=".5"/>'
    cour = lambda t, fs, wt=400, col=C["ink"], extra="": f'<div style="font:{wt} {fs}px/1.2 Courier;color:{col};{extra}">{t}</div>'
    stampbox = lambda t, fs, rot: (f'<div style="display:inline-block;transform:rotate({rot}deg);filter:url(#stamp);border:{fs*.08:.0f}px double {C["stamp"]};'
                                   f'padding:{fs*.12:.0f}px {fs*.4:.0f}px {fs*.06:.0f}px;border-radius:{fs*.08:.0f}px;font:700 {fs}px/1.1 Courier;color:{C["stamp"]};letter-spacing:.06em;opacity:.92">{t}</div>')
    head = (cour(f'{G["uni"].upper()} LIBRARY', k(n, 34, 28, 26), 700, C["ink"], "letter-spacing:.14em") +
            f'<div style="width:{k(n,860,860,860)}px;display:flex;justify-content:space-between;margin-top:{k(n,22,12,10)}px">'
            + cour(f'BORROWER: <b>{G["name"]}</b>', k(n, 30, 26, 24)) + cour('CALL NO. 2027.G7', k(n, 30, 26, 24)) + '</div>')
    if n == 1:
        text = (box(lay["text"], head + f'<div style="margin-top:46px">{stampbox(G["cls"].upper(), 92, -4)}</div>') +
                box(lay["foot"], cour("DATE DUE", 24, 700, C["ink"], "letter-spacing:.3em") +
                    f'<div style="margin-top:20px">{stampbox("JUN 12 2027", 46, 3)}</div>' + cour("renewed for life", 22, 400, C["ink"], "margin-top:16px;opacity:.6;font-style:italic")))
    else:
        text = box(lay["text"], head + f'<div style="display:flex;gap:40px;align-items:center;margin-top:{k(n,0,30,24)}px">{stampbox(G["cls"].upper(), k(n,0,60,56), -4)}{stampbox("JUN 12 2027", k(n,0,34,32), 4)}</div>')
    card = f'<div class="fr" style="inset:0;background:{C["manila"]}">{paper(.14, .10)}</div>'
    return dict(bg=C["manila"], body=card + svg(W, H, lines + margin + hole) +
                windows(lay["wins"], mode, [(10, f'border:2px solid {C["ink"]};opacity:.7')]) + text)


def commencement(n, mode):  # grad school, college; formal
    lay = LAYOUTS["tag"]["n"][n]; W, H = P
    gold = foil(GOLD)
    fr = (f'<div class="fr" style="inset:44px;border:2px solid {C["brass"]};opacity:.9"></div>'
          f'<div class="fr" style="inset:56px;border:1px solid {C["brass"]};opacity:.6"></div>')
    corners = "".join(f'<path d="M{x} {y-16} L{x+16} {y} L{x} {y+16} L{x-16} {y}Z" fill="url(#g)"/>' for x, y in ((44, 44), (W - 44, 44), (44, H - 44), (W - 44, H - 44)))
    head = (cz(G["uni"], k(n, 26, 22, 21), C["cream"], ".3em", 600, "opacity:.85") +
            f'<div style="font:600 {k(n,90,74,70)}px/1.1 Cinzel;letter-spacing:.08em;padding-left:.08em;{gold};margin:{k(n,22,8,6)}px 0 {k(n,10,4,4)}px">COMMENCEMENT</div>' +
            f'<div style="{gar(k(n,64,48,46), 500)};color:{C["cream"]}">{G["name"]}, <span style="font-style:normal;font-size:.8em">M.S.</span></div>')
    date = caps(G["date"], k(n, 20, 17, 16), C["tassel"], ".46em", 600, "Montserrat", f"margin-top:{k(n,0,16,12)}px")
    if n == 1:
        text = box(lay["text"], head) + box(lay["foot"], f'<div style="{gar(46, 400)};color:{C["cream"]};opacity:.9">{G["degree"]}</div>' + date.replace("margin-top:0px", "margin-top:20px").replace("font:600 20px","font:600 22px"))
    else:
        text = box(lay["text"], head + date)
    return dict(bg=f"radial-gradient(120% 90% at 50% 30%,#305a3e,{C['ivy']} 55%,{C['ivy_dk']})",
                body=wool(W, H, .04, .07) + paper(.08, .10) + fr + svg(W, H, gold_defs() + corners) +
                windows(lay["wins"], mode, [(10, f'border:2px solid {C["brass"]}')]) + text)


DESIGNS = [  # id, name, base layout, builder
    ("diploma", "Diploma", "band", diploma),
    ("chalk-notes", "Chalk Notes", "band", chalk_notes),
    ("felt-pennant", "Felt Pennant", "band", felt_pennant),
    ("gold-tassel", "Gold Tassel", "panel", gold_tassel),
    ("graduate-stack", "Graduate Stack", "panel", grad_stack),
    ("embossed-seal", "Embossed Seal", "panel", embossed_seal),
    ("varsity-letter", "Varsity Letter", "card", varsity_letter),
    ("composition-book", "Composition Book", "card", composition_book),
    ("library-card", "Library Card", "tag", library_card),
    ("commencement", "Commencement", "tag", commencement),
]


def page(d, n, mode):
    did, name, base, fn = d
    W, H = LAYOUTS[base]["size"]
    r = fn(n, mode)
    return (f'<!doctype html><meta charset="utf-8"><style>{FONT_CSS}{build.BASE_CSS}body{{width:{W}px;height:{H}px;background:{r["bg"]}}}</style>'
            f'<svg width="0" height="0" style="position:absolute">{gold_defs()}<defs>{FILTERS}</defs></svg><body>{r["body"]}</body>')


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    only = [a for a in os.sys.argv[1:]]
    for d in DESIGNS:
        did, name, base, _ = d
        W, H = LAYOUTS[base]["size"]
        for n in (1, 2, 3):
            for mode in ("preview", "overlay", "blank"):
                if only and did not in only: continue
                with open(os.path.join(OUT, f"{did}-{n}-{mode}.html"), "w") as f:
                    f.write(page(d, n, mode))
            manifest.append(dict(id=did, name=name, base=base, n=n, size=[W, H], category="graduation",
                                 wins=[w[:4] for w in LAYOUTS[base]["n"][n]["wins"]],
                                 shapes=[w[4] for w in LAYOUTS[base]["n"][n]["wins"]]))
    with open(os.path.join(HERE, "out-graduation", "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(len(manifest), "design versions")


if __name__ == "__main__":
    main()
