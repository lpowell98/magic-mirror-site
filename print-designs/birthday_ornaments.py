#!/usr/bin/env python3
"""Ornament strip for the Birthday review page: writes out-birthday/ornaments.html (render with Playwright)."""
import os, birthday as b
C = b.C
cells = [
    ("Confetti", b.scatter(300, 220, [], 16, [C["gold"], C["plum"], C["rose"], C["orchid"], C["honey"]], ["dot", "dash", "tri", "squig", "ring"], seed=3, gap=48, edge=20).replace('class="tex"', '')),
    ("Streamers", f'<svg width="300" height="220">{b.streamer(20, 70, 260, 40, 3, 30, C["gold"])}{b.streamer(20, 150, 260, -10, 3, 24, C["plum"])}</svg>'),
    ("Bunting", b.bunting(300, 40, 40, 6, [C["plum"], C["gold"], C["rose"], C["orchid"], C["honey"]], fw=40, fh=52).replace('class="tex"', '')),
    ("Retro rings", f'<div style="padding-top:60px">{b.rings(280, [C["plum"], C["orchid"], C["rose"], C["gold"], C["honey"]], 21)}</div>'),
    ("Marquee bulbs", f'<svg width="300" height="220" style="background:#151017">{b.bulbs(30, 30, 240, 160, 30, 30, C["gold"])}</svg>'),
    ("Candles", f'<div style="padding-top:40px">{b.candles(5, 150, C["amber"], "url(#g)")}</div>'),
]
html = (f'<!doctype html><meta charset="utf-8"><style>{b.FONT_CSS}*{{margin:0}}body{{width:2100px;height:330px;background:{C["cream"]};display:flex;gap:40px;padding:30px 40px;box-sizing:border-box}}'
        '.c{width:300px;display:flex;flex-direction:column;align-items:center}.c>div:first-child{height:220px;display:flex;align-items:center;justify-content:center}'
        f'.c p{{font:600 18px Montserrat;letter-spacing:.3em;text-transform:uppercase;color:{C["plum"]};margin-top:22px}}</style>'
        f'<svg width="0" height="0" style="position:absolute">{b.gold_defs()}</svg><body>' +
        "".join(f'<div class="c"><div>{svg}</div><p>{name}</p></div>' for name, svg in cells))
os.makedirs(os.path.join(b.HERE, "out-birthday"), exist_ok=True)
open(os.path.join(b.HERE, "out-birthday", "ornaments.html"), "w").write(html)
