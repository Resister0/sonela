<p align="center">
  <img src="icons/sonela-128.png" width="96" height="96" alt="Sonela">
</p>

<h1 align="center">Sonela</h1>

<p align="center">Free, lightweight tools for PC gamers. No ads, no accounts, open source.<br>
<a href="https://sonela.app">sonela.app</a></p>

---

Sonela is a small family of free apps for PC gamers. Each one does one job, stays light on your PC while you play, and
runs on Windows and Linux.

## The apps

| App | What it does | Where |
|---|---|---|
| **Echo** | Game clip recorder: records in the background, saves the last moments with one key, trim and share. | [echoclip.link](https://echoclip.link) · [code](https://github.com/Resister0/echoclip) |
| **Sonela Aimdot** | A clean crosshair overlay for any game. | [sonela.app/aimdot](https://sonela.app/aimdot) · coming soon |
| **Sonela Lasso** | A screenshot tool: draw around it, mark it up, share it. | [sonela.app/lasso](https://sonela.app/lasso) · coming soon |

## This repo

This is the code of the [sonela.app](https://sonela.app) website: plain HTML and CSS, no JavaScript, no cookies, no
tracking. It runs as a [Cloudflare Worker](https://developers.cloudflare.com/workers/static-assets/) that only serves
the static files in `public/`.

| File | What it is |
|---|---|
| `public/` | the website: pages, `style.css`, icons, share picture, `robots.txt`, `sitemap.xml`, `_headers` (security headers) |
| `build_pages.py` | the page text and layout. Edit here, not in `public/*.html` (it writes them) |
| `seo.py` | writes the SEO block in each page's `<head>` (canonical, Open Graph, JSON-LD) + `sitemap.xml` + `robots.txt`. `--check` only reports |
| `make_images.py` | draws the icons and the share picture (SVG, turned into PNG with Inkscape) |
| `icons/` | the Sonela icon: `sonela.svg` + PNG 16-512 px + `sonela.ico` |
| `wrangler.toml` | the Worker settings (sonela.app + www.sonela.app) |

### Run it on your PC

You need [Node.js](https://nodejs.org). In this folder:

```bash
npx wrangler dev
```

Then open http://localhost:8787.

After changing the text in `build_pages.py`:

```bash
python3 build_pages.py && python3 seo.py
```

(`make_images.py` needs Python with Pillow, and Inkscape.)

## Contact

Questions, bugs and ideas: the [Discord](https://discord.gg/JPVewEfUQs) or support@echoclip.link.

## License

The website code is [MIT](LICENSE). Echo has its own license (GPL-3.0) in [its repo](https://github.com/Resister0/echoclip).
