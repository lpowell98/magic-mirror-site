#!/usr/bin/env python3
"""Corporate print designs: brand activations, company holiday parties, galas, conferences, and restaurant,
bar and university events. Same pipeline as the Wedding (build.py), Birthday, Holiday, Graduation and Baby shower sets.
Writes one HTML page per design, photo count and mode into out-corporate/html/. Then:
  PD_OUT=out-corporate node render.js
  PD_OUT=out-corporate PD_FINAL=final-corporate python3 finish.py
Every design is 4x6 at 300 dpi and every photo window is landscape.
Every design has an obvious spot for the client's logo. The previews show a sample "YOUR LOGO" lockup there.
The "bare" mode renders the same print with the logo spot left empty (finish.py saves it as -overlay-nologo.png),
so a client's own logo can be dropped in.
Each design is grounded in a real object from corporate events: a conference lanyard badge, dimensional
lobby letters on travertine, a step-and-repeat press wall, a velvet rope and stanchions, a leather folio,
a brass award plaque, a felt letter board, a letterpress dinner menu and a paint chip strip.
Annual Report is the type-only design. (Lans replaced the first round's Split-Flap, Matchbook and Neon Sign.)"""
import json, math, os, random

import build
from build import paper, windows, box, k
from birthday import _clear, grow, text_core
import graduation
import babyshower
from babyshower import crinkle, spread, uri

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out-corporate", "html")
FONTS = build.FONTS

# ---------- style guide: graphite, stone and bone, with cobalt, teal, vermilion and copper as accents ----------
C = dict(ink="#15171A", graphite="#2A2D31", slate="#4B5159", steel="#8A9099", concrete="#C9C5BE", stone="#DDD8D0",
         bone="#EEEAE3", paper="#F7F5F0", white="#FFFFFF",
         cobalt="#2742C4", cobalt_dk="#1A2E8F", cobalt_lt="#B9C4F0", oxblood="#7D1828", travertine="#D9CDB8",
         vermilion="#E1502A", copper="#B06A43", walnut="#4A2F1F", oak="#C69A66")
COPPER = "linear-gradient(100deg,#7a4528 0%,#e2a47c 30%,#a7613c 50%,#f2c6a3 68%,#87502f 100%)"
BRASS = "linear-gradient(100deg,#8a6a2e 0%,#dcc07c 28%,#a9873f 48%,#efd99c 68%,#94742f 100%)"
CHROME = "linear-gradient(180deg,#f4f5f6 0%,#b9bec4 45%,#eceef0 55%,#8e959c 100%)"
foil = graduation.foil

FONT_CSS = graduation.FONT_CSS + "".join(
    f"@font-face{{font-family:'{n}';src:url('{FONTS}/{f}');font-style:{s};font-weight:{w};font-stretch:{st}}}"
    for n, f, s, w, st in [("Archivo", "Archivo.ttf", "normal", "100 900", "62% 125%"),
                           ("Plex", "IBMPlexMono-Regular.ttf", "normal", "400", "100%"),
                           ("Plex", "IBMPlexMono-Medium.ttf", "normal", "500", "100%"),
                           ("Plex", "IBMPlexMono-SemiBold.ttf", "normal", "600", "100%"),
                           ("Fraunces", "Fraunces.ttf", "normal", "100 900", "100%"),
                           ("Fraunces", "Fraunces-Italic.ttf", "italic", "100 900", "100%")])

# Sample words. Each client's own event name, date and logo replace them.
E = dict(summit="Summit 2027", gala="Annual Awards Gala", party="Holiday Party", launch="Launch Night", dinner="Private Dinner",
         kickoff="Annual Kickoff", date="March 18, 2027", dates="March 18–20, 2027", city="Chicago", year="2027",
         short="03.18.27", leaders="Leadership Summit")


def ar(t, size, color, wd=100, wt=600, ls=".2em", extra=""):
    """Archivo, the grotesque used for event names and labels. wd is its width, 62 (condensed) to 125 (extended)."""
    return (f'<div style="font:{wt} {size}px/1.08 Archivo;font-stretch:{wd}%;letter-spacing:{ls};padding-left:{ls};'
            f'text-transform:uppercase;color:{color};{extra}">{t}</div>')


def mono(t, size, color, wt=500, ls=".14em", extra=""):
    return (f'<div style="font:{wt} {size}px/1.2 Plex;letter-spacing:{ls};padding-left:{ls};text-transform:uppercase;'
            f'color:{color};{extra}">{t}</div>')


def svg(W, H, inner, cls="tex", style=""):
    return f'<svg class="{cls}" width="{W}" height="{H}" style="{style}">{inner}</svg>'


def win_mode(mode):
    return "overlay" if mode == "bare" else mode


# ---------- the logo spot ----------
def logo_mark(s, col):
    """The sample mark: a circle split on the diagonal, its two halves pulled apart."""
    g = 7
    a = f"M{50-g} {50-g} L{50-g-36*.707:.1f} {50-g+36*.707:.1f} A36 36 0 0 1 {50-g+36*.707:.1f} {50-g-36*.707:.1f}Z"
    b = f"M{50+g} {50+g} L{50+g+36*.707:.1f} {50+g-36*.707:.1f} A36 36 0 0 1 {50+g-36*.707:.1f} {50+g+36*.707:.1f}Z"
    return (f'<svg width="{s}" height="{s}" viewBox="0 0 100 100" style="display:block;flex:none;overflow:visible">'
            f'<path d="{a}" fill="{col}"/><path d="{b}" fill="{col}"/></svg>')


def logo(h, col, mode, stacked=False, extra="", word="YOUR LOGO"):
    """The client's logo goes here. The sample is a mark and a wordmark. In 'bare' mode the space is kept but left empty."""
    hide = "visibility:hidden;" if mode == "bare" else ""
    wd = (f'<div style="font:700 {h*.46:.0f}px/1 Archivo;font-stretch:118%;letter-spacing:.2em;padding-left:.2em;color:{col};white-space:nowrap">{word}</div>')
    if stacked:
        return (f'<div class="logo" style="display:flex;flex-direction:column;align-items:center;gap:{h*.28:.0f}px;{hide}{extra}">'
                f'{logo_mark(h * 1.25, col)}{wd}</div>')
    return (f'<div class="logo" style="display:flex;align-items:center;gap:{h*.34:.0f}px;{hide}{extra}">'
            f'{logo_mark(h, col)}{wd}</div>')


# ---------- layouts: windows [x,y,w,h,shape], all landscape ----------
L, P = (1800, 1200), (1200, 1800)
LAYOUTS = {
    "band": build.LAYOUTS["band"],      # landscape, photos on top, words in a band below
    "panel": build.LAYOUTS["panel"],    # landscape, a panel holds the art and words beside the photos
    "card": build.LAYOUTS["card"],      # portrait, photos stacked, words at the foot
    "tag": graduation.LAYOUTS["tag"],   # portrait, words on top, rounded windows below
    "badge": dict(size=P, n={           # portrait, a lanyard badge: a header band with the logo, then the photos
        1: dict(wins=[[110, 620, 980, 735, "r"]], text=[60, 390, 1080, 210], foot=[36, 1380, 1128, 384]),
        2: dict(wins=[[110, 560, 980, 560, "r"], [110, 1150, 980, 560, "r"]], text=[60, 370, 1080, 170]),
        3: dict(wins=[[110, 520, 980, 380, "r"], [110, 925, 980, 380, "r"], [110, 1330, 980, 380, "r"]], text=[60, 352, 1080, 150])}),
}
for lay in LAYOUTS.values():
    for v in lay["n"].values():
        assert all(w > h for _, _, w, h, _ in v["wins"]), "every photo window must be landscape"


# ---------- textures ----------
def turb(W, H, freq, seed, rgb, a, b, op=1, octv=3, blend="normal", typ="fractalNoise"):
    """A noise layer. Its alpha is a*R + b, so a and b set how much of the noise shows."""
    r, g, bl = rgb
    return (f'<svg class="tex" width="{W}" height="{H}" style="opacity:{op};mix-blend-mode:{blend}">'
            f'<filter id="t{seed}" x="0" y="0" width="100%" height="100%"><feTurbulence type="{typ}" baseFrequency="{freq}" numOctaves="{octv}" seed="{seed}"/>'
            f'<feColorMatrix values="0 0 0 0 {r} 0 0 0 0 {g} 0 0 0 0 {bl} {a} 0 0 0 {b}"/></filter>'
            f'<rect width="{W}" height="{H}" filter="url(#t{seed})"/></svg>')


def leather(W, H, seed=3):
    """Pebbled leather: a fine raised grain lit from the top left, and a few soft creases."""
    return crinkle(W, H, seed, .55, ".22", 2.2) + crinkle(W, H, seed + 1, .25, ".004 .006", 4) + paper(.10, .06)


def walnut(W, H, seed=5):
    """Walnut: long dark grain lines and a lighter figure, on a warm brown."""
    return (turb(W, H, ".0018 .045", seed, (.08, .04, .02), 2.4, -1.0, .9, 4) +
            turb(W, H, ".003 .12", seed + 1, (.55, .36, .22), 2.0, -1.1, .35, 3) +
            turb(W, H, ".6 .02", seed + 2, (.05, .03, .02), 1.4, -.5, .25, 2) + paper(.06, .05))


def brushed(W, H, seed=8, op=.35):
    """Brushed metal: fine horizontal streaks."""
    return (turb(W, H, ".0015 .9", seed, (1, 1, 1), 1.6, -.7, op, 2) +
            turb(W, H, ".002 .7", seed + 1, (0, 0, 0), 1.6, -.75, op * .8, 2))


def shadow_css(d=10, b=26, a=.35):
    return f"box-shadow:0 {d}px {b}px rgba(0,0,0,{a})"


# ---------- ornaments, all drawn in code ----------
LB_CSS = """.lb span{display:inline-block;width:.62em;text-align:center}"""


def screw(x, y, r):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#scr)"/>'
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="#5c4519" stroke-width="1.2" opacity=".7"/>'
            f'<line x1="{x-r*.7:.1f}" y1="{y+r*.25:.1f}" x2="{x+r*.7:.1f}" y2="{y-r*.25:.1f}" stroke="#4a3610" stroke-width="{r*.28:.1f}" stroke-linecap="round"/>'
            f'<line x1="{x-r*.7:.1f}" y1="{y+r*.25+1.6:.1f}" x2="{x+r*.7:.1f}" y2="{y-r*.25+1.6:.1f}" stroke="#f3e2b0" stroke-width="1" opacity=".6"/>')


SCREW_DEF = ('<defs><radialGradient id="scr" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f6e6b4"/>'
             '<stop offset=".55" stop-color="#b8954c"/><stop offset="1" stop-color="#6f5321"/></radialGradient></defs>')


def plate(w, h, inner, uid):
    """A brushed brass plate with a bevelled edge and a screw in each corner. The words on it are engraved."""
    s = 13; m = 30
    screws = svg(w, h, SCREW_DEF + "".join(screw(x, y, s) for x, y in ((m, m), (w - m, m), (m, h - m), (w - m, h - m))), "tex")
    return (f'<div style="position:relative;width:{w}px;height:{h}px;border-radius:6px;background:{BRASS};overflow:hidden;'
            f'box-shadow:0 10px 22px rgba(20,10,5,.55),0 2px 3px rgba(20,10,5,.6),inset 0 0 0 2px rgba(255,240,200,.55),inset 0 0 0 5px rgba(120,85,30,.35),inset 0 0 0 9px rgba(255,235,190,.18)">'
            f'{brushed(w, h, 21, .5)}<div class="tex" style="background:linear-gradient(160deg,rgba(255,255,255,.22),transparent 40%,transparent 60%,rgba(80,50,10,.18))"></div>'
            f'{screws}<div class="tb" style="inset:0;display:flex">{inner}</div></div>')


ENGRAVE = "color:#3b2a0e;text-shadow:0 1.5px 0 rgba(255,244,205,.6),0 -1px 0 rgba(40,25,5,.25)"
ENGRAVE_F = "filter:drop-shadow(0 1.5px 0 rgba(255,244,205,.6))"
DEBOSS = "color:#161719;text-shadow:0 1.5px 0 rgba(255,255,255,.13),0 -1.5px 1px rgba(0,0,0,.7)"
DEBOSS_F = "filter:drop-shadow(0 1.5px 0 rgba(255,255,255,.13)) drop-shadow(0 -1.5px 1px rgba(0,0,0,.7))"


def paint_strip(w, h, mode, horiz=False, shades=("#1A2E8F", "#2742C4", "#7085E2", "#BCC6F2"), names=("Midnight", "Cobalt 2027", "Signal", "Mist")):
    """A paint chip strip: four graded swatches of the brand color on a white card, each with its name and number."""
    pad = 22
    if not horiz:
        foot = h * .2
        sh = (h - foot - pad * 2 - 4 * 6) / 4
        heights = [sh * 1.6, sh * .8, sh * .8, sh * .8]
        y = pad; sw = []
        for i, (c, nm) in enumerate(zip(shades, names)):
            hh = heights[i]
            ink = C["white"] if i < 3 else C["cobalt_dk"]
            inner = (f'<div class="tb" style="inset:0">{logo(w*.075, C["white"], mode, True)}</div>' if i == 0 else "")
            sw.append(f'<div style="position:absolute;left:{pad}px;top:{y:.0f}px;width:{w-2*pad}px;height:{hh:.0f}px;background:{c}">{inner}'
                      f'<div style="position:absolute;left:16px;bottom:12px;font:600 {max(w*.05, 22):.0f}px/1.2 Plex;letter-spacing:.04em;color:{ink}">{nm}'
                      f'<span style="opacity:.7;margin-left:12px">{2340+i*10}-C</span></div></div>')
            y += hh + 6
        words = (f'<div class="tb" style="left:0;top:{y:.0f}px;width:{w}px;height:{h-y:.0f}px">'
                 f'{ar(E["launch"], w*.085, C["ink"], 112, 800, ".04em")}'
                 f'{mono(E["date"], w*.036, C["slate"], 500, ".12em", "margin-top:10px")}</div>')
    else:
        side = w * .42
        cw = (w - side - pad * 2 - 3 * 6) / 4
        widths = [cw * 1.6, cw * .8, cw * .8, cw * .8]
        x = pad; sw = []
        for i, (c, nm) in enumerate(zip(shades, names)):
            ww = widths[i]
            ink = C["white"] if i < 3 else C["cobalt_dk"]
            inner = (f'<div class="tb" style="inset:0">{logo(h*.075, C["white"], mode, True)}</div>' if i == 0 else "")
            sw.append(f'<div style="position:absolute;left:{x:.0f}px;top:{pad}px;width:{ww:.0f}px;height:{h-2*pad}px;background:{c}">{inner}'
                      f'<div style="position:absolute;left:12px;bottom:12px;font:600 {h*.04:.0f}px/1.25 Plex;letter-spacing:.04em;color:{ink}">{nm}<br>'
                      f'<span style="opacity:.7">{2340+i*10}-C</span></div></div>')
            x += ww + 6
        words = (f'<div class="tb" style="left:{x+10:.0f}px;top:0;width:{w-x-10:.0f}px;height:{h}px">'
                 f'{ar(E["launch"], h*.085, C["ink"], 112, 800, ".04em")}'
                 f'{mono(E["date"], h*.036, C["slate"], 500, ".12em", "margin-top:10px")}</div>')
    return (f'<div style="position:relative;width:{w}px;height:{h}px;background:{C["white"]};box-shadow:0 14px 30px rgba(30,30,40,.22),0 2px 4px rgba(30,30,40,.18)">'
            f'{paper(.08, 0)}{"".join(sw)}{words}</div>')


def letterboard(w, h, lines, mode, fs, logo_after=None, logo_h=60):
    """A black felt letter board in an oak frame. Each white letter is pushed into a groove, a little uneven."""
    fr = 30
    pitch = fs * .34
    rnd = random.Random(len("".join(lines)) + w)
    def line(t):
        spans = "".join(f'<span style="transform:translateY({rnd.uniform(-1.5, 1.5):.1f}px) rotate({rnd.uniform(-1.6, 1.6):.1f}deg)">{c if c != " " else "&nbsp;"}</span>' for c in t)
        return f'<div class="lb" style="font:500 {fs}px/{pitch*3:.0f}px Archivo;font-stretch:84%;color:#F3F2EE;text-shadow:0 2px 2px rgba(0,0,0,.7);white-space:nowrap">{spans}</div>'
    rows = []
    for i, t in enumerate(lines):
        rows.append(line(t))
        if logo_after == i:
            rows.append(f'<div style="height:{pitch*3:.0f}px;display:flex;align-items:center;filter:drop-shadow(0 2px 2px rgba(0,0,0,.7))">{logo(logo_h, "#F3F2EE", mode)}</div>')
    felt = (f"repeating-linear-gradient(180deg,#1d1d1f 0 {pitch-4:.1f}px,#060607 {pitch-4:.1f}px {pitch-1.5:.1f}px,#2a2a2d {pitch-1.5:.1f}px {pitch:.1f}px)")
    return (f'<div style="position:relative;width:{w}px;height:{h}px;border-radius:4px;background:{C["oak"]};box-shadow:0 14px 28px rgba(40,30,20,.35)">'
            f'<div style="position:absolute;inset:0;border-radius:4px;overflow:hidden">{walnut(w, h, 31).replace("rgb", "rgb")}</div>'
            f'<div style="position:absolute;inset:0;border-radius:4px;box-shadow:inset 0 0 0 2px rgba(255,230,190,.35),inset 0 -3px 4px rgba(60,40,20,.35)"></div>'
            f'<div style="position:absolute;inset:{fr}px;background:{felt};box-shadow:inset 0 3px 8px rgba(0,0,0,.8),0 0 0 2px rgba(60,40,20,.5);overflow:hidden">'
            f'{turb(w, h, ".9", 41, (.5, .5, .5), 1.4, -.55, .25, 2)}'
            f'<div class="tb" style="inset:0;padding:{pitch:.0f}px 0">{"".join(rows)}</div></div></div>')


# ---------- the 10 designs ----------
def lanyard_badge(n, mode):  # conferences, summits, university events
    lay = LAYOUTS["badge"]["n"][n]; W, H = P
    m = 36; hb = k(n, 330, 300, 290)  # card inset, header band bottom
    card = (f'<div class="fr" style="left:{m}px;top:{m}px;width:{W-2*m}px;height:{H-2*m}px;border-radius:44px;background:{C["paper"]};overflow:hidden;'
            f'box-shadow:0 12px 30px rgba(0,0,0,.45),inset 0 0 0 1.5px rgba(255,255,255,.6)">'
            f'<div style="position:absolute;left:0;top:0;right:0;height:{hb-m}px;background:{C["cobalt"]}">'
            f'<div class="tex" style="background:repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 2px,transparent 2px 14px)"></div></div>'
            f'{paper(.06, .03)}<div class="tex" style="background:linear-gradient(125deg,rgba(255,255,255,.28),transparent 35%)"></div></div>')
    # the punched slot and the lanyard clip through it
    sx, sy, sw_, sh_ = W / 2 - 80, 96, 160, 26
    slot = f'<div class="fr" style="left:{sx}px;top:{sy}px;width:{sw_}px;height:{sh_}px;border-radius:13px;background:{C["graphite"]};box-shadow:inset 0 3px 5px rgba(0,0,0,.6)"></div>'
    strap = (f'<div class="fr" style="left:{W/2-40}px;top:0;width:80px;height:58px;background:{C["cobalt_dk"]};box-shadow:0 4px 6px rgba(0,0,0,.4)">'
             f'<div class="tex" style="background:repeating-linear-gradient(0deg,rgba(255,255,255,.07) 0 1.5px,transparent 1.5px 5px)"></div></div>'
             f'<div class="fr" style="left:{W/2-46}px;top:50px;width:92px;height:22px;border-radius:5px;background:{CHROME};box-shadow:0 3px 4px rgba(0,0,0,.4)"></div>'
             f'<div class="fr" style="left:{W/2-20}px;top:70px;width:40px;height:44px;border-radius:0 0 20px 20px;border:7px solid #b7bcc2;border-top:0;box-shadow:0 3px 4px rgba(0,0,0,.35)"></div>')
    head = f'<div class="tb" style="left:{m}px;top:{sy+sh_}px;width:{W-2*m}px;height:{hb-sy-sh_}px">{logo(k(n, 78, 70, 66), C["white"], mode)}</div>'
    s = k(n, 1, .9, .84)
    words = (ar(E["summit"], 104 * s, C["ink"], 112, 800, ".03em") +
             mono(f'{E["dates"]} &nbsp;·&nbsp; {E["city"]}', 26 * s, C["slate"], 500, ".16em", f"margin-top:{14*s:.0f}px"))
    foot = ""
    if n == 1:
        fx, fy, fw, fh = lay["foot"]
        foot = (f'<div class="tb" style="left:{fx}px;top:{fy}px;width:{fw}px;height:{fh-170}px">'
                f'{mono("Photo booth &nbsp;·&nbsp; Main hall", 24, C["slate"], 500, ".2em")}</div>'
                f'<div class="fr" style="left:{m}px;top:{H-m-150}px;width:{W-2*m}px;height:150px;background:{C["cobalt"]};border-radius:0 0 44px 44px;'
                f'display:flex;align-items:center;justify-content:center">{ar("All access", 64, C["white"], 125, 800, ".34em")}</div>')
    else:
        foot = f'<div class="fr" style="left:{m}px;top:{H-m-22}px;width:{W-2*m}px;height:22px;background:{C["cobalt"]};border-radius:0 0 44px 44px"></div>'
    return dict(bg=C["graphite"], body=leather(W, H, 7) + card + slot + strap + head + box(lay["text"], words) + foot +
                windows(lay["wins"], win_mode(mode), [(3, f"border:1.5px solid {C['concrete']}")]))


def step_repeat(n, mode):  # brand activations, galas, premieres, launches
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    cw, rh = 400, 150
    tiles = []
    for j in range(-1, int(H / rh) + 2):
        for i in range(-1, int(W / cw) + 2):
            x = i * cw + (cw / 2 if j % 2 else 0); y = j * rh
            if (i + j) % 2 == 0:
                t = logo(38, C["cobalt"], mode, extra="")
            else:
                t = ar(E["launch"], 30, C["ink"], 118, 800, ".12em")
            tiles.append(f'<div class="tb" style="left:{x:.0f}px;top:{y:.0f}px;width:{cw}px;height:{rh}px">{t}</div>')
    wall = (f'<div class="tex" style="opacity:.5">{"".join(tiles)}</div>'
            f'<div class="tex" style="background:linear-gradient(105deg,rgba(255,255,255,.0) 20%,rgba(255,255,255,.35) 45%,rgba(255,255,255,0) 60%)"></div>'
            + crinkle(W, H, 61, .28, ".002 .004", 2) + paper(.06, .04))
    s = k(n, 1, 1.15, 1)
    tx, ty, tw, th = lay["text"]
    pw, ph = k(n, 1000, 1080, 1000), k(n, 236, 300, 250)
    plaque = (f'<div style="width:{pw}px;height:{ph}px;background:{C["white"]};border:2px solid {C["ink"]};display:flex;flex-direction:column;align-items:center;justify-content:center;{shadow_css(10, 24, .22)}">'
              f'{logo(40 * s, C["cobalt"], mode, extra=f"margin-bottom:{18*s:.0f}px")}'
              f'{ar(E["launch"], 72 * s, C["ink"], 118, 800, ".1em")}'
              f'{mono(f"{E["date"]} &nbsp;·&nbsp; New York", 20 * s, C["slate"], 500, ".24em", f"margin-top:{12*s:.0f}px")}</div>')
    return dict(bg=C["paper"], body=wall + windows(lay["wins"], win_mode(mode), mat=(14, f"background:{C['white']};box-shadow:0 0 0 2px {C['ink']},0 10px 24px rgba(0,0,0,.22)")) +
                box(lay["text"], plaque))


def leather_folio(n, mode):  # leadership summits, executive dinners, galas
    lay = LAYOUTS["tag"]["n"][n]; W, H = P
    stitch = (f'<svg class="tex" width="{W}" height="{H}"><rect x="44" y="44" width="{W-88}" height="{H-88}" rx="34" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="4" stroke-dasharray="15 9" transform="translate(0 1.5)"/>'
              f'<rect x="44" y="44" width="{W-88}" height="{H-88}" rx="34" fill="none" stroke="#9a9ca1" stroke-width="3.2" stroke-dasharray="15 9" stroke-linecap="round"/></svg>')
    edge = '<div class="tex" style="box-shadow:inset 0 0 0 3px rgba(255,255,255,.06),inset 0 0 60px rgba(0,0,0,.45)"></div>'
    s = k(n, 1, .86, .8)
    cu = foil(COPPER)
    words = (f'<div style="margin-bottom:{30*s:.0f}px;filter:drop-shadow(0 1px 0 rgba(0,0,0,.6))">{logo(66 * s, "#C98B62", mode)}</div>' +
             f'<div style="font:400 {k(n,108,92,84)}px/1.05 Fraunces;font-style:italic;{cu};padding:0 10px">{E["leaders"]}</div>' +
             f'<div style="font:600 {24*s:.0f}px/1 Montserrat;letter-spacing:.42em;padding-left:.42em;text-transform:uppercase;{cu};margin-top:{18*s:.0f}px">{E["date"]}</div>')
    foot = ""
    if n == 1:
        foot = box(lay["foot"], f'<div style="font:600 22px/1 Montserrat;letter-spacing:.5em;padding-left:.5em;text-transform:uppercase;{foil(COPPER)}">{E["city"]} &nbsp;·&nbsp; {E["year"]}</div>')
    frames = [(16, "border:3px dashed #8f9196;opacity:.85"), (2, "box-shadow:0 0 0 2px rgba(0,0,0,.5),0 0 0 3px rgba(255,255,255,.08)")]
    return dict(bg="radial-gradient(120% 90% at 40% 25%,#34363a,#222326 60%,#17181a)", body=leather(W, H, 3) + edge + stitch +
                windows(lay["wins"], win_mode(mode), frames) + box(lay["text"], words) + foot)


def brass_plaque(n, mode):  # award nights, galas, milestones, university honors
    lay = LAYOUTS["card"]["n"][n]; W, H = P
    tx, ty, tw, th = lay["text"]
    if n == 1:
        pw, ph = 880, 620
        inner = (f'<div style="{ENGRAVE_F};margin-bottom:34px">{logo(62, "#3b2a0e", mode, True)}</div>' +
                 f'<div style="width:420px;height:2px;background:#5b4214;opacity:.6;margin-bottom:34px;box-shadow:0 1.5px 0 rgba(255,244,205,.6)"></div>' +
                 f'<div style="font:600 62px/1.15 Cinzel;letter-spacing:.06em;{ENGRAVE}">{E["gala"]}</div>' +
                 f'<div style="font:italic 400 40px/1.2 Garamond;{ENGRAVE};margin-top:16px">Celebrating a year of excellence</div>' +
                 f'<div style="font:600 24px/1 Cinzel;letter-spacing:.3em;padding-left:.3em;{ENGRAVE};margin-top:30px">{E["date"]}</div>')
    else:
        pw, ph = 900, k(n, 0, 270, 262)
        inner = (f'<div style="display:flex;align-items:center;gap:46px">'
                 f'<div style="{ENGRAVE_F}">{logo(44, "#3b2a0e", mode, True)}</div>'
                 f'<div style="width:2px;height:140px;background:#5b4214;opacity:.55;box-shadow:1.5px 0 0 rgba(255,244,205,.6)"></div>'
                 f'<div style="display:flex;flex-direction:column;align-items:center">'
                 f'<div style="font:600 46px/1.15 Cinzel;letter-spacing:.05em;{ENGRAVE}">{E["gala"]}</div>'
                 f'<div style="font:600 21px/1 Cinzel;letter-spacing:.3em;padding-left:.3em;{ENGRAVE};margin-top:18px">{E["date"]}</div></div></div>')
    frames = [(14, f"border:14px solid transparent;border-image:{BRASS} 1;box-shadow:0 8px 18px rgba(20,10,5,.55),inset 0 0 0 2px rgba(60,40,10,.6)")]
    return dict(bg=C["walnut"], body=walnut(W, H) + '<div class="tex" style="background:radial-gradient(90% 70% at 50% 40%,rgba(255,200,150,.10),rgba(0,0,0,.35))"></div>' +
                windows(lay["wins"], win_mode(mode), frames) + box(lay["text"], plate(pw, ph, inner, f"pl{n}")))


def letter_board(n, mode):  # company holiday parties, office parties, restaurants and cafés
    lay = LAYOUTS["panel"]["n"][n]; W, H = L
    px, py, pw, ph = lay["panel"]
    if n == 1:
        bw, bh = 480, 1000
        b = letterboard(bw, bh, ["HAPPY", "HOLIDAYS", "TEAM!", "", "12.18.27"], mode, 76, 3, 40)
        at = (px + (pw - bw) / 2, py + (ph - bh) / 2)
    elif n == 2:
        bw, bh = 780, 1000
        b = letterboard(bw, bh, ["CHEERS TO", "A GREAT YEAR", "", "HOLIDAY PARTY", "12.18.27"], mode, 86, 2, 62)
        at = (px + (pw - bw) / 2, py + (ph - bh) / 2)
    else:
        bw, bh = 815, 520
        b = letterboard(bw, bh, ["CHEERS TO", "A GREAT YEAR", "12.18.27"], mode, 64, 1, 36)
        at = (px, py)
    board = f'<div class="fr" style="left:{at[0]:.0f}px;top:{at[1]:.0f}px">{b}</div>'
    wall = paper(.12, .10) + crinkle(W, H, 71, .22, ".012", 2)
    return dict(bg=C["bone"], body=wall + board +
                windows(lay["wins"], win_mode(mode), [(10, f"border:10px solid {C['ink']};box-shadow:0 10px 22px rgba(40,30,20,.3)")]))


def color_chip(n, mode):  # brand activations, product launches, agencies
    lay = LAYOUTS["panel"]["n"][n]; W, H = L
    px, py, pw, ph = lay["panel"]
    if n == 3:
        cw, ch = 760, 460
        chip = paint_strip(cw, ch, mode, True)
        at = (px + (pw - cw) / 2, py + (ph - ch) / 2)
    else:
        cw, ch = k(n, 400, 540, 0), k(n, 1000, 1040, 0)
        chip = paint_strip(cw, ch, mode)
        at = (px + (pw - cw) / 2, py + (ph - ch) / 2)
    body = (f'<div class="fr" style="left:{at[0]:.0f}px;top:{at[1]:.0f}px;transform:rotate({k(n,-2,-2,-1.5)}deg)">{chip}</div>')
    return dict(bg=C["stone"], body=paper(.12, .08) + crinkle(W, H, 91, .18, ".02", 1.5) + body +
                windows(lay["wins"], win_mode(mode), [(10, f"border:10px solid {C['white']};box-shadow:0 10px 22px rgba(30,30,40,.18)")]))


def annual_report(n, mode):  # typographic; kickoffs, all-hands, conferences
    lay = LAYOUTS["panel"]["n"][n]; W, H = L
    px, py, pw, ph = lay["panel"]
    ink = C["ink"]
    if n == 3:
        num = f'<div style="position:absolute;right:-14px;bottom:-56px;font:800 380px/1 Archivo;font-stretch:62%;letter-spacing:-.03em;color:{ink}">2027</div>'
        info = (f'<div style="position:absolute;left:34px;top:34px">{logo(34, ink, mode)}</div>'
                f'<div style="position:absolute;left:34px;top:118px;width:300px;height:2px;background:{ink}"></div>'
                f'<div style="position:absolute;left:34px;top:138px">{ar(E["kickoff"], 34, ink, 100, 800, ".02em", "padding-left:0")}'
                f'{mono(E["date"], 17, ink, 500, ".1em", "padding-left:0;margin-top:8px")}{mono(E["city"], 17, ink, 500, ".1em", "padding-left:0")}</div>')
    else:
        fs = k(n, 470, 640, 0)
        num = (f'<div style="position:absolute;left:{k(n,-22,-30,0)}px;bottom:{k(n,-70,-90,0)}px;font:800 {fs}px/.8 Archivo;font-stretch:62%;letter-spacing:-.04em;color:{ink}">20<br>27</div>')
        info = (f'<div style="position:absolute;left:{k(n,40,56,0)}px;top:{k(n,48,60,0)}px">{logo(k(n,40,46,0), ink, mode)}</div>'
                f'<div style="position:absolute;left:{k(n,40,56,0)}px;right:{k(n,40,56,0)}px;top:{k(n,140,160,0)}px;height:2px;background:{ink}"></div>'
                f'<div style="position:absolute;left:{k(n,40,56,0)}px;top:{k(n,164,190,0)}px;display:flex;gap:40px">'
                f'<div>{ar(E["kickoff"], k(n,42,56,0), ink, 100, 800, ".02em", "padding-left:0")}</div>'
                f'<div>{mono(E["date"], k(n,18,22,0), ink, 500, ".1em", "padding-left:0")}{mono(E["city"], k(n,18,22,0), ink, 500, ".1em", "padding-left:0")}</div></div>')
    panel = (f'<div class="fr" style="left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;background:{C["vermilion"]};overflow:hidden">'
             f'{paper(.10, .05)}{num}{info}</div>')
    return dict(bg=C["paper"], body=paper(.10, .05) + panel + windows(lay["wins"], win_mode(mode), [(0, f"box-shadow:0 0 0 2px {ink}")]))


# ---------- round 2: lobby sign, dinner menu, velvet rope ----------
STEEL = "linear-gradient(180deg,#e3e6e9 0%,#959ba2 38%,#4c5258 54%,#aab0b6 74%,#596067 100%)"
STANDOFF = "filter:drop-shadow(1.5px 2px 0 rgba(70,55,40,.45)) drop-shadow(9px 14px 7px rgba(70,55,40,.32))"


def travertine(W, H, seed=13, joints=600):
    """Travertine: warm cream stone with long horizontal veins, small pits, and the joints between the slabs."""
    lines = "".join(f'<line x1="0" x2="{W}" y1="{y}" y2="{y}" stroke="#9c8c74" stroke-width="2.5" opacity=".55"/>'
                    f'<line x1="0" x2="{W}" y1="{y+2}" y2="{y+2}" stroke="#fff" stroke-width="1.2" opacity=".5"/>' for y in range(joints, H, joints))
    lines += "".join(f'<line y1="{a}" y2="{min(a + joints, H)}" x1="{x}" x2="{x}" stroke="#9c8c74" stroke-width="2.5" opacity=".55"/>'
                     for i, a in enumerate(range(0, H, joints)) for x in range(joints // 2 + (i % 2) * joints // 2, W, joints * 3 // 2))
    return (turb(W, H, ".0016 .018", seed, (.55, .44, .32), 2.2, -.95, .28, 4) +
            turb(W, H, ".003 .05", seed + 1, (.99, .96, .9), 2.0, -.95, .25, 3) +
            turb(W, H, ".05 .22", seed + 2, (.42, .35, .27), 7, -5.0, .8, 2) + paper(.12, .14) + svg(W, H, lines))


def lobby_sign(n, mode):  # conferences, offices and headquarters, galas
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    s = k(n, 1, 1.3, 1.05)
    steel = f"background:{STEEL};-webkit-background-clip:text;background-clip:text;color:transparent"
    txt = (f'<div style="{STANDOFF}">{logo(48 * s, "#1d1e20", mode)}</div>' +
           f'<div style="{STANDOFF};margin-top:{20*s:.0f}px"><div style="font:700 {124*s:.0f}px/1 Archivo;font-stretch:112%;letter-spacing:.06em;padding-left:.06em;{steel}">{E["summit"].upper()}</div></div>' +
           f'<div style="{STANDOFF};margin-top:{16*s:.0f}px"><div style="font:600 {26*s:.0f}px/1 Archivo;font-stretch:118%;letter-spacing:.42em;padding-left:.42em;color:#1d1e20">{E["dates"].upper()} &nbsp;·&nbsp; {E["city"].upper()}</div></div>')
    frames = [(10, f"border:10px solid transparent;border-image:{STEEL.replace('180deg', '135deg')} 1;box-shadow:9px 14px 16px rgba(70,55,40,.35)")]
    return dict(bg="#D9CDB8", body=travertine(W, H) + '<div class="tex" style="background:radial-gradient(70% 60% at 50% 0%,rgba(255,250,235,.35),transparent 70%),linear-gradient(180deg,transparent 60%,rgba(80,60,40,.12))"></div>' +
                windows(lay["wins"], win_mode(mode), frames) + box(lay["text"], txt))


def menu_card(w, h, mode, wide=False):
    """A letterpress dinner menu on thick cotton paper with a torn deckle edge: the logo, the dinner, and the evening's program."""
    sc = w / 480 if not wide else h / 470
    prog = [("Cocktails", "7 pm"), ("Dinner", "8 pm"), ("Toasts", "9 pm"), ("Dancing", "10 pm")]
    rows = "".join(f'<div style="display:flex;align-items:baseline;gap:12px;width:100%;font:600 {21*sc:.0f}px/1 Montserrat;letter-spacing:.2em;text-transform:uppercase;color:{C["ink"]};margin-top:{20*sc:.0f}px">'
                   f'<span>{a}</span><span style="flex:1;border-bottom:2px dotted {C["steel"]};transform:translateY(-4px)"></span>'
                   f'<span style="font:italic 400 {30*sc:.0f}px/1 Fraunces;letter-spacing:0;text-transform:none;color:{C["copper"]}">{b}</span></div>' for a, b in prog)
    head = (f'{logo(36 * sc, C["ink"], mode, True)}'
            f'<div style="width:{60*sc:.0f}px;height:2px;background:{C["copper"]};margin:{26*sc:.0f}px 0 {22*sc:.0f}px"></div>'
            f'<div style="font:italic 400 {72*sc:.0f}px/1.05 Fraunces;color:{C["ink"]}">{E["dinner"]}</div>'
            f'<div style="font:600 {18*sc:.0f}px/1 Montserrat;letter-spacing:.34em;padding-left:.36em;text-transform:uppercase;color:{C["slate"]};margin-top:{16*sc:.0f}px">{E["date"]}</div>')
    if wide:
        inner = (f'<div style="display:flex;align-items:center;gap:{50*sc:.0f}px;width:100%;padding:0 {50*sc:.0f}px">'
                 f'<div style="display:flex;flex-direction:column;align-items:center;flex:1">{head}</div>'
                 f'<div style="width:1.5px;align-self:stretch;margin:{30*sc:.0f}px 0;background:{C["concrete"]}"></div>'
                 f'<div style="display:flex;flex-direction:column;flex:1;margin-top:-{20*sc:.0f}px">{rows}</div></div>')
    else:
        inner = (f'{head}<div style="font:600 {14*sc:.0f}px/1 Montserrat;letter-spacing:.5em;padding-left:.5em;color:{C["copper"]};margin:{40*sc:.0f}px 0 {6*sc:.0f}px">· · ·</div>'
                 f'<div style="width:100%;padding:0 {34*sc:.0f}px">{rows}</div>'
                 f'<div style="font:italic 400 {26*sc:.0f}px/1 Fraunces;color:{C["slate"]};margin-top:{44*sc:.0f}px">{E["city"]}</div>')
    return (f'<div style="position:relative;width:{w}px;height:{h}px">'
            f'<div style="position:absolute;inset:0;background:#FAF7F0;filter:url(#deckle) drop-shadow(0 14px 18px rgba(0,0,0,.5)) drop-shadow(0 2px 2px rgba(0,0,0,.35))"></div>'
            f'<div style="position:absolute;inset:8px;overflow:hidden;filter:url(#deckle)">{paper(.16, .07)}{turb(w, h, ".02 .9", 81, (.4, .35, .3), 1.2, -.5, .18, 2)}</div>'
            f'<div class="tb" style="inset:0;padding:{36*sc:.0f}px 0">{inner}</div></div>')


def dinner_menu(n, mode):  # restaurants, private dinners, client dinners, galas
    lay = LAYOUTS["panel"]["n"][n]; W, H = L
    px, py, pw, ph = lay["panel"]
    if n == 3:
        cw, ch = pw - 10, ph - 10
        card = menu_card(cw, ch, mode, True)
    else:
        cw, ch = k(n, 470, 690, 0), k(n, 1080, 1090, 0)
        card = menu_card(cw, ch, mode)
    at = (px + (pw - cw) / 2, py + (ph - ch) / 2)
    slate = (turb(W, H, ".0025 .012", 101, (.6, .62, .64), 2.0, -.9, .22, 4) + turb(W, H, ".7", 102, (0, 0, 0), 1.4, -.5, .3, 2) + paper(.08, .06))
    return dict(bg="radial-gradient(110% 90% at 40% 35%,#34383c,#24272a 60%,#1b1d1f)", body=slate +
                f'<div class="fr" style="left:{at[0]:.0f}px;top:{at[1]:.0f}px;transform:rotate({k(n,-1,-1,-.6)}deg)">{card}</div>' +
                windows(lay["wins"], win_mode(mode), [(10, f"border:2px solid {C['bone']};opacity:.75")]))


def drape(W, H, seed=17, base="#1E1A1C"):
    """A velvet drape: deep vertical pleats of uneven width, each catching the light down its middle."""
    rnd = random.Random(seed); x = -20; out = []
    i = 0
    while x < W:
        w = rnd.uniform(70, 130)
        out.append(f'<linearGradient id="pl{i}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/>'
                   f'<stop offset="{rnd.uniform(.35, .6):.2f}" stop-color="#fff" stop-opacity="{rnd.uniform(.07, .14):.2f}"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>'
                   f'<rect x="{x:.1f}" y="0" width="{w+1:.1f}" height="{H}" fill="url(#pl{i})"/>')
        x += w; i += 1
    return (svg(W, H, f'<rect width="{W}" height="{H}" fill="{base}"/>' + "".join(out)) +
            turb(W, H, ".9 .05", seed + 1, (1, .9, .9), 1.4, -.55, .10, 2) +
            '<div class="tex" style="background:linear-gradient(180deg,rgba(255,255,255,.05),transparent 30%,rgba(0,0,0,.35))"></div>')


def stanchion(x, top, bottom, uid):
    """A polished brass post with a ball finial."""
    return (f'<rect x="{x-17}" y="{top}" width="34" height="{bottom-top}" fill="url(#{uid}p)"/>'
            f'<circle cx="{x}" cy="{top-6}" r="26" fill="url(#{uid}b)"/>'
            f'<rect x="{x-24}" y="{top+6}" width="48" height="14" rx="4" fill="url(#{uid}p)"/>')


def rope(x1, y1, x2, y2, sag, uid):
    """A velvet rope: an oxblood swag with a twisted nap, a sheen along its top, and brass hooks at each end."""
    d = f"M{x1} {y1} Q{(x1+x2)/2:.0f} {max(y1, y2) + sag:.0f} {x2} {y2}"
    hook = lambda x, y: f'<rect x="{x-18}" y="{y-14}" width="36" height="28" rx="9" fill="url(#{uid}p)"/>'
    return (f'<path d="{d}" fill="none" stroke="#4a0c16" stroke-width="30" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="#7d1828" stroke-width="24" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="#a3283b" stroke-width="20" stroke-dasharray="5 9" opacity=".7"/>'
            f'<path d="{d}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="5" transform="translate(0 -7)"/>' + hook(x1, y1) + hook(x2, y2))


def velvet_rope(n, mode):  # galas, VIP receptions, brand activations, premieres
    lay = LAYOUTS["band"]["n"][n]; W, H = L
    tx, ty, tw, th = lay["text"]
    sw, sh = k(n, 600, 700, 620), k(n, 200, 270, 220)
    sx, sy = (W - sw) / 2, ty + k(n, 30, 50, 40)
    pt = ty + k(n, 120, 210, 160)  # top of the side posts
    att = sy + sh + 40
    uid = f"vr{n}"
    defs = (f'<defs><linearGradient id="{uid}p" x1="0" x2="1"><stop offset="0" stop-color="#6d5321"/><stop offset=".3" stop-color="#efd99c"/>'
            f'<stop offset=".55" stop-color="#b08c42"/><stop offset="1" stop-color="#5e4519"/></linearGradient>'
            f'<radialGradient id="{uid}b" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff3c8"/><stop offset=".45" stop-color="#c9a453"/><stop offset="1" stop-color="#5e4519"/></radialGradient></defs>')
    posts = stanchion(150, pt, H + 10, uid) + stanchion(W - 150, pt, H + 10, uid) + stanchion(W / 2, sy + sh, H + 10, uid)
    ropes = rope(150 + 20, pt + 40, W / 2 - 20, att, k(n, 70, 90, 80), uid) + rope(W / 2 + 20, att, W - 150 - 20, pt + 40, k(n, 70, 90, 80), uid)
    art = (f'<svg class="tex" width="{W}" height="{H}" style="filter:drop-shadow(0 14px 12px rgba(0,0,0,.6))">{defs}{posts}{ropes}</svg>')
    s = k(n, 1, 1.25, 1.05)
    sign = (f'<div class="fr" style="left:{sx:.0f}px;top:{sy:.0f}px;width:{sw}px;height:{sh}px;padding:12px;background:{BRASS};border-radius:4px;'
            f'box-shadow:0 12px 20px rgba(0,0,0,.6),inset 0 0 0 1.5px rgba(255,240,200,.6)">'
            f'<div style="width:100%;height:100%;background:#0d0d0e;box-shadow:inset 0 2px 6px rgba(0,0,0,.9);display:flex;flex-direction:column;align-items:center;justify-content:center">'
            f'{logo(34 * s, C["bone"], mode)}'
            f'<div style="font:400 {58*s:.0f}px/1 Cinzel;letter-spacing:.08em;padding-left:.08em;color:{C["bone"]};margin-top:{18*s:.0f}px">VIP Reception</div>'
            f'<div style="font:600 {16*s:.0f}px/1 Montserrat;letter-spacing:.42em;padding-left:.42em;text-transform:uppercase;color:#d9bf86;margin-top:{14*s:.0f}px">{E["date"]}</div></div></div>')
    return dict(bg="#1E1A1C", body=drape(W, H) + paper(.08, .05) +
                windows(lay["wins"], win_mode(mode), [(10, f"border:10px solid transparent;border-image:{BRASS} 1;box-shadow:0 12px 24px rgba(0,0,0,.6)")]) + art + sign)


DESIGNS = [  # id, name, base layout, builder
    ("lobby-sign", "Lobby Sign", "band", lobby_sign),
    ("step-and-repeat", "Step and Repeat", "band", step_repeat),
    ("velvet-rope", "Velvet Rope", "band", velvet_rope),
    ("letter-board", "Letter Board", "panel", letter_board),
    ("dinner-menu", "Dinner Menu", "panel", dinner_menu),
    ("color-chip", "Color Chip", "panel", color_chip),
    ("annual-report", "Annual Report", "panel", annual_report),
    ("lanyard-badge", "Lanyard Badge", "badge", lanyard_badge),
    ("leather-folio", "Leather Folio", "tag", leather_folio),
    ("brass-plaque", "Brass Plaque", "card", brass_plaque),
]

FILTERS = babyshower.FILTERS  # chalk, stamp, felt, deckle, torn paper, wax


def page(d, n, mode):
    did, name, base, fn = d
    W, H = LAYOUTS[base]["size"]
    r = fn(n, mode)
    return (f'<!doctype html><meta charset="utf-8"><style>{FONT_CSS}{build.BASE_CSS}{LB_CSS}body{{width:{W}px;height:{H}px;background:{r["bg"]}}}</style>'
            f'<svg width="0" height="0" style="position:absolute">{build.gold_defs()}<defs>{FILTERS}</defs></svg><body>{r["body"]}</body>')


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    only = os.sys.argv[1:]
    for d in DESIGNS:
        did, name, base, _ = d
        W, H = LAYOUTS[base]["size"]
        for n in (1, 2, 3):
            for mode in ("preview", "overlay", "blank", "bare"):
                if only and did not in only: continue
                with open(os.path.join(OUT, f"{did}-{n}-{mode}.html"), "w") as f:
                    f.write(page(d, n, mode))
            manifest.append(dict(id=did, name=name, base=base, n=n, size=[W, H], category="corporate",
                                 wins=[w[:4] for w in LAYOUTS[base]["n"][n]["wins"]],
                                 shapes=[w[4] for w in LAYOUTS[base]["n"][n]["wins"]]))
    with open(os.path.join(HERE, "out-corporate", "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(len(manifest), "design versions")


if __name__ == "__main__":
    main()
