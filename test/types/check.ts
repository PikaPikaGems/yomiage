// Compiled (not run) by `npm run test:types`: the types accept what API.md shows and reject mistakes.
import { createVoice, toWav, PRESETS, DEFAULTS, RANGES, CREDIT, VoiceError, type LoadProgress, type Sentence } from "yomiage";

const voice = createVoice({ preset: "deep", speed: 0.9, timeouts: { loadStall: 30_000 }, crashGuard: false });
const off = voice.on("progress", (p: LoadProgress) => console.log(p.stage, p.fraction, p.step, p.file));
voice.on("status", (s) => { const ok: "ready" | string = s; void ok; });
off();

async function demo() {
  const { cached, downloadMB } = await voice.info();
  if (!cached) console.log(downloadMB);
  const { fromCache, timings } = await voice.load();
  console.log(fromCache, timings?.map((t) => `${t.step} ${t.ms}`));
  const result: "done" | "stopped" = await voice.speak("こんにちは。", {
    pitch: -10, queue: true, otherLanguages: "skip",
    onSentence: ({ text, start, end }: Sentence) => console.log(text, start, end),
  });
  const audio = await voice.synthesize("はい", { preset: "soft" });
  const blob: Blob = toWav(audio);
  console.log(result, blob.size, PRESETS.soft.pitch, DEFAULTS.speed, RANGES.pitch[0], CREDIT);
  try { await voice.load(); } catch (e) { if (e instanceof VoiceError && e.code === "unavailable") voice.resetCrashGuard(); }
}
void demo;

// @ts-expect-error unknown preset
createVoice({ preset: "robot" });
// @ts-expect-error otherLanguages is "read" | "skip"
voice.speak("x", { otherLanguages: "browser" });
// @ts-expect-error unknown event
voice.on("loaded", () => {});
// @ts-expect-error speed is a number
voice.speak("x", { speed: "fast" });
