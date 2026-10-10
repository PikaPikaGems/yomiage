// PSOLA on a synthetic voice: pitch and length land where asked, cycles are marked steadily.
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPitch, pitchMarks, psola, resample, shiftVoicePsola, smoothVoicing, VOICE_SHIFT } from "../.cache/ts/psola.js";

const SR = 22050;

/** A crude vowel: a glottal pulse train at `f0` (with vibrato) through two formant resonators. */
function vowel(f0, seconds = 1.5, formants = [700, 1200]) {
  const n = Math.round(SR * seconds);
  const src = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    phase += (f0 * (1 + 0.02 * Math.sin((2 * Math.PI * 5 * i) / SR))) / SR;
    if (phase >= 1) { phase -= 1; src[i] = 1; }
  }
  let y = src;
  for (const fc of formants) {
    const r = 0.97, w = (2 * Math.PI * fc) / SR, a1 = -2 * r * Math.cos(w), a2 = r * r;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = y[i] - a1 * (out[i - 1] ?? 0) - a2 * (out[i - 2] ?? 0);
    y = out;
  }
  const peak = y.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return y.map((v) => (v / peak) * 0.5);
}

const medianF0 = (x) => {
  const v = Array.from(detectPitch(x, SR).f0).filter((f) => f > 0).sort((a, b) => a - b);
  return v[v.length >> 1];
};
const input = vowel(220);
const f0In = medianF0(input);

test("pitch detection finds the input pitch", () => {
  assert.ok(Math.abs(f0In - 220) < 2, `f0 ${f0In}`);
});

test("shifts land on the target pitch and keep the length", () => {
  for (const [pitch, formant] of [[-5, 0], [-9, -4], [-13, -7], [4, 2], [0, -4]]) {
    const out = shiftVoicePsola(input, SR, pitch, formant);
    assert.equal(out.length, input.length);
    assert.ok(out.every(Number.isFinite));
    const errSt = 12 * Math.log2(medianF0(out) / (f0In * 2 ** (pitch / 12)));
    assert.ok(Math.abs(errSt) < 0.3, `pitch ${pitch}/${formant}: off by ${errSt.toFixed(2)} st`);
  }
});

test("VOICE_SHIFT (no stretching): pitch on target, back to normal length", () => {
  for (const [pitch, formant] of [[-9, -4], [-11, -5.5], [-2, -0.5]]) {
    const r = 2 ** (formant / 12);
    const faster = psola(input, SR, { timeFactor: r }); // stands in for the voice speaking faster by r
    const out = shiftVoicePsola(faster, SR, pitch, formant, VOICE_SHIFT);
    assert.ok(Math.abs(out.length - input.length) < 4, `length ${out.length} vs ${input.length}`);
    const errSt = 12 * Math.log2(medianF0(out) / (f0In * 2 ** (pitch / 12)));
    assert.ok(Math.abs(errSt) < 0.3, `pitch ${pitch}/${formant}: off by ${errSt.toFixed(2)} st`);
  }
});

test("improved pitch marks are steadier on a breathy voice", () => {
  let seed = 1;
  const noise = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296 - 0.5);
  const breathy = input.map((v) => v + noise() * 0.15);
  const jitter = (m) => {
    const d = [];
    for (let i = 2; i < m.pos.length; i++) {
      if (!m.voiced[i] || !m.voiced[i - 1] || !m.voiced[i - 2]) continue;
      d.push(Math.abs((m.pos[i] - m.pos[i - 1]) - (m.pos[i - 1] - m.pos[i - 2])) / m.period[i]);
    }
    return d.reduce((s, v) => s + v, 0) / d.length;
  };
  const track = detectPitch(breathy, SR);
  const raw = jitter(pitchMarks(breathy, SR, track));
  const steady = jitter(pitchMarks(breathy, SR, smoothVoicing(track), { stable: true, align: true }));
  assert.ok(steady < raw, `improved ${steady} vs first ${raw}`);
});

test("resample changes the length by 1/ratio", () => {
  assert.equal(resample(input, 0.5).length, input.length * 2);
});
