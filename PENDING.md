# Pending

- [x] **Files on another host** (2026-10-09): `filesUrl` can be another site that sends CORS headers; kakera starts
      the worker through a small same-origin script. Tested with two local origins.
- [x] Demo site: https://pikapikagems.github.io/yomiage/ (`npm run publish:demo` updates it).
- [x] First release: v0.1.0 (pre-release, 2026-10-09) with the tarball and `files/`; the playground installs from it.
      Next releases: bump the version, `npm pack`, `gh release create v<version> yomiage-<version>.tgz files/*`.
- [ ] `yomiage/react`: `useYomiage()` and `useYomiageEngine()`, designed in API.md §11; React as an optional peer
      dependency.
- [ ] `debugReport()` (from kakera), API.md §11.
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
- [ ] Test on a real iPhone (sound unlock, loading bar, memory).
- [ ] CI: Node tests and the browser test page.
