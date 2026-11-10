// sonela.app: the pages are static files (public/). This small script only handles Aimdot's downloads, its update
// check and the download buttons on /aimdot. No database, no cookies, nothing about visitors is stored.
//
//   /aimdot/download/<windows|windows-portable|linux|linux-tar>  -> 302 to the file in the GitHub release "latest"
//   /aimdot/update/<windows|linux>/<arch>/<current version>       -> 204 = nothing to install (x-aimdot-why: current,
//                                                                     no-release, internal, unsigned, unknown-os, paused),
//                                                                     else JSON {version, notes, pub_date, url, signature}
//   /aimdot                                                       -> the static page; its download buttons switch from
//                                                                     "Coming soon" to real links once the release has the file
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
// update check: which download the app replaces itself with, per OS (needs its .sig next to it)
const UPDATE_FILES = { windows: "windows", linux: "linux" };
const ARCHES = new Set(["x86_64", "x64", "amd64"]);   // aarch64 etc.: no builds yet -> 204 no-release
const fileUrl = (name) => `https://github.com/${REPO}/releases/download/latest/${encodeURIComponent(name)}`;
const UA = { "user-agent": "sonela-hub" };

// ----- the release "latest": GitHub's API (cached 5 min per Worker copy), else github.com itself, else the last good one -----
let memo = { at: 0, rel: undefined };
const sigMemo = new Map();
const nowS = () => Math.floor(Date.now() / 1000);

async function latestRelease(env) {
  if (memo.rel !== undefined && nowS() - memo.at < (memo.rel ? 300 : 30)) return memo.rel;
  const keep = new Request("https://sonela.app/_cache/aimdot-release");
  let rel = null, gone = false;
  try {
    const auth = env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {};
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/latest`, {
      headers: { ...UA, ...auth, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
    if (r.ok) {
      const j = await r.json();
      rel = { name: j.name || "", body: j.body || "", published: j.published_at || j.created_at || "", files: (j.assets || []).map((a) => a.name) };
    } else if (r.status === 404) {
      gone = true;   // no release yet, or "latest" is being rebuilt right now (its files are gone too)
    } else {
      console.log("github api", r.status);
    }
  } catch (e) { console.log("github api error", e && e.message); }
  if (!rel && !gone) rel = await releaseFromWeb().catch(() => null);   // rate limit etc.: read github.com instead
  if (rel) {
    try { await caches.default.put(keep, new Response(JSON.stringify(rel), { headers: { "cache-control": "max-age=604800" } })); } catch {}
  } else if (!gone) {
    try { const hit = await caches.default.match(keep); if (hit) rel = await hit.json(); } catch {}
  }
  memo = { at: nowS(), rel };
  return rel;
}

// title + text from the releases feed, files checked with HEAD on their download links (a redirect = it's there)
async function releaseFromWeb() {
  const feed = await fetch(`https://github.com/${REPO}/releases.atom`, { headers: { ...UA, accept: "application/atom+xml" } });
  if (!feed.ok) return null;
  const xml = await feed.text();
  const entry = (xml.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1] || "";
  const unesc = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const name = unesc(((entry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "").trim());
  const tag = (((entry.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "").match(/\/releases\/tag\/([^"/?#]+)/) || [])[1];
  if (!/\d+\.\d+\.\d+/.test(name) || tag !== "latest") return null;
  const html = unesc((entry.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "");
  const body = unesc(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n").replace(/<[^>]+>/g, ""));
  const published = ((entry.match(/<updated>([^<]+)<\/updated>/) || [])[1] || "").trim();
  const names = [];
  for (const list of Object.values(FILES)) for (const n of list) names.push(n, `${n}.sig`);
  const have = await Promise.all(names.map(async (n) => {
    try {
      const h = await fetch(fileUrl(n), { method: "HEAD", redirect: "manual", headers: UA });
      return h.status >= 300 && h.status < 400;
    } catch { return false; }
  }));
  const files = names.filter((n, i) => have[i]);
  return files.length ? { name, body, published, files } : null;
}

const versionOf = (rel) => rel && (rel.name.match(/\d+\.\d+\.\d+/) || [])[0];
const fileFor = (rel, what) => rel && (FILES[what] || []).find((n) => rel.files.includes(n));
const verNum = (v) => String(v || "").replace(/^v/, "").split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
function newer(a, b) {
  const x = verNum(a), y = verNum(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
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
  const notes = ((rel.body.match(/Built from: (.*)/) || [])[1] || "").trim();
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

// /aimdot: each button in the page is <span class="btn off" data-dl="<what>">..<small data-dl-soon="<what>">Coming
// soon</small></span>. Once the release has that file: a real link to /aimdot/download/<what>, without the "Coming soon".
async function aimdotPage(req, env) {
  const res = await env.ASSETS.fetch(req);
  if (res.status !== 200 || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  const rel = await latestRelease(env).catch(() => null);
  const ready = Object.keys(FILES).filter((w) => fileFor(rel, w));
  if (!ready.length) return res;
  const v = versionOf(rel);
  return new HTMLRewriter()
    .on("[data-dl]", { element(el) {
      const what = el.getAttribute("data-dl");
      if (!ready.includes(what)) return;
      el.tagName = "a";
      el.setAttribute("href", `/aimdot/download/${what}`);
      el.setAttribute("class", "btn app dl");
      el.removeAttribute("aria-disabled");
    } })
    .on("[data-dl-soon]", { element(el) { if (ready.includes(el.getAttribute("data-dl-soon"))) el.remove(); } })
    .on("[data-dl-version]", { element(el) { if (v) el.setInnerContent(`Version ${v} · `); } })
    .transform(res);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    let m = p.match(/^\/aimdot\/download\/([a-z-]+)\/?$/);
    if (m) return FILES[m[1]] ? download(env, m[1]) : env.ASSETS.fetch(req);   // unknown: the 404 page
    m = p.match(/^\/aimdot\/update\/([a-z]+)\/([a-z0-9_]+)\/v?([0-9][0-9a-z.+-]{0,30})\/?$/);
    if (m) return update(env, m[1], m[2], m[3]);
    if (p === "/aimdot") return aimdotPage(req, env);
    return env.ASSETS.fetch(req);
  },
};
