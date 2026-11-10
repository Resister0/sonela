#!/usr/bin/env python3
"""Draws the hub's icons + share picture into public/. Run again after a brand or design change.

    python3 make_images.py

Writes: icons/ (the full Sonela icon set: sonela.svg master, PNG 16-512, sonela.ico 16-256), favicon.svg, favicon.ico (16-48), icon-192.png, icon-512.png, apple-touch-icon.png (180), og.png (1200x630),
site.webmanifest. The pictures are SVG, turned into PNG with Inkscape (Linux: the `inkscape` package); the .ico needs Pillow.
The look: dark only, neutral brand (a white "S" tile on graphite), colour only from the apps (Echo purple, Aimdot coral,
Lasso teal) - same as style.css.
"""
import base64, json, pathlib, shutil, subprocess, sys, tempfile
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from seo import BRAND, SITE  # noqa: E402

BG, INK, MUTED, CARD, LINE = "#111317", "#f2f3f5", "#9aa1ab", "#181b20", "#262a31"
ECHO, AIMDOT, LASSO = "#7c5cff", "#ef6a4c", "#14a38b"
S_PATH = "M42 21c-3-4-17-5-18 2s18 7 17 15-15 6-18 2"
FONT = "Inter, 'Segoe UI', sans-serif"

# The Sonela icon (10 Nov 2026): a white tile filling the whole square, a graphite S.
TILE = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" '
        f'fill="{INK}"/><path d="{S_PATH}" fill="none" stroke="{BG}" stroke-width="6" stroke-linecap="round"/></svg>\n')
# 16 + 24 px get a thicker S, so it stays readable in a tab or the tray
TILE_SMALL = TILE.replace('stroke-width="6"', 'stroke-width="8"')
ICON_DIR = SITE.parent / "icons"            # the full icon set (GitHub avatar, folder icon, ...): not served by the site
ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
# apple-touch: iOS rounds the corners itself, so a full square
SQUARE = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{INK}"/>'
          f'<path d="{S_PATH}" fill="none" stroke="{BG}" stroke-width="6" stroke-linecap="round"/></svg>\n')


HERE = pathlib.Path(__file__).resolve().parent
# the apps' real icons for the share picture: Echo's (from echoclip.link), Aimdot's (public/aimdot.svg, copied from the
# Aimdot repo), Lasso's stand-in (teal tile with the site's Lasso glyph - not a final icon)
APP_ICONS = {"Echo": HERE / ".github/readme/echo.png", "Aimdot": SITE / "aimdot.svg", "Lasso": HERE / ".github/readme/lasso.png"}


def data_uri(path):
    kind = "image/svg+xml" if path.suffix == ".svg" else "image/png"
    return f"data:{kind};base64," + base64.b64encode(path.read_bytes()).decode()


def chip(x, name, sub, colour, live):
    w = 320
    fill = f'fill="{colour}" fill-opacity="0.16"' if live else f'fill="{CARD}"'
    return (f'<rect x="{x}" y="380" width="{w}" height="112" rx="20" {fill} stroke="{colour}" stroke-width="3"/>'
            f'<image x="{x + 22}" y="408" width="56" height="56" href="{data_uri(APP_ICONS[name])}"/>'
            f'<text x="{x + 94}" y="428" font-family="{FONT}" font-size="34" font-weight="700" fill="{INK}">{name}</text>'
            f'<text x="{x + 94}" y="466" font-family="{FONT}" font-size="22" font-weight="500" fill="{MUTED}">{sub}</text>')


OG = (f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'
      f'<rect width="1200" height="630" fill="{BG}"/>'
      f'<g transform="translate(90 118) scale(2.35)"><rect width="64" height="64" rx="18" fill="{INK}"/>'
      f'<path d="{S_PATH}" fill="none" stroke="{BG}" stroke-width="6" stroke-linecap="round"/></g>'
      f'<text x="270" y="222" font-family="{FONT}" font-size="108" font-weight="700" letter-spacing="-3" fill="{INK}">{BRAND}</text>'
      f'<text x="274" y="282" font-family="{FONT}" font-size="38" font-weight="500" fill="{MUTED}">Free, lightweight tools for PC gamers</text>'
      + chip(90, "Echo", "clips · out now", ECHO, True)
      + chip(420, "Aimdot", "crosshair · soon", AIMDOT, False)
      + chip(750, "Lasso", "screenshots · soon", LASSO, False)
      + f'<text x="90" y="560" font-family="{FONT}" font-size="28" font-weight="600" fill="{MUTED}">Free · No ads · Open source · Windows &amp; Linux</text>'
      '</svg>\n')


def png(svg_text, out, w, h=None):
    inkscape = shutil.which("inkscape")
    if not inkscape:
        sys.exit("needs Inkscape to turn the SVGs into PNG (sudo dnf install inkscape)")
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg_text)
    args = [inkscape, f.name, "--export-type=png", f"--export-filename={out}", f"--export-width={w}"]
    if h:
        args.append(f"--export-height={h}")
    subprocess.run(args, check=True, capture_output=True)
    pathlib.Path(f.name).unlink()


def main():
    (SITE / "favicon.svg").write_text(TILE, encoding="utf-8")
    png(TILE, SITE / "icon-512.png", 512)
    png(TILE, SITE / "icon-192.png", 192)
    png(SQUARE, SITE / "apple-touch-icon.png", 180)
    # full icon set: icons/sonela.svg (master), sonela-small.svg, sonela-<size>.png, sonela.ico (each size rendered on its own)
    ICON_DIR.mkdir(exist_ok=True)
    (ICON_DIR / "sonela.svg").write_text(TILE, encoding="utf-8")
    (ICON_DIR / "sonela-small.svg").write_text(TILE_SMALL, encoding="utf-8")
    for s in ICON_SIZES:
        png(TILE_SMALL if s <= 24 else TILE, ICON_DIR / f"sonela-{s}.png", s, s)
    ico = [Image.open(ICON_DIR / f"sonela-{s}.png").convert("RGBA") for s in ICO_SIZES]
    ico[-1].save(ICON_DIR / "sonela.ico", sizes=[(s, s) for s in ICO_SIZES], append_images=ico[:-1])
    fav = [im for im in ico if im.width <= 48]
    fav[-1].save(SITE / "favicon.ico", sizes=[(im.width, im.width) for im in fav], append_images=fav[:-1])
    png(OG, SITE / "og.png", 1200, 630)
    manifest = {"name": BRAND, "short_name": BRAND, "start_url": "/", "display": "browser",
                "background_color": BG, "theme_color": BG,
                "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
                          {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}]}
    (SITE / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("wrote favicon.svg, favicon.ico, icon-192/512.png, apple-touch-icon.png, og.png, site.webmanifest")


if __name__ == "__main__":
    main()
