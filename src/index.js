// yomiage, page side: createVoice, PRESETS, CREDIT, toWav, VoiceError. See API.md.
//
// The engine (piper-plus, ONNX Runtime, the voice filters) runs in a worker started from the files folder
// (`yomiage-worker.js`, put there by `yomiage copy-files`), shared by every voice on the page. kakera does the worker
// management, downloading in parts and the phone protections.
import { createPool, KakeraError } from "kakera";
import { DEFAULTS, PRESETS, RANGES, resolveSettings } from "./presets.js";
import { splitForSpeech, isOtherLanguage } from "./sentences.js";
import { Playback, audioRunning, unlockAudio, unlockOnGestures } from "./playback.js";
import { toWav } from "./wav.js";

export { DEFAULTS, PRESETS, RANGES, toWav };

/** Set by the build (scripts/build.mjs); the worker carries the same value. */
export const VERSION = typeof __YOMIAGE_VERSION__ === "string" ? __YOMIAGE_VERSION__ : "dev";

/** Must be shown in every app that uses the voice (Tsukuyomi-chan's terms). See NOTICE.md. */
export const CREDIT = "音声合成には、フリー素材キャラクター「つくよみちゃん」（© Rei Yumesaki）が無料公開している音声データを使用しています。"
  + "■つくよみちゃんコーパス（CV.夢前黎）https://tyc.rei-yumesaki.net/material/corpus/";

/** Errors from yomiage. `code`: see API.md §7. */
export class VoiceError extends KakeraError {}

const pool = createPool({ prefix: "yomiage", ErrorClass: VoiceError });
const SETTINGS = new Set(["preset", ...Object.keys(RANGES)]);
const OTHER_LANGUAGES = ["read", "skip"];
const LOOKAHEAD_S = 8; // synthesize at most this far ahead of what is playing (memory, and stop() stays cheap)
const STOPPED = Symbol("stopped");
let versionChecked = false;

// Everything speaking on the page: a new speak() (without queue) stops all of them; so does stop() on any voice.
const speeches = new Set();
const stopAll = () => { for (const s of [...speeches]) s.stop(); };

const abortError = () => new DOMException("The operation was aborted.", "AbortError");
const definedOnly = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const pick = (o, keys) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => keys.has(k)));

function checkOtherLanguages(v) {
  if (!OTHER_LANGUAGES.includes(v)) throw new TypeError(`otherLanguages must be "read" or "skip", not ${JSON.stringify(v)}`);
  return v;
}

/**
 * Browsers say nothing useful when a worker's script can't be loaded ("unknown error"), so find out why.
 * The usual causes: copy-files wasn't run (404), or the site's server isn't reachable.
 */
async function explainStartFailure(workerUrl, err) {
  let res;
  try {
    res = await fetch(workerUrl, { method: "HEAD", cache: "no-store" });
  } catch {
    return new VoiceError("download-failed", `could not reach ${workerUrl} (is the server running, is the device online?)`, { cause: err });
  }
  if (res.status === 404) {
    return new VoiceError("engine-failed", `${workerUrl.replace(/\?.*/, "")} is missing: run "yomiage copy-files" into the folder served at that address`, { cause: err });
  }
  if (!res.ok) return new VoiceError("download-failed", `${workerUrl}: ${res.status} ${res.statusText}`, { cause: err });
  return err;
}

/**
 * A voice: a light handle with default settings. The engine is shared by all voices and loaded by load().
 * @param {object} [options]  see API.md §2
 */
export function createVoice(options = {}) {
  const {
    filesUrl = "/yomiage/", idleTimeout, stopWhenHidden = true, crashGuard, timeouts = {}, persistStorage,
    otherLanguages = "read",
  } = options;
  const defaults = pick(options, SETTINGS);
  resolveSettings(defaults); // an unknown preset fails here, not at the first speak()
  checkOtherLanguages(otherLanguages);
  const speakStall = timeouts.speakStall ?? 20_000;
  const base = new URL(filesUrl.endsWith("/") ? filesUrl : `${filesUrl}/`, globalThis.location?.href).href;

  const workerUrl = new URL(`yomiage-worker.js?v=${encodeURIComponent(VERSION)}`, base).href;
  const handle = pool.handle(definedOnly({
    name: "tsukuyomi",
    filesUrl: base,
    createWorker: () => new Worker(workerUrl, { type: "module" }),
    idleTimeout, stopWhenHidden, crashGuard, persistStorage,
    loadStall: timeouts.loadStall,
  }));
  if (stopWhenHidden) handle.onHidden(stopAll);
  unlockOnGestures();

  /** Each piece of `text` as audio, in order; stops early when `signal` aborts. */
  async function* pieces(text, settings, otherLangs, signal) {
    for (const piece of splitForSpeech(String(text ?? ""))) {
      const other = isOtherLanguage(piece.text);
      if (other && otherLangs === "skip") continue;
      const audio = await handle.call("synth", { ...settings, text: piece.text, language: other ? "en" : "ja" }, { stall: speakStall, signal });
      yield { piece, audio };
    }
  }

  const callSettings = (o) => {
    const settings = resolveSettings(defaults, pick(o, SETTINGS));
    delete settings.preset;
    return settings;
  };

  return {
    get status() { return handle.status; },

    /** Subscribe to "status", "progress" ({ loaded, total } bytes) or "log". Returns an unsubscribe function. */
    on: (event, fn) => handle.on(event, fn),

    /** { cached, downloadBytes, downloadMB } without downloading anything. */
    info: () => handle.info(),

    /** Download (first time) and start the engine. Resolves { fromCache }. */
    async load() {
      let res;
      try {
        res = await handle.load();
      } catch (err) {
        throw err.code === "engine-failed" && /failed to start/.test(err.message) ? await explainStartFailure(workerUrl, err) : err;
      }
      if (!versionChecked) {
        const engine = await handle.call("version");
        if (engine !== VERSION && engine !== "dev" && VERSION !== "dev") {
          throw new VoiceError("engine-failed", `the files at ${base} are from yomiage ${engine}, but the page uses ${VERSION}: run "yomiage copy-files" again`);
        }
        versionChecked = true;
      }
      return res;
    },

    /**
     * Read `text` aloud. Resolves "done", or "stopped" when stop(), a newer speak() or the page being hidden ended it.
     * Call it from a tap or click handler (iPhone).
     */
    speak(text, o = {}) {
      unlockAudio(); // first, while the tap still counts
      let settings, otherLangs;
      try {
        settings = callSettings(o);
        otherLangs = checkOtherLanguages(o.otherLanguages ?? otherLanguages);
      } catch (e) { return Promise.reject(e); }
      if (o.signal?.aborted) return Promise.reject(abortError());

      const waitFor = o.queue ? [...speeches].map((s) => s.done) : [];
      if (!o.queue) stopAll();

      const ctrl = new AbortController();
      const speech = { stop: () => ctrl.abort(STOPPED) };
      const onUserAbort = () => ctrl.abort(abortError());
      o.signal?.addEventListener("abort", onUserAbort, { once: true });
      const check = () => { if (ctrl.signal.aborted) throw ctrl.signal.reason; };
      const until = (p) => new Promise((resolve, reject) => {
        if (ctrl.signal.aborted) { reject(ctrl.signal.reason); return; }
        const onAbort = () => reject(ctrl.signal.reason);
        ctrl.signal.addEventListener("abort", onAbort, { once: true });
        p.then(resolve, reject).finally(() => ctrl.signal.removeEventListener("abort", onAbort));
      });

      speech.done = (async () => {
        let playback = null;
        try {
          await until(Promise.allSettled(waitFor));
          playback = new Playback();
          const running = audioRunning();
          for await (const { piece, audio } of pieces(text, settings, otherLangs, ctrl.signal)) {
            check();
            if (!(await until(running))) throw new VoiceError("audio-blocked", "the browser did not allow sound: call speak() from a tap or click");
            const { onSentence } = o;
            playback.add(audio.samples, audio.sampleRate, onSentence && (() => {
              if (!ctrl.signal.aborted) try { onSentence({ ...piece }); } catch (e) { console.error(e); }
            }));
            while (playback.ahead() > LOOKAHEAD_S) await until(new Promise((r) => setTimeout(r, 250)));
          }
          await until(playback.finished());
          return "done";
        } catch (e) {
          playback?.stop();
          if (ctrl.signal.reason === STOPPED) return "stopped";
          if (ctrl.signal.aborted) throw ctrl.signal.reason;
          throw e;
        }
      })().finally(() => {
        speeches.delete(speech);
        o.signal?.removeEventListener("abort", onUserAbort);
      });
      speeches.add(speech);
      return speech.done;
    },

    /** Stop whatever is speaking on the page (from any voice), including queued speech. */
    stop: stopAll,

    /** The audio of `text` without playing it: { samples: Float32Array, sampleRate }. See toWav(). */
    async synthesize(text, o = {}) {
      const settings = callSettings(o);
      const otherLangs = checkOtherLanguages(o.otherLanguages ?? otherLanguages);
      const parts = [];
      let sampleRate = 22050;
      for await (const { audio } of pieces(text, settings, otherLangs, o.signal)) {
        parts.push(audio.samples);
        sampleRate = audio.sampleRate;
      }
      const samples = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) { samples.set(p, at); at += p.length; }
      return { samples, sampleRate };
    },

    /** Free the memory now (if no other voice needs it). The next speak() reloads from the device. */
    unload() { handle.unload(); },

    /** Back to "not-loaded"; load() is needed again. */
    dispose() { handle.dispose(); },

    /** Delete the downloaded files from this device. */
    clearCache: () => handle.clearCache(),

    /** Forget a recorded crash so load() tries again. */
    resetCrashGuard: () => handle.resetCrashGuard(),
  };
}
