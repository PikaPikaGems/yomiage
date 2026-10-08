// Playing audio on the page: one AudioContext for the page, unlocked on the first tap (iPhone Safari only plays sound
// that starts from a user gesture), and a Playback per speech that schedules pieces back to back.

let ctx = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function audioContext() {
  ctx ??= new (globalThis.AudioContext ?? globalThis.webkitAudioContext)();
  return ctx;
}

/**
 * Call synchronously inside a tap or key handler: resumes the AudioContext while the gesture still counts, and plays
 * one silent sample (older iOS versions need that to really unlock).
 */
export function unlockAudio() {
  try {
    const c = audioContext();
    if (c.state === "running") return;
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
  return c.state === "running";
}

/** The pieces of one speech, scheduled back to back so there are no gaps. */
export class Playback {
  constructor() {
    this.ctx = audioContext();
    this.next = 0;
    this.sources = new Set();
    this.timers = new Set();
    this.last = Promise.resolve();
  }

  /** Schedule a piece after the previous one; `onStart` runs when it starts playing. */
  add(samples, sampleRate, onStart) {
    const c = this.ctx;
    const buf = c.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples, 0);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    const at = Math.max(this.next, c.currentTime + 0.05);
    src.start(at);
    this.next = at + buf.duration;
    this.sources.add(src);
    this.last = new Promise((resolve) => { src.onended = () => { this.sources.delete(src); resolve(); }; });
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
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const s of this.sources) { try { s.stop(); } catch { /* not started */ } }
    this.sources.clear();
  }
}
