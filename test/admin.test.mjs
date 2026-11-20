// sonela.app/admin + the daily counts, run locally with a fake D1 (a real SQLite in memory, node:sqlite) and a fake
// echo-cloud binding. Nothing here talks to Cloudflare or GitHub.   Run: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/worker.js";

// D1's API (prepare / bind / all / run / first / batch) over node:sqlite
export function fakeD1(sql = "") {
  const db = new DatabaseSync(":memory:");
  if (sql) db.exec(sql);
  const prepare = (q) => {
    let args = [];
    const st = {
      bind(...a) { args = a; return st; },
      async all() { return { results: db.prepare(q).all(...args) }; },
      async run() { const r = db.prepare(q).run(...args); return { meta: { changes: r.changes } }; },
      async first() { return db.prepare(q).get(...args) ?? null; },
    };
    return st;
  };
  return { db, prepare, batch: (list) => Promise.all(list.map((s) => s.all())) };
}

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const day = (ago = 0) => new Date(Date.now() - ago * 86400e3).toISOString().slice(0, 10);
const ORIGIN = "https://sonela.app";
const assets = { fetch: async (r) => new Response(new URL(r.url).pathname === "/404" ? "not found page" : "asset", { status: new URL(r.url).pathname === "/404" ? 404 : 200 }) };
const echoSummary = (days) => ({
  days: [...Array(days)].map((_, i) => ({ day: day(days - 1 - i), download: { windows: 2, linux: 1, other: 0 },
    install: { windows: 1, linux: 0, other: 0 }, user: { windows: 40, linux: 10, other: 0 }, visitors: 20 })),
  totals: { download: { windows: 500, linux: 120, other: 0 }, install: { windows: 300, linux: 60, other: 0 } },
  versions: [{ version: "2.0.11", windows: 200, linux: 50, other: 0 }], since: { install: "2026-11-10" },
  extra: [{ label: "Echo Cloud accounts", value: 77 }],
});
// stands in for echo-cloud's HubStats: only ADMIN gets a code, the code makes an adm_ session
const ADMIN = "boss@example.com", TOKEN = "adm_" + "ab".repeat(32);
function fakeEcho(over = {}) {
  const sessions = new Set();
  let code = null;
  return {
    calls: [],
    async signInStart(email, ip) { this.calls.push(["start", email, ip]); if (email === ADMIN) code = "123456"; return { ok: true }; },
    async signInVerify(email, c, ip) {
      this.calls.push(["verify", email, ip]);
      if (email === ADMIN && code && c === code) { sessions.add(TOKEN); code = null; return { token: TOKEN }; }
      return { error: "Wrong code", status: 400 };
    },
    async isAdmin(t) { return sessions.has(t); },
    async signOut(t) { sessions.delete(t); },
    async summary(d, t) { if (!sessions.has(t)) throw new Error("signed out"); return echoSummary(d); },
    ...over,
  };
}
function env(over = {}) {
  const STATS = fakeD1(schema);
  const add = (d, app, kind, os, version, n) => STATS.db.prepare("INSERT INTO daily VALUES (?, ?, ?, ?, ?, ?)").run(d, app, kind, os, version, n);
  add(day(0), "aimdot", "user", "windows", "1.0.3", 3);
  add(day(0), "aimdot", "user", "linux", "1.0.3", 2);
  add(day(1), "aimdot", "user", "windows", "1.0.2", 4);
  add(day(1), "aimdot", "download", "windows-portable", "1.0.3", 6);
  add(day(1), "aimdot", "download", "linux-tar", "1.0.3", 2);
  add(day(2), "aimdot", "install", "linux", "1.0.2", 1);
  add(day(60), "aimdot", "install", "windows", "1.0.0", 9);   // old: only in "all time"
  add(day(0), "lasso", "user", "linux", "0.1.0", 1);
  return { ASSETS: assets, STATS, ECHO: fakeEcho(), _wait: [], ...over };
}
const call = (e, path, { method = "GET", headers = {}, form, ua } = {}) =>
  worker.fetch(new Request(ORIGIN + path, { method, headers: { "cf-connecting-ip": "203.0.113.9", ...(ua ? { "user-agent": ua } : {}), ...headers },
    body: form ? new URLSearchParams(form) : undefined }), e, { waitUntil: (p) => e._wait.push(p) });
const post = (e, path, form, headers = {}) => call(e, path, { method: "POST", form, headers: { origin: ORIGIN, ...headers } });
// signs in like the browser does and returns the cookie header for the next requests
async function signIn(e) {
  assert.equal((await post(e, "/admin/sign-in", { email: ADMIN })).status, 200);
  const r = await post(e, "/admin/code", { email: ADMIN, code: "123456" });
  assert.equal(r.status, 303);
  return { cookie: r.headers.get("set-cookie").split(";")[0] };
}
const get = async (e, path) => call(e, path, { headers: await signIn(e) });

test("signed out: the sign-in form, no numbers; data.json 401", async () => {
  const e = env();
  const r = await call(e, "/admin");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.match(r.headers.get("x-robots-tag"), /noindex/);
  const page = await r.text();
  assert.match(page, /action="\/admin\/sign-in"/);
  assert.doesNotMatch(page, /Aimdot|Users today/);
  const j = await call(e, "/admin/data.json");
  assert.equal(j.status, 401);
  assert.doesNotMatch(await j.text(), /aimdot/);
});

test("sign-in: Echo's code flow; the session cookie is HttpOnly, Secure, SameSite=Strict, __Host-", async () => {
  const e = env();
  const r1 = await post(e, "/admin/sign-in", { email: ADMIN });
  assert.match(await r1.text(), /action="\/admin\/code"/);
  assert.deepEqual(e.ECHO.calls[0], ["start", ADMIN, "203.0.113.9"]);   // Echo's limits per network get the real IP
  const bad = await post(e, "/admin/code", { email: ADMIN, code: "000000" });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /Wrong code/);
  assert.equal(bad.headers.get("set-cookie"), null);
  const r2 = await post(e, "/admin/code", { email: ADMIN, code: "123456" });
  assert.equal(r2.status, 303);
  assert.equal(r2.headers.get("location"), "/admin");
  const c = r2.headers.get("set-cookie");
  assert.match(c, /^__Host-sonela_admin=adm_[0-9a-f]{64};/);
  for (const part of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) assert.ok(c.includes(part), part);
});

test("another address gets the same answer but never a session", async () => {
  const e = env();
  assert.match(await (await post(e, "/admin/sign-in", { email: "someone@example.com" })).text(), /a 6-digit code is on its way/);
  assert.equal((await post(e, "/admin/code", { email: "someone@example.com", code: "123456" })).status, 400);
});

test("forms from another site are refused", async () => {
  const e = env();
  for (const h of [{ origin: "https://evil.example" }, { origin: "null" }, { origin: "" }, { origin: "", "sec-fetch-site": "cross-site" }]) {
    const r = await post(e, "/admin/sign-in", { email: ADMIN }, h);
    assert.equal(r.status, 403, JSON.stringify(h));
  }
  assert.equal(e.ECHO.calls.length, 0);
  // no Origin header but the browser says it came from this site: fine
  assert.equal((await post(e, "/admin/sign-in", { email: ADMIN }, { origin: "", "sec-fetch-site": "same-origin" })).status, 200);
});

test("a made-up or ended session is not let in, and the cookie is cleared", async () => {
  const e = env();
  const r = await call(e, "/admin", { headers: { cookie: `__Host-sonela_admin=${TOKEN}` } });
  assert.match(await r.text(), /Signed out - sign in again/);
  assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
  const h = await signIn(e);
  assert.match(await (await call(e, "/admin", { headers: h })).text(), /<h2 id="aimdot">/);
  const out = await call(e, "/admin/sign-out", { method: "POST", headers: { ...h, origin: ORIGIN } });
  assert.equal(out.status, 303);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
  assert.doesNotMatch(await (await call(e, "/admin", { headers: h })).text(), /<h2 id="aimdot">/);
});

test("no Echo connection: says so instead of a sign-in that can't work", async () => {
  const r = await call(env({ ECHO: undefined }), "/admin");
  assert.equal(r.status, 503);
  assert.match(await r.text(), /connection to echo-cloud/);
});

test("/stats redirects to /admin", async () => {
  const r = await call(env(), "/stats");
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "/admin");
});

test("the page: every app, noindex, no-store, no script", async () => {
  const r = await get(env(), "/admin");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.match(r.headers.get("x-robots-tag"), /noindex/);
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
  const html = await r.text();
  for (const name of ["Echo", "Aimdot", "Lasso"]) assert.match(html, new RegExp(`<h2 id="${name.toLowerCase()}">`));
  assert.ok(html.indexOf('id="echo"') < html.indexOf('id="aimdot"') && html.indexOf('id="aimdot"') < html.indexOf('id="lasso"'));
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /echoclip\.link\/admin/);           // Echo's full page stays reachable
  assert.match(html, /Echo Cloud accounts/);
  assert.match(html, /Website visitors/);
});

test("the numbers: per day, totals, versions, Windows / Linux", async () => {
  const r = await get(env(), "/admin/data.json");
  assert.equal(r.status, 200);
  const { apps, days } = await r.json();
  assert.deepEqual(apps.map((a) => a.id), ["echo", "aimdot", "lasso"]);
  const a = apps.find((x) => x.id === "aimdot");
  assert.equal(a.days.length, days);
  assert.equal(a.days.at(-1).day, day(0));
  assert.deepEqual(a.days.at(-1).user, { windows: 3, linux: 2, other: 0 });
  assert.deepEqual(a.days.at(-2).download, { windows: 6, linux: 2, other: 0 });   // windows-portable / linux-tar
  assert.deepEqual(a.totals.install, { windows: 9, linux: 1, other: 0 });            // the 60-day-old one counts here
  assert.equal(a.days.reduce((t, d) => t + d.install.windows, 0), 0);                // ...but not in the 30 days
  assert.deepEqual(a.versions.map((v) => v.version), ["1.0.3", "1.0.2"]);
  assert.equal(a.since.install, day(60));
  assert.equal(apps.find((x) => x.id === "echo").extra[0].value, 77);
});

test("Echo's numbers failing: its section says so, the rest still works", async () => {
  {
    const html = await (await get(env({ ECHO: fakeEcho({ summary: async () => { throw new Error("boom"); } }) }), "/admin")).text();
    const msg = /Couldn&#39;t read it right now \(boom\)/;
    assert.match(html, msg);
    assert.match(html, /<h2 id="aimdot">/);
    assert.match(html, /Users today<\/span><b>5<\/b>/);
  }
});

test("no database yet: the hub's apps say so, Echo still shows", async () => {
  const html = await (await get(env({ STATS: undefined }), "/admin")).text();
  assert.match(html, /No database yet/);
  assert.match(html, /Echo Cloud accounts/);
});

test("a ping from the app counts a user (and an install when new=1) and shows up on /admin", async () => {
  const e = env();
  await call(e, "/lasso/ping?v=0.1.0&os=windows&new=1", { ua: "Lasso/0.1.0" });
  await call(e, "/lasso/ping?v=0.1.0&os=windows", { ua: "Mozilla/5.0" });   // a browser: not counted
  await Promise.all(e._wait);
  const { apps } = await (await get(e, "/admin/data.json")).json();
  const l = apps.find((x) => x.id === "lasso");
  assert.deepEqual(l.days.at(-1).user, { windows: 1, linux: 1, other: 0 });
  assert.deepEqual(l.days.at(-1).install, { windows: 1, linux: 0, other: 0 });
});
