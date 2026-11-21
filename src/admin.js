// sonela.app/admin: the WHOLE echoclip.link/admin page with an app switcher (Echo / Aimdot / Lasso ...) in its top-left
// corner, like an account switcher. There is one copy of the page: Echo's own admin.html + admin.js, read from the
// echo-cloud Worker on every visit, so whatever echoclip.link/admin gets, this page gets too.
//
//   GET  /admin                  Echo's admin.html + this site's settings on <main data-cfg> (the switcher's apps,
//                                where Echo's calls go). The page signs in with Echo's admin email code, as on echoclip.link.
//   GET  /admin/admin.js         Echo's admin.js
//   *    /admin/echo/<path>      Echo's own calls (sign-in, stats, releases, moderation): passed on to echo-cloud through
//                                the ECHO_WEB service binding, only the paths in ECHO_CALLS. echo-cloud does every check
//                                itself (admin session, limits per network - the visitor's IP goes along for those).
//   GET  /admin/app/<id>/stats   an app counted by this site (APPS in worker.js: Aimdot, Lasso, ...) in the page's own
//                                shape, from the D1 STATS (numbers per day only). Only for a valid Echo admin session
//                                (asked through the ECHO binding - echo-cloud's HubStats entrypoint, no web address).
//
// A new app counted here = its APPS entry in worker.js (name, note, icon): it shows up in the switcher by itself.

const ECHO_SITE = "https://echoclip.link";
const ECHO_CALLS = new Set(["POST /auth/start", "POST /auth/verify", "POST /auth/logout", "GET /admin/stats", "POST /admin/release",
  "POST /admin/takedown", "POST /admin/profile-takedown", "POST /admin/profile-handle", "GET /admin/mods", "POST /admin/mods"]);
const DAY = 86400;
const utcDay = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const attr = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const HEAD = {
  "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin", "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...HEAD, "content-type": "application/json" } });

// the switcher's list: Echo first, then every app counted here
export function appList(apps) {
  return [{ id: "echo", name: "Echo", note: "game clips", icon: "/echo.png", stats: "/admin/echo/admin/stats" },
    ...Object.entries(apps).map(([id, a]) => ({ id, name: a.name, note: a.note || "", icon: a.icon || "", stats: `/admin/app/${id}/stats` }))];
}

// opts: { apps, latest(app) -> newest released version or null, notFound() }
export async function admin(req, env, opts) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!env.ECHO || !env.ECHO_WEB) return new Response("sonela.app/admin needs the connection to echo-cloud (wrangler.toml: ECHO and ECHO_WEB).", { status: 503, headers: HEAD });
  try {
    if (path === "/admin" && (req.method === "GET" || req.method === "HEAD")) return await page(env, opts.apps);
    if (path === "/admin/admin.js" && req.method === "GET") {
      const { js } = await env.ECHO.adminFiles();
      if (!js) return new Response("// echo-cloud sent no admin.js", { status: 502, headers: { ...HEAD, "content-type": "text/javascript" } });
      return new Response(js, { headers: { ...HEAD, "content-type": "text/javascript; charset=utf-8" } });
    }
    let m = path.match(/^\/admin\/echo(\/[a-z/-]+)$/);
    if (m) return await passOn(req, env, m[1]);
    m = path.match(/^\/admin\/app\/([a-z0-9-]+)\/stats$/);
    if (m && req.method === "GET") return await appStats(req, env, opts, m[1]);
  } catch (e) {
    console.log("admin error", e && e.message);
    return json({ error: "Couldn't reach echoclip.link - try again in a moment" }, 502);
  }
  return opts.notFound();
}

async function page(env, apps) {
  const { html } = await env.ECHO.adminFiles();
  if (!/<main id="app"[^>]*>/.test(html || "") || !/src="\/admin\.js[^"]*"/.test(html)) {
    return new Response("Echo's admin page looks different than expected - src/admin.js needs a look.", { status: 502, headers: HEAD });
  }
  const cfg = { api: "/admin/echo", site: ECHO_SITE, apps: appList(apps) };
  const out = html.replace(/<title>[^<]*<\/title>/, "<title>Sonela admin</title>")
    .replace(/<main id="app"([^>]*)>/, (_, rest) => `<main id="app"${rest} data-cfg="${attr(JSON.stringify(cfg))}">`)
    .replace(/src="\/admin\.js([^"]*)"/, 'src="/admin/admin.js$1"')
    .replace("<head>", '<head>\n<link rel="icon" href="/favicon.svg">');
  return new Response(out, { headers: { ...HEAD, "content-type": "text/html; charset=utf-8" } });
}

// Echo's own calls, unchanged except: the sign-in is always the ADMIN sign-in (only Echo's admin address gets a code)
async function passOn(req, env, p) {
  if (!ECHO_CALLS.has(`${req.method} ${p}`)) return json({ error: "not here" }, 404);
  let body;
  if (req.method === "POST") {
    body = await req.text();
    if (p === "/auth/start" || p === "/auth/verify") {
      let b = {}; try { b = JSON.parse(body || "{}"); } catch { }
      body = JSON.stringify({ email: b.email, code: b.code, admin: true });
    }
  }
  const h = new Headers();
  for (const k of ["content-type", "authorization", "user-agent"]) if (req.headers.get(k)) h.set(k, req.headers.get(k));
  h.set("cf-connecting-ip", req.headers.get("cf-connecting-ip") || "?");   // Echo's limits per network
  const r = await env.ECHO_WEB.fetch(new Request(ECHO_SITE + p, { method: req.method, headers: h, body }));
  return new Response(r.body, { status: r.status, headers: { ...HEAD, "content-type": r.headers.get("content-type") || "application/json" } });
}

async function appStats(req, env, opts, id) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !(await env.ECHO.isAdmin(token))) return json({ error: "Signed out - sign in again" }, 403);
  const app = opts.apps[id];
  if (!app) return json({ error: "No such app" }, 404);
  const latest = await Promise.resolve(opts.latest ? opts.latest(id) : null).catch(() => null);
  return json(await liteStats(env.STATS, id, app, latest || null));
}

// One app's numbers in the shape of Echo's /admin/stats (the parts the page draws for "lite" apps):
//   apps: {rows: [{day, k, n}] with k = app:<os> (copies used that day), appv:<os>:<version>, inst:<os>; latest; today}
//   site: {keys: {"dl:<button>": [today, 7 days, 30 days]}, daily: [{day, downloads, dlw, dll, visitors: 0, views: 0}]}
//   installs: {total, windows, linux, d1, d7, d30}
export async function liteStats(DB, id, app, latest, at = Math.floor(Date.now() / 1000)) {
  const today = utcDay(at), d30 = [...Array(30)].map((_, i) => utcDay(at - (29 - i) * DAY));
  const out = {
    at, lite: true, app: { id, name: app.name },
    apps: { rows: [], latest, today, uniq: null, lite: true,
      note: `Copies of ${app.name} in use, each counted once a day (UTC) - the app tells sonela.app once a day, with no ID.`,
      inst_note: "first start of a new copy" },
    site: { keys: {}, daily: d30.map((day) => ({ day, visitors: 0, views: 0, downloads: 0, dlw: 0, dll: 0 })) },
    installs: { total: 0, windows: 0, linux: 0, d1: 0, d7: 0, d30: 0 },
    releases: [],
    note: `${app.name}: downloads = clicks on sonela.app's download links (bots skipped), installs = first starts, users = copies `
      + "used that day. Numbers per day only - no IP, no ID, nothing about one person. Days are UTC."
      + (DB ? "" : " (No database yet - wrangler.toml: STATS.)"),
  };
  if (!DB) return out;
  const [rows, inst] = (await DB.batch([
    DB.prepare("SELECT day, kind, os, version, SUM(n) AS n FROM daily WHERE app = ?1 AND day >= ?2 GROUP BY day, kind, os, version").bind(id, d30[0]),
    DB.prepare("SELECT os, SUM(n) AS n FROM daily WHERE app = ?1 AND kind = 'install' GROUP BY os").bind(id),
  ])).map((r) => (r && r.results) || []);
  const sys = (os) => (String(os).startsWith("windows") ? "windows" : String(os).startsWith("linux") ? "linux" : null);
  const keyed = new Map(), age = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
  const add = (day, k, n) => { const x = `${day} ${k}`; keyed.set(x, (keyed.get(x) || 0) + n); };
  const idx = new Map(d30.map((d, i) => [d, i]));
  for (const r of rows) {
    const os = sys(r.os), n = r.n || 0;
    if (r.kind === "user" && os) { add(r.day, `app:${os}`, n); add(r.day, `appv:${os}:${r.version}`, n); }
    else if (r.kind === "install" && os) {
      add(r.day, `inst:${os}`, n);
      const a = age(r.day); if (a < 1) out.installs.d1 += n; if (a < 7) out.installs.d7 += n; out.installs.d30 += n;
    } else if (r.kind === "download") {
      const d = out.site.daily[idx.get(r.day)];
      if (d) { d.downloads += n; if (os === "linux") d.dll += n; else d.dlw += n; }
      const k = out.site.keys[`dl:${r.os}`] || (out.site.keys[`dl:${r.os}`] = [0, 0, 0]);
      const a = age(r.day); if (a < 1) k[0] += n; if (a < 7) k[1] += n; k[2] += n;
    }
  }
  out.apps.rows = [...keyed].map(([x, n]) => { const [day, k] = x.split(" "); return { day, k, n }; });
  for (const r of inst) { const os = sys(r.os); out.installs.total += r.n || 0; if (os) out.installs[os] += r.n || 0; }
  return out;
}
