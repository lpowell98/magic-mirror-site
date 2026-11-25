#!/usr/bin/env python3
"""Contact sheet: one row per design, its 1, 2 and 3 photo versions side by side.
Usage: python3 sheet.py OUT.jpg [design-id ...]"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
man = json.load(open(os.path.join(HERE, "out", "manifest.json")))
ids = sys.argv[2:] or list(dict.fromkeys(m["id"] for m in man))
RH, PAD = 560, 40
font = ImageFont.truetype(os.path.join(HERE, "fonts", "Montserrat.ttf"), 30)
rows = []
for did in ids:
    ims = [Image.open(os.path.join(HERE, "out", "png", f"{did}-{n}-preview.png")).convert("RGB") for n in (1, 2, 3)]
    ims = [i.resize((round(i.width * RH / i.height), RH), Image.LANCZOS) for i in ims]
    name = next(m["name"] for m in man if m["id"] == did)
    rows.append((name, ims))
W = max(sum(i.width for i in r[1]) + PAD * (len(r[1]) + 1) for r in rows)
H = len(rows) * (RH + PAD + 60) + PAD
sheet = Image.new("RGB", (W, H), "#e9e6e1")
d = ImageDraw.Draw(sheet)
y = PAD
for name, ims in rows:
    d.text((PAD, y), name, fill="#222", font=font)
    x = PAD
    for n, i in enumerate(ims, 1):
        sheet.paste(i, (x, y + 50))
        x += i.width + PAD
    y += RH + PAD + 60
sheet.save(sys.argv[1], quality=88)
