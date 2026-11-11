// LOCAL LOOK-TEST ONLY - never deployed (`npx wrangler deploy` uses src/worker.js, never this file).
// Runs the real Worker, but swaps what GitHub answers, so /aimdot and /lasso can be checked before Aimdot's first release:
//   npx wrangler dev dev/sample-changes.js                          made-up Aimdot versions (Lasso: still "No versions yet")
//   npx wrangler dev dev/sample-changes.js --var SAMPLE:echo        real data: Echo's public repo stands in for Aimdot's
//   npx wrangler dev dev/sample-changes.js --var SAMPLE:echo-down   same, with GitHub's commit list "down" (tests the github.com feed)
// Switching between them: stop wrangler and delete .wrangler/state first (the list is cached for 5 minutes).
import worker from "../src/worker.js";

const T = (s) => new Date(s).toISOString();
// newest first, like GitHub's commit list. 1.0.5 is missing (a test build that failed), 1.0.8 is internal ("#").
const SAMPLE = [
  ["1.1.0", "2026-11-11T15:10:00Z", "Game Bar mode works again after the latest Windows update, the tray menu shows which crosshair is on"],
  ["1.0.12", "2026-11-11T09:40:00Z", "New: a crosshair can fade out while you aim down sights. Hotkeys can be cleared with Backspace"],
  ["1.0.11", "2026-11-10T20:05:00Z", "Paint tools: line, fill and mirror"],
  ["1.0.10", "2026-11-10T13:30:00Z", "Fixed the overlay staying on top of the desktop after a game closed (Linux, KDE Wayland)"],
  ["1.0.9", "2026-11-09T18:15:00Z", "Share codes keep the outline colour, the installer is 2 MB smaller"],
  ["1.0.8", "2026-11-09T11:00:00Z", "# updater test build"],
  ["1.0.7", "2026-11-09T10:45:00Z", "Valorant codes import with their outline. Faster start on Windows"],
  ["1.0.6", "2026-11-08T16:20:00Z", "The crosshair no longer jumps when a game changes its resolution, AppImage starts on Steam Deck again"],
  ["1.0.4", "2026-11-08T09:00:00Z", "Each game can have its own hotkey"],
  ["1.0.3", "2026-11-07T19:30:00Z", "Linux: the overlay follows the game to another screen"],
  ["1.0.2", "2026-11-07T12:10:00Z", "Fix a crash when a picture crosshair's file was moved"],
  ["1.0.1", "2026-11-06T21:00:00Z", "Clearer names in the settings (\"Size\", \"Gap\" and \"Outline\" instead of short codes)"],
  ["1.0.0", "2026-11-06T12:00:00Z", "First release: design, paint or pick a picture as your crosshair, one per game, share codes, CS2 and Valorant import"],
];
const sha = (v) => (v.replace(/\D/g, "") + "a".repeat(40)).slice(0, 40);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const realFetch = globalThis.fetch;

function fakeGithub(mode) {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (mode === "echo" || mode === "echo-down") {
      // (only the commit list: Echo's release files have other names than Aimdot's, so the release must come from the API)
      if (mode === "echo-down" && url.startsWith("https://api.github.com/") && url.includes("/commits?")) return json({ message: "rate limit (pretend)" }, 403);
      return realFetch(url.replace("Resister0/aimdot", "Resister0/echoclip"), init);
    }
    if (url.includes("Resister0/aimdot/commits?"))
      return json(SAMPLE.map(([v, at, msg]) => ({ sha: sha(v), commit: { message: `${msg}\n\nCo-authored text below the first line is ignored`, committer: { date: T(at) } } })));
    const raw = url.match(/raw\.githubusercontent\.com\/Resister0\/aimdot\/([0-9a-f]{40})\/ci\/version\.txt/);
    if (raw) { const hit = SAMPLE.find(([v]) => sha(v) === raw[1]); return new Response(hit ? `${hit[0]}\n` : "", { status: hit ? 200 : 404 }); }
    if (url.includes("Resister0/aimdot/releases/tags/latest")) {
      const [v, at, msg] = SAMPLE[0];
      return json({ name: `Aimdot ${v}`, body: `Built from: ${msg}\n\nWindows: ...`, published_at: T(at),
        assets: ["Aimdot-Setup.exe", "Aimdot-Windows.zip", "Aimdot-x86_64.AppImage", "Aimdot-linux-x86_64.tar.gz"].map((name) => ({ name })) });
    }
    return realFetch(input, init);   // everything else (Lasso's repo, which doesn't exist yet) asks the real GitHub
  };
}

export default {
  async fetch(req, env, ctx) {
    globalThis.fetch = fakeGithub(env.SAMPLE || "sample");
    return worker.fetch(req, env, ctx);
  },
};
