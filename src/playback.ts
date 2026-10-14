// Playing audio on the page: one AudioContext for the page, unlocked on the first tap (iPhone Safari only plays sound
// that starts from a user gesture), and a Playback per speech that schedules pieces back to back.

// iPhone Safari can bring the AudioContext back from the background "interrupted", or "running" with a clock that
// does not move (nothing is heard). So the context is replaced after the page was hidden, and a speech whose clock
// does not advance fails with audio-blocked instead of "playing" in silence.

let ctx: AudioContext | null = null;
let stale = false; // replace the context at the next chance (page was hidden, or it never got going)
let recreated = 0;
let hiddenAt = 0;
let shownAt = 0;
let lastError: { code: string; at: number } | null = null;
const startMs: number[] = []; // speak() to the first sentence playing, the last few
const playbacks = new Set<Playback>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STALL_MS = 1500; // the audio clock may stand still this long before the speech fails

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
const audioSession = () => (globalThis.navigator as AudioSessionNavigator | undefined)?.audioSession;

function retire() {
  const old = ctx;
  ctx = null;
  stale = false;
  recreated++;
  if (!old) return;
  old.onstatechange = null;
  try { old.close().catch(() => {}); } catch { /* already closed */ }
}

export function audioContext() {
  const busy = [...playbacks].some((p) => p.sources.size > 0);
  if (ctx && (ctx.state === "closed" || (stale && !busy))) retire();
  ctx ??= new (globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

/** The next audioContext() makes a fresh one (it is unusable, or the page was in the background). */
export function markAudioStale() { stale = true; }

/** Play even when the iPhone's silent switch is on (Web Audio is muted by it otherwise). Once; leaves an app's own choice alone. */
export function playInSilentMode() {
  try {
    const session = audioSession();
    if (session && session.type === "auto") session.type = "playback";
  } catch { /* not supported */ }
}

export function noteSpeakError(code: string) { lastError = { code, at: Date.now() }; }
export function noteSpeakStart(ms: number) { startMs.push(Math.round(ms)); if (startMs.length > 5) startMs.shift(); }

/** Plain-text audio state for the debug report. */
export function audioReport() {
  const ago = (t: number) => (t ? `${Math.round((Date.now() - t) / 1000)} s ago` : "never");
  const lines = [
    "yomiage audio",
    `  AudioContext: ${ctx ? `${ctx.state}, ${ctx.sampleRate} Hz, time ${ctx.currentTime.toFixed(2)} s` : "none yet"}`,
    `  recreated: ${recreated}`,
    `  page hidden: ${ago(hiddenAt)}, shown: ${ago(shownAt)}`,
    `  last speak() error: ${lastError ? `${lastError.code}, ${ago(lastError.at)}` : "none"}`,
    `  speak() to first sentence (ms, oldest first): ${startMs.length ? startMs.join(", ") : "none"}`,
    `  audioSession.type: ${audioSession()?.type ?? "not available"}`,
  ];
  return lines.join("\n");
}

let watching = false;
function watchVisibility() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    shownAt = Date.now();
    if (hiddenAt) stale = true;
  });
  globalThis.addEventListener?.("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) stale = true; });
}

/**
 * Call synchronously inside a tap or key handler: resumes the AudioContext while the gesture still counts, and plays
 * one silent sample (older iOS versions need that to really unlock).
 */
export function unlockAudio() {
  try {
    const c = audioContext();
    if (c.state === "running") return;
    // "interrupted" (iOS, after a call or app switch) is not "running" either: resume() below, and speak() fails with
    // audio-blocked if that does not work, after which the next call starts from a fresh context.
    c.resume().catch(() => {});
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
  } catch { /* no Web Audio: speak() reports audio-blocked */ }
}

let listening = false;
/** Unlock audio on every tap / key press until it runs (and again after iOS suspends it, e.g. after a call). */
export function unlockOnGestures() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  watchVisibility();
  for (const type of ["pointerdown", "touchend", "click", "keydown"]) {
    document.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }
}

/** Resolves when audio can play; false when the browser keeps it blocked. */
export async function audioRunning(waitMs = 1500) {
  let c;
  try { c = audioContext(); } catch { return false; }
  if (c.state === "running") return true;
  await Promise.race([c.resume().catch(() => {}), sleep(waitMs)]);
  if ((c.state as AudioContextState) === "running") return true;
  stale = true; // resume() did not get it going: the next speak() starts from a fresh context
  return false;
}

/** The pieces of one speech, scheduled back to back so there are no gaps. */
export class Playback {
  ctx: AudioContext;
  next: number;
  sources: Set<AudioBufferSourceNode>;
  timers: Set<ReturnType<typeof setTimeout>>;
  last: Promise<void>;
  /** Resolves true when the audio clock stood still for STALL_MS while sound was scheduled: nothing is being heard. */
  stalled: Promise<boolean>;
  private stall!: (v: boolean) => void;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  constructor() {
    this.ctx = audioContext();
    this.next = 0;
    this.sources = new Set();
    this.timers = new Set();
    this.last = Promise.resolve();
    this.stalled = new Promise((resolve) => { this.stall = resolve; });
  }

  private watch() {
    if (this.watchdog) return;
    const c = this.ctx;
    let seen = c.currentTime;
    let since = Date.now();
    this.watchdog = setInterval(() => {
      if (this.sources.size === 0) { this.unwatch(); return; }
      const now = Date.now();
      if (c.currentTime > seen || (typeof document !== "undefined" && document.hidden)) { seen = c.currentTime; since = now; return; }
      if (now - since < STALL_MS) return;
      markAudioStale();
      this.unwatch();
      this.stall(true);
    }, 250);
  }

  private unwatch() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  /** Schedule a piece after the previous one; `onStart` runs when it starts playing. */
  add(samples: Float32Array, sampleRate: number, onStart?: () => void) {
    const c = this.ctx;
    const buf = c.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    const at = Math.max(this.next, c.currentTime + 0.05);
    src.start(at);
    this.next = at + buf.duration;
    this.sources.add(src);
    playbacks.add(this);
    this.watch();
    this.last = new Promise((resolve) => {
      src.onended = () => {
        this.sources.delete(src);
        if (this.sources.size === 0) playbacks.delete(this);
        // Let go of the player and its audio: Safari keeps finished players that are still connected (and their
        // buffers) alive, about 2 MB per sentence, until the page closes.
        src.onended = null;
        try { src.disconnect(); src.buffer = null; } catch { /* already released */ }
        resolve();
      };
    });
    if (onStart) {
      const t = setTimeout(() => { this.timers.delete(t); onStart(); }, Math.max(0, (at - c.currentTime) * 1000));
      this.timers.add(t);
    }
  }

  /** Seconds of audio scheduled but not played yet. */
  ahead() { return Math.max(0, this.next - this.ctx.currentTime); }

  /** Resolves when everything scheduled so far has played (or was stopped). */
  finished() { return this.last; }

  stop() {
    this.unwatch();
    playbacks.delete(this);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const s of this.sources) { try { s.stop(); } catch { /* not started */ } }
    this.sources.clear();
  }
}
