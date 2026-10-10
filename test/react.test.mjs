// useYomiage()'s state (src/react-state.ts) with a fake engine: no React or voice model needed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { engineStore } from "kakera/store";
import { createSpeaker } from "../.cache/ts/react-state.js";

/** A fake shared voice: status events, and speak() calls that the test finishes by hand. */
function fakeEngine() {
  const listeners = { status: new Set(), progress: new Set() };
  const e = {
    status: "not-loaded", loads: 0, calls: [],
    emit(event, value) { if (event === "status") e.status = value; for (const fn of listeners[event]) fn(value); },
    on(event, fn) { listeners[event].add(fn); return () => listeners[event].delete(fn); },
    async info() { return { cached: true, downloadMB: 65 }; },
    async load() { e.loads++; e.emit("status", "downloading"); e.emit("progress", { stage: "downloading", fraction: 0.2 }); await null; e.emit("status", "ready"); },
    unload() { e.emit("status", "stopped"); },
    async clearCache() {},
    async debugReport() { return ""; },
    speak(text, options) {
      return new Promise((resolve, reject) => {
        e.calls.push({ text, options, resolve, reject });
        options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    },
  };
  return e;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const engine = fakeEngine();
  const store = engineStore(engine);
  const speaker = createSpeaker(store, engine);
  speaker.start();
  return { engine, store, speaker, state: () => speaker.getSnapshot() };
}

test("nothing loads on mount; loading shows progress; load() anywhere makes it ready", async () => {
  const { engine, store, state } = setup();
  assert.equal(state().status, "not-loaded");
  await tick();
  assert.equal(state().cached, true);
  assert.equal(state().downloadMB, 65);
  assert.equal(engine.loads, 0);
  const loading = store.load(); // e.g. useYomiageEngine() in a settings page
  assert.equal(state().status, "loading");
  assert.equal(state().progress.fraction, 0.2);
  await loading;
  assert.equal(state().status, "ready");
  engine.unload(); // memory freed: still "ready", the next speak() reloads from the device
  assert.equal(state().status, "ready");
});

test("speak: the hook's settings, then the call's; speaking and sentence follow the speech", async () => {
  const { engine, store, speaker, state } = setup();
  speaker.setDefaults({ preset: "deep", speed: 0.9 });
  await store.load();
  const seen = [];
  const done = state().speak("猫です。犬です。", { speed: 1.1, onSentence: (s) => seen.push(s.text) });
  const call = engine.calls[0];
  assert.equal(call.options.preset, "deep");
  assert.equal(call.options.speed, 1.1);
  assert.equal(state().speaking, true);
  assert.equal(state().sentence, null);
  call.options.onSentence({ text: "猫です。", start: 0, end: 4 });
  assert.deepEqual(state().sentence, { text: "猫です。", start: 0, end: 4 });
  assert.deepEqual(seen, ["猫です。"]);
  call.resolve("done");
  assert.equal(await done, "done");
  assert.equal(state().speaking, false);
  assert.equal(state().sentence, null);
});

test("stop() and unmounting stop only this component's speech, resolving stopped", async () => {
  const { engine, store, speaker, state } = setup();
  await store.load();
  const first = state().speak("一");
  state().stop();
  assert.equal(await first, "stopped");
  assert.equal(state().speaking, false);
  const second = state().speak("二");
  speaker.stop(); // unmount
  assert.equal(await second, "stopped");
  assert.ok(engine.calls.every((c) => c.options.signal.aborted));
});

test("a failed speak() never rejects: status error, retry() speaks again", async () => {
  const { engine, store, state } = setup();
  await store.load();
  const p = state().speak("猫", { preset: "low" });
  engine.calls[0].reject(Object.assign(new Error("no sound"), { code: "audio-blocked" }));
  assert.equal(await p, "stopped");
  assert.equal(state().status, "error");
  assert.equal(state().error.code, "audio-blocked");
  state().retry();
  assert.equal(state().status, "ready");
  assert.equal(engine.calls.length, 2);
  assert.equal(engine.calls[1].text, "猫");
  assert.equal(engine.calls[1].options.preset, "low");
});

test("unavailable comes from the shared engine", async () => {
  const { engine, state } = setup();
  engine.emit("status", "unavailable");
  assert.equal(state().status, "unavailable");
  assert.equal(typeof state().reason, "string");
});
