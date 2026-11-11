// sonela.app: the pages are static files (public/). This small script only handles Aimdot's downloads, its update
// check, the download buttons on /aimdot and the "What's new" lists on the app pages. No database, no cookies, nothing
// about visitors is stored.
//
//   /aimdot/download/<windows|windows-portable|linux|linux-tar>  -> 302 to the file in the GitHub release "latest"
//   /aimdot/update/<windows|linux>/<arch>/<current version>       -> 204 = nothing to install (x-aimdot-why: current,
//                                                                     no-release, internal, unsigned, unknown-os, paused),
//                                                                     else JSON {version, notes, pub_date, url, signature}
//   /aimdot                                                       -> the static page; its download buttons switch from
//                                                                     "Coming soon" to real links once the release has the file
//   /aimdot, /lasso                                               -> the static page with the "What's new" list written in
//   /<aimdot|lasso>/changes                                       -> the same list as JSON {app, latest, releases: [{version,
//                                                                     notes, at}]}, newest first
//
// The release: https://github.com/Resister0/aimdot/releases/tag/latest, titled "Aimdot x.y.z", its text has a line
// "Built from: <publish text>". A publish text starting with "#" = internal build: downloadable, never offered as an update.
// The update answer follows the Aimdot updater's server contract (the Tauri / Echo updater format).
// Nothing about the asker is stored (no IP, no ID) - the installer's privacy notice promises that.

const REPO = "Resister0/aimdot";
// download button -> file name in the release (the first one that exists wins)
const FILES = {
  "windows": ["Aimdot-Setup.exe"],
  "windows-portable": ["Aimdot-Windows.zip"],
  "linux": ["Aimdot-x86_64.AppImage"],
  "linux-tar": ["Aimdot-linux-x86_64.tar.gz"],
};
// the apps without a website of their own: their public repo. A repo that doesn't exist yet (Lasso) = "No versions yet";
// its list shows up by itself once the repo has its first publish.
const APPS = {
  aimdot: { name: "Aimdot", repo: REPO, files: FILES },
  lasso: { name: "Lasso", repo: "Resister0/lasso", files: {} },
};
// update check: which download the app replaces itself with, per OS (needs its .sig next to it)
const UPDATE_FILES = { windows: "windows", linux: "linux" };
const ARCHES = new Set(["x86_64", "x64", "amd64"]);   // aarch64 etc.: no builds yet -> 204 no-release
const fileUrl = (name, repo = REPO) => `https://github.com/${repo}/releases/download/latest/${encodeURIComponent(name)}`;
const UA = { "user-agent": "sonela-hub" };
const unesc = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const ghApi = (env, path) => fetch(`https://api.github.com/repos/${path}`, { headers: { ...UA,
  ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
  accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });

// ----- the release "latest": GitHub's API (cached 5 min per Worker copy), else github.com itself, else the last good one -----
const memo = new Map();   // app -> {at, rel}
const sigMemo = new Map();
const nowS = () => Math.floor(Date.now() / 1000);

async function latestRelease(env, app = "aimdot") {
  const m = memo.get(app);
  if (m && nowS() - m.at < (m.rel ? 300 : 30)) return m.rel;
  const keep = new Request(`https://sonela.app/_cache/${app}-release`);
  let rel = null, gone = false;
  try {
    const r = await ghApi(env, `${APPS[app].repo}/releases/tags/latest`);
    if (r.ok) {
      const j = await r.json();
      rel = { name: j.name || "", body: j.body || "", published: j.published_at || j.created_at || "", files: (j.assets || []).map((a) => a.name) };
    } else if (r.status === 404) {
      gone = true;   // no release yet, or "latest" is being rebuilt right now (its files are gone too)
    } else {
      console.log("github api", r.status);
    }
  } catch (e) { console.log("github api error", e && e.message); }
  if (!rel && !gone) rel = await releaseFromWeb(APPS[app]).catch(() => null);   // rate limit etc.: read github.com instead
  if (rel) {
    try { await caches.default.put(keep, new Response(JSON.stringify(rel), { headers: { "cache-control": "max-age=604800" } })); } catch {}
  } else if (!gone) {
    try { const hit = await caches.default.match(keep); if (hit) rel = await hit.json(); } catch {}
  }
  memo.set(app, { at: nowS(), rel });
  return rel;
}

// title + text from the releases feed, files checked with HEAD on their download links (a redirect = it's there)
async function releaseFromWeb({ repo, files: wanted }) {
  const names = [];
  for (const list of Object.values(wanted)) for (const n of list) names.push(n, `${n}.sig`);
  if (!names.length) return null;
  const feed = await fetch(`https://github.com/${repo}/releases.atom`, { headers: { ...UA, accept: "application/atom+xml" } });
  if (!feed.ok) return null;
  const xml = await feed.text();
  const entry = (xml.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1] || "";
  const name = unesc(((entry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "").trim());
  const tag = (((entry.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "").match(/\/releases\/tag\/([^"/?#]+)/) || [])[1];
  if (!/\d+\.\d+\.\d+/.test(name) || tag !== "latest") return null;
  const html = unesc((entry.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "");
  const body = unesc(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n").replace(/<[^>]+>/g, ""));
  const published = ((entry.match(/<updated>([^<]+)<\/updated>/) || [])[1] || "").trim();
  const have = await Promise.all(names.map(async (n) => {
    try {
      const h = await fetch(fileUrl(n, repo), { method: "HEAD", redirect: "manual", headers: UA });
      return h.status >= 300 && h.status < 400;
    } catch { return false; }
  }));
  const files = names.filter((n, i) => have[i]);
  return files.length ? { name, body, published, files } : null;
}

const versionOf = (rel) => rel && (rel.name.match(/\d+\.\d+\.\d+/) || [])[0];
const fileFor = (rel, what) => rel && (FILES[what] || []).find((n) => rel.files.includes(n));
const builtFrom = (rel) => ((rel && rel.body.match(/Built from: (.*)/)) || [])[1] || "";
const verNum = (v) => String(v || "").replace(/^v/, "").split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
function newer(a, b) {
  const x = verNum(a), y = verNum(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// ----- what's new: every published version + its "What changed?" text (like echoclip.link/changelog) -----
// Each publish is ONE commit in the app's public repo that changes ci/version.txt. Its first line is the text typed at
// publish.sh's "What changed?"; the version is that commit's ci/version.txt. Shown: only versions that really came out
// (up to the release "latest", which has files), never texts starting with "#" (internal builds). No database: the
// list is kept in Cloudflare's cache - fresh for 5 minutes, plus a copy for 30 days in case GitHub can't be reached
// (that copy also remembers each commit's version, so a commit's version.txt is only read once).
const secs = (d) => Math.floor(Date.parse(d || "") / 1000) || nowS();
const firstLine = (m) => String(m || "").split("\n")[0].trim().slice(0, 600);

// [{sha, notes, at}], newest first. [] = no repo or no publish yet. null = GitHub can't be reached right now.
async function versionCommits(env, repo) {
  try {
    const r = await ghApi(env, `${repo}/commits?path=ci/version.txt&per_page=30`);
    if (r.ok) return (await r.json()).filter((c) => c && c.sha && c.commit).map((c) =>
      ({ sha: c.sha, notes: firstLine(c.commit.message), at: secs(c.commit.committer && c.commit.committer.date) }));
    if (r.status === 404 || r.status === 409) return [];   // 404 no such repo, 409 repo still empty
    console.log("github commits", r.status);
  } catch (e) { console.log("github commits error", e && e.message); }
  // rate limit etc.: the same list from github.com's feed of that file
  try {
    const f = await fetch(`https://github.com/${repo}/commits/main/ci/version.txt.atom`, { headers: { ...UA, accept: "application/atom+xml" } });
    if (f.status === 404) return [];
    if (!f.ok) return null;
    return [...(await f.text()).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
      sha: (e.match(/Commit\/([0-9a-f]{40})/) || [])[1],
      // the title is cut at ~70 characters; the content has the whole message (as <pre>, escaped twice)
      notes: firstLine(unesc(unesc((e.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "").replace(/<[^>]+>/g, "")).trim()
        || unesc(((e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "").trim())),
      at: secs((e.match(/<updated>([^<]+)<\/updated>/) || [])[1]),
    })).filter((c) => c.sha);
  } catch { return null; }
}

const changesMemo = new Map();   // app -> {at, out}
async function changesOf(env, app) {
  const m = changesMemo.get(app);
  if (m && nowS() - m.at < 60) return m.out;
  const fresh = new Request(`https://sonela.app/_cache/${app}-changes`);
  const keep = new Request(`https://sonela.app/_cache/${app}-changes-keep`);
  try { const hit = await caches.default.match(fresh); if (hit) { const out = await hit.json(); changesMemo.set(app, { at: nowS(), out }); return out; } } catch {}
  let old = null;
  try { const hit = await caches.default.match(keep); if (hit) old = await hit.json(); } catch {}
  const { repo } = APPS[app];
  const [commits, rel] = await Promise.all([versionCommits(env, repo), latestRelease(env, app).catch(() => null)]);
  // every publish commit with its version (already known ones from the kept copy)
  let rows = (old && old.rows) || [];
  if (commits) {
    const known = new Map(rows.filter((x) => x.sha).map((x) => [x.sha, x.version]));
    const vers = await Promise.all(commits.map(async (c) => {
      if (known.has(c.sha)) return known.get(c.sha);
      try {
        const r = await fetch(`https://raw.githubusercontent.com/${repo}/${c.sha}/ci/version.txt`, { headers: UA });
        return r.ok ? (await r.text()).trim() : "";
      } catch { return ""; }
    }));
    const seen = new Set();
    rows = commits.map((c, i) => ({ ...c, version: vers[i] }))
      .filter((x) => /^\d+\.\d+\.\d+$/.test(x.version) && !seen.has(x.version) && seen.add(x.version));
  }
  // only versions that really came out: up to the release "latest" (while it's being rebuilt: the last one seen)
  const latest = (rel && rel.files.length && versionOf(rel)) || (old && old.out && old.out.latest) || null;
  let all = rows.slice();
  // the commit list can fail or lag behind; the release's own "Built from:" line keeps the newest version listed
  if (latest && rel && versionOf(rel) === latest && !all.some((x) => x.version === latest) && builtFrom(rel).trim())
    all.push({ sha: null, version: latest, notes: firstLine(builtFrom(rel)), at: secs(rel.published) });
  let list = latest ? all.filter((x) => x.notes && !x.notes.startsWith("#") && !newer(x.version, latest)) : [];
  list.sort((a, b) => (newer(a.version, b.version) ? -1 : newer(b.version, a.version) ? 1 : 0));
  // the newest build is an internal "#" one (published right after a real one, which it replaced as "latest"): that's
  // the version people download, with the real one's changes in it -> show those under its number (as Echo does)
  if (latest && list.length && newer(latest, list[0].version)) {
    const between = all.filter((x) => newer(x.version, list[0].version) && !newer(x.version, latest));
    if (between.length && between.every((x) => String(x.notes || "").startsWith("#"))) list[0] = { ...list[0], version: latest };
  }
  const out = { app, latest, releases: list.slice(0, 100).map(({ version, notes, at }) => ({ version, notes, at })) };
  // GitHub unreachable and nothing kept: try again in a minute rather than in 5
  const ttl = commits ? 300 : 60;
  try {
    await caches.default.put(fresh, new Response(JSON.stringify(out), { headers: { "cache-control": `max-age=${ttl}` } }));
    if (commits) await caches.default.put(keep, new Response(JSON.stringify({ rows, out }), { headers: { "cache-control": "max-age=2592000" } }));
  } catch {}
  changesMemo.set(app, { at: nowS(), out });
  return out;
}

// The list as HTML, written into the page's <div data-changes> (the site runs no scripts). Same look and rules as
// echoclip.link/changelog: the newest version as a big card, the older ones grouped by day. Each text is split into
// its parts (commas, sentence ends - not inside quotes or brackets) and every part gets a tag (New / Fix / Linux /
// Windows). The filter buttons are radio buttons + CSS (style.css, ".cfilter"); "Show older versions" is a <details>.
const SHOW = 8;   // older versions shown before "Show older versions"
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateOf = (t, o) => new Date(t * 1000).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
// a comma right after "Something: Word" is a list ("Paint tools: line, fill and mirror") and doesn't split
function parts(n) {
  const out = []; let cur = "", q = false, br = 0; const t = String(n);
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"') q = !q; else if (ch === "(") br++; else if (ch === ")" && br) br--;
    const top = !q && !br;
    if (top && ch === "," && !/:\s*\S+$/.test(cur)) { out.push(cur); cur = ""; }
    else if (top && ch === "." && /^\s+[A-Z0-9]/.test(t.slice(i + 1, i + 3))) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim().replace(/\.$/, "")).filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1));
}
function tagsOf(t) {
  const g = [/^new:/i.test(t) ? "new" : /\b(fix|fixed|fixes|no longer|crash|bug|broken|stuck|works again|instead of)\b/i.test(t) ? "fix" : "new"];
  if (/linux|appimage|flatpak|kde|wayland|x11|gnome|steam deck|bazzite/i.test(t)) g.push("linux");
  if (/windows|installer|\.exe\b|smartscreen|game bar|msix/i.test(t)) g.push("windows");
  return g;
}
const TAG = { new: "New", fix: "Fix", linux: "Linux", windows: "Windows" };
const items = (n) => `<ul>${parts(n).map((p) => { const g = tagsOf(p);
  const text = p.replace(/^(new|fix|fixed|fixes)\s*:\s*(\S)/i, (m, w, c) => c.toUpperCase());   // "New: x" -> tag New + "X"
  return `<li data-t="${g.join(" ")}">${g.map((x) => `<span class="tg ${x}">${TAG[x]}</span>`).join("")}<span>${esc(text)}</span></li>`; }).join("")}</ul>`;
function changesHtml(app, list) {
  const [first, ...rest] = list;
  const filters = ["all", "new", "fix", "linux", "windows"].map((f, i) =>
    `<input type="radio" name="cf" id="cf-${f}"${i ? "" : " checked"}><label for="cf-${f}">${f === "all" ? "Everything" : f === "fix" ? "Fixes" : TAG[f]}</label>`).join("");
  let html = `<div class="cfilter" role="radiogroup" aria-label="Show">${filters}</div>`
    + `<article class="clatest"><div class="chead"><b>${esc(APPS[app].name)} ${esc(first.version)}</b><span class="new">Latest</span>`
    + `<time>${dateOf(first.at, { day: "numeric", month: "short", year: "numeric" })}</time></div>${items(first.notes)}</article>`;
  const groups = [];   // [[day, [rows]]]
  for (const x of rest) {
    const d = dateOf(x.at, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (!groups.length || groups[groups.length - 1][0] !== d) groups.push([d, []]);
    groups[groups.length - 1][1].push(x);
  }
  const days = (gs) => gs.map(([d, rows]) => `<div class="cgroup"><h3 class="cday">${esc(d)}</h3>${rows.map((x) =>
    `<article><div class="chead"><b>${esc(x.version)}</b></div>${items(x.notes)}</article>`).join("")}</div>`).join("");
  // whole days only: show days until SHOW versions are on screen, the rest behind "Show older versions"
  let cut = 0, shown = 0;
  while (cut < groups.length && shown < SHOW) shown += groups[cut++][1].length;
  html += days(groups.slice(0, cut));
  if (cut < groups.length) html += `<details class="colder"><summary class="btn ghost">Show older versions (${rest.length - shown})</summary>${days(groups.slice(cut))}</details>`;
  // a gap in the numbers (1.0.4 -> 1.0.6) = test builds that never went out
  const gap = list.some((x, i) => { const y = list[i + 1]; if (!y) return false;
    const a = verNum(x.version), b = verNum(y.version); return a[0] === b[0] && a[1] === b[1] && a[2] - b[2] > 1; });
  if (gap) html += `<p class="cnote">Missing version numbers were test builds that never went out.</p>`;
  return html;
}

// ----- routes -----
async function download(env, what) {
  const file = fileFor(await latestRelease(env), what);
  // not released yet (or being rebuilt): back to the page, whose button says "Coming soon"
  return new Response(null, { status: 302, headers: { location: file ? fileUrl(file) : "/aimdot#download", "cache-control": "no-store" } });
}

async function update(env, os, arch, current) {
  const none = (why) => new Response(null, { status: 204, headers: { "x-aimdot-why": why, "cache-control": "no-store" } });
  if (!UPDATE_FILES[os]) return none("unknown-os");
  if (!ARCHES.has(arch)) return none("no-release");
  // the brake: `npx wrangler secret put AIMDOT_UPDATES_PAUSED` (value 1) pauses updates; `wrangler secret delete` resumes
  if (env.AIMDOT_UPDATES_PAUSED === "1") return none("paused");
  const rel = await latestRelease(env);
  const version = versionOf(rel);
  if (!version) return none("no-release");
  const file = fileFor(rel, UPDATE_FILES[os]);
  if (!file) return none("no-release");
  if (!rel.files.includes(`${file}.sig`)) return none("unsigned");
  if (!newer(version, current)) return none("current");
  const notes = builtFrom(rel).trim();
  if (notes.startsWith("#")) return none("internal");
  const key = `${version}:${file}`;
  let signature = sigMemo.get(key);
  if (!signature) {
    const r = await fetch(fileUrl(`${file}.sig`), { headers: UA }).catch(() => null);
    if (!r || !r.ok) return none("no-signature");
    signature = (await r.text()).trim();
    sigMemo.set(key, signature);
  }
  return new Response(JSON.stringify({ version, notes, pub_date: rel.published, url: fileUrl(file), signature }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

const fresh = (res) => {
  const h = new Headers(res.headers);
  h.delete("etag"); h.delete("last-modified"); h.set("cache-control", "public, max-age=60");
  return new Response(res.body, { status: res.status, headers: h });
};

// /aimdot: each button in the page is <span class="btn off" data-dl="<what>">..<small data-dl-soon="<what>">Coming
// soon</small></span>. Once the release has that file: a real link to /aimdot/download/<what>, without the "Coming soon".
// The empty line <p data-dl-version> under the buttons becomes "Aimdot x.y.z · date · Windows and Linux · What's new".
// /aimdot and /lasso: <div data-changes> gets the "What's new" list (it says "No versions yet" until there's one).
async function appPage(req, env, app) {
  // the page changes without its file changing: no ETag / 304 (a browser would keep showing an old list)
  const res = await env.ASSETS.fetch(new Request(req.url, { method: req.method === "HEAD" ? "HEAD" : "GET" }));
  if (res.status !== 200 || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  const [rel, changes] = await Promise.all([
    app === "aimdot" ? latestRelease(env).catch(() => null) : null,
    changesOf(env, app).catch((e) => { console.log("changes error", e && e.message); return null; }),
  ]);
  const list = changes && changes.releases.length ? changes : null;
  const out = new HTMLRewriter().on("[data-changes]", { element(el) {
    if (list) el.setInnerContent(changesHtml(app, list.releases), { html: true });
    else if (!changes) el.setInnerContent(`<p class="cnone">Couldn't load the list - try again in a moment.</p>`, { html: true });
  } });
  const ready = Object.keys(FILES).filter((w) => fileFor(rel, w));
  if (!ready.length) return fresh(out.transform(res));
  const v = versionOf(rel);
  const when = Date.parse(rel.published || "");
  const day = when ? ` · ${new Date(when).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : "";
  return fresh(out
    .on("[data-dl]", { element(el) {
      const what = el.getAttribute("data-dl");
      if (!ready.includes(what)) return;
      el.tagName = "a";
      el.setAttribute("href", `/aimdot/download/${what}`);
      el.setAttribute("class", "btn app dl");
      el.removeAttribute("aria-disabled");
    } })
    .on("[data-dl-soon]", { element(el) { if (ready.includes(el.getAttribute("data-dl-soon"))) el.remove(); } })
    .on("[data-dl-version]", { element(el) {
      if (v) el.setInnerContent(`Aimdot ${v}${day} · Windows and Linux · <a href="#changes">What's new</a>`, { html: true });
    } })
    .transform(res));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    let m = p.match(/^\/aimdot\/download\/([a-z-]+)\/?$/);
    if (m) return FILES[m[1]] ? download(env, m[1]) : env.ASSETS.fetch(req);   // unknown: the 404 page
    m = p.match(/^\/aimdot\/update\/([a-z]+)\/([a-z0-9_]+)\/v?([0-9][0-9a-z.+-]{0,30})\/?$/);
    if (m) return update(env, m[1], m[2], m[3]);
    m = p.match(/^\/([a-z]+)\/changes\/?$/);
    if (m && APPS[m[1]]) {
      const out = await changesOf(env, m[1]).catch((e) => { console.log("changes error", e && e.message); return null; });
      if (!out) return new Response(JSON.stringify({ error: "try again in a moment" }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      return new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });
    }
    if (p === "/aimdot" || p === "/lasso") return appPage(req, env, p.slice(1));
    return env.ASSETS.fetch(req);
  },
};
