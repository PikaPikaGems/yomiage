# Pending

- [x] **Files on another host** (2026-10-09): `filesUrl` can be another site that sends CORS headers; kakera starts
      the worker through a small same-origin script. Tested with two local origins.
- [x] Demo site: https://pikapikagems.github.io/yomiage/ (`npm run publish:demo` updates it).
- [x] First release: v0.1.0 (pre-release, 2026-10-09) with the tarball and `files/`; the playground installs from it.
      Next releases: bump the version, `npm pack`, `gh release create v<version> yomiage-<version>.tgz files/*`.
- [ ] `yomiage/react`: `useYomiage()` and `useYomiageEngine()`, designed in API.md §11; React as an optional peer
      dependency.
- [ ] `debugReport()` (from kakera), API.md §11.
- [ ] **Memory** (~450 MB loaded, API.md §9). Ideas, smallest first: (1) stream the phonemizer's 59 MB dictionary
      into its memory like wakachi does with Sudachi, so browsers don't keep it twice (~-59 MB); (2) ONNX Runtime
      session options: `graphOptimizationLevel: "disabled"` starts at 122 MB instead of 211 MB but grew to 176 MB on
      a long sentence (check its speed); (3) a smaller (quantized) voice model, which changes the sound.
- [ ] Test on a real iPhone (sound unlock, loading bar, memory).
- [ ] CI: Node tests and the browser test page.
