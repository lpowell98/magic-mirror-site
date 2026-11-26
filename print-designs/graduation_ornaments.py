#!/usr/bin/env python3
"""Ornament strip for the Graduation review page: writes out-graduation/ornaments.html (render with Playwright)."""
import os, graduation as g
C = g.C
sl, c = g.seal(70, "os", "HARBOR UNIVERSITY")
es = g.emboss_seal(95, "oe", "Harbor University", C["stock"])
tas = g.tassel(300, 220, 150, 0, 40, 60, 110, seed=7).replace('class="fr"', '').replace("left:0;top:0;", "")
stamp = (f'<div style="transform:rotate(-5deg);filter:url(#stamp);border:7px double {C["stamp"]};padding:10px 24px 4px;border-radius:6px;'
         f'font:700 34px/1.1 Courier;white-space:nowrap;color:{C["stamp"]};letter-spacing:.06em">JUN 12 2027</div>')
cells = [
    ("Engraved border + seal", f'<div style="position:relative;width:300px;height:220px"><svg width="300" height="220" style="position:absolute;inset:0">{g.guilloche(300, 220, 12, 22, C["brass"])}</svg>'
                               f'<div style="position:absolute;left:{150-c:.0f}px;top:{100-c:.0f}px">{sl}</div></div>', C["parchment"]),
    ("Chalk", f'<div style="font:600 58px/1 Caveat;white-space:nowrap;color:{C["chalk"]};filter:url(#chalk)">Class of 2027</div>', C["slate"]),
    ("Felt pennant", f'<div style="transform:rotate(-4deg) scale(.95)">{g.pennant(250, 80, C["tassel"], "#c99a2e", "HARBOR", "CLASS OF 2027", C["blue_dk"], "op")}</div>', C["blue"]),
    ("Tassel and charm", tas, C["ivy"]),
    ("Blind emboss", es, C["stock"]),
    ("Chenille letter", g.chenille("M", 170, C["cream"], C["tassel"], C["cardinal_dk"]), C["cardinal"]),
    ("Composition marble", f'<div style="position:relative;width:300px;height:220px;overflow:hidden">{g.marble(300, 220, 12).replace("class=\"tex\"", "")}</div>', "#111"),
    ("Rubber stamp", stamp, C["manila"]),
]
html = (f'<!doctype html><meta charset="utf-8"><style>{g.FONT_CSS}*{{margin:0}}body{{width:2800px;height:330px;background:#f2efe9;display:flex;gap:40px;padding:30px 40px;box-sizing:border-box}}'
        '.c{width:300px;display:flex;flex-direction:column;align-items:center}.c>div:first-child{width:300px;height:220px;display:flex;align-items:center;justify-content:center;border-radius:6px;overflow:hidden}'
        f'.c p{{font:600 15px Montserrat;letter-spacing:.2em;text-transform:uppercase;color:{C["ink"]};margin-top:22px;white-space:nowrap}}</style>'
        f'<svg width="0" height="0" style="position:absolute">{g.gold_defs()}<defs>{g.FILTERS}</defs></svg><body>' +
        "".join(f'<div class="c"><div style="background:{bg}">{s}</div><p>{name}</p></div>' for name, s, bg in cells))
os.makedirs(os.path.join(g.HERE, "out-graduation"), exist_ok=True)
open(os.path.join(g.HERE, "out-graduation", "ornaments.html"), "w").write(html)
