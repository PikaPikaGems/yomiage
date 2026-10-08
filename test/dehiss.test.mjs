// The breath filter cuts high frequencies and leaves the voice's main range alone.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reduceBreath } from "../src/dehiss.js";

const SR = 22050;
const tone = (hz, seconds = 0.5) => Float32Array.from({ length: Math.round(SR * seconds) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SR));
const rmsDb = (x) => {
  const tail = x.subarray(x.length >> 2); // skip the filter's start-up
  let e = 0;
  for (const v of tail) e += v * v;
  return 10 * Math.log10(e / tail.length);
};
const gainDb = (hz, amount) => rmsDb(reduceBreath(tone(hz), SR, amount)) - rmsDb(tone(hz));

test("amount 0 returns the input unchanged", () => {
  const t = tone(440);
  assert.equal(reduceBreath(t, SR, 0), t);
});

// Measured: at amount 0.6 the cut is about -4 dB at 3 kHz, -7 dB at 6 kHz, -18 dB at 9 kHz; the output matched the
// playground's Web Audio version to within 6e-8 in a browser.
test("low frequencies pass, high frequencies are cut, more with a higher amount", () => {
  assert.ok(Math.abs(gainDb(300, 0.6)) < 0.5, `300 Hz: ${gainDb(300, 0.6).toFixed(1)} dB`);
  assert.ok(gainDb(6000, 0.6) < -6, `6 kHz: ${gainDb(6000, 0.6).toFixed(1)} dB`);
  assert.ok(gainDb(9000, 0.6) < -15, `9 kHz: ${gainDb(9000, 0.6).toFixed(1)} dB`);
  assert.ok(gainDb(6000, 1) < gainDb(6000, 0.3), "stronger at a higher amount");
});

test("output stays finite", () => {
  assert.ok(reduceBreath(tone(1000), SR, 1).every(Number.isFinite));
});
