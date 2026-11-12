#!/usr/bin/env python3
"""Writes the hub's pages (the visible text + layout) into a folder.

    python3 build_pages.py && python3 make_images.py && python3 seo.py

This is the source of the page text: edit here, not in public/*.html (this script overwrites them; seo.py then adds the
SEO block to each <head>, right before the first stylesheet). Redesign 11 Nov 2026: the same look as echoclip.link
(the taste-skill kit in public/assets/ + public/sonela.css), dark. Pages: home, about, aimdot, lasso, privacy, 404.
src/worker.js fills two things on /aimdot and /lasso at request time, never edit them away:
  - the download buttons: <span class="btn off dl" data-dl="<file>"> + <small data-dl-soon="<file>"> turn into
    <a class="btn app dl" href="/aimdot/download/<file>"> once the release has the file; <p data-dl-version> gets the version line
  - the "What's new" list: <div class="changes" data-changes="<app>"> (the <p class="cnone"> line shows until there's a version)
"""
import pathlib, sys
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent / "public")

HEAD = r'''<!doctype html>
<html lang="en" data-type="software" data-radius="round" data-ground="sonela" data-buttons="tonal" data-motion>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>@@TITLE@@</title>
<meta name="description" content="@@DESC@@">
<meta name="theme-color" content="#0a0a0a">
<meta name="site-kind" content="software">
<meta name="page-type" content="software">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/assets/system.css">
<link rel="stylesheet" href="/assets/ui/cards.css">
<link rel="stylesheet" href="/assets/motion/motion.css">
<link rel="stylesheet" href="/assets/layout/layout.css">
<link rel="stylesheet" href="/assets/moments/liquid-type/moment.css">
<link rel="stylesheet" href="/sonela.css">
<script src="/sonela-head.js"></script>
<link rel="modulepreload" href="/assets/moments/moments.js">
</head>
<body>
'''
TAIL = r'''
<script type="module" src="/assets/system.js"></script>
<script type="module" src="/assets/motion/motion.js"></script>
<script type="module" src="/assets/layout/layout.js"></script>
</body>
</html>
'''
# the bar on every page (the "Apps" menu, the Aimdot card in it); a page marks its own word with aria-current
HEADER = r'''<header class="nav">
  <div class="wrap nav__bar">
    <a class="skip-link" href="#top">Skip to content</a>
    <a class="nav__logo" href="/"><span class="sn-logo" aria-hidden="true"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#f2f3f5"/><path d="M42 21c-3-4-17-5-18 2s18 7 17 15-15 6-18 2" fill="none" stroke="#111317" stroke-width="6" stroke-linecap="round"/></svg></span>Sonela</a>
    <nav class="nav__links" aria-label="Main">
      <div class="nav__item">
        <a class="nav__link" href="/#apps">Apps <svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        <div class="nav__menu">
          <div class="wrap grid">
            <div class="menu-col span-3">
              <p class="t-label">Out now</p>
              <a href="https://echoclip.link/">Echo<span>Game clip recorder, 2.0</span></a>
              <a href="/aimdot">Aimdot<span>Crosshair overlay, 1.0</span></a>
            </div>
            <div class="menu-col span-3">
              <p class="t-label">Coming next</p>
              <a href="/lasso">Lasso<span>Screenshot tool</span></a>
              <a href="https://discord.gg/JPVewEfUQs">Discord<span>News and help</span></a>
            </div>
            <a class="menu-card span-3 start-10" href="/aimdot">
              <div class="panel"><img class="frame__img" src="/img/aimdot-designer-640.webp" alt="Aimdot's Designer: presets, colour and a live preview of the crosshair" width="640" height="400" loading="lazy"></div>
              <span class="t-card">Aimdot is out</span>
              <span class="t-small muted">Your own crosshair on any game</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav__item"><a class="nav__link" href="https://echoclip.link/">Echo</a></div>
      <div class="nav__item"><a class="nav__link" href="/aimdot">Aimdot</a></div>
      <div class="nav__item"><a class="nav__link" href="/about">About</a></div>
    </nav>
    <div class="nav__actions">
      <a class="nav__link" href="https://github.com/Resister0/sonela">GitHub</a>
      <a class="btn btn--primary" href="/#apps">Get the apps</a>
    </div>
    <button class="nav__toggle" type="button" aria-expanded="false" aria-label="Menu">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 13h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
  </div>
</header>

'''
# the home page's close: "Get the apps" + one button per app, then the link rows (the statement footer, Sonela white)
HOME_FOOT = r'''<footer class="footer closing footer--statement" id="contact" aria-labelledby="close-h">
  <div class="wrap">
    <div class="closing__cta sn-close">
      <div class="section-head">
        <h2 id="close-h">Get the apps</h2>
        <p>Free on Windows and Linux, and open source.</p>
      </div>
      <div class="sn-close-btns">
        <a class="btn btn--primary sn-dl" href="https://echoclip.link/download"><img src="/echo.png" alt="" width="24" height="24">Download Echo</a>
        <a class="btn btn--primary sn-dl" href="/aimdot#download"><img src="/aimdot.svg" alt="" width="24" height="24">Download Aimdot</a>
      </div>
    </div>
    <div class="closing__links">
      <div class="grid">
        <div class="span-4 stack-4">
          <a class="nav__logo" href="/"><span class="sn-logo" aria-hidden="true"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#111317"/><path d="M42 21c-3-4-17-5-18 2s18 7 17 15-15 6-18 2" fill="none" stroke="#f2f3f5" stroke-width="6" stroke-linecap="round"/></svg></span>Sonela</a>
          <p class="footer__lede">Free, light apps for PC gamers. Made by Resister0.</p>
        </div>
        <div class="span-2 footer__col"><h3>Apps</h3><ul><li><a href="https://echoclip.link/">Echo</a></li><li><a href="/aimdot">Aimdot</a></li><li><a href="/lasso">Lasso</a></li></ul></div>
        <div class="span-2 footer__col"><h3>Sonela</h3><ul><li><a href="/about">About</a></li><li><a href="/privacy">Privacy</a></li></ul></div>
        <div class="span-2 footer__col"><h3>Community</h3><ul><li><a href="https://discord.gg/JPVewEfUQs">Discord</a></li><li><a href="mailto:support@echoclip.link">Email support</a></li></ul></div>
        <div class="span-2 footer__col"><h3>Source</h3><ul><li><a href="https://github.com/Resister0/sonela">This site</a></li><li><a href="https://github.com/Resister0/echoclip">Echo</a></li></ul></div>
      </div>
      <div class="footer__legal">
        <span>&copy; 2026 Sonela · Made by Resister0</span>
        <span>Crosshair X, Discord, Windows and other product names belong to their owners. Sonela isn't connected to them.</span>
      </div>
    </div>
  </div>
</footer>
'''
# every other page: the same link rows on the dark ground
SUB_FOOT = r'''<footer class="footer closing footer--dark sn-subfoot" id="contact">
  <div class="wrap">
    <div class="closing__links">
      <div class="grid">
        <div class="span-4 stack-4">
          <a class="nav__logo" href="/"><span class="sn-logo" aria-hidden="true"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#111317"/><path d="M42 21c-3-4-17-5-18 2s18 7 17 15-15 6-18 2" fill="none" stroke="#f2f3f5" stroke-width="6" stroke-linecap="round"/></svg></span>Sonela</a>
          <p class="footer__lede">Free, light apps for PC gamers. Made by Resister0.</p>
        </div>
        <div class="span-2 footer__col"><h3>Apps</h3><ul><li><a href="https://echoclip.link/">Echo</a></li><li><a href="/aimdot">Aimdot</a></li><li><a href="/lasso">Lasso</a></li></ul></div>
        <div class="span-2 footer__col"><h3>Sonela</h3><ul><li><a href="/about">About</a></li><li><a href="/privacy">Privacy</a></li></ul></div>
        <div class="span-2 footer__col"><h3>Community</h3><ul><li><a href="https://discord.gg/JPVewEfUQs">Discord</a></li><li><a href="mailto:support@echoclip.link">Email support</a></li></ul></div>
        <div class="span-2 footer__col"><h3>Source</h3><ul><li><a href="https://github.com/Resister0/sonela">This site</a></li><li><a href="https://github.com/Resister0/echoclip">Echo</a></li></ul></div>
      </div>
      <div class="footer__legal">
        <span>&copy; 2026 Sonela · Made by Resister0</span>
        <span>Crosshair X, Discord, Windows and other product names belong to their owners. Sonela isn't connected to them.</span>
      </div>
    </div>
  </div>
</footer>
'''
FOOTS = {"HOME_FOOT": HOME_FOOT, "SUB_FOOT": SUB_FOOT}

PAGES = [  # file, <title>, <meta description>, nav word marked as current ("" = none), the page's <main>, its footer
    ("index.html", "Sonela - free, lightweight tools for PC gamers",
     "Free, open-source gaming tools that stay light on your PC: Echo the game clip recorder, the Aimdot crosshair and the Lasso screenshot tool. No ads.", "",
     r'''<main id="top">
  <section class="hero hero--split" data-enter aria-labelledby="hero-h">
    <div class="wrap"><div class="hero-text grid hero__grid">
      <div class="hero__text span-5">
        <p class="hero__kicker"><span class="dot" aria-hidden="true"></span>Echo 2.0 and Aimdot 1.0 are out</p>
        <h1 id="hero-h">Free, light apps for PC gamers</h1>
        <p class="hero__lead">Small native apps that stay out of your game's way. Echo saves the clip you just played, Aimdot puts your own crosshair on any game.</p>
        <div class="btn-row"><a class="btn btn--primary" href="#apps">See the apps</a><a class="btn btn--secondary" href="https://discord.gg/JPVewEfUQs">Join the Discord</a></div>
      </div>
      <div class="hero__media span-6 start-7 sn-win">
        <img src="/img/aimdot-designer.webp" width="1280" height="800" alt="The real Aimdot app: the Designer with crosshair presets, colour settings and a live preview" fetchpriority="high">
        <div class="ly-float">
          <div class="ly-float__row"><span class="ly-live">Aimdot's overlay, in a game</span><span>measured</span></div>
          <div class="ly-float__title">Under 2 MB of memory, no CPU while idle</div>
        </div>
      </div>
    </div></div>
  </section>

  <section class="section sn-app sn-echo" id="apps" aria-labelledby="echo-h">
    <div class="wrap">
      <div class="grid grid--top sn-split">
        <div class="span-5 stack-4">
          <p class="sn-kicker"><img src="/echo.png" alt="" width="40" height="40">Out now · Windows and Linux</p>
          <h2 id="echo-h">Echo 2.0, the game clip recorder</h2>
          <p class="t-lead">Echo keeps the last minutes of your game ready. Press one key and they become a clip to trim and share on Discord.</p>
          <dl class="sn-nums">
            <div><dt>Memory while recording</dt><dd>~150 MB</dd></div>
            <div><dt>CPU while recording</dt><dd>~0.6 %</dd></div>
            <div><dt>Accounts needed</dt><dd>0</dd></div>
          </dl>
          <div class="btn-row"><a class="btn btn--primary sn-dl" href="https://echoclip.link/download"><img src="/echo.png" alt="" width="24" height="24">Download Echo</a><a class="btn btn--secondary" href="https://echoclip.link/">Visit echoclip.link</a></div>
        </div>
        <figure class="span-6 start-7 sn-shot sn-shot--echo"><img src="/img/echo-library.webp?v=2" width="1920" height="1043" alt="The real Echo app: the clip library with this week's clips, game folders and the recording status" loading="lazy"></figure>
      </div>
    </div>
  </section>

  <section class="section sn-app sn-aimdot" id="aimdot" aria-labelledby="aimdot-h">
    <div class="wrap">
      <div class="grid grid--top sn-split">
        <div class="span-5 stack-4">
          <p class="sn-kicker"><img src="/aimdot.svg" alt="" width="40" height="40">Out now · Windows and Linux</p>
          <h2 id="aimdot-h">Aimdot, a crosshair for any game</h2>
          <p class="t-lead">Design it or paint it pixel by pixel, give each game its own, and show or hide it with a hotkey.</p>
          <ul class="sn-points">
            <li>Over 100 presets, or your own picture</li>
            <li>Share a crosshair as a short code, or bring yours from CS2 or Valorant</li>
            <li>Game Bar mode for exclusive fullscreen on Windows</li>
          </ul>
          <div class="btn-row"><a class="btn btn--primary sn-dl" href="/aimdot#download"><img src="/aimdot.svg" alt="" width="24" height="24">Download Aimdot</a><a class="btn btn--secondary" href="/aimdot">More about Aimdot</a></div>
        </div>
        <figure class="span-6 start-7 sn-shot sn-shot--aimdot"><img src="/img/aimdot-painter.webp" width="1280" height="800" alt="Aimdot's Painter: a crosshair painted pixel by pixel on a grid" loading="lazy"></figure>
      </div>
    </div>
  </section>

  <section class="section sn-app sn-lasso" id="lasso" aria-labelledby="lasso-h">
    <div class="wrap">
      <div class="grid grid--top sn-split">
        <div class="span-5 stack-4">
          <p class="sn-kicker sn-kicker--plain">Coming next · Windows and Linux</p>
          <h2 id="lasso-h">Lasso, the screenshot tool</h2>
          <p class="t-lead">Draw around any part of the screen, mark it up, then copy, save or share it. Light enough to leave running all the time.</p>
          <div class="btn-row"><a class="btn btn--secondary" href="https://discord.gg/JPVewEfUQs">Get news on Discord</a><a class="btn btn--secondary" href="/lasso">More about Lasso</a></div>
        </div>
        <div class="span-6 start-7 sn-tile"><img src="/lasso.svg" alt="Lasso's app icon: a dashed loop on teal" width="220" height="220" loading="lazy"></div>
      </div>
    </div>
  </section>

  <section class="section" id="why" aria-labelledby="why-h">
    <div class="wrap">
      <div data-moment="liquid-type" class="section-head sn-why-head">
        <h2 class="mo-lt__type" id="why-h">Native. Free. Open.</h2>
      </div>
      <div class="sn-why">
        <div class="sn-why__card"><img class="sn-ico-mono" src="/icons/rust.svg" alt="Rust" width="40" height="40" loading="lazy"><h3>Native apps in Rust</h3><p>Not a web browser in disguise. Echo uses about 150 MB of memory while recording, Aimdot's overlay under 2 MB.</p></div>
        <div class="sn-why__card"><span class="sn-why__apps"><img src="/echo.png" alt="" width="32" height="32" loading="lazy"><img src="/aimdot.svg" alt="" width="32" height="32" loading="lazy"><img src="/lasso.svg" alt="" width="32" height="32" loading="lazy"></span><h3>Free apps, every feature</h3><p>Echo and Aimdot cost nothing and track nothing. Echo's optional cloud storage has paid plans for more space.</p></div>
        <div class="sn-why__card"><img class="sn-ico-mono" src="/icons/github.svg" alt="GitHub" width="40" height="40" loading="lazy"><h3>Open-source code for every app</h3><p>The code is on <a href="https://github.com/Resister0">GitHub</a>, so anyone can check what the apps do.</p></div>
        <div class="sn-why__card"><span class="sn-why__apps"><img src="/icons/windows.svg" alt="Windows" width="32" height="32" loading="lazy"><img src="/icons/linux-tux.svg" alt="Linux" width="32" height="32" loading="lazy"></span><h3>Windows 10, 11, Linux and Steam Deck</h3><p>Windows 10 and 11, and Linux, including Steam Deck and Bazzite through Flatpak.</p></div>
      </div>
    </div>
  </section>
</main>

''',
     "HOME_FOOT"),
    ("about.html", "About Sonela - who makes Echo, Aimdot and Lasso",
     "Sonela is a small family of free, open-source PC gaming tools made by one independent developer: Echo, Aimdot and Lasso.", "/about",
     r'''<main id="top" class="sn-sub sn-sub--about">
  <section class="hero hero--split sn-about" data-enter aria-labelledby="hero-h">
    <div class="wrap"><div class="hero-text grid hero__grid">
      <div class="hero__text span-5">
        <h1 id="hero-h">Small tools. Big games.</h1>
        <p class="hero__lead">Sonela makes free, open-source apps for PC gamers, made by Resister0, one independent developer. The apps are native, do one job each, and stay light on your PC while you play.</p>
        <div class="btn-row"><a class="btn btn--primary" href="/#apps">See the apps</a><a class="btn btn--secondary" href="https://discord.gg/JPVewEfUQs">Join the Discord</a></div>
      </div>
      <div class="span-6 start-7 sn-rows">
        <a class="sn-row" href="https://echoclip.link/"><img src="/echo.png" alt="" width="56" height="56"><span><b>Echo</b><em class="sn-tag sn-tag--out">Out now · 2.0</em><small>Game clip recorder for Windows and Linux.</small></span></a>
        <a class="sn-row" href="/aimdot"><img src="/aimdot.svg" alt="" width="56" height="56"><span><b>Aimdot</b><em class="sn-tag sn-tag--out">Out now · 1.0</em><small>A crosshair overlay for any game.</small></span></a>
        <a class="sn-row" href="/lasso"><img src="/lasso.svg" alt="" width="56" height="56"><span><b>Lasso</b><em class="sn-tag">Coming soon</em><small>A screenshot tool: draw around it, mark it up, share it.</small></span></a>
      </div>
    </div></div>
  </section>

  <section class="section sn-docsec" id="more" aria-labelledby="more-h">
    <div class="wrap">
      <article class="sn-doc">
        <h2 id="more-h">Free and open source</h2>
        <p>The apps are free, with no ads and no tracking. Echo's code is public on <a href="https://github.com/Resister0/echoclip">GitHub</a> under the GPL-3.0 licence, and <a href="https://github.com/Resister0/sonela">this website's code</a> is there too (MIT licence). Echo Cloud, Echo's optional clip storage, has paid plans for people who want more space; that is what pays for the servers.</p>
        <h2>Get in touch</h2>
        <p>Questions, bugs and ideas: the <a href="https://discord.gg/JPVewEfUQs">Discord</a> or <a href="mailto:support@echoclip.link">support@echoclip.link</a>.</p>
      </article>
    </div>
  </section>
</main>

''',
     "SUB_FOOT"),
    ("aimdot.html", "Sonela Aimdot - a free crosshair overlay for PC games",
     "Sonela Aimdot puts your own crosshair on top of any PC game: design or paint it, one per game, share codes, CS2 and Valorant import. Windows and Linux.", "/aimdot",
     r'''<main id="top" class="sn-sub sn-sub--aimdot">
  <section class="hero hero--split sn-apphero" data-enter aria-labelledby="hero-h">
    <div class="wrap"><div class="hero-text grid hero__grid">
      <div class="hero__text span-5">
        <p class="sn-kicker"><img src="/aimdot.svg" alt="" width="40" height="40">Aimdot</p>
        <h1 id="hero-h">A free crosshair overlay for PC games</h1>
        <p class="hero__lead">Your own crosshair on top of any game. Design it or paint it, give each game its own, and turn it on or off with a hotkey.</p>
        <div class="dl-grid" id="download">
      <span class="btn off dl" data-dl="windows" aria-disabled="true"><span>Windows (installer)</span><small data-dl-soon="windows">Coming soon</small></span>
      <span class="btn off dl" data-dl="windows-portable" aria-disabled="true"><span>Windows (portable zip)</span><small data-dl-soon="windows-portable">Coming soon</small></span>
      <span class="btn off dl" data-dl="linux" aria-disabled="true"><span>Linux (AppImage)</span><small data-dl-soon="linux">Coming soon</small></span>
      <span class="btn off dl" data-dl="linux-tar" aria-disabled="true"><span>Linux (tar.gz)</span><small data-dl-soon="linux-tar">Coming soon</small></span>
    </div>
        <p class="note dl-ver" data-dl-version></p>
        <p class="note">Free and open source. No ads, no account. <a href="https://discord.gg/JPVewEfUQs">Get news on Discord</a></p>
      </div>
      <div class="hero__media span-6 start-7 sn-win">
        <img src="/img/aimdot-designer.webp" srcset="/img/aimdot-designer-640.webp 640w, /img/aimdot-designer.webp 1280w" sizes="(max-width: 1023px) 92vw, 46vw" width="1280" height="800" alt="The real Aimdot app: the Designer with crosshair presets, colour settings and a live preview" fetchpriority="high">
      </div>
    </div></div>
  </section>

  <section class="section sn-changes aimdot" id="changes" aria-labelledby="changes-h">
    <div class="wrap">
      <div class="sn-changes__head">
        <h2 id="changes-h">What's new in Aimdot</h2>
        <p class="sub">Every version, newest first. Aimdot updates itself, and news about new versions goes out on Discord.</p>
      </div>
      <div class="changes" data-changes="aimdot"><p class="cnone">No versions yet. The first one is on its way.</p></div>
    </div>
  </section>

  <section class="section sn-feats" id="features" aria-labelledby="feats-h">
    <div class="wrap">
      <div class="grid grid--top sn-split">
        <div class="span-5 stack-4">
          <h2 id="feats-h">Everything Aimdot does</h2>
          <ul class="sn-featlist">
            <li><b>Design it</b> Pick the shape, colour, size, gap and outline, and watch it change as you go.</li>
            <li><b>Or paint it</b> Draw your crosshair pixel by pixel, with layers and animation.</li>
            <li><b>Use a picture</b> Any image of your own can be your crosshair.</li>
            <li><b>One per game</b> Give each game its own crosshair. Aimdot switches when the game starts.</li>
            <li><b>Share codes</b> Send your crosshair to a friend as a short code, or bring yours over from CS2 or Valorant.</li>
            <li><b>Hotkeys</b> Show, hide or switch crosshairs without leaving the game.</li>
            <li><b>Out of the way</b> Lives in the tray and can start with your PC.</li>
            <li><b>Game Bar mode</b> On Windows, it also shows over games in exclusive fullscreen.</li>
            <li><b>Very light</b> A small native app. You won't notice it while you play.</li>
          </ul>
        </div>
        <div class="span-6 start-7 sn-pair">
          <figure class="sn-shot sn-shot--aimdot"><img src="/img/aimdot-painter.webp" srcset="/img/aimdot-painter-640.webp 640w, /img/aimdot-painter.webp 1280w" sizes="(max-width: 1023px) 92vw, 46vw" width="1280" height="800" alt="Aimdot's Painter: a crosshair painted pixel by pixel on a grid" loading="lazy"></figure>
          <figure class="sn-shot sn-shot--aimdot sn-shot--back"><img src="/img/aimdot-presets.webp" srcset="/img/aimdot-presets-640.webp 640w, /img/aimdot-presets.webp 1280w" sizes="(max-width: 1023px) 92vw, 46vw" width="1280" height="800" alt="Aimdot's preset list: 106 crosshairs in classic crosses, dots, circles and rings" loading="lazy"></figure>
        </div>
      </div>
    </div>
  </section>

  <!-- the memory comparison (12 Nov 2026): Task Manager's Memory column, both apps idle in the tray. Numbers only, no logos;
       the bar widths are classes in sonela.css (no inline styles, CSP) -->
  <section class="section sn-mem" id="memory" aria-labelledby="mem-h">
    <div class="wrap">
      <div class="sn-changes__head">
        <h2 id="mem-h">Light on your PC</h2>
        <p class="sub">Memory used while waiting in the tray, as Task Manager shows it.</p>
      </div>
      <figure class="sn-mem__fig">
        <div class="sn-bar sn-bar--aimdot"><span class="sn-bar__name">Aimdot</span><span class="sn-bar__track" aria-hidden="true"><span class="sn-bar__fill"></span></span><span class="sn-bar__val">under 2 MB<small>1 process</small></span></div>
        <div class="sn-bar sn-bar--other"><span class="sn-bar__name">Crosshair X</span><span class="sn-bar__track" aria-hidden="true"><span class="sn-bar__fill"></span></span><span class="sn-bar__val">about 320 MB<small>7 processes</small></span></div>
        <figcaption>Measured on Windows 11 on 12 November 2026: both apps idle in the tray with no window open, Task Manager's Memory column, all of each app's processes added up.</figcaption>
      </figure>
      <p class="sn-back"><a href="/#apps">All Sonela apps</a></p>
    </div>
  </section>
</main>

''',
     "SUB_FOOT"),
    ("lasso.html", "Sonela Lasso - a free screenshot tool for Windows and Linux",
     "Sonela Lasso: draw around any part of the screen, mark it up, then copy, save or share it. Free and open source. Coming soon.", "",
     r'''<main id="top" class="sn-sub sn-sub--lasso">
  <section class="hero sn-solo" data-enter aria-labelledby="hero-h">
    <div class="wrap">
      <img class="sn-solo__icon" src="/lasso.svg" alt="" width="128" height="128">
      <p class="sn-kicker sn-kicker--plain">Lasso · coming soon</p>
      <h1 id="hero-h">A free screenshot tool for Windows and Linux</h1>
      <p class="hero__lead">Draw around any part of the screen, mark it up, then copy, save or share it. Light enough to leave running all the time.</p>
      <div class="btn-row"><span class="btn btn--secondary sn-off" aria-disabled="true">Download · coming soon</span><a class="btn btn--primary" href="https://discord.gg/JPVewEfUQs">Get news on Discord</a></div>
      <ul class="sn-solo__feats">
        <li><b>Draw around it</b>Grab exactly the part of the screen you want, any shape.</li>
        <li><b>Mark it up</b>Arrows, boxes and text before you send it.</li>
        <li><b>Copy, save or share</b>Straight to the clipboard or a file, or share it in a click.</li>
      </ul>
    </div>
  </section>

  <section class="section sn-changes lasso" id="changes" aria-labelledby="changes-h">
    <div class="wrap">
      <div class="sn-changes__head">
        <h2 id="changes-h">What's new in Lasso</h2>
        <p class="sub">Every version, newest first. News about Lasso goes out on Discord.</p>
      </div>
      <div class="changes" data-changes="lasso"><p class="cnone">No versions yet. Lasso is still being made.</p></div>
      <p class="sn-back"><a href="/#apps">All Sonela apps</a></p>
    </div>
  </section>
</main>

''',
     "SUB_FOOT"),
    ("privacy.html", "Privacy - Sonela",
     "The Sonela website has no cookies, analytics, trackers or forms. It collects nothing about you. Each app has its own privacy policy.", "",
     r'''<main id="top" class="sn-sub sn-sub--privacy">
  <section class="section sn-docsec sn-docsec--top">
    <div class="wrap">
      <article class="sn-doc">
        <h1>Privacy</h1>
        <p class="updated">Last updated: 10 November 2026</p>
        <p>This website collects nothing about you. It has no cookies, no analytics, no trackers, no ads, no embedded videos or fonts from other sites, and no forms. It is plain pages.</p>
        <p>The pages are served by Cloudflare. Like any web host, Cloudflare needs your IP address to send you the page, and may keep it in short-lived logs to keep the service running and safe. We only see total numbers (for example how many requests the site got in a day), never anything about one visitor.</p>
        <p>Links to other sites (echoclip.link, GitHub, Discord) take you to those sites, and their own privacy policies apply there.</p>
        <h2>The apps</h2>
        <p>Each app has its own privacy policy, on its own website. Echo's is at <a href="https://echoclip.link/privacy">echoclip.link/privacy</a>.</p>
        <h2>Contact</h2>
        <p><a href="mailto:support@echoclip.link">support@echoclip.link</a></p>
      </article>
    </div>
  </section>
</main>

''',
     "SUB_FOOT"),
    ("404.html", "Page not found - Sonela",
     "This page does not exist. Sonela makes free, lightweight tools for PC gamers: Echo, Aimdot and Lasso.", "",
     r'''<main id="top" class="sn-sub sn-sub--404">
  <section class="hero sn-solo" aria-labelledby="hero-h">
    <div class="wrap">
      <h1 id="hero-h">Nothing here</h1>
      <p class="hero__lead">This page doesn't exist. Maybe it moved, or the link has a typo.</p>
      <div class="btn-row"><a class="btn btn--primary" href="/">Go to the home page</a><a class="btn btn--secondary" href="https://echoclip.link/">Get Echo</a></div>
      <ul class="sn-404">
        <li><a href="/aimdot">Aimdot</a></li>
        <li><a href="/lasso">Lasso</a></li>
        <li><a href="/about">About Sonela</a></li>
        <li><a href="https://discord.gg/JPVewEfUQs">Discord</a></li>
      </ul>
    </div>
  </section>
</main>

''',
     "SUB_FOOT"),
]


def page(title, desc, cur, main, foot):
    header = HEADER.replace(f'<a class="nav__link" href="{cur}">', f'<a class="nav__link" href="{cur}" aria-current="page">', 1) if cur else HEADER
    return HEAD.replace("@@TITLE@@", title, 1).replace("@@DESC@@", desc, 1) + header + main + FOOTS[foot] + TAIL


for name, title, desc, cur, main, foot in PAGES:
    (OUT / name).write_text(page(title, desc, cur, main, foot), encoding="utf-8")
print("pages written")
