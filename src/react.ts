// yomiage/react: useYomiage() and useYomiageEngine(). See API.md §11.
//
// React is an optional peer dependency: only apps that import "yomiage/react" need it. The build keeps React and
// "./index.js" (the main bundle, so the page has one voice engine) out of dist/react.js.
//
// No provider: every hook on the page uses one shared voice per filesUrl, so load() in one component loads it for
// all. The engine options (idleTimeout, crashGuard, ...) come from the first hook that uses that filesUrl.
import { useEffect, useState, useSyncExternalStore } from "react";
import { engineStore } from "kakera/store";
import { createVoice } from "./index.js";
import { createSpeaker, type SpeakerDefaults, type YomiageEngineSnapshot, type YomiageEngineStore, type YomiageState } from "./react-state.js";
import type { LoadProgress, Voice, VoiceOptions, VoiceStatus } from "./types.js";

export type { YomiageState, HookSpeakOptions } from "./react-state.js";

type SettingName = "preset" | "speed" | "pitch" | "formant" | "breathReduction" | "expressiveness" | "rhythmVariation" | "otherLanguages";
/** Options for useYomiageEngine(): where the files are, and how the shared voice behaves. */
export type YomiageEngineOptions = Omit<VoiceOptions, SettingName>;
/** Options for useYomiage(): the engine options plus this component's default voice settings. */
export type UseYomiageOptions = VoiceOptions;

/** What useYomiageEngine() returns. Same shape as wakachi's useWakachiEngine(). */
export interface YomiageEngine extends YomiageEngineSnapshot {
  /** Download if needed, then load into memory. Never rejects: a failure shows in `status` and `error`. */
  load(): Promise<void>;
  /** Free the memory, keep the files. */
  unload(): void;
  /** Delete the files from this device. */
  clearCache(): Promise<void>;
  /** Text to paste into a bug report. Never includes spoken text. */
  debugReport(): Promise<string>;
}

const shared = new Map<string, { voice: Voice; store: YomiageEngineStore }>();

function split(options: VoiceOptions = {}) {
  const { preset, speed, pitch, formant, breathReduction, expressiveness, rhythmVariation, otherLanguages, ...engine } = options;
  const settings: SpeakerDefaults = { preset, speed, pitch, formant, breathReduction, expressiveness, rhythmVariation, otherLanguages };
  for (const k of Object.keys(settings) as (keyof SpeakerDefaults)[]) if (settings[k] === undefined) delete settings[k];
  return { engine, settings };
}

function sharedEngine(options: YomiageEngineOptions = {}) {
  const key = options.filesUrl ?? "/yomiage/";
  let s = shared.get(key);
  if (!s) {
    const voice = createVoice(options); // no voice settings here: each useYomiage() passes its own to speak()
    s = { voice, store: engineStore<VoiceStatus, LoadProgress>(voice) };
    shared.set(key, s);
  }
  return s;
}

/** The voice for a settings page: what is on the device and in memory, with buttons to change it. */
export function useYomiageEngine(options?: YomiageEngineOptions): YomiageEngine {
  const { store } = sharedEngine(split(options).engine);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...snap, load: store.load, unload: store.unload, clearCache: store.clearCache, debugReport: store.debugReport };
}

/**
 * Read aloud, once the voice is loaded (by this or any other component). Nothing loads by itself: with status
 * "not-loaded", call `load()` from something the user chose. Unmounting stops what this component was saying.
 */
export function useYomiage(options?: UseYomiageOptions): YomiageState {
  const { engine, settings } = split(options);
  const { voice, store } = sharedEngine(engine);
  const [speaker] = useState(() => createSpeaker(store, voice));
  speaker.setDefaults(settings); // read at speak() time, so the latest render's settings apply
  useEffect(() => { speaker.start(); return speaker.stop; }, [speaker]);
  return useSyncExternalStore(speaker.subscribe, speaker.getSnapshot, speaker.getSnapshot);
}
