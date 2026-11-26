#!/usr/bin/env python3
"""Ornament strip for the Holiday review page: writes out-holiday/ornaments.html (render with Playwright)."""
import os, random, holiday as h
from birthday import scatter
C = h.C
rb = []; h.branch(290, 10, 2.6, 110, 14, 6, random.Random(3), rb, C["bone"])
fi, fh = h.fairisle(300, 14, [("zig", 3), ("star", 9), ("zig", 3)], C["snow"])
cells = [
    ("Papercut pines", f'<svg width="300" height="220" style="filter:drop-shadow(0 4px 5px rgba(10,30,25,.25))">{h.pine(70,215,170,C["sage"],4,1)}{h.pine(160,215,210,C["pine"],5,2)}{h.pine(245,215,150,C["spruce"],4,3)}</svg>', "#EEF3F4"),
    ("Evergreen wreath", f'<div style="transform:scale(.55)">{h.wreath(150, 52, 4)}</div>', "#FAF8F4"),
    ("Fair isle knit", f'<svg width="300" height="220" style="background:{C["claret"]}">{fi}</svg>', C["claret"]),
    ("Ice crystals", f'<svg width="300" height="220">{h.snowflake(95,110,80,C["frost"],3,1)}{h.snowflake(225,70,40,C["silver"],2.2,4)}{h.snowflake(230,170,30,C["silver"],2.2,7)}</svg>', C["navy"]),
    ("Fireworks", f'<svg width="300" height="220">{h.gold_defs()}{h.burst(110,110,85,"url(#g)",28,1,2.6)}{h.burst(240,70,40,C["silver"],20,2,2)}</svg>', C["midnight"]),
    ("Midnight clock", f'<div>{h.clock(100, "url(#g)")}</div>', C["midnight"]),
    ("Moon and bough", f'<svg width="300" height="220" style="overflow:hidden">{rb and ""}</svg>'.replace('</svg>', '') + f'<foreignObject/></svg>', C["night"]),
]
cells[-1] = ("Moon and bough", f'<div style="position:relative;width:300px;height:220px;overflow:hidden"><div style="position:absolute;left:70px;top:20px">{h.moon(90)}</div>'
             f'<svg style="position:absolute;inset:0" width="300" height="220">{"".join(rb).replace(C["bone"], "#0b070d")}</svg></div>', C["night"])
html = (f'<!doctype html><meta charset="utf-8"><style>{h.FONT_CSS}*{{margin:0}}body{{width:2460px;height:330px;background:#f2efe9;display:flex;gap:40px;padding:30px 40px;box-sizing:border-box}}'
        '.c{width:300px;display:flex;flex-direction:column;align-items:center}.c>div:first-child{width:300px;height:220px;display:flex;align-items:center;justify-content:center;border-radius:6px;overflow:hidden}'
        f'.c p{{font:600 16px Montserrat;letter-spacing:.26em;text-transform:uppercase;color:{C["ink"]};margin-top:22px}}</style>'
        f'<svg width="0" height="0" style="position:absolute">{h.gold_defs()}</svg><body>' +
        "".join(f'<div class="c"><div style="background:{bg}">{s}</div><p>{name}</p></div>' for name, s, bg in cells))
os.makedirs(os.path.join(h.HERE, "out-holiday"), exist_ok=True)
open(os.path.join(h.HERE, "out-holiday", "ornaments.html"), "w").write(html)
