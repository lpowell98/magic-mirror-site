#!/usr/bin/env python3
"""Ornament strip for the Corporate review page: writes out-corporate/ornaments.html (render with Playwright)."""
import os, corporate as c
from build import paper
C = c.C
glow = f"color:#FFE3EC;text-shadow:0 0 4px #fff,0 0 10px {C['neon']},0 0 22px {C['neon']},0 0 46px {C['neon']},0 0 80px #ff2a6d"
cells = [
    ("Logo spot", c.logo(40, C["ink"], "preview", True), C["paper"]),
    ("Split-flap", f'<div class="board" style="transform:scale(.8)">{c.flap_row("2027", 4, 52, 76, 56)}</div>', "#18191B"),
    ("Neon on brick", f'<div style="position:absolute;inset:0">{c.bricks(300, 220, 5)}</div><div style="position:relative;font:400 74px/1 Neon;{glow}">Cheers!</div>', "#121213"),
    ("Letter board", c.letterboard(250, 170, ["HELLO", "TEAM!"], "preview", 52), C["bone"]),
    ("Matchbook", c.matchbook(130, 176, "preview", -6), C["paper"]),
    ("Paint chip", f'<div style="transform:scale(.36) rotate(-2deg);flex:none">{c.paint_strip(330, 560, "preview")}</div>', C["stone"]),
    ("Brass plate", c.plate(250, 120, f'<div style="font:600 24px/1.2 Cinzel;{c.ENGRAVE}">Annual Gala</div>', "o"), C["walnut"]),
    ("Leather and stitch", f'<div style="position:absolute;inset:0">{c.leather(300, 220, 5)}</div><svg width="260" height="180" style="position:relative"><rect x="4" y="4" width="252" height="172" rx="18" fill="none" stroke="#9a9ca1" stroke-width="3" stroke-dasharray="12 8"/></svg>'
     f'<div style="position:absolute;font:italic 400 40px Fraunces;{c.foil(c.COPPER)}">Summit</div>', "#26272A"),
    ("Annual report type", f'<div style="font:800 170px/.8 Archivo;font-stretch:62%;letter-spacing:-.04em;color:{C["ink"]}">27</div>', C["vermilion"]),
]
html = (f'<!doctype html><meta charset="utf-8"><style>{c.FONT_CSS}{c.FLAP_CSS}*{{margin:0;box-sizing:border-box}}.tex{{position:absolute;inset:0}}.tb{{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}}'
        'body{width:3160px;height:330px;background:#f2efe9;display:flex;gap:40px;padding:30px 40px}'
        '.c{width:300px;display:flex;flex-direction:column;align-items:center}.c>div:first-child{width:300px;height:220px;display:flex;align-items:center;justify-content:center;border-radius:6px;overflow:hidden;position:relative}'
        f'.c p{{font:600 15px Montserrat;letter-spacing:.2em;text-transform:uppercase;color:{C["ink"]};margin-top:22px;white-space:nowrap}}</style>'
        f'<svg width="0" height="0" style="position:absolute"><defs>{c.FILTERS}</defs></svg><body>' +
        "".join(f'<div class="c"><div style="background:{bg}">{s}</div><p>{name}</p></div>' for name, s, bg in cells))
os.makedirs(os.path.join(c.HERE, "out-corporate"), exist_ok=True)
open(os.path.join(c.HERE, "out-corporate", "ornaments.html"), "w").write(html)
