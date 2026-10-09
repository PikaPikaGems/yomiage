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
- [ ] More memory, if needed: ONNX Runtime `graphOptimizationLevel: "disabled"` started at 122 MB instead of 211 MB in
      Node but grew to 176 MB on a long sentence (check its speed); a smaller (quantized) voice model changes the sound.
- [ ] Test on a real iPhone (sound unlock, loading bar, memory).
- [ ] CI: Node tests and the browser test page.
