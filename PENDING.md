# Pending

- [x] Strict TypeScript source and generated public declarations (2026-10-09).

- [x] Shared `debugReport()` for bug reports (2026-10-09).

- [x] **Files on another host** (2026-10-09): `filesUrl` can be another site that sends CORS headers; kakera starts
      the worker through a small same-origin script. Tested with two local origins.
- [x] Demo site: https://pikapikagems.github.io/yomiage/ (`npm run publish:demo` updates it).
- [x] First release: v0.1.0 (pre-release, 2026-10-09) with the tarball and `files/`; the playground installs from it.
      Next releases: bump the version, `npm pack`, `gh release create v<version> yomiage-<version>.tgz files/*`.
- [x] `yomiage/react` (2026-10-10): `useYomiage()` and `useYomiageEngine()`, API.md §11; React ≥ 18 as an optional peer dependency.
      One shared voice per filesUrl for all hooks (no provider). Node tests (test/react.test.mjs, with a fake
      engine), type tests (test/types/react.ts), and test/react.html (a small React app with automatic checks;
      `npm run build:test-react`), passing in Chromium and WebKit. Released in v0.3.0 (2026-10-10).
- [x] `clearCache()` also frees the memory and puts every handle back to `"not-loaded"` (2026-10-10, in kakera):
      before, the next call after deleting the files downloaded them again by itself.
- [x] `debugReport()` (from kakera), API.md §11 (2026-10-09).
- [x] **Memory** (2026-10-09, measured in WebKit, Safari's engine): the phonemizer's dictionary now ships as
      phonemizer-data.bin and is streamed into its memory (kakera/wasm): peak while loading 931 → 693 MB, speaking
      ~680 → ~570 MB. Finished audio players are disconnected: Safari kept them, +2.3 MB per sentence until unload.
      The WebKit measuring scripts (Playwright WebKit + macOS `footprint`) are worth keeping for CI.
- [x] Release v0.2.0 (pre-release, 2026-10-09): the Safari memory fixes.
- [x] Tried ONNX Runtime `graphOptimizationLevel: "disabled"` (2026-10-09): same speed and 122 instead of 211 MB of
      wasm memory in Node, but ~60 MB *more* for the whole tab in WebKit (673–686 vs 618 MB speaking). Not used.
- [ ] More memory, if needed: a smaller (quantized) voice model, which changes the sound.
- [ ] **Parked (2026-10-09): memory still grows while speaking in some runs on Safari's engine.** About 1 run in 3,
      speaking a long text for 3 minutes in WebKit grows ~570 → ~740 MB; it stays while idle and is freed only when
      the worker ends, so it is in the worker. With pitch shifting and breath reduction off it grew less (+20, +52,
      +22 MB in 3 runs), so they make it worse (about 8 audio-sized temporary arrays per sentence) but are not the only
      cause. Next steps: (1) do those steps in place instead of copying; (2) restart the worker quietly between
      speeches after it has generated a lot (ending the worker frees everything; ~1 s from the device); (3) repeat
      `npm run test:webkit` several times, then add it to CI (macOS runner, for `footprint`).
      Tool: `npm run test:webkit` (test/webkit.mjs) runs the test page's checks in WebKit, the load peak limit and a
      5-minute speaking check. Needs `npx playwright-core install webkit` once, and test/files made with
      `node bin/yomiage.mjs copy-files test/files --from files`.
- [ ] **Parked (2026-10-10, owner).** Test on a real iPhone (sound unlock, loading bar, memory).
- [ ] CI: Node tests and the browser test page.
- [x] Page hidden after `dispose()` and `load()` (2026-10-10, fixed in kakera): speech kept going in the background
      (3 more sentences in 6 s in Chrome) and the engine reloaded there. Now it stops at once; test/voice.html checks
      it. Released in 0.3.2.
