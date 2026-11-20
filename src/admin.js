// sonela.app/admin: one private page with the numbers of every Sonela app - downloads, installs and users per day
// (last 30 days, UTC), all-time totals, versions in use and the Windows / Linux split. Numbers only: no IP, no ID,
// nothing about one person is stored or shown.
//
// Where each app's numbers come from:
//   - apps served by this site (APPS in worker.js: Aimdot, Lasso, ...): the D1 database bound as STATS (schema.sql).
//     A new app here = its APPS entry in worker.js; it shows up on this page by itself.
//   - apps with a server of their own (OUTSIDE below: Echo): a Cloudflare service binding to that server's
//     "HubStats" entrypoint (wrangler.toml [[services]]), which answers summary(days) in the same shape as hubSummaries.
//     That entrypoint has no web address (only Workers in the same Cloudflare account can bind to it), so no secret
//     travels and nobody else can ask. A new app with its own server = one OUTSIDE entry + one [[services]] binding.
//
// Sign-in: echoclip.link/admin's own email code, through the same binding (HubStats.signInStart / signInVerify: only
// Echo's ADMIN_EMAIL gets a code, with Echo's limits per network and address). The adm_ session Echo hands out is kept
// in an HttpOnly cookie and checked with Echo on every page (isAdmin), so signing out on either side or 180 days unused
// ends it. No password of its own. /admin/data.json = the same numbers as JSON (same session).

const OUTSIDE = [
  { id: "echo", name: "Echo", color: "#7c5cff", binding: "ECHO", page: "https://echoclip.link",
    more: { href: "https://echoclip.link/admin", text: "Echo's full admin page: Echo Cloud accounts, money, performance, update answers, releases, moderation" } },
];
const DAYS = 30;
const DAY = 86400;
const utcDay = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const osOf = (s) => (String(s).startsWith("windows") ? "windows" : String(s).startsWith("linux") ? "linux" : "other");
const blank = () => ({ windows: 0, linux: 0, other: 0 });
const sum = (o) => (o ? (o.windows || 0) + (o.linux || 0) + (o.other || 0) : 0);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Math.round(n || 0).toLocaleString("en-US");

// every app in the list (APPS from worker.js + OUTSIDE), Echo first
export function appList(apps) {
  return [...OUTSIDE.map((a) => ({ ...a, from: "binding" })),
    ...Object.entries(apps).map(([id, a]) => ({ id, name: a.name, color: a.color || "#8c8c8c", from: "hub", page: `/${id}` }))];
}

// The hub's own apps from D1, one shape per app (the same shape echo-cloud's HubStats answers - see its hub_stats.js).
export async function hubSummaries(DB, ids, days = DAYS, at = Math.floor(Date.now() / 1000)) {
  const list = [...Array(days)].map((_, i) => utcDay(at - (days - 1 - i) * DAY));
  const out = {};
  for (const id of ids) out[id] = { days: list.map((day) => ({ day, download: blank(), install: blank(), user: blank() })),
    totals: { download: blank(), install: blank() }, versions: [], since: {}, extra: [] };
  if (!DB) return out;
  const [daily, totals, firsts, vers] = (await DB.batch([
    DB.prepare("SELECT app, day, kind, os, SUM(n) AS n FROM daily WHERE day >= ?1 GROUP BY app, day, kind, os").bind(list[0]),
    DB.prepare("SELECT app, kind, os, SUM(n) AS n FROM daily GROUP BY app, kind, os"),
    DB.prepare("SELECT app, kind, MIN(day) AS day FROM daily GROUP BY app, kind"),
    DB.prepare("SELECT app, version, os, SUM(n) AS n FROM daily WHERE kind = 'user' AND day >= ?1 GROUP BY app, version, os")
      .bind(utcDay(at - 6 * DAY)),
  ])).map((r) => (r && r.results) || []);
  const idx = new Map(list.map((d, i) => [d, i]));
  for (const r of daily) {
    const d = out[r.app] && out[r.app].days[idx.get(r.day)];
    if (d && d[r.kind]) d[r.kind][osOf(r.os)] += r.n || 0;
  }
  for (const r of totals) if (out[r.app] && out[r.app].totals[r.kind]) out[r.app].totals[r.kind][osOf(r.os)] += r.n || 0;
  for (const r of firsts) if (out[r.app]) out[r.app].since[r.kind] = r.day;
  const byVer = new Map();
  for (const r of vers) {
    if (!out[r.app]) continue;
    const key = `${r.app} ${r.version}`;
    const v = byVer.get(key) || { app: r.app, version: r.version, ...blank() };
    v[osOf(r.os)] += r.n || 0;
    byVer.set(key, v);
  }
  for (const v of byVer.values()) out[v.app].versions.push({ version: v.version, windows: v.windows, linux: v.linux, other: v.other });
  for (const id of ids) out[id].versions.sort((a, b) => sum(b) - sum(a));
  return out;
}

// all apps' numbers: {id: summary} or {id: {error}} when that app's source can't be read right now
export async function summaries(env, apps, at, token) {
  const list = appList(apps);
  const hubIds = list.filter((a) => a.from === "hub").map((a) => a.id);
  const out = {};
  await Promise.all([
    hubSummaries(env.STATS, hubIds, DAYS, at).then((s) => {
      for (const id of hubIds) out[id] = env.STATS ? s[id] : { error: "No database yet (wrangler.toml: STATS - see its comments)." };
    }).catch((e) => { for (const id of hubIds) out[id] = { error: `Database error: ${e && e.message}` }; }),
    ...list.filter((a) => a.from === "binding").map(async (a) => {
      const b = env[a.binding];
      if (!b || typeof b.summary !== "function") { out[a.id] = { error: `Not connected yet (wrangler.toml: service binding ${a.binding}).` }; return; }
      try {
        const s = await b.summary(DAYS, token);
        out[a.id] = s && Array.isArray(s.days) ? s : { error: "Unexpected answer." };
      } catch (e) { out[a.id] = { error: `Couldn't read it right now (${e && e.message}).` }; }
    }),
  ]);
  return out;
}

// ----- sign-in (Echo's admin email code) -----
const COOKIE = "__Host-sonela_admin";
const tokenOf = (req) => ((req.headers.get("cookie") || "").match(/(?:^|;\s*)__Host-sonela_admin=(adm_[0-9a-f]{64})/) || [])[1] || "";
const cookie = (v, age) => `${COOKIE}=${v}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
const KEEP = 180 * DAY;   // like Echo's sessions (Echo ends them after 180 days unused)

const HEAD = {
  "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin", "x-frame-options": "DENY",   // no-referrer would make the forms send Origin: null
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const html = (body, status = 200, more = {}) => new Response(body, { status, headers: { ...HEAD, "content-type": "text/html; charset=utf-8", ...more } });
const go = (to, more = {}) => new Response(null, { status: 303, headers: { ...HEAD, location: to, ...more } });

export async function admin(req, env, apps, notFound) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const echo = env.ECHO;
  if (!echo || typeof echo.isAdmin !== "function") return html(signIn("", "Sign-in needs the connection to echo-cloud (wrangler.toml: ECHO)."), 503);
  const ip = req.headers.get("cf-connecting-ip") || "?";
  const token = tokenOf(req);
  if (req.method === "POST") {
    // forms only from this page (the cookie is SameSite=Strict too): Origin = this site, or the browser says same-origin
    const origin = req.headers.get("origin");
    const same = origin ? origin === url.origin : req.headers.get("sec-fetch-site") === "same-origin";
    if (!same) return new Response("Wrong origin", { status: 403, headers: HEAD });
    const f = await req.formData().catch(() => null);
    const email = String((f && f.get("email")) || "").trim().slice(0, 200);
    try {
      if (path === "/admin/sign-in") {
        const r = await echo.signInStart(email, ip);
        return r && r.error ? html(signIn(email, r.error), r.status === 429 ? 429 : 400) : html(codePage(email));
      }
      if (path === "/admin/code") {
        const r = await echo.signInVerify(email, String((f && f.get("code")) || ""), ip);
        if (!r || !r.token) return html(codePage(email, (r && r.error) || "Wrong code"), (r && r.status === 429) ? 429 : 400);
        return go("/admin", { "set-cookie": cookie(r.token, KEEP) });
      }
      if (path === "/admin/sign-out") {
        if (token) await echo.signOut(token);
        return go("/admin", { "set-cookie": cookie("", 0) });
      }
    } catch (e) {
      return html(signIn(email, `Echo's server couldn't be reached - try again in a moment (${e && e.message}).`), 503);
    }
    return notFound();
  }
  if (path !== "/admin" && path !== "/admin/data.json") return notFound();
  let ok = false;
  try { ok = !!token && (await echo.isAdmin(token)); } catch (e) {
    return html(signIn("", `Echo's server couldn't be reached - try again in a moment (${e && e.message}).`), 503);
  }
  if (!ok) {
    const out = token ? { "set-cookie": cookie("", 0) } : {};
    if (path === "/admin/data.json") return new Response(JSON.stringify({ error: "signed out" }), { status: 401, headers: { ...HEAD, ...out, "content-type": "application/json" } });
    return html(signIn("", token ? "Signed out - sign in again." : ""), 200, out);
  }
  const at = Math.floor(Date.now() / 1000);
  const data = await summaries(env, apps, at, token);
  if (path === "/admin/data.json")
    return new Response(JSON.stringify({ at, days: DAYS, apps: appList(apps).map(({ id, name }) => ({ id, name, ...data[id] })) }),
      { headers: { ...HEAD, "content-type": "application/json" } });
  return html(page(appList(apps), data, at));
}

function signIn(email, error) {
  return shell(`<div class="box signin"><p>Sign in with the admin email: the same email code as echoclip.link/admin.</p>
<form method="post" action="/admin/sign-in"><label>Email<input type="email" name="email" value="${esc(email)}" required autocomplete="email" autofocus></label>
<button>Send code</button></form>${error ? `<p class="warn">${esc(error)}</p>` : ""}</div>`);
}
function codePage(email, error) {
  return shell(`<div class="box signin"><p>If <b>${esc(email)}</b> is the admin address, a 6-digit code is on its way (an email "Your Echo
sign-in code"). It works for 10 minutes.</p>
<form method="post" action="/admin/code"><input type="hidden" name="email" value="${esc(email)}">
<label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="9" required autofocus></label><button>Sign in</button></form>
${error ? `<p class="warn">${esc(error)}</p>` : ""}
<form method="post" action="/admin/sign-in" class="again"><input type="hidden" name="email" value="${esc(email)}"><button class="link">Send a new code</button></form>
<p class="small"><a href="/admin">Use another address</a></p></div>`);
}

// ----- the page (no script: the charts are SVG drawn here, hovering a day shows its numbers) -----
const SERIES = [["windows", "Windows"], ["linux", "Linux"], ["other", "Other"]];
const dshort = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (a, b) => (b ? `${Math.round(a / b * 100)}%` : "-");

function view(s) {
  const d = s.days, last = d.length - 1;
  const k = (kind, from, to = last) => d.slice(from, to + 1).reduce((t, x) => t + sum(x[kind]), 0);
  const os30 = blank();
  for (const x of d) for (const [o] of SERIES) os30[o] += (x.user && x.user[o]) || 0;
  return {
    today: sum(d[last].user), yesterday: last ? sum(d[last - 1].user) : 0,
    avg7: d.length > 7 ? k("user", last - 7, last - 1) / 7 : 0,   // the 7 whole days before today
    dl30: k("download", 0), in30: k("install", 0), dlAll: sum(s.totals.download), inAll: sum(s.totals.install),
    os30, visitors30: d.some((x) => "visitors" in x) ? d.reduce((t, x) => t + (x.visitors || 0), 0) : null,
  };
}

// a small bar chart: one bar per day, Windows at the bottom, Linux on top (2px gap between them)
function chart(days, kind, title) {
  const W = 300, H = 96, top = 14, base = 80, slot = W / days.length, bw = Math.max(2, slot - 3);
  const vals = days.map((x) => (kind === "visitors" ? { windows: 0, linux: 0, other: x.visitors || 0 } : x[kind]));
  const peak = Math.max(1, ...vals.map(sum));
  const total = vals.reduce((t, v) => t + sum(v), 0);
  const y = (n) => (n / peak) * (base - top);
  let bars = "";
  days.forEach((x, i) => {
    const v = vals[i], X = (i * slot + (slot - bw) / 2).toFixed(1);
    let yy = base, segs = "";
    const parts = kind === "visitors" ? [["other", v.other]] : SERIES.map(([o]) => [o, v[o]]).filter(([, n]) => n > 0);
    parts.forEach(([o, n], j) => {
      const h = y(n);
      if (h <= 0) return;
      const gap = j ? 2 : 0;
      const hh = Math.max(1, h - gap);
      yy -= h;
      const cls = kind === "visitors" ? "s1" : `s-${o}`;
      // the top segment gets a rounded end, the rest are square
      segs += j === parts.length - 1 && hh > 3
        ? `<path class="${cls}" d="M${X} ${(yy + hh).toFixed(1)}V${(yy + 2).toFixed(1)}q0 -2 2 -2h${(bw - 4).toFixed(1)}q2 0 2 2V${(yy + hh).toFixed(1)}z"/>`
        : `<rect class="${cls}" x="${X}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}"/>`;
    });
    const tip = kind === "visitors" ? `${dshort(x.day)}: ${num(v.other)} visitors`
      : `${dshort(x.day)}: ${num(sum(v))} ${title.toLowerCase()} - Windows ${num(v.windows)}, Linux ${num(v.linux)}${v.other ? `, other ${num(v.other)}` : ""}`;
    bars += `<g class="day"><title>${esc(tip)}</title><rect class="hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"/>${segs}</g>`;
  });
  return `<figure class="chart"><figcaption><b>${esc(title)}</b><span>${num(total)} in ${days.length} days</span></figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} per day, last ${days.length} days, ${num(total)} in all">
<line class="grid" x1="0" x2="${W}" y1="${top}" y2="${top}"/>${total ? `<text class="ax" x="0" y="${top - 4}">${num(peak)}</text>` : `<text class="ax" x="${W / 2}" y="${base - 30}" text-anchor="middle">nothing yet</text>`}
${bars}<line class="axis" x1="0" x2="${W}" y1="${base}" y2="${base}"/>
<text class="ax" x="0" y="${H - 2}">${esc(dshort(days[0].day))}</text><text class="ax" x="${W}" y="${H - 2}" text-anchor="end">Today</text></svg></figure>`;
}

function split(os) {
  const t = sum(os);
  if (!t) return `<span class="muted">no users yet</span>`;
  return `<span class="sw s-windows"></span>Windows ${pct(os.windows, t)} · <span class="sw s-linux"></span>Linux ${pct(os.linux, t)}${os.other ? ` · other ${pct(os.other, t)}` : ""}`;
}

function section(a, s) {
  const head = `<h2 id="${esc(a.id)}"><span class="dot" style="background:${esc(a.color)}"></span>${esc(a.name)}
<a class="small" href="${esc(a.page)}">${esc(a.page.replace(/^https:\/\//, ""))}</a></h2>`;
  const more = a.more ? `<p class="more"><a href="${esc(a.more.href)}">${esc(a.more.text)} →</a></p>` : "";
  if (!s || s.error) return `<section class="app">${head}<p class="warn">⚠ ${esc((s && s.error) || "No numbers.")}</p>${more}</section>`;
  const v = view(s);
  const tiles = [
    ["Users today", num(v.today), "so far (UTC day)"], ["Users yesterday", num(v.yesterday), ""],
    ["Daily users", num(Math.round(v.avg7 * 10) / 10), "average, last 7 whole days"],
    ["Downloads", num(v.dl30), `30 days · ${num(v.dlAll)} all time`], ["Installs", num(v.in30), `30 days · ${num(v.inAll)} all time`],
    ...(s.extra || []).map((x) => [x.label, num(x.value), ""]),
  ].map(([l, n, sub]) => `<div class="tile"><span>${esc(l)}</span><b>${n}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`).join("");
  const funnel = v.visitors30 != null
    ? `${num(v.visitors30)} website visitors → ${num(v.dl30)} downloads (${pct(v.dl30, v.visitors30)}) → ${num(v.in30)} installs (${pct(v.in30, v.dl30)})`
    : `${num(v.dl30)} downloads → ${num(v.in30)} installs (${pct(v.in30, v.dl30)})`;
  const vt = s.versions.reduce((t, x) => t + sum(x), 0);
  const vpeak = Math.max(1, ...s.versions.map(sum));
  const versions = s.versions.length ? `<table class="vers"><thead><tr><th>Version</th><th>Windows</th><th>Linux</th><th>Share</th></tr></thead><tbody>${
    s.versions.slice(0, 12).map((x) => `<tr><td>${esc(x.version)}</td><td>${num(x.windows)}</td><td>${num(x.linux + x.other)}</td>
<td><span class="vbar"><i class="s-windows" style="width:${(x.windows / vpeak * 100).toFixed(1)}%"></i><i class="s-linux" style="width:${((x.linux + x.other) / vpeak * 100).toFixed(1)}%"></i></span>${pct(sum(x), vt)}</td></tr>`).join("")
  }</tbody></table>` : `<p class="muted">No app has checked in during the last 7 days.</p>`;
  const rows = s.days.slice().reverse().map((x) => {
    const c = (o) => (sum(o) ? `${num(sum(o))} <small>${num(o.windows)} / ${num(o.linux + o.other)}</small>` : `<small>0</small>`);
    return `<tr><td>${esc(x.day)}</td>${"visitors" in x ? `<td>${num(x.visitors)}</td>` : ""}<td>${c(x.download)}</td><td>${c(x.install)}</td><td>${c(x.user)}</td></tr>`;
  }).join("");
  const since = Object.entries(s.since || {}).filter(([, d]) => d).map(([k, d]) => `${k}s since ${esc(d)}`).join(" · ");
  return `<section class="app">${head}
<div class="tiles">${tiles}</div>
<p class="line"><b>Funnel, 30 days:</b> ${funnel}</p>
<p class="line"><b>Users by system, 30 days:</b> ${split(v.os30)}</p>
<div class="charts">${chart(s.days, "download", "Downloads")}${chart(s.days, "install", "Installs")}${chart(s.days, "user", "Users")}${
    "visitors" in s.days[0] ? chart(s.days, "visitors", "Website visitors") : ""}</div>
<h3>Versions in use, last 7 days</h3>${versions}
<details><summary>Every day as a table</summary><table class="days"><thead><tr><th>Day (UTC)</th>${"visitors" in s.days[0] ? "<th>Visitors</th>" : ""}<th>Downloads</th><th>Installs</th><th>Users</th></tr></thead><tbody>${rows}</tbody></table>
<p class="small">Small numbers: Windows / Linux.</p></details>
${since ? `<p class="small">Counting started: ${since}.</p>` : ""}${more}</section>`;
}

function page(list, data, at) {
  const over = list.map((a) => {
    const s = data[a.id];
    if (!s || s.error) return `<tr><td><a href="#${esc(a.id)}"><span class="dot" style="background:${esc(a.color)}"></span>${esc(a.name)}</a></td><td colspan="6" class="muted">not available</td></tr>`;
    const v = view(s);
    return `<tr><td><a href="#${esc(a.id)}"><span class="dot" style="background:${esc(a.color)}"></span>${esc(a.name)}</a></td><td>${num(v.today)}</td><td>${num(v.yesterday)}</td>
<td>${num(Math.round(v.avg7 * 10) / 10)}</td><td>${num(v.dl30)}</td><td>${num(v.in30)}</td><td>${num(v.inAll)}</td></tr>`;
  }).join("");
  const time = new Date(at * 1000).toISOString().slice(0, 16).replace("T", " ");
  return shell(`<p class="small">Updated ${esc(time)} UTC · days are UTC days · numbers only, nothing about one person.
Downloads = download links clicked · Installs = first starts · Users = app copies used that day (each counted once a day).</p>
<p class="legend"><span><span class="sw s-windows"></span>Windows</span><span><span class="sw s-linux"></span>Linux</span><span><span class="sw s-other"></span>Other system</span></p>
<div class="box wrap"><table><thead><tr><th>App</th><th>Users today</th><th>Users yesterday</th><th>Daily users (7-day avg)</th><th>Downloads, 30 d</th><th>Installs, 30 d</th><th>Installs, all time</th></tr></thead>
<tbody>${over}</tbody></table></div>
${list.map((a) => section(a, data[a.id])).join("\n")}
`, true);
}

const CSS = `
:root{color-scheme:light;--bg:#f6f6f4;--surface:#fff;--ink:#111317;--muted:#5d636b;--line:#e3e3df;--grid:#ecece8;
--windows:#2a78d6;--linux:#eb6834;--other:#8c8c8c;--s1:#1baf7a;--warn:#8a5a00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#0a0a0a;--surface:#151515;--ink:#efefef;--muted:#9a9a9a;
--line:#2a2a2a;--grid:#232323;--windows:#3987e5;--linux:#d95926;--other:#7a7a7a;--s1:#199e70;--warn:#e0b050}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#0a0a0a;--surface:#151515;--ink:#efefef;--muted:#9a9a9a;--line:#2a2a2a;--grid:#232323;
--windows:#3987e5;--linux:#d95926;--other:#7a7a7a;--s1:#199e70;--warn:#e0b050}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 60px}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:0 0 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
h3{font-size:14px;margin:22px 0 8px}a{color:inherit}.small,small{color:var(--muted);font-size:12px;font-weight:400}.muted{color:var(--muted)}
.warn{color:var(--warn)}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:0}
h2 .dot{margin:0}.app,.box{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px;margin-top:18px}
table{border-collapse:collapse;width:100%}th,td{padding:6px 10px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--muted);font-weight:500;font-size:12px}th:first-child,td:first-child{text-align:left}.wrap{overflow-x:auto}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}.tile{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column}
.tile span{color:var(--muted);font-size:12px}.tile b{font-size:22px;font-variant-numeric:tabular-nums}.line{margin:12px 0 0}
.charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin-top:16px}.chart{margin:0}
.chart figcaption{display:flex;justify-content:space-between;gap:8px;font-size:13px}.chart figcaption span{color:var(--muted);font-size:12px}
svg{width:100%;height:auto;display:block;overflow:visible}.grid{stroke:var(--grid);stroke-width:1}.axis{stroke:var(--line);stroke-width:1}
.ax{fill:var(--muted);font-size:9px}.hit{fill:transparent}.day:hover .hit{fill:var(--grid)}
.s-windows{fill:var(--windows);background:var(--windows)}.s-linux{fill:var(--linux);background:var(--linux)}.s-other{fill:var(--other);background:var(--other)}.s1{fill:var(--s1)}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 2px;vertical-align:-1px}
.legend{display:flex;gap:14px;font-size:12px;color:var(--muted);margin-top:6px}
.vers td:last-child{display:flex;align-items:center;justify-content:flex-end;gap:8px}.vbar{display:inline-flex;gap:2px;width:120px;height:8px}
.vbar i{display:block;height:8px;border-radius:2px}.vers td,.days td{font-variant-numeric:tabular-nums}
details{margin-top:16px}summary{cursor:pointer;color:var(--muted)}.more{margin:16px 0 0}.more a{font-weight:500}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.top form{margin:0}
button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
button:hover{border-color:var(--muted)}.signin{max-width:440px}.signin form{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:12px 0}
.signin label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);flex:1;min-width:200px}
.signin input{font:inherit;font-size:15px;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
button.link{border:0;background:none;padding:0;color:var(--muted);text-decoration:underline}.again{margin:4px 0}
@media (max-width:600px){main{padding:16px 16px 40px}.tile b{font-size:19px}}
`;
function shell(body, signedIn = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Sonela admin</title><link rel="icon" href="/favicon.svg"><style>${CSS}</style></head><body><main>
<header class="top"><h1>Sonela admin</h1>${signedIn ? `<form method="post" action="/admin/sign-out"><button>Sign out</button></form>` : ""}</header>
${body}</main></body></html>`;
}
