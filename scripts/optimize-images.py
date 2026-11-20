#!/usr/bin/env python3
"""Build web-ready images in public/images/ from the originals in src-images/.

Usage (from the repo root):  python3 scripts/optimize-images.py
Needs Pillow (pip install pillow). Safe to re-run; output is regenerated.

Every image becomes WebP, sized for how big it is shown on the site.
Gallery and template photos also get a small "-thumb" version for the grid;
the full-size one opens in the lightbox.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "src-images", ROOT / "public" / "images"

# folder -> (max width of the full image, max width of the thumbnail or None)
SIZES = {
    "gallery": (1600, 800),
    "templates": (1200, 600),
    "about": (1000, None),
    "home": (1200, None),          # the hero is shown blurred, so it can be small
    "pricing": (900, None),
    "magic-mirror": (1000, None),
    "magic-mirror/icons": (184, None),
    "brand": (320, None),
}
KEEP_AS_IS = {"favicon.ico", "og-image.png"}  # social sites and old browsers need these formats


def save(im, dest, width):
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=80, method=6)


def main():
    before = after = 0
    for src in sorted(p for p in SRC.rglob("*") if p.is_file()):
        rel = src.relative_to(SRC)
        before += src.stat().st_size
        if src.name in KEEP_AS_IS:
            dest = OUT / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(src.read_bytes())
            after += dest.stat().st_size
            continue
        full_w, thumb_w = SIZES[str(rel.parent)]
        im = Image.open(src)
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        outs = [(OUT / rel.with_suffix(".webp"), full_w)]
        if thumb_w:
            outs.append((OUT / rel.with_name(rel.stem + "-thumb.webp"), thumb_w))
        for dest, w in outs:
            save(im, dest, w)
            after += dest.stat().st_size
    print(f"{before / 1e6:.1f} MB -> {after / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
