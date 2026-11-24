// Update checks + update channels (stable / beta / dev, 21 Nov 2026), run locally: GitHub is a fake (no network), the
// clock is moved on between tests so the Worker's 5-minute release memo never carries one test's releases into the next.
// Run: node --test test/*.test.mjs
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/worker.js";
import { liteStats } from "../src/admin.js";
import { DatabaseSync } from "node:sqlite";

// D1's API over node:sqlite (the same as admin.test.mjs's; importing that file would run its tests here too)
function fakeD1(sql) {
  const db = new DatabaseSync(":memory:");
  db.exec(sql);
  const prepare = (q) => {
    let args = [];
    const st = { bind(...a) { args = a; return st; }, async all() { return { results: db.prepare(q).all(...args) }; },
      async run() { db.prepare(q).run(...args); return {}; }, async first() { return db.prepare(q).get(...args) ?? null; } };
    return st;
  };
  return { db, prepare, batch: (list) => Promise.all(list.map((s) => s.all())) };
}

let clock = Date.now();
Date.now = () => clock;
beforeEach(() => { clock += 3600e3; });

// the public repos' releases by tag: {app: {tag: {name, body, files}}}; a missing tag = GitHub's 404
let REL = {};
const API = /^https:\/\/api\.github\.com\/repos\/Resister0\/(aimdot|lasso)\/releases\/tags\/([a-z]+)$/;
const DL = /^https:\/\/github\.com\/Resister0\/(aimdot|lasso)\/releases\/download\/([a-z]+)\/(.+)$/;
globalThis.fetch = async (u) => {
  const url = String(u && u.url ? u.url : u);
  let m = url.match(API);
  if (m) {
    const r = REL[m[1]] && REL[m[1]][m[2]];
    return r ? new Response(JSON.stringify({ name: r.name, body: r.body, published_at: "2026-11-21T10:00:00Z", assets: r.files.map((name) => ({ name })) }))
      : new Response("", { status: 404 });
  }
  m = url.match(DL);
  if (m && m[3].endsWith(".sig")) return new Response(`sig of ${m[1]} ${m[2]} ${decodeURIComponent(m[3])}\n`);
  return new Response("", { status: 404 });
};

const AIM = ["Aimdot-Setup.exe", "Aimdot-Setup.exe.sig", "Aimdot-x86_64.AppImage", "Aimdot-x86_64.AppImage.sig"];
const rel = (app, v, text, files = AIM) => ({ name: `${app} ${v}`, body: `Built from: ${text}\n\nmore text`, files });
const CODE = "tester-code-123";
const env = (over = {}) => ({ ASSETS: { fetch: async () => new Response("asset") }, DEV_CODE: CODE, ...over });

async function check(path, { code, e } = {}) {
  const res = await worker.fetch(new Request(`https://sonela.app${path}`, { headers: code ? { "x-sonela-code": code } : {} }), e || env(), { waitUntil() {} });
  return { status: res.status, why: res.headers.get("x-aimdot-why") || res.headers.get("x-lasso-why"), body: res.status === 200 ? await res.json() : null };
}

test("stable: only the release 'latest' - beta / dev builds are never offered to it", async () => {
  REL = { aimdot: { latest: rel("Aimdot", "1.0.8", "Stable one"), beta: rel("Aimdot", "1.0.9", "Beta one"), dev: rel("Aimdot", "1.0.10", "Dev one") } };
  const r = await check("/aimdot/update/windows/x86_64/1.0.6");
  assert.equal(r.status, 200);
  assert.equal(r.body.version, "1.0.8");
  assert.equal(r.body.notes, "Stable one");
  assert.equal(r.body.url, "https://github.com/Resister0/aimdot/releases/download/latest/Aimdot-Setup.exe");
  assert.equal(r.body.signature, "sig of aimdot latest Aimdot-Setup.exe.sig");
  assert.equal(r.body.channel, undefined);
  // on 1.0.8 already: nothing, even though a 1.0.9 beta exists
  assert.equal((await check("/aimdot/update/windows/x86_64/1.0.8")).why, "current");
  // an unknown channel name = stable
  assert.equal((await check("/aimdot/update/windows/x86_64/1.0.8?ch=nightly")).why, "current");
});

test("beta: the beta build, from its own release; dev without the right code = stable", async () => {
  REL = { aimdot: { latest: rel("Aimdot", "1.0.8", "Stable one"), beta: rel("Aimdot", "1.0.9", "Beta one"), dev: rel("Aimdot", "1.0.10", "Dev one") } };
  const b = await check("/aimdot/update/linux/x86_64/1.0.6?ch=beta");
  assert.equal(b.body.version, "1.0.9");
  assert.equal(b.body.channel, "beta");
  assert.equal(b.body.url, "https://github.com/Resister0/aimdot/releases/download/beta/Aimdot-x86_64.AppImage");
  assert.equal(b.body.signature, "sig of aimdot beta Aimdot-x86_64.AppImage.sig");
  assert.equal((await check("/aimdot/update/linux/x86_64/1.0.6?ch=dev")).body.version, "1.0.8");
  assert.equal((await check("/aimdot/update/linux/x86_64/1.0.6?ch=dev", { code: "wrong-code-xyz" })).body.version, "1.0.8");
  const d = await check("/aimdot/update/linux/x86_64/1.0.6?ch=dev", { code: CODE });
  assert.equal(d.body.version, "1.0.10");
  assert.equal(d.body.channel, "dev");
  // no DEV_CODE on the server: dev = stable for everyone
  assert.equal((await check("/aimdot/update/linux/x86_64/1.0.6?ch=dev", { code: CODE, e: env({ DEV_CODE: undefined }) })).body.version, "1.0.8");
});

test("a newer stable wins over an old beta (nobody gets stuck on a beta)", async () => {
  REL = { aimdot: { latest: rel("Aimdot", "1.0.11", "Stable after the beta"), beta: rel("Aimdot", "1.0.9", "Beta one") } };
  const r = await check("/aimdot/update/windows/x86_64/1.0.9?ch=beta");
  assert.equal(r.body.version, "1.0.11");
  assert.equal(r.body.channel, undefined);
  assert.match(r.body.url, /\/download\/latest\//);
});

test("'#' = internal on stable only; an unsigned beta is skipped", async () => {
  REL = { lasso: {
    latest: rel("Lasso", "0.1.5", "# test build", ["Lasso-x86_64.AppImage", "Lasso-x86_64.AppImage.sig"]),
    beta: rel("Lasso", "0.1.6", "# trying the new box", ["Lasso-x86_64.AppImage", "Lasso-x86_64.AppImage.sig"]),
    dev: rel("Lasso", "0.1.7", "unsigned dev", ["Lasso-x86_64.AppImage"]),
  } };
  assert.equal((await check("/lasso/update/linux/x86_64/0.1.4")).why, "internal");
  const b = await check("/lasso/update/linux/x86_64/0.1.4?ch=beta");
  assert.equal(b.body.version, "0.1.6");
  assert.equal(b.body.notes, "trying the new box");
  // dev: its own build has no .sig -> the beta one
  assert.equal((await check("/lasso/update/linux/x86_64/0.1.4?ch=dev", { code: CODE })).body.version, "0.1.6");
});

test("test builds named after their Stable (1.0.9-beta.1): older than that Stable, newer than the one before", async () => {
  REL = { aimdot: { latest: rel("Aimdot", "1.0.8", "Stable one"), beta: rel("Aimdot", "1.0.9-beta.1 (beta)", "Beta one"),
    dev: rel("Aimdot", "1.0.9-dev.2 (dev)", "Dev one") } };
  const b = await check("/aimdot/update/windows/x86_64/1.0.8?ch=beta");
  assert.equal(b.body.version, "1.0.9-beta.1");
  assert.equal(b.body.channel, "beta");
  // dev sees both: the higher count wins
  assert.equal((await check("/aimdot/update/windows/x86_64/1.0.8?ch=dev", { code: CODE })).body.version, "1.0.9-dev.2");
  assert.equal((await check("/aimdot/update/windows/x86_64/1.0.9-dev.2?ch=dev", { code: CODE })).why, "current");
  // Stable never sees them
  assert.equal((await check("/aimdot/update/windows/x86_64/1.0.8")).why, "current");
});

test("the Stable a test build led up to comes out: every tester gets it", async () => {
  REL = { aimdot: { latest: rel("Aimdot", "1.0.9", "Stable after the tests"), beta: rel("Aimdot", "1.0.9-beta.1 (beta)", "Beta one"),
    dev: rel("Aimdot", "1.0.9-dev.2 (dev)", "Dev one") } };
  const s = await check("/aimdot/update/windows/x86_64/1.0.9-dev.2?ch=dev", { code: CODE });
  assert.equal(s.body.version, "1.0.9");
  assert.equal(s.body.channel, undefined);
  assert.equal((await check("/aimdot/update/windows/x86_64/1.0.9-beta.1?ch=beta")).body.version, "1.0.9");
});

test("no release at all, a channel without its own release, the pause switch", async () => {
  REL = {};
  assert.equal((await check("/lasso/update/linux/x86_64/0.1.0?ch=beta")).why, "no-release");
  REL = { aimdot: { latest: rel("Aimdot", "1.0.8", "Stable one") } };
  assert.equal((await check("/aimdot/update/windows/x86_64/1.0.8?ch=beta")).why, "current");
  assert.equal((await check("/aimdot/update/windows/x86_64/1.0.6?ch=beta")).body.version, "1.0.8");
  REL = { aimdot: { latest: rel("Aimdot", "1.0.8", "Stable one"), beta: rel("Aimdot", "1.0.9", "Beta one") } };
  assert.equal((await check("/aimdot/update/windows/x86_64/1.0.6?ch=beta", { e: env({ AIMDOT_UPDATES_PAUSED: "1" }) })).why, "paused");
});

test("the download buttons stay on 'latest' while a beta is out", async () => {
  REL = { aimdot: { latest: rel("Aimdot", "1.0.8", "Stable one"), beta: rel("Aimdot", "1.0.9", "Beta one") } };
  const res = await worker.fetch(new Request("https://sonela.app/aimdot/download/windows"), env(), { waitUntil() {} });
  assert.equal(res.headers.get("location"), "https://github.com/Resister0/aimdot/releases/download/latest/Aimdot-Setup.exe");
});

test("POST /<app>/channel/check: the dev code, 10 tries an hour", async () => {
  const post = (code, ip = "198.51.100.7") => worker.fetch(new Request("https://sonela.app/aimdot/channel/check",
    { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ code }) }), env(), {});
  assert.deepEqual(await (await post(CODE)).json(), { ok: true });
  assert.deepEqual(await (await post(` ${CODE} `)).json(), { ok: true });
  assert.deepEqual(await (await post("nope")).json(), { ok: false });
  for (let i = 0; i < 7; i++) await post("guess" + i);
  assert.equal((await post(CODE)).status, 429);
  assert.deepEqual(await (await post(CODE, "198.51.100.8")).json(), { ok: true });   // another network
  // no DEV_CODE set: never ok
  const r = await worker.fetch(new Request("https://sonela.app/lasso/channel/check", { method: "POST", body: JSON.stringify({ code: "" }) }), env({ DEV_CODE: undefined }), {});
  assert.deepEqual(await r.json(), { ok: false });
});

test("the daily ping counts the channel; the admin numbers carry it as appch rows", async () => {
  const STATS = fakeD1(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const wait = [];
  const ping = (q, ua = "Aimdot/1.0.9") => worker.fetch(new Request(`https://sonela.app/aimdot/ping?${q}`, { headers: { "user-agent": ua } }), env({ STATS }), { waitUntil: (p) => wait.push(p) });
  await ping("v=1.0.9&os=windows&new=0&ch=beta");
  await ping("v=1.0.8&os=linux&new=0&ch=stable");
  await ping("v=1.0.6&os=linux&new=0");               // an older version: no channel
  await ping("v=1.0.8&os=linux&new=0&ch=weird");      // not a channel: only the user
  await Promise.all(wait);
  const rows = STATS.db.prepare("SELECT kind, os, version, n FROM daily WHERE kind = 'channel' ORDER BY version").all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ kind: "channel", os: "windows", version: "beta", n: 1 }, { kind: "channel", os: "linux", version: "stable", n: 1 }]);
  const out = await liteStats(STATS, "aimdot", { name: "Aimdot" }, "1.0.8");
  const k = out.apps.rows.map((r) => `${r.k}=${r.n}`).sort();
  assert.ok(k.includes("appch:windows:beta=1") && k.includes("appch:linux:stable=1"), k.join(" "));
  assert.ok(k.includes("app:linux=3"), k.join(" "));   // users unchanged: every ping counts once
});
