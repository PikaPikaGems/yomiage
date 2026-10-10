// Types for yomiage. The API is described in API.md.

/** Names of the voice filters. */
export type PresetName = "original" | "soft" | "low" | "deep" | "deeper";

/** Voice settings. All optional; see API.md § Settings for what each does. Out-of-range values are clamped. */
export interface VoiceSettings {
  /** Starting values for pitch, formant and breathReduction. Default "soft". */
  preset?: PresetName;
  /** 0.5 – 1.5. Tempo only, not pitch. Default 0.8. */
  speed?: number;
  /** −14 – +6 semitones. Default from the preset. */
  pitch?: number;
  /** −8 – +4 semitones: the "size" of the voice. Default from the preset. */
  formant?: number;
  /** 0 – 1. Softens hiss and airy high frequencies. Default from the preset. */
  breathReduction?: number;
  /** 0 – 1. Variation in tone and intonation (piper's noise scale). Default 0.5. */
  expressiveness?: number;
  /** 0 – 1. Variation in timing (piper's noise W). Default 0.5. */
  rhythmVariation?: number;
}

/** Sentences with no Japanese at all: read them in the model's English mode, or leave them out. */
export type OtherLanguages = "read" | "skip";

export interface VoiceOptions extends VoiceSettings {
  /** Where `yomiage copy-files` put the files. Default "/yomiage/". */
  filesUrl?: string;
  /** Free the memory after this many ms unused; 0 = never. Default 60000. */
  idleTimeout?: number;
  /** Free the memory and stop playback while the page is in the background. Default true. */
  stopWhenHidden?: boolean;
  /** Don't load again for a while after a load crashed the tab. false = off. Default { retryAfterDays: 7 }. */
  crashGuard?: false | { retryAfterDays?: number };
  /** Give up after this long without progress. Defaults: loadStall 60000, speakStall 20000 (ms). */
  timeouts?: { loadStall?: number; speakStall?: number };
  /** Ask the browser to keep the downloaded files. Default true. */
  persistStorage?: boolean;
  /** Default for this voice's calls. Default "read". */
  otherLanguages?: OtherLanguages;
}

/** A piece of the text, as passed to onSentence. `text.slice(start, end)` of the original text. */
export interface Sentence {
  text: string;
  start: number;
  end: number;
}

export interface SpeakOptions extends VoiceSettings {
  /** Wait for the current speech instead of stopping it. Default false. */
  queue?: boolean;
  /** Called as each sentence starts playing. */
  onSentence?: (sentence: Sentence) => void;
  otherLanguages?: OtherLanguages;
  /** Aborting rejects speak() with an AbortError. */
  signal?: AbortSignal;
}

export interface SynthesizeOptions extends VoiceSettings {
  otherLanguages?: OtherLanguages;
  signal?: AbortSignal;
}

export interface Audio {
  samples: Float32Array;
  sampleRate: number;
}

export type VoiceStatus = "not-loaded" | "downloading" | "loading" | "ready" | "stopped" | "unavailable" | "error";

/** One `progress` event: `stage` and `fraction` for the UI; the rest for debugging. */
export interface LoadProgress {
  stage: "downloading" | "preparing" | "ready";
  /** 0 → 1 over the whole load; never goes backwards. */
  fraction: number;
  /** What is happening right now. May change between versions: use it for debugging, not for logic. */
  step: string;
  /** Bytes for the current stage (downloaded / to download, or unpacked / all). */
  loaded?: number;
  total?: number;
  file?: string;
  part?: number;
  parts?: number;
  fileIndex?: number;
  files?: number;
  downloaded?: number;
  toDownload?: number;
  unpacked?: number;
  toUnpack?: number;
  /** Milliseconds since loading started. */
  ms: number;
}

/** One step of a load, with how long it took. */
export interface LoadTiming {
  step: string;
  file?: string;
  part?: number;
  /** Start, in ms since loading started. */
  at: number;
  /** Duration in ms. */
  ms: number;
}

export interface LoadResult {
  /** Nothing was downloaded. */
  fromCache: boolean;
  /** How long the load took (absent when the engine was already loaded). */
  ms?: number;
  timings?: LoadTiming[];
}

export interface VoiceInfo {
  /** All files are on this device. */
  cached: boolean;
  downloadBytes: number;
  downloadMB: number;
}

export interface VoiceEvents {
  status: VoiceStatus;
  progress: LoadProgress;
  log: string;
}

export interface Voice {
  readonly status: VoiceStatus;
  /** Returns an unsubscribe function. */
  on<E extends keyof VoiceEvents>(event: E, listener: (value: VoiceEvents[E]) => void): () => void;
  /** Download size and whether the files are already on this device, without downloading anything. */
  info(): Promise<VoiceInfo>;
  /** Plain-text, privacy-safe diagnostics for a bug report. Never includes spoken text. */
  debugReport(): Promise<string>;
  /** Download (when needed) and start the engine. Shared by all voices on the page. */
  load(): Promise<LoadResult>;
  /** Read aloud. Resolves "done", or "stopped" when stop(), a newer speak() or the page being hidden ended it. */
  speak(text: string, options?: SpeakOptions): Promise<"done" | "stopped">;
  /** Stop whatever is speaking on the page, including queued speech. */
  stop(): void;
  /** The audio without playing it. */
  synthesize(text: string, options?: SynthesizeOptions): Promise<Audio>;
  /** Free the memory now (if no other voice needs it); the next speak() reloads from the device. */
  unload(): void;
  /** Back to "not-loaded"; load() is needed again. */
  dispose(): void;
  /**
   * Delete the downloaded files from this device, free the memory and put every voice on the page back to
   * "not-loaded" (speech stops). Nothing downloads again until a load().
   */
  clearCache(): Promise<void>;
  /** Forget a recorded crash so load() tries again. */
  resetCrashGuard(): void;
}

export type VoiceErrorCode =
  | "not-loaded" | "disposed" | "unavailable" | "unsupported-browser" | "download-failed" | "checksum-mismatch"
  | "out-of-memory" | "timeout" | "engine-failed" | "worker-crashed" | "audio-blocked";
