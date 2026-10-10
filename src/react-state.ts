// The state behind yomiage/react's useYomiage(), without React (react.ts is the thin hook on top), so Node tests can
// drive it with a fake engine.
//
// All hooks on a page share one voice per filesUrl (react.ts); each hook passes its own settings to speak(). Nothing
// loads by itself: speak() exists only once the shared voice has been loaded (by any component).
import type { LoadProgress, Sentence, SpeakOptions, Voice, VoiceSettings, VoiceStatus, OtherLanguages } from "./types.js";

// Declared here rather than imported from kakera: kakera is bundled, so the published types can't refer to it.
/** The shared voice's state (kakera's engineStore() snapshot). */
export interface YomiageEngineSnapshot {
  status: VoiceStatus;
  /** The files are on this device. null until known (a moment after mounting). */
  cached: boolean | null;
  /** Download size in MB when not cached. null until known. */
  downloadMB: number | null;
  /** The latest progress while downloading or loading, otherwise null. */
  progress: LoadProgress | null;
  /** The last load() error, until the next load() starts or the voice is ready. */
  error: Error | null;
}

/** kakera's engineStore() for the shared voice. */
export interface YomiageEngineStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): YomiageEngineSnapshot;
  load(): Promise<void>;
  unload(): void;
  clearCache(): Promise<void>;
  debugReport(): Promise<string>;
}

/** Settings for one speak() from the hook: the voice settings, queue and onSentence. */
export type HookSpeakOptions = Omit<SpeakOptions, "signal">;

/** The settings a hook passes to every speak() (its own defaults). */
export interface SpeakerDefaults extends VoiceSettings {
  otherLanguages?: OtherLanguages;
}

/** What useYomiage() returns: the fields depend on `status`. */
export type YomiageState =
  | {
    status: "not-loaded";
    /** Download if needed, then load (for every component on the page). Call it from something the user chose. */
    load: () => Promise<void>;
    /** The voice is on this device. null until known (a moment after mounting). */
    cached: boolean | null;
    /** Download size in MB. null until known. */
    downloadMB: number | null;
  }
  | { status: "loading"; progress: LoadProgress }
  | {
    status: "ready";
    /**
     * Read `text` aloud (call it from a tap or click). Resolves "done", or "stopped" when stop(), a newer speak()
     * or the page being hidden ended it. Never rejects: a failure shows as status "error".
     */
    speak: (text: string, settings?: HookSpeakOptions) => Promise<"done" | "stopped">;
    /** Stop what this component is saying. */
    stop: () => void;
    /** This component is speaking (or waiting its turn with `queue`). */
    speaking: boolean;
    /** The sentence being read, for highlighting: `text.slice(start, end)`. null when not speaking. */
    sentence: Sentence | null;
  }
  | { status: "unavailable"; reason: string }
  | { status: "error"; error: Error; retry: () => void };

const progressFor = (status: VoiceStatus, p: LoadProgress | null): LoadProgress =>
  p ?? { stage: status === "downloading" ? "downloading" : "preparing", fraction: status === "downloading" ? 0 : 1, step: status, ms: 0 };

/** One useYomiage() instance. start() / stop() follow the component's mount (React may run them twice). */
export function createSpeaker(store: YomiageEngineStore, voice: Pick<Voice, "speak">) {
  let defaults: SpeakerDefaults = {};
  const speeches = new Set<AbortController>();
  let sentence: Sentence | null = null;
  let error: Error | null = null;
  let last: { text: string; settings: HookSpeakOptions } | null = null;
  let snap: YomiageState | null = null;
  let seen: ReturnType<typeof store.getSnapshot> | null = null;
  let unsubscribe: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function changed() {
    snap = null;
    for (const fn of [...listeners]) fn();
  }

  function speak(text: string, settings: HookSpeakOptions = {}): Promise<"done" | "stopped"> {
    last = { text, settings };
    error = null;
    const ctrl = new AbortController();
    speeches.add(ctrl);
    changed();
    return voice.speak(text, {
      ...defaults, ...settings, signal: ctrl.signal,
      onSentence(s) {
        if (ctrl.signal.aborted) return;
        sentence = s;
        changed();
        settings.onSentence?.(s);
      },
    }).catch((err: unknown): "stopped" => {
      // "disposed": the files were deleted (clearCache()); the status says "not-loaded" now, not an error
      if (!ctrl.signal.aborted && (err as { code?: unknown } | null)?.code !== "disposed") error = err instanceof Error ? err : new Error(String(err));
      return "stopped";
    }).finally(() => {
      speeches.delete(ctrl);
      if (speeches.size === 0) sentence = null;
      changed();
    });
  }

  function stop() {
    for (const ctrl of speeches) ctrl.abort();
  }

  function retry() {
    error = null;
    changed();
    const s = store.getSnapshot().status;
    if (s === "ready" || s === "stopped") { if (last) void speak(last.text, last.settings); }
    else void store.load();
  }

  function compute(): YomiageState {
    const e = store.getSnapshot();
    if (e.status === "unavailable") return { status: "unavailable", reason: e.error?.message ?? "loading the voice crashed this device recently" };
    if (error) return { status: "error", error, retry };
    if (e.status === "error") return { status: "error", error: e.error ?? new Error("the voice could not be loaded"), retry };
    if (e.status === "not-loaded") return { status: "not-loaded", load: store.load, cached: e.cached, downloadMB: e.downloadMB };
    if (e.status === "downloading" || e.status === "loading") return { status: "loading", progress: progressFor(e.status, e.progress) };
    return { status: "ready", speak, stop, speaking: speeches.size > 0, sentence };
  }

  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot() {
      // also recompute when the shared engine changed before start() subscribed (between render and effect)
      if (!snap || store.getSnapshot() !== seen) { seen = store.getSnapshot(); snap = compute(); }
      return snap;
    },
    setDefaults(d: SpeakerDefaults) { defaults = d; },
    start() {
      if (unsubscribe) return;
      unsubscribe = store.subscribe(changed);
    },
    /** Unmounting: stop the sound this component started. The voice stays loaded for the others. */
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      stop();
    },
  };
}
