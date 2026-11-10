#!/usr/bin/env python3
"""Writes the hub's pages (the visible text + layout) into a folder.

    python3 build_pages.py && python3 make_images.py && python3 seo.py

This is the source of the page text: edit here, not in public/*.html (this script overwrites them; seo.py then adds the
SEO block to each <head>). Pages: home (E style: three app tiles), about (F style: split), aimdot + lasso (app pages,
"coming soon" for now), privacy, 404.
"""
import pathlib, sys
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent / "public")
DISCORD = "https://discord.gg/JPVewEfUQs"
S_LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="18" fill="#f2f3f5"/><path d="M42 21c-3-4-17-5-18 2s18 7 17 15-15 6-18 2" fill="none" stroke="#111317" stroke-width="6" stroke-linecap="round"/></svg>'
WORD = '<span class="wordmark">sonela<i>.</i><i>.</i><i>.</i></span>'
ECHO = '<svg viewBox="0 0 256 256" aria-hidden="true"><circle cx="128" cy="128" r="80" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" stroke-dasharray="390 503" transform="rotate(-200 128 128)"/><path d="M48 104 L58 70 L82 96 Z" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M106 86 L176 128 L106 170 Z" fill="#fff" stroke="#fff" stroke-width="12" stroke-linejoin="round"/></svg>'
AIM = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1" fill="#fff"/></svg>'
LASSO = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 6.5C7 3.5 17.5 3 19 7.5s-5 8.5-10 7.5S3 9.5 5 6.5z" stroke-dasharray="3 2.6"/><path d="M9.5 15c-.5 2 .5 4 2.5 5.5"/></svg>'
def head(title, desc, nav_on=""):
    on = lambda h: ' class="on"' if h == nav_on else ''
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#111317">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header><div class="wrap">
  <a class="brand" href="/">{S_LOGO}Sonela</a>
  <nav>
    <a href="/#apps"{on("apps")}>Apps</a>
    <a href="/about"{on("about")}>About</a>
    <a href="https://github.com/Resister0/sonela" class="hide-s">GitHub</a>
  </nav>
</div></header>
<main>
'''
FOOT = f'''</main>
<footer><div class="wrap">
  {WORD}
  <span>© 2026 Sonela · Made by Resister0</span>
  <nav>
    <a href="/about">About</a>
    <a href="/privacy">Privacy</a>
    <a href="https://echoclip.link/">Echo</a>
    <a href="https://github.com/Resister0/sonela">GitHub</a>
    <a href="https://discord.gg/JPVewEfUQs">Discord</a>
  </nav>
</div></footer>
</body>
</html>
'''
index = head("Sonela - free, lightweight tools for PC gamers",
 "Free, open-source gaming tools that stay light on your PC: Echo the game clip recorder, the Aimdot crosshair and the Lasso screenshot tool. No ads.", "apps") + f'''<section class="hero">
  <div class="wrap">
    <h1>Tools that stay out<br>of your game's way.</h1>
    <p>Free, open-source apps for PC gamers. Light, quick, no ads. Windows and Linux.</p>
  </div>
</section>

<section id="apps">
  <div class="wrap">
    <div class="tiles">
      <article class="tile echo">
        <span class="ico">{ECHO}</span>
        <h2>Echo</h2>
        <span class="sub">Game clip recorder</span>
        <p>Records your game in the background and saves the last moments with one key. Trim, caption and share on Discord.</p>
        <div class="nums">
          <div><b>~150 MB</b><small>memory while recording</small></div>
          <div><b>0.6 %</b><small>CPU while recording</small></div>
          <div><b>0</b><small>ads or accounts needed</small></div>
        </div>
        <div class="foot"><span class="tag out">Out now · 2.0</span><a class="app-link" href="https://echoclip.link/">echoclip.link →</a></div>
      </article>
      <article class="tile aimdot">
        <span class="ico">{AIM}</span>
        <h2>Aimdot</h2>
        <span class="sub">Crosshair overlay</span>
        <p>A clean crosshair on top of any game. Pick the shape, colour and size, and turn it on or off with a hotkey.</p>
        <div class="foot"><span class="tag">Coming soon</span><a class="app-link" href="/aimdot">sonela.app/aimdot →</a></div>
      </article>
      <article class="tile lasso">
        <span class="ico">{LASSO}</span>
        <h2>Lasso</h2>
        <span class="sub">Screenshot tool</span>
        <p>Draw around any part of the screen, mark it up, then copy, save or share it. Light enough to leave running all the time.</p>
        <div class="foot"><span class="tag">Coming soon</span><a class="app-link" href="/lasso">sonela.app/lasso →</a></div>
      </article>
    </div>

    <div class="why">
      <div><h3>Light on your PC</h3><p>Native apps built in Rust, not a web browser in disguise. Echo uses about 150 MB of memory while recording.</p></div>
      <div><h3>Free, no catch</h3><p>No ads, no tracking and no paid version of the apps. Echo's optional cloud storage has paid plans for more space.</p></div>
      <div><h3>Open source</h3><p>The code is on GitHub under the GPL-3.0 licence, so anyone can check what the apps do.</p></div>
      <div><h3>Windows and Linux</h3><p>Windows 10 and 11, and Linux, including Steam Deck and Bazzite through Flatpak.</p></div>
    </div>
  </div>
</section>
''' + FOOT
about = head("About Sonela - who makes Echo, Aimdot and Lasso",
 "Sonela is a small family of free, open-source PC gaming tools made by one independent developer: Echo, Aimdot and Lasso.", "about") + f'''<section class="wrap split">
  <div>
    <h1>Small tools.<br>Big games.</h1>
    <p class="lead">Sonela makes free, open-source apps for PC gamers, made by Resister0, one independent developer. The apps are native, do one job each, and stay light on your PC while you play.</p>
    <a class="btn" href="https://echoclip.link/">Get Echo</a>
  </div>
  <div class="stack">
    <a class="row echo" href="https://echoclip.link/"><span class="ico">{ECHO}</span><span><b>Echo</b><span class="tag out">Out now · 2.0</span><span class="d">Game clip recorder for Windows and Linux.</span></span></a>
    <a class="row aimdot" href="/aimdot"><span class="ico">{AIM}</span><span><b>Aimdot</b><span class="tag">Coming soon</span><span class="d">A crosshair overlay for any game.</span></span></a>
    <a class="row lasso" href="/lasso"><span class="ico">{LASSO}</span><span><b>Lasso</b><span class="tag">Coming soon</span><span class="d">A screenshot tool: draw around it, mark it up, share it.</span></span></a>
  </div>
</section>

<article class="doc doc-tight">
  <h2>Free and open source</h2>
  <p>The apps are free, with no ads and no tracking. Echo's code is public on <a href="https://github.com/Resister0/echoclip">GitHub</a>
    under the GPL-3.0 licence, and <a href="https://github.com/Resister0/sonela">this website's code</a> is there too (MIT licence). Echo Cloud, Echo's optional clip storage, has paid plans for people who want more space; that is
    what pays for the servers.</p>
  <h2>Get in touch</h2>
  <p>Questions, bugs and ideas: the <a href="https://discord.gg/JPVewEfUQs">Discord</a> or
    <a href="mailto:support@echoclip.link">support@echoclip.link</a>.</p>
</article>
''' + FOOT
privacy = head("Privacy - Sonela",
 "The Sonela website has no cookies, analytics, trackers or forms. It collects nothing about you. Each app has its own privacy policy.") + '''<article class="doc">
  <h1>Privacy</h1>
  <p class="updated">Last updated: 10 November 2026</p>
  <p>This website collects nothing about you. It has no cookies, no analytics, no trackers, no ads, no embedded videos or fonts
    from other sites, and no forms. It is plain pages.</p>
  <p>The pages are served by Cloudflare. Like any web host, Cloudflare needs your IP address to send you the page, and may keep
    it in short-lived logs to keep the service running and safe. We only see total numbers (for example how many requests the site
    got in a day), never anything about one visitor.</p>
  <p>Links to other sites (echoclip.link, GitHub, Discord) take you to those sites, and their own privacy policies apply there.</p>
  <h2>The apps</h2>
  <p>Each app has its own privacy policy, on its own website. Echo's is at
    <a href="https://echoclip.link/privacy">echoclip.link/privacy</a>.</p>
  <h2>Contact</h2>
  <p><a href="mailto:support@echoclip.link">support@echoclip.link</a></p>
</article>
''' + FOOT
nf = head("Page not found - Sonela",
 "This page does not exist. Sonela makes free, lightweight tools for PC gamers: Echo, Aimdot and Lasso.") + '''<section class="hero">
  <div class="wrap">
    <h1>Nothing here.</h1>
    <p>This page doesn't exist. Maybe it moved, or the link has a typo.</p>
    <p class="cta"><a class="btn" href="/">Go to the home page</a> <a class="btn ghost" href="https://echoclip.link/">Get Echo</a></p>
  </div>
</section>
''' + FOOT
def app_page(key, name, icon, title, desc, kind, lead, points):
    """A simple page for an app that isn't out yet: big icon, one line, a greyed-out download, Discord for news."""
    feats = "\n".join(f'      <div><h3>{h}</h3><p>{t}</p></div>' for h, t in points)
    return head(title, desc, "apps") + f'''<section class="app-hero {key}">
  <div class="wrap">
    <span class="ico big">{icon}</span>
    <p class="kicker">Sonela {name} · {kind}</p>
    <h1>{name}</h1>
    <p class="lead">{lead}</p>
    <p class="cta"><span class="btn off" aria-disabled="true">Download · coming soon</span>
      <a class="btn ghost" href="{DISCORD}">Get news on Discord</a></p>
    <p class="note">Free and open source. Windows and Linux. No ads, no account.</p>
  </div>
</section>

<section class="{key}">
  <div class="wrap">
    <div class="feats">
{feats}
    </div>
    <p class="back"><a href="/#apps">← All Sonela apps</a></p>
  </div>
</section>
''' + FOOT

aimdot = app_page("aimdot", "Aimdot", AIM,
 "Sonela Aimdot - a free crosshair overlay for PC games",
 "Sonela Aimdot puts a clean crosshair on top of any PC game. Free, open source and light, for Windows and Linux. Coming soon.",
 "Crosshair overlay",
 "A clean crosshair on top of any game. Pick the shape, colour and size, and turn it on or off with a hotkey.",
 [("Your crosshair", "Choose the shape, colour and size so it's easy to see in every game."),
  ("One hotkey", "Turn it on or off without leaving the game."),
  ("Light", "A small native app, like Echo. It stays out of the way while you play.")])

lasso = app_page("lasso", "Lasso", LASSO,
 "Sonela Lasso - a free screenshot tool for Windows and Linux",
 "Sonela Lasso: draw around any part of the screen, mark it up, then copy, save or share it. Free and open source. Coming soon.",
 "Screenshot tool",
 "Draw around any part of the screen, mark it up, then copy, save or share it. Light enough to leave running all the time.",
 [("Draw around it", "Grab exactly the part of the screen you want, any shape."),
  ("Mark it up", "Arrows, boxes and text before you send it."),
  ("Copy, save or share", "Straight to the clipboard or a file, or share it in a click.")])

for n, t in [("index.html", index), ("about.html", about), ("aimdot.html", aimdot), ("lasso.html", lasso),
             ("privacy.html", privacy), ("404.html", nf)]:
    (OUT / n).write_text(t, encoding="utf-8")
print("pages written")
