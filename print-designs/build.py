#!/usr/bin/env python3
"""Wedding print designs: writes one HTML page per design and photo count into out/html/.
render.js turns them into PNGs. Every design is 4x6 at 300 dpi (1800x1200 or 1200x1800)."""
import json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "html")
FONTS = "file://" + os.path.join(HERE, "fonts")
PHOTOS = "file://" + os.path.join(HERE, "sample-photos")

# Sample text. The real print uses the couple's own names and date.
T = dict(a="Olivia", b="James", ini=("O", "J"), date_dots="06 · 14 · 2027", date_long="June 14, 2027",
         date_short="06.14.27", place="Boston, Massachusetts")

# ---------- style guide ----------
C = dict(ivory="#F6F1E7", linen="#EDE4D3", champagne="#E7D9C1", ink="#2A2522", taupe="#7A6E62",
         gold="#A8843F", gold_lt="#D8BF86", navy="#172038", sage="#7D8C76", sage_dk="#55634F",
         blush="#EBD7CE", wine="#5E2B30", black="#111111", emerald="#1E3A31", white="#FFFFFF")
GOLD_CSS = "linear-gradient(100deg,#8a6a2f 0%,#d9c08a 28%,#a8843f 48%,#ecdcaa 66%,#9a7738 100%)"

FONT_CSS = "".join(
    f"@font-face{{font-family:'{n}';src:url('{FONTS}/{f}');font-style:{s};font-weight:100 900}}"
    for n, f, s in [("Cormorant", "Cormorant.ttf", "normal"), ("Cormorant", "Cormorant-Italic.ttf", "italic"),
                    ("Pinyon", "PinyonScript-Regular.ttf", "normal"), ("Italiana", "Italiana-Regular.ttf", "normal"),
                    ("Montserrat", "Montserrat.ttf", "normal"), ("Bodoni", "Bodoni.ttf", "normal"),
                    ("Bodoni", "Bodoni-Italic.ttf", "italic")])

NOISE = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>"
         "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/>"
         "<feColorMatrix values='0 0 0 0 .35 0 0 0 0 .3 0 0 0 0 .25 0 0 0 .55 0'/></filter>"
         "<rect width='100%' height='100%' filter='url(%23n)'/></svg>")
MOTTLE = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1800' height='1800'>"
          "<filter id='m'><feTurbulence type='fractalNoise' baseFrequency='.004' numOctaves='4' seed='7'/>"
          "<feColorMatrix values='0 0 0 0 .3 0 0 0 0 .25 0 0 0 0 .2 0 0 0 .9 -.35'/></filter>"
          "<rect width='100%' height='100%' filter='url(%23m)'/></svg>")
LINEN = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>"
         "<filter id='l'><feTurbulence type='fractalNoise' baseFrequency='.02 .9' numOctaves='2' seed='3'/>"
         "<feColorMatrix values='0 0 0 0 .4 0 0 0 0 .3 0 0 0 0 .3 0 0 0 .5 0'/></filter>"
         "<filter id='k'><feTurbulence type='fractalNoise' baseFrequency='.9 .02' numOctaves='2' seed='5'/>"
         "<feColorMatrix values='0 0 0 0 .4 0 0 0 0 .3 0 0 0 0 .3 0 0 0 .5 0'/></filter>"
         "<rect width='100%' height='100%' filter='url(%23l)'/><rect width='100%' height='100%' filter='url(%23k)' opacity='.7'/></svg>")


def paper(grain=.10, mottle=.06, linen=0):
    s = f'<div class="tex" style="background-image:url(&quot;{NOISE}&quot;);opacity:{grain}"></div>'
    if mottle: s += f'<div class="tex" style="background-image:url(&quot;{MOTTLE}&quot;);background-size:cover;opacity:{mottle}"></div>'
    if linen: s += f'<div class="tex" style="background-image:url(&quot;{LINEN}&quot;);opacity:{linen}"></div>'
    return s


# ---------- layouts: windows [x,y,w,h,shape] and the text area, per photo count ----------
L, P = (1800, 1200), (1200, 1800)
LAYOUTS = {
    "band": dict(size=L, n={
        1: dict(wins=[[310, 72, 1180, 786, "r"]], text=[0, 870, 1800, 290]),
        2: dict(wins=[[90, 90, 785, 523, "r"], [925, 90, 785, 523, "r"]], text=[0, 640, 1800, 480]),
        3: dict(wins=[[145, 75, 1000, 667, "r"], [1189, 75, 467, 311, "r"], [1189, 431, 467, 311, "r"]], text=[0, 775, 1800, 370])}),
    "panel": dict(size=L, n={
        1: dict(panel=[0, 0, 560, 1200], wins=[[615, 160, 1125, 880, "r"]], text=[30, 80, 500, 1040]),
        2: dict(panel=[0, 0, 900, 1200], wins=[[950, 60, 790, 515, "r"], [950, 625, 790, 515, "r"]], text=[60, 80, 780, 1040]),
        3: dict(panel=[55, 55, 815, 520], wins=[[930, 55, 815, 520, "r"], [55, 625, 815, 520, "r"], [930, 625, 815, 520, "r"]], text=[55, 55, 815, 520])}),
    "card": dict(size=P, n={
        1: dict(wins=[[110, 110, 980, 735, "r"]], text=[0, 880, 1200, 840]),
        2: dict(wins=[[110, 110, 980, 610, "r"], [110, 770, 980, 610, "r"]], text=[0, 1405, 1200, 330]),
        3: dict(wins=[[110, 110, 980, 400, "r"], [110, 555, 980, 400, "r"], [110, 1000, 980, 400, "r"]], text=[0, 1420, 1200, 320])}),
    "frame": dict(size=P, n={  # names on top; wide cut-corner windows so a whole group fits
        1: dict(wins=[[100, 640, 1000, 750, "c"]], text=[0, 90, 1200, 500], foot=[0, 1440, 1200, 300]),
        2: dict(wins=[[100, 430, 1000, 615, "c"], [100, 1095, 1000, 615, "c"]], text=[0, 60, 1200, 340]),
        3: dict(wins=[[100, 400, 1000, 410, "c"], [100, 860, 1000, 410, "c"], [100, 1320, 1000, 410, "c"]], text=[0, 50, 1200, 320])}),
}


def win_style(x, y, w, h, shape, grow=0):
    x, y, w, h = x - grow, y - grow, w + 2 * grow, h + 2 * grow
    r = f"border-radius:{w/2}px {w/2}px 0 0/{w/2}px {w/2}px 0 0;" if shape == "a" else ""
    if shape == "c": r = f"clip-path:polygon({chamfer_pts(w, h, CUT + grow * .4142, '%gpx %gpx', ',')});"
    return f"left:{x}px;top:{y}px;width:{w}px;height:{h}px;{r}"


CUT = 44  # corner cut of the cut-corner windows, in px


def chamfer_pts(w, h, c, fmt="%g,%g", sep=" ", inset=0):
    i = inset
    pts = [(c, i), (w - c, i), (w - i, c), (w - i, h - c), (w - c, h - i), (c, h - i), (i, h - c), (i, c)]
    return sep.join(fmt % p for p in pts)


def chamfer_outline(x, y, w, h, g, css):
    """Gold outline for a cut-corner window, grown by g px (an SVG, since clipped divs can't show borders)."""
    sw = float(re.search(r"border:([\d.]+)px", css).group(1)); col = re.search(r"solid ([^;]+)", css).group(1)
    op = re.search(r"opacity:([\d.]+)", css); op = op.group(1) if op else "1"
    X, Y, W, H = x - g, y - g, w + 2 * g, h + 2 * g
    return (f'<svg class="fr" style="left:{X}px;top:{Y}px;opacity:{op}" width="{W}" height="{H}"><polygon points="'
            f'{chamfer_pts(W, H, CUT + g * .4142, inset=sw / 2)}" fill="none" stroke="{col}" stroke-width="{sw}"/></svg>')


def windows(wins, mode, frames=(), mat=None):
    """frames: list of (grow_px, css) drawn around each window. mat: (grow_px, css) solid mat behind it."""
    out = []
    for i, (x, y, w, h, s) in enumerate(wins):
        if mat: out.append(f'<div class="fr" style="{win_style(x,y,w,h,s,mat[0])}{mat[1]}"></div>')
        for g, css in frames:
            out.append(chamfer_outline(x, y, w, h, g, css) if s == "c" else f'<div class="fr" style="{win_style(x,y,w,h,s,g)}{css}"></div>')
        inner = f'<img src="{PHOTOS}/p{[1,4,3,2,5,9][i % 6]}.jpg">' if mode == "preview" else ""
        bg = "#EEF4F7" if mode == "blank" else "transparent" if mode == "overlay" else "#ccc"
        out.append(f'<div class="win" style="{win_style(x,y,w,h,s)}background:{bg}">{inner}</div>')
    return "".join(out)


def box(r, inner, css=""):
    x, y, w, h = r
    return f'<div class="tb" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;{css}">{inner}</div>'


# ---------- ornaments (all drawn in SVG, no clip art) ----------
def gold_defs(id="g"):
    return (f'<defs><linearGradient id="{id}" x1="0" y1="0" x2="1" y2=".3">'
            '<stop offset="0" stop-color="#8a6a2f"/><stop offset=".3" stop-color="#d9c08a"/>'
            '<stop offset=".5" stop-color="#a8843f"/><stop offset=".7" stop-color="#ecdcaa"/>'
            '<stop offset="1" stop-color="#9a7738"/></linearGradient></defs>')


def rule(w, color, diamond=True, gap=26):
    d = (f'<svg width="18" height="18" viewBox="0 0 18 18" style="margin:0 {gap}px;flex:none">'
         f'<path d="M9 1 17 9 9 17 1 9Z" fill="none" stroke="{color}" stroke-width="1.6"/></svg>') if diamond else f'<span style="width:{gap}px"></span>'
    return (f'<div class="rule" style="width:{w}px"><i style="background:{color}"></i>{d}'
            f'<i style="background:{color}"></i></div>')


def bez(p0, p1, p2, t):
    return tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c for a, b, c in zip(p0, p1, p2))



def eucalyptus(w, h, color, sw=2.2, flip=False, seed=0):
    """Line-drawn eucalyptus sprig: a curved stem with round leaves on short stalks, smaller toward the tip."""
    p0, p1, p2 = (w * .5, h * .99), (w * (.2 if not flip else .8), h * .55), (w * .52, h * .03)
    stem = f'M{p0[0]:.1f} {p0[1]:.1f} Q{p1[0]:.1f} {p1[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}'
    parts = [f'<path d="{stem}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>']
    n = 8
    for i in range(n):
        t = .14 + .8 * i / (n - 1)
        x, y = bez(p0, p1, p2, t)
        x2, y2 = bez(p0, p1, p2, min(t + .01, 1))
        ang = math.atan2(y2 - y, x2 - x)
        side = 1 if i % 2 == 0 else -1
        r = (w * .17) * (1 - .5 * t)
        a2 = ang + side * math.radians(62)
        nx, ny = math.cos(a2), math.sin(a2)
        sx, sy = x + nx * r * .5, y + ny * r * .5
        cx, cy = x + nx * r * 1.45, y + ny * r * 1.45
        parts.append(f'<path d="M{x:.1f} {y:.1f} L{sx:.1f} {sy:.1f}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>')
        parts.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{r:.1f}" ry="{r*.86:.1f}" fill="none" stroke="{color}" stroke-width="{sw}" '
                     f'transform="rotate({math.degrees(a2):.1f} {cx:.1f} {cy:.1f})"/>')
        parts.append(f'<path d="M{sx:.1f} {sy:.1f} L{cx+nx*r*.55:.1f} {cy+ny*r*.55:.1f}" stroke="{color}" stroke-width="{sw*.6:.1f}" opacity=".7"/>')
    return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">{"".join(parts)}</svg>'



def laurel(size, fill, initials, font_css, gid="g"):
    """Monogram crest: two laurel branches curving up around the couple's initials."""
    c, R = size / 2, size * .42
    out = []
    for side in (-1, 1):
        th0, th1 = math.radians(14), math.radians(138)
        p = lambda th: (c + side * R * math.sin(th), c + R * math.cos(th))
        (x0, y0), (x1, y1) = p(th0), p(th1)
        out.append(f'<path d="M{x0:.1f} {y0:.1f} A{R} {R} 0 0 {0 if side > 0 else 1} {x1:.1f} {y1:.1f}" fill="none" stroke="{fill}" stroke-width="2.4" stroke-linecap="round"/>')
        for i in range(8):
            th = math.radians(24 + i * 15.5)
            x, y = p(th)
            phi = math.degrees(math.atan2(side * math.cos(th), math.sin(th)))
            Lf = size * (.064 - i * .0035)
            for kk in (-1, 1):
                out.append(f'<ellipse cx="0" cy="{-Lf:.1f}" rx="{Lf*.36:.1f}" ry="{Lf:.1f}" fill="{fill}" '
                           f'transform="translate({x:.1f} {y:.1f}) rotate({phi + kk*34*side:.1f})"/>')
        tx, ty = p(th1 + math.radians(6))
        out.append(f'<ellipse cx="0" cy="{-size*.04:.1f}" rx="{size*.018:.1f}" ry="{size*.045:.1f}" fill="{fill}" transform="translate({x1:.1f} {y1:.1f}) rotate({math.degrees(math.atan2(side*math.cos(th1), math.sin(th1))):.1f})"/>')
    a, b = initials
    txt = (f'<text x="{c}" y="{c + size*.11:.0f}" text-anchor="middle" style="{font_css}" fill="{fill}">{a}'
           f'<tspan style="font-style:italic;font-size:.55em" dx="6" dy="-{size*.03:.0f}">&amp;</tspan><tspan dx="6" dy="{size*.03:.0f}">{b}</tspan></text>')
    return f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">{"".join(out)}{txt}</svg>'


def fan(w, h, stroke):
    """Art deco sunburst fan."""
    cx, cy = w / 2, h
    p = []
    for r in (h * .98, h * .82, h * .4):
        p.append(f'<path d="M{cx-r} {cy} A{r} {r} 0 0 1 {cx+r} {cy}" fill="none" stroke="{stroke}" stroke-width="2"/>')
    for i in range(1, 18):
        a = math.pi * i / 18
        r0, r1 = h * .4, h * (.82 if i % 2 else .98)
        p.append(f'<line x1="{cx-math.cos(a)*r0:.1f}" y1="{cy-math.sin(a)*r0:.1f}" x2="{cx-math.cos(a)*r1:.1f}" y2="{cy-math.sin(a)*r1:.1f}" stroke="{stroke}" stroke-width="2"/>')
    return f'<svg width="{w}" height="{h+2}" viewBox="0 0 {w} {h+2}">{gold_defs()}{"".join(p)}</svg>'


def sparkle(s, fill):
    return (f'<svg width="{s}" height="{s}" viewBox="0 0 40 40"><path d="M20 0C21 14 26 19 40 20 26 21 21 26 20 40 19 26 14 21 0 20 14 19 19 14 20 0Z" fill="{fill}"/></svg>')


# ---------- the 10 designs ----------
def k(n, a, b, c):  # pick a value by photo count
    return {1: a, 2: b, 3: c}[n]


def caps(t, size, color, ls=".34em", wt=500, fam="Montserrat", extra=""):
    return f'<div style="font:{wt} {size}px/1.2 {fam};letter-spacing:{ls};text-transform:uppercase;color:{color};padding-left:{ls};{extra}">{t}</div>'


def ivory_script(n, mode):
    lay = LAYOUTS["band"]["n"][n]
    s = k(n, 1, 1.25, .95)
    txt = (caps("The wedding of", 22 * s, C["gold"]) +
           f'<div style="font:{150*s}px/1 Pinyon;color:{C["ink"]};margin:{14*s}px 0 {10*s}px">{T["a"]} <span style="font:italic 400 .62em Cormorant;color:{C["gold"]};margin:0 .12em">&amp;</span> {T["b"]}</div>' +
           f'<div style="display:flex;align-items:center"><i class="hl" style="width:{150*s}px;background:{C["gold"]}"></i>'
           f'{caps(T["date_dots"], 30*s, C["ink"], ".28em", 500, "Cormorant", "margin:0 28px")}'
           f'<i class="hl" style="width:{150*s}px;background:{C["gold"]}"></i></div>')
    return dict(bg=C["ivory"], body=paper(.12, .05) + windows(lay["wins"], mode, [(16, f'border:1.5px solid {C["gold"]}')]) + box(lay["text"], txt))


def champagne_toast(n, mode):
    lay = LAYOUTS["band"]["n"][n]
    s = k(n, 1, 1.25, .95)
    txt = (f'<div style="font:italic 300 {118*s}px/1 Cormorant;color:#4A3B2C;letter-spacing:.01em">{T["a"]} '
           f'<span style="color:{C["gold"]};margin:0 .06em">&amp;</span> {T["b"]}</div>' +
           caps(f'{T["date_long"]}', 24 * s, "#6E5A45", ".42em", 500, "Montserrat", f"margin-top:{22*s}px"))
    return dict(bg="linear-gradient(170deg,#efe4d1,#e3d3b8)",
                body=paper(.10, .08) + windows(lay["wins"], mode, mat=(18, "background:#fffdf8;box-shadow:0 6px 18px rgba(80,60,30,.18),0 1px 3px rgba(80,60,30,.2)")) + box(lay["text"], txt))


def navy_gold(n, mode):
    lay = LAYOUTS["band"]["n"][n]
    s = k(n, 1, 1.25, .95)
    gold = f"background:{GOLD_CSS};-webkit-background-clip:text;background-clip:text;color:transparent"
    txt = (f'<div style="font:{108*s}px/1 Italiana;letter-spacing:.12em;padding-left:.12em;text-transform:uppercase;{gold}">{T["a"]}'
           f' <span style="font:italic 400 .8em Cormorant;letter-spacing:0">&amp;</span> {T["b"]}</div>' +
           f'<div style="display:flex;align-items:center;margin-top:{20*s}px"><i class="hl" style="width:{120*s}px;background:{C["gold_lt"]};opacity:.7"></i>'
           f'{caps(T["date_dots"], 24*s, C["gold_lt"], ".4em", 400, "Montserrat", "margin:0 26px")}'
           f'<i class="hl" style="width:{120*s}px;background:{C["gold_lt"]};opacity:.7"></i></div>')
    border = (f'<div class="fr" style="inset:26px;border:1.5px solid {C["gold_lt"]};opacity:.75"></div>'
              f'<div class="fr" style="inset:36px;border:1px solid {C["gold_lt"]};opacity:.45"></div>')
    lay2 = dict(lay)
    return dict(bg=f"radial-gradient(120% 90% at 50% 30%,#22305a 0%,{C['navy']} 60%,#0f1628 100%)",
                body=paper(.10, .10) + border + windows(lay2["wins"], mode, [(12, f'border:2px solid {C["gold_lt"]}')]) + box(lay["text"], txt))


def sage_garden(n, mode):
    lay = LAYOUTS["panel"]["n"][n]
    s = k(n, 1.02, 1.15, .95)
    iv = C["ivory"]
    sprig = eucalyptus(int(150 * s), int(330 * s), iv, 2.4)
    txt = (f'<div style="margin-bottom:{18*s}px;opacity:.9">{sprig}</div>' +
           f'<div style="font:{116*s}px/1.02 Pinyon;color:{iv}">{T["a"]}<br><span style="font:italic 400 .5em Cormorant">&amp;</span> {T["b"]}</div>' +
           f'<i class="hl" style="width:{90*s}px;background:{iv};opacity:.6;margin:{26*s}px 0"></i>' +
           caps(T["date_long"], 22 * s, iv, ".36em", 500))
    if n == 3: txt = txt.replace(f'<div style="margin-bottom:{18*s}px;opacity:.9">{sprig}</div>', "")
    px, py, pw, ph = lay["panel"]
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{C["sage"]}">{paper(.12, .1)}</div>'
    return dict(bg=C["ivory"], body=paper(.10, .04) + panel + windows(lay["wins"], mode, [(12, f'border:1.5px solid {C["sage_dk"]};opacity:.6')]) + box(lay["text"], txt))


def black_tie(n, mode):
    lay = LAYOUTS["panel"]["n"][n]
    s = k(n, .86, 1.12, .9)
    gold = f"background:{GOLD_CSS};-webkit-background-clip:text;background-clip:text;color:transparent"
    txt = (f'<div style="margin-bottom:{30*s}px">{fan(int(300*s), int(150*s), "url(#g)")}</div>' +
           f'<div style="font:{92*s}px/1.15 Italiana;letter-spacing:.1em;padding-left:.1em;text-transform:uppercase;{gold}">{T["a"]}</div>' +
           f'<div style="font:italic 400 {70*s}px/1 Cormorant;{gold};margin:{4*s}px 0">&amp;</div>' +
           f'<div style="font:{92*s}px/1.15 Italiana;letter-spacing:.1em;padding-left:.1em;text-transform:uppercase;{gold}">{T["b"]}</div>' +
           f'<div style="width:{220*s}px;height:{14*s}px;border-top:1.5px solid {C["gold"]};border-bottom:1.5px solid {C["gold"]};margin:{30*s}px 0 {24*s}px"></div>' +
           caps(T["date_dots"], 24 * s, C["gold_lt"], ".42em", 400))
    if n == 3: txt = txt.replace(f'<div style="margin-bottom:{30*s}px">', f'<div style="margin-bottom:{18*s}px;display:none">')
    px, py, pw, ph = lay["panel"]
    inset = 26 if n < 3 else 0
    panel = (f'<div class="fr" style="left:{px+inset}px;top:{py+inset}px;width:{pw-2*inset}px;height:{ph-2*inset}px;border:1.5px solid {C["gold"]}"></div>'
             f'<div class="fr" style="left:{px+inset+10}px;top:{py+inset+10}px;width:{pw-2*inset-20}px;height:{ph-2*inset-20}px;border:1px solid {C["gold"]};opacity:.55"></div>')
    return dict(bg=f"linear-gradient(160deg,#181818,{C['black']} 60%,#0b0b0b)", body=paper(.10, .08) + panel +
                windows(lay["wins"], mode, [(10, f'border:2px solid {C["gold"]}')]) + box(lay["text"], txt))


def blush_linen(n, mode):
    lay = LAYOUTS["panel"]["n"][n]
    s = k(n, 1.0, 1.15, .95)
    wine = C["wine"]
    txt = (caps("Together with their families", 17 * s, wine, ".3em", 500, "Montserrat", f"opacity:.8;margin-bottom:{30*s}px") if n == 2 else "") + (
        f'<div style="font:italic 400 {104*s}px/1.05 Bodoni;color:{wine}">{T["a"]}</div>'
        f'<div style="font:{64*s}px/1.1 Pinyon;color:{C["gold"]};margin:{6*s}px 0">and</div>'
        f'<div style="font:italic 400 {104*s}px/1.05 Bodoni;color:{wine}">{T["b"]}</div>'
        f'<div style="margin:{34*s}px 0 0">{caps(T["date_long"], 22*s, wine, ".36em", 500)}</div>')
    px, py, pw, ph = lay["panel"]
    panel = f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{C["blush"]}">{paper(.10, .06, .35)}</div>'
    return dict(bg="#FBF7F3", body=paper(.08, .04) + panel + windows(lay["wins"], mode, [(14, f'border:1.5px solid {C["gold"]};opacity:.8')]) + box(lay["text"], txt))



def modern_serif(n, mode):
    lay = LAYOUTS["card"]["n"][n]
    bod = "font-family:Bodoni;font-variation-settings:'opsz' 28"
    if n == 1:
        nm = lambda t: f'<div style="font-size:124px;line-height:1.05;{bod};letter-spacing:.08em;padding-left:.08em;text-transform:uppercase;color:{C["black"]}">{t}</div>'
        txt = (nm(T["a"]) + f'<div style="font:italic 400 110px/1 Bodoni;color:#8a6a2f;margin:6px 0 10px">&amp;</div>' + nm(T["b"]) +
               f'<div style="display:flex;gap:40px;align-items:center;margin-top:56px">{caps("06", 30, C["black"], ".2em", 400)}'
               f'<i class="hl" style="width:1.5px;height:34px;background:{C["black"]}"></i>{caps("14", 30, C["black"], ".2em", 400)}'
               f'<i class="hl" style="width:1.5px;height:34px;background:{C["black"]}"></i>{caps("2027", 30, C["black"], ".2em", 400)}</div>')
        return dict(bg="#FCFBF9", body=paper(.06, 0) + windows(lay["wins"], mode) + box(lay["text"], txt))
    txt = (f'<div style="font-size:78px;line-height:1;{bod};letter-spacing:.08em;padding-left:.08em;text-transform:uppercase;color:{C["black"]}">{T["a"]}'
           f'<span style="font-style:italic;text-transform:none;letter-spacing:0;margin:0 .32em 0 .24em;font-size:.92em;color:#8a6a2f">&amp;</span>{T["b"]}</div>'
           f'<div style="display:flex;gap:34px;align-items:center;margin-top:34px">{caps("06", 24, C["black"], ".2em", 400)}'
           f'<i class="hl" style="width:1.5px;height:28px;background:{C["black"]}"></i>{caps("14", 24, C["black"], ".2em", 400)}'
           f'<i class="hl" style="width:1.5px;height:28px;background:{C["black"]}"></i>{caps("2027", 24, C["black"], ".2em", 400)}</div>')
    return dict(bg="#FCFBF9", body=paper(.06, 0) + windows(lay["wins"], mode) + box(lay["text"], txt))


def monogram_crest(n, mode):
    lay = LAYOUTS["card"]["n"][n]
    tx, ty, tw, th = lay["text"]
    crest = laurel(300, "url(#g)", T["ini"], "font:500 104px Cormorant")
    if n == 1:
        txt = (laurel(400, "url(#g)", T["ini"], "font:500 138px Cormorant") +
               f'<div style="margin-top:24px">{caps(T["a"] + " &amp; " + T["b"], 58, C["ink"], ".26em", 500, "Cormorant")}</div>' +
               caps(T["date_long"], 24, C["taupe"], ".42em", 500, "Montserrat", "margin-top:22px"))
        return dict(bg=C["ivory"], body=paper(.12, .05) + windows(lay["wins"], mode, [(14, f'border:1px solid {C["gold"]}'), (22, f'border:1px solid {C["gold"]};opacity:.5')]) + box(lay["text"], txt))
    txt = (f'<div style="display:flex;align-items:center;gap:40px">'
           f'<div style="text-align:right">{caps(T["a"], 50, C["ink"], ".3em", 500, "Cormorant")}</div>{crest}'
           f'<div style="text-align:left">{caps(T["b"], 50, C["ink"], ".3em", 500, "Cormorant")}</div></div>'
           + caps(T["date_long"], 21, C["taupe"], ".42em", 500, "Montserrat", "margin-top:-6px"))
    return dict(bg=C["ivory"], body=paper(.12, .05) + windows(lay["wins"], mode, [(14, f'border:1px solid {C["gold"]}'), (22, f'border:1px solid {C["gold"]};opacity:.5')]) + box(lay["text"], txt))


def gilded_frame(n, mode):
    lay = LAYOUTS["frame"]["n"][n]
    names = f'<div style="font:{k(n,176,140,130)}px/1.1 Pinyon;color:{C["ink"]}">{T["a"]} <span style="font:italic 400 .6em Cormorant;color:{C["gold"]};margin:0 .12em">&amp;</span> {T["b"]}</div>'
    date = (f'<div style="display:flex;align-items:center;margin-top:18px">{sparkle(k(n,22,16,16), C["gold"])}'
            f'{caps(T["date_dots"], k(n,36,28,28), C["ink"], ".3em", 500, "Cormorant", "margin:0 24px")}{sparkle(k(n,22,16,16), C["gold"])}</div>')
    if n == 1:
        names = caps("The wedding of", 22, C["gold"], ".42em", 500, "Montserrat", "margin-bottom:22px") + names
        text = box(lay["text"], names) + box(lay["foot"], date)
    else:
        text = box(lay["text"], names + date)
    return dict(bg=C["linen"], body=paper(.12, .07) + windows(lay["wins"], mode, [(16, f'border:2px solid {C["gold"]}'), (26, f'border:1px solid {C["gold"]};opacity:.55')]) + text)


def emerald_frame(n, mode):
    lay = LAYOUTS["frame"]["n"][n]
    gold = f"background:{GOLD_CSS};-webkit-background-clip:text;background-clip:text;color:transparent"
    top = (caps("Forever begins", k(n,24,20,20), C["gold_lt"], ".46em", 400, "Montserrat", "opacity:.85;margin-bottom:6px") +
           f'<div style="font:{k(n,170,134,124)}px/1.15 Pinyon;{gold};padding:0 20px">{T["a"]} <span style="font:italic 400 .58em Cormorant">&amp;</span> {T["b"]}</div>')
    date = caps(T["date_long"], k(n,40,32,32), C["gold_lt"], ".34em", 500, "Cormorant", "margin-top:8px")
    text = box(lay["text"], top) + box(lay["foot"], date) if n == 1 else box(lay["text"], top + date)
    return dict(bg=f"radial-gradient(110% 80% at 50% 35%,#2a4d41,{C['emerald']} 55%,#132620)", body=paper(.12, .10) +
                windows(lay["wins"], mode, [(14, f'border:2px solid {C["gold_lt"]}'), (24, f'border:1px solid {C["gold_lt"]};opacity:.5')]) + text)


DESIGNS = [  # id, name, base layout, builder
    ("ivory-script", "Ivory Script", "band", ivory_script),
    ("champagne-toast", "Champagne Toast", "band", champagne_toast),
    ("navy-and-gold", "Navy & Gold", "band", navy_gold),
    ("sage-garden", "Sage Garden", "panel", sage_garden),
    ("black-tie", "Black Tie", "panel", black_tie),
    ("blush-linen", "Blush Linen", "panel", blush_linen),
    ("modern-serif", "Modern Serif", "card", modern_serif),
    ("monogram-crest", "Monogram Crest", "card", monogram_crest),
    ("gilded-frame", "Gilded Frame", "frame", gilded_frame),
    ("emerald-frame", "Emerald Frame", "frame", emerald_frame),
]

BASE_CSS = """*{margin:0;padding:0;box-sizing:border-box}
body{position:relative;overflow:hidden;-webkit-font-smoothing:antialiased}
.tex,.fr,.win,.tb{position:absolute}.tex{inset:0;pointer-events:none}
.win{overflow:hidden}.win img{width:100%;height:100%;object-fit:cover;display:block}
.tb{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.hl{display:block;height:1.5px;flex:none}
.rule{display:flex;align-items:center}.rule i{flex:1;height:1.5px}"""


def page(d, n, mode):
    did, name, base, fn = d
    W, H = LAYOUTS[base]["size"]
    r = fn(n, mode)
    return (f'<!doctype html><meta charset="utf-8"><style>{FONT_CSS}{BASE_CSS}body{{width:{W}px;height:{H}px;background:{r["bg"]}}}</style>'
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
            manifest.append(dict(id=did, name=name, base=base, n=n, size=[W, H],
                                 wins=[w[:4] for w in LAYOUTS[base]["n"][n]["wins"]],
                                 shapes=[w[4] for w in LAYOUTS[base]["n"][n]["wins"]]))
    with open(os.path.join(HERE, "out", "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(len(manifest), "design versions")


if __name__ == "__main__":
    main()
