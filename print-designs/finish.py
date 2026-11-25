#!/usr/bin/env python3
"""Cuts the photo windows out of the overlay PNGs (transparent, for the booth software)
and writes print-ready files to final/<id>/ plus web previews to final/web/."""
import json, os
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
man = json.load(open(os.path.join(HERE, "out", "manifest.json")))
FIN = os.path.join(HERE, "final"); os.makedirs(os.path.join(FIN, "web"), exist_ok=True)
import sys
only = sys.argv[1:]
for m in man:
    if only and m["id"] not in only: continue
    did, n = m["id"], m["n"]
    os.makedirs(os.path.join(FIN, did), exist_ok=True)
    src = lambda mode: Image.open(os.path.join(HERE, "out", "png", f"{did}-{n}-{mode}.png"))
    ov = src("overlay").convert("RGBA")
    S = 4  # supersampled mask for smooth arch edges
    mask = Image.new("L", (ov.width * S, ov.height * S), 255)
    d = ImageDraw.Draw(mask)
    for (x, y, w, h), sh in zip(m["wins"], m["shapes"]):
        if sh == "a":
            d.rectangle([x * S, (y + w / 2) * S, (x + w) * S - 1, (y + h) * S - 1], fill=0)
            d.ellipse([x * S, y * S, (x + w) * S - 1, (y + w) * S - 1], fill=0)
        elif sh == "c":
            import build
            pts = [(x + px, y + py) for px, py in (tuple(map(float, q.split(","))) for q in build.chamfer_pts(w, h, build.CUT).split())]
            d.polygon([(px * S, py * S) for px, py in pts], fill=0)
        else:
            d.rectangle([x * S, y * S, (x + w) * S - 1, (y + h) * S - 1], fill=0)
    ov.putalpha(mask.resize(ov.size, Image.LANCZOS))
    ov.save(os.path.join(FIN, did, f"{did}-{n}photo-overlay.png"), dpi=(300, 300), optimize=True)
    src("blank").convert("RGB").save(os.path.join(FIN, did, f"{did}-{n}photo.png"), dpi=(300, 300), optimize=True)
    pv = src("preview").convert("RGB")
    pv.save(os.path.join(FIN, did, f"{did}-{n}photo-sample.jpg"), quality=90, dpi=(300, 300))
    w = 900 if pv.width > pv.height else 600
    pv.resize((w, round(pv.height * w / pv.width)), Image.LANCZOS).save(os.path.join(FIN, "web", f"{did}-{n}.webp"), quality=84)
json.dump(man, open(os.path.join(FIN, "manifest.json"), "w"), indent=1)
print("done", len(man))
