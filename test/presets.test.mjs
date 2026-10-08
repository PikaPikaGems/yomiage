import assert from "node:assert/strict";
import { test } from "node:test";
import { PRESETS, resolveSettings } from "../src/presets.js";

test("defaults: original preset, speed 0.9", () => {
  assert.deepEqual(resolveSettings(), {
    preset: "original", speed: 0.9, expressiveness: 0.5, rhythmVariation: 0.5, pitch: 0, formant: 0, breathReduction: 0,
  });
});

test("a preset sets pitch, formant and breathReduction", () => {
  const s = resolveSettings({ preset: "deep" });
  assert.equal(s.pitch, PRESETS.deep.pitch);
  assert.equal(s.formant, PRESETS.deep.formant);
  assert.equal(s.breathReduction, PRESETS.deep.breathReduction);
});

test("explicit values override the preset; later levels override earlier ones", () => {
  const voiceDefaults = { preset: "soft", speed: 0.85 };
  assert.equal(resolveSettings(voiceDefaults).speed, 0.85);
  assert.equal(resolveSettings(voiceDefaults, { speed: 1.1 }).speed, 1.1);
  assert.equal(resolveSettings({ preset: "deep", pitch: -10 }).pitch, -10);
  assert.equal(resolveSettings({ preset: "deep", pitch: -10 }).formant, PRESETS.deep.formant);
});

test("a preset named in a call resets the voice's own pitch tweaks", () => {
  const s = resolveSettings({ preset: "soft", pitch: -3 }, { preset: "deep" });
  assert.equal(s.pitch, PRESETS.deep.pitch);
  assert.equal(s.preset, "deep");
});

test("out-of-range values are clamped; non-numbers are ignored", () => {
  const s = resolveSettings({ speed: 9, pitch: -99, breathReduction: -1, expressiveness: "loud", formant: NaN });
  assert.equal(s.speed, 1.5);
  assert.equal(s.pitch, -14);
  assert.equal(s.breathReduction, 0);
  assert.equal(s.expressiveness, 0.5);
  assert.equal(s.formant, 0);
});

test("unknown preset names are an error", () => {
  assert.throws(() => resolveSettings({ preset: "robot" }), /unknown preset "robot"/);
});
