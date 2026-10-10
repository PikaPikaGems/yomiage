// Compiled by `npm run test:types` (never run): the hooks' types narrow by status and reject mistakes.
import { useYomiage, useYomiageEngine, type YomiageState, type YomiageEngine } from "yomiage/react";

export function ReadAloud({ text }: { text: string }): string {
  const y: YomiageState = useYomiage({ preset: "soft", speed: 0.85, filesUrl: "/yomiage/" });
  // @ts-expect-error  speak exists only once status is "ready"
  void y.speak(text);
  switch (y.status) {
    case "not-loaded": void y.load(); return y.cached ? "Turn on voice" : `Download voice (${y.downloadMB ?? "?"} MB)`;
    case "loading": return `${y.progress.stage} ${y.progress.fraction}`;
    case "unavailable": return y.reason;
    case "error": y.retry(); return y.error.message;
    case "ready":
      if (y.speaking) y.stop();
      else void y.speak(text, { pitch: -2, queue: true, onSentence: (s) => s.start }).then((r: "done" | "stopped") => r);
      return y.sentence ? text.slice(y.sentence.start, y.sentence.end) : "";
  }
}

export function Row(): string {
  const e: YomiageEngine = useYomiageEngine({ idleTimeout: 0 });
  if (e.status === "not-loaded") void e.load();
  if (e.status === "ready") e.unload();
  if (e.cached) void e.clearCache();
  void e.debugReport().then((t: string) => t);
  return `${e.downloadMB} ${e.progress?.fraction} ${e.error?.message}`;
}

// @ts-expect-error  voice settings belong to useYomiage(), not the shared engine
useYomiageEngine({ preset: "soft" });
// @ts-expect-error  no such preset
useYomiage({ preset: "loud" });
