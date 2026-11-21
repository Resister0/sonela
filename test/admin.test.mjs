// sonela.app/admin (echoclip.link/admin's page + app switcher) and the daily counts, run locally with a fake D1 (a real
// SQLite in memory, node:sqlite) and fake echo-cloud bindings. Nothing here talks to Cloudflare or GitHub.
// Run: node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/worker.js";

// no network in tests: GitHub (release lookups) answers "no such release"
globalThis.fetch = async () => new Response("", { status: 404 });

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
const TOKEN = "adm_" + "ab".repeat(32);
const assets = { fetch: async (r) => new Response(new URL(r.url).pathname === "/404" ? "not found page" : "asset", { status: new URL(r.url).pathname === "/404" ? 404 : 200 }) };
// a cut-down copy of Echo's admin.html (the parts the hub changes)
const ECHO_HTML = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Echo stats</title>\n<style>body{}</style>\n</head>\n<body>\n<main id="app"></main>\n<script src="/admin.js"></script>\n</body>\n</html>`;
// stands in for echo-cloud: HubStats (ECHO) and its normal fetch (ECHO_WEB), which records what it was sent
function fakeEcho() {
  const sent = [];
  return {
    sent,
    ECHO: { isAdmin: async (t) => t === TOKEN, adminFiles: async () => ({ html: ECHO_HTML, js: "/* echo admin.js */" }) },
    ECHO_WEB: { fetch: async (r) => { sent.push({ url: r.url, method: r.method, headers: Object.fromEntries(r.headers), body: r.method === "POST" ? await r.text() : null });
      return new Response(JSON.stringify({ ok: true, from: "echo" }), { status: 200, headers: { "content-type": "application/json", "set-cookie": "x=1" } }); } },
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
  const e = fakeEcho();
  return { ASSETS: assets, STATS, ECHO: e.ECHO, ECHO_WEB: e.ECHO_WEB, _sent: e.sent, _wait: [], ...over };
}
const call = (e, path, { method = "GET", headers = {}, body, ua } = {}) =>
  worker.fetch(new Request(ORIGIN + path, { method, headers: { "cf-connecting-ip": "203.0.113.9", ...(ua ? { "user-agent": ua } : {}), ...headers }, body }),
    e, { waitUntil: (p) => e._wait.push(p) });
const signed = { authorization: `Bearer ${TOKEN}` };

test("/admin = Echo's page with the switcher's settings, noindex, no-store, scripts only from this site", async () => {
  const r = await call(env(), "/admin");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.match(r.headers.get("x-robots-tag"), /noindex/);
  assert.match(r.headers.get("content-security-policy"), /script-src 'self';/);
  const html = await r.text();
  assert.match(html, /<title>Sonela admin<\/title>/);
  assert.match(html, /<script src="\/admin\/admin\.js"><\/script>/);
  const cfg = JSON.parse(html.match(/data-cfg="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  assert.equal(cfg.api, "/admin/echo");
  assert.equal(cfg.site, "https://echoclip.link");
  assert.deepEqual(cfg.apps.map((a) => [a.id, a.name, a.stats]), [
    ["echo", "Echo", "/admin/echo/admin/stats"], ["aimdot", "Aimdot", "/admin/app/aimdot/stats"], ["lasso", "Lasso", "/admin/app/lasso/stats"]]);
  assert.ok(cfg.apps.every((a) => a.icon && a.note));
});

test("/admin/admin.js = Echo's admin.js", async () => {
  const r = await call(env(), "/admin/admin.js");
  assert.match(r.headers.get("content-type"), /javascript/);
  assert.equal(await r.text(), "/* echo admin.js */");
});

test("Echo's page changed shape: a clear error instead of a broken page", async () => {
  const e = env();
  e.ECHO = { ...e.ECHO, adminFiles: async () => ({ html: "<html>new</html>", js: "" }) };
  assert.equal((await call(e, "/admin")).status, 502);
  assert.equal((await call(e, "/admin/admin.js")).status, 502);
});

test("Echo's own calls go to echo-cloud unchanged (with the visitor's IP for Echo's limits); the sign-in is always the admin one", async () => {
  const e = env();
  const r = await call(e, "/admin/echo/auth/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@example.com", admin: false }) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("set-cookie"), null);                 // nothing of echo-cloud's own headers leaks through
  assert.equal(e._sent[0].url, "https://echoclip.link/auth/start");
  assert.deepEqual(JSON.parse(e._sent[0].body), { email: "a@example.com", admin: true });
  assert.equal(e._sent[0].headers["cf-connecting-ip"], "203.0.113.9");
  await call(e, "/admin/echo/admin/stats", { headers: signed });
  assert.equal(e._sent[1].url, "https://echoclip.link/admin/stats");
  assert.equal(e._sent[1].headers.authorization, `Bearer ${TOKEN}`);
  await call(e, "/admin/echo/admin/release", { method: "POST", headers: signed, body: '{"version":"2.0.11","paused":true}' });
  assert.equal(e._sent[2].body, '{"version":"2.0.11","paused":true}');
});

test("only Echo's admin calls pass: anything else is a 404 and never reaches echo-cloud", async () => {
  const e = env();
  for (const [method, p] of [["POST", "/admin/echo/creds"], ["GET", "/admin/echo/me"], ["POST", "/admin/echo/account/delete"], ["GET", "/admin/echo/auth/start"], ["GET", "/admin/echo/admin/../creds"]]) {
    const r = await call(e, p, { method, headers: signed });
    assert.equal(r.status, 404, p);
  }
  assert.equal(e._sent.length, 0);
});

test("an app counted here: only for a valid admin session", async () => {
  const e = env();
  assert.equal((await call(e, "/admin/app/aimdot/stats")).status, 403);
  assert.equal((await call(e, "/admin/app/aimdot/stats", { headers: { authorization: "Bearer adm_" + "00".repeat(32) } })).status, 403);
  const r = await call(e, "/admin/app/aimdot/stats", { headers: signed });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal((await call(e, "/admin/app/nope/stats", { headers: signed })).status, 404);
});

test("an app's numbers come in the page's own shape (Echo's /admin/stats parts)", async () => {
  const j = await (await call(env(), "/admin/app/aimdot/stats", { headers: signed })).json();
  assert.equal(j.lite, true);
  assert.equal(j.app.name, "Aimdot");
  const row = (d, k) => (j.apps.rows.find((r) => r.day === day(d) && r.k === k) || {}).n;
  assert.equal(row(0, "app:windows"), 3);
  assert.equal(row(0, "app:linux"), 2);
  assert.equal(row(0, "appv:windows:1.0.3"), 3);
  assert.equal(row(1, "appv:windows:1.0.2"), 4);
  assert.equal(row(2, "inst:linux"), 1);
  assert.equal(j.apps.today, day(0));
  assert.equal(j.site.daily.length, 30);
  assert.deepEqual(j.site.daily.at(-2), { day: day(1), visitors: 0, views: 0, downloads: 8, dlw: 6, dll: 2 });
  assert.deepEqual(j.site.keys["dl:windows-portable"], [0, 6, 6]);
  assert.deepEqual(j.installs, { total: 10, windows: 9, linux: 1, d1: 0, d7: 1, d30: 1 });
  assert.equal(j.apps.latest, null);   // the fake GitHub has no release
});

test("no database yet: the numbers are zeros with a note", async () => {
  const j = await (await call(env({ STATS: undefined }), "/admin/app/lasso/stats", { headers: signed })).json();
  assert.equal(j.installs.total, 0);
  assert.match(j.note, /No database yet/);
});

test("no Echo connection: says so", async () => {
  const r = await call(env({ ECHO: undefined }), "/admin");
  assert.equal(r.status, 503);
  assert.match(await r.text(), /connection to echo-cloud/);
});

test("/stats redirects to /admin", async () => {
  const r = await call(env(), "/stats");
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "/admin");
});

test("a ping from the app counts a user (and an install when new=1) and shows up on /admin", async () => {
  const e = env();
  await call(e, "/lasso/ping?v=0.1.0&os=windows&new=1", { ua: "Lasso/0.1.0" });
  await call(e, "/lasso/ping?v=0.1.0&os=windows", { ua: "Mozilla/5.0" });   // a browser: not counted
  await Promise.all(e._wait);
  const j = await (await call(e, "/admin/app/lasso/stats", { headers: signed })).json();
  const row = (k) => (j.apps.rows.find((r) => r.day === day(0) && r.k === k) || {}).n;
  assert.equal(row("app:windows"), 1);
  assert.equal(row("app:linux"), 1);
  assert.equal(row("inst:windows"), 1);
  assert.equal(j.installs.total, 1);
});
