// The browser test page in WebKit (Safari's engine), plus a memory check. Run after `npm run build`, `npm run files`
// and `node bin/yomiage.mjs copy-files test/files --from files`; needs `npx playwright-core install webkit` once.
//
//   node test/webkit.mjs
//
// 1. test/voice.html: load the voice, "Run checks", all must pass.
// 2. Memory (macOS only, read with `footprint` like Activity Monitor): the peak while loading must stay under
//    PEAK_LIMIT_MB, and speaking a long text for 5 minutes must not keep memory. Safari's engine frees memory late,
//    so memory rises for a few minutes and then drops back; a leak never drops. So the check compares the lowest
//    reading of the last minute with the lowest of the first minutes (before 0.2.0: ~+110 MB per minute).
import { webkit } from "playwright-core";
import { execSync } from "node:child_process";
import { serveFolder } from "./serve.mjs";

const PEAK_LIMIT_MB = 900; // 0.2.0: ~690–780 MB; 0.1.0: ~930 MB
const KEPT_LIMIT_MB = 60; // without a leak: within ~±20 MB; the 0.1.0 leak: ~+400 MB over these minutes
const SPEAK_SECONDS = 300;

const LONG_TEXT = "今、散歩をしているんですけど、僕の後ろをねこがついてきます。僕の猫じゃないですよ。でも、なんか、猫がついてきます。めっちゃかわいいので、猫さんと一緒に散歩します。猫さん、どこに行くんですか？教えてください。".repeat(40); // longer than SPEAK_SECONDS

const root = new URL("..", import.meta.url).pathname;
const server = await serveFolder(root);
const browser = await webkit.launch();
let failed = false;
const fail = (msg) => { console.log(`FAIL ${msg}`); failed = true; };

try {
  // ---- 1. the page's own checks
  const page = await browser.newPage();
  page.on("pageerror", (e) => fail(`page error: ${e.message}`));
  await page.goto(`${server.url}/test/voice.html`);
  await page.click("#load");
  await page.waitForFunction(() => /ready/.test(document.body.innerText) && !document.querySelector("#run").disabled, null, { timeout: 120_000 });
  await page.click("#run");
  await page.waitForFunction(() => /passed|failed/.test(document.querySelector("#summary").textContent), null, { timeout: 300_000 });
  const summary = await page.textContent("#summary");
  if (summary.startsWith("All")) console.log(`ok   test page: ${summary}`);
  else fail(`test page: ${summary}\n${(await page.innerText("body")).split("\n").filter((l) => l.startsWith("FAIL")).join("\n")}`);
  await page.close();

  // ---- 2. memory
  if (process.platform !== "darwin") {
    console.log("skip memory check (needs macOS footprint)");
  } else {
    const page2 = await browser.newPage();
    await page2.goto(`${server.url}/test/voice.html`);
    let peak = 0;
    const sample = () => { const mb = pageMemoryMB(); peak = Math.max(peak, mb); return mb; };
    const loading = page2.evaluate(async () => {
      const { createVoice } = await import("/dist/yomiage.js");
      window.v = createVoice({ filesUrl: new URL("/test/files/", location.href).href, idleTimeout: 0, stopWhenHidden: false });
      await window.v.load();
    });
    let done = false;
    loading.finally(() => { done = true; });
    while (!done) { sample(); await sleep(200); }
    await loading;
    sample();
    if (peak > PEAK_LIMIT_MB) fail(`peak while loading ${peak} MB > ${PEAK_LIMIT_MB} MB`);
    else console.log(`ok   peak while loading ${peak} MB (limit ${PEAK_LIMIT_MB})`);

    await page2.mouse.click(5, 5); // a gesture, so audio may start
    await page2.evaluate((t) => { window.v.speak(t); }, LONG_TEXT);
    const samples = [];
    for (let t = 10; t <= SPEAK_SECONDS; t += 10) { await sleep(10_000); samples.push([t, sample()]); }
    const lowest = (from, to) => Math.min(...samples.filter(([t]) => t >= from && t <= to).map(([, mb]) => mb));
    const kept = lowest(SPEAK_SECONDS - 60, SPEAK_SECONDS) - lowest(30, 90);
    const line = samples.filter(([t]) => t % 30 === 0).map(([t, mb]) => `${t}s ${mb}`).join(", ");
    if (kept > KEPT_LIMIT_MB) fail(`memory kept while speaking: lowest reading rose ${kept} MB (${line})`);
    else console.log(`ok   speaking ${SPEAK_SECONDS / 60} min: lowest reading changed ${kept} MB (limit ${KEPT_LIMIT_MB}; ${line})`);
    await page2.close();
  }
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** The largest footprint among WebKit's page processes, in MB (what Activity Monitor's Memory column shows). */
function pageMemoryMB() {
  const lines = execSync("ps -axo pid,command").toString().split("\n").filter((l) => /ms-playwright\/webkit/.test(l) && /WebContent/i.test(l));
  let max = 0;
  for (const l of lines) {
    try {
      const m = execSync(`footprint ${l.trim().split(/\s+/)[0]} 2>/dev/null`).toString().match(/Footprint: ([\d.]+) (KB|MB|GB)/);
      if (m) max = Math.max(max, Number(m[1]) * { KB: 0.001, MB: 1, GB: 1000 }[m[2]]);
    } catch { /* the process ended */ }
  }
  return Math.round(max);
}


