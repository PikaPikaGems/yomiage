// Voice presets and settings: defaults, ranges, and how presets, voice defaults and per-call options combine.

/** Filters on Tsukuyomi-chan's voice, picked by ear. Values: pitch and formant in semitones, breathReduction 0..1. */
import type { PresetName, VoiceSettings } from "./types.js";
export type ResolvedSettings = Required<VoiceSettings>;
type NumericSetting = Exclude<keyof VoiceSettings, "preset">;

export const PRESETS: Readonly<Record<PresetName, Readonly<{pitch: number; formant: number; breathReduction: number}>>> = Object.freeze({
  original: Object.freeze({ pitch: 0, formant: 0, breathReduction: 0 }),
  soft: Object.freeze({ pitch: -2, formant: -0.5, breathReduction: 0.6 }),
  low: Object.freeze({ pitch: -6, formant: -1.5, breathReduction: 0.6 }),
  deep: Object.freeze({ pitch: -9, formant: -4, breathReduction: 0.6 }),
  deeper: Object.freeze({ pitch: -11, formant: -5.5, breathReduction: 0.6 }),
});

/** [min, max] of each setting. Values outside are clamped. */
export const RANGES: Readonly<Record<NumericSetting, readonly [number, number]>> = Object.freeze({
  speed: [0.5, 1.5],
  pitch: [-14, 6],
  formant: [-8, 4],
  breathReduction: [0, 1],
  expressiveness: [0, 1],
  rhythmVariation: [0, 1],
});

/** Settings when nothing else is given: the soft filter, a little slower than the model's own pace. */
export const DEFAULTS: Readonly<{preset: PresetName; speed: number; expressiveness: number; rhythmVariation: number}> = Object.freeze({ preset: "soft", speed: 0.8, expressiveness: 0.5, rhythmVariation: 0.5 });
const BASE = DEFAULTS;
const NAMES = Object.keys(RANGES) as NumericSetting[];

/**
 * Final settings for one call: the preset's values, then the voice's defaults, then the call's options. A preset
 * named at a later level resets pitch/formant/breathReduction to that preset before that level's own values apply.
 * Unknown presets are an error; out-of-range numbers are clamped; non-numbers fall back to the earlier level.
 * @param {...object} levels  e.g. resolveSettings(voiceDefaults, callOptions)
 */
export function resolveSettings(...levels: VoiceSettings[]) {
  const out: ResolvedSettings = { ...BASE, ...PRESETS[BASE.preset] };
  for (const level of levels) {
    if (!level) continue;
    if (level.preset !== undefined) {
      if (!Object.hasOwn(PRESETS, level.preset)) {
        throw new TypeError(`unknown preset "${level.preset}" (use ${Object.keys(PRESETS).join(", ")})`);
      }
      Object.assign(out, PRESETS[level.preset], { preset: level.preset });
    }
    for (const name of NAMES) {
      const v = level[name];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const [min, max] = RANGES[name];
      out[name] = Math.min(max, Math.max(min, v));
    }
  }
  return out;
}
