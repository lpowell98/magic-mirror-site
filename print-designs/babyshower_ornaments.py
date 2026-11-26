#!/usr/bin/env python3
"""Ornament strip for the Baby shower review page: writes out-babyshower/ornaments.html (render with Playwright)."""
import os, babyshower as b
C = b.C
sv = lambda inner, w=300, h=220: f'<svg width="{w}" height="{h}">{inner}</svg>'
stars = "".join(b.star4(x, y, 12, C["dusk"], r, .6) for x, y, r in ((60, 50, 5), (170, 40, -8), (250, 120, 10), (110, 150, 0), (200, 190, -5))) + \
        "".join(f'<circle cx="{x}" cy="{y}" r="4.5" fill="{C["rose"]}" opacity=".6"/>' for x, y in ((130, 90), (40, 180), (260, 50)))
cells = [
    ("Muslin print", f'<div style="position:relative;width:300px;height:220px">{b.weave(.45, ".7 .05", 3)}{sv(stars)}</div>', C["oat"]),
    ("Letter beads", sv(b.bead_string("BABY", 150, 100, 290, 46, 14, "ob")), C["cream"]),
    ("Gingham label", f'<div style="width:300px;height:220px;display:flex;align-items:center;justify-content:center;background:{b.gingham("#7f9fbc", 18, .36)},{C["cotton"]}">'
                      f'{b.label(240, 110, b.ser(52) and f"""<div style="{b.ser(52)};color:{C["cocoa"]}">Bennett</div>""")}</div>', C["cotton"]),
    ("Alphabet block", sv(b.wood_defs("ob") + b.block(95, 70, 110, "B", C["rose_dk"], C["dusk"], "star", "ob", -4)), C["powder"]),
    ("Felt mobile", sv(b.mobile(150, 20, 20, .5, "om")), C["powder"]),
    ("Eyelet lace", sv(b.eyelets(600, 220, -1, "oe"), 300, 220), "#C8D8E5"),
    ("Cross-stitch", sv("".join(o for o in [None] if o) + (lambda st: (b.xstitch("OH", 60, 60, 16, C["rose_dk"], "#86524f", st), b.xstitch("♥", 236, 76, 12, C["sage_dk"], "#566650", st), "".join(st))[-1])([])), "#F1EADC"),
    ("Pressed baby's breath", sv(b.sprig(150, 210, 70, -90, 4, .8)), "#F6F4EC"),
    ("Stamp and postmark", f'<div style="position:relative;width:300px;height:220px"><div style="position:absolute;left:150px;top:30px">{b.postage_stamp(120, 150, "ops")}</div>'
                           f'<div style="position:absolute;left:60px;top:70px;opacity:.85">{b.postmark(62, "SPECIAL DELIVERY · SPECIAL DELIVERY ·", "#6d6a7c", "opm", 3, 60)}</div></div>', C["cotton"]),
]
html = (f'<!doctype html><meta charset="utf-8"><style>{b.FONT_CSS}*{{margin:0}}.tex{{position:absolute;inset:0}}body{{width:3160px;height:330px;background:#f2efe9;display:flex;gap:40px;padding:30px 40px;box-sizing:border-box}}'
        '.c{width:300px;display:flex;flex-direction:column;align-items:center}.c>div:first-child{width:300px;height:220px;display:flex;align-items:center;justify-content:center;border-radius:6px;overflow:hidden;position:relative}'
        f'.c p{{font:600 15px Montserrat;letter-spacing:.2em;text-transform:uppercase;color:{C["cocoa"]};margin-top:22px;white-space:nowrap}}</style>'
        f'<svg width="0" height="0" style="position:absolute"><defs>{b.FILTERS}</defs></svg><body>' +
        "".join(f'<div class="c"><div style="background:{bg}">{s}</div><p>{name}</p></div>' for name, s, bg in cells))
os.makedirs(os.path.join(b.HERE, "out-babyshower"), exist_ok=True)
open(os.path.join(b.HERE, "out-babyshower", "ornaments.html"), "w").write(html)
