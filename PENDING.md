# Pending

- [ ] **Files on another host.** Today the files must be on the same site as the page. The voice parts could come from
      any host that sends CORS headers (GitHub Pages does), but browsers refuse to start a worker from another origin,
      so `yomiage-worker.js` can't. Fix (in kakera): start the worker from a small same-origin blob that imports the
      remote script (the remote host then also needs CORS on that file). GitHub release downloads send no CORS headers,
      so a page can't load from a release directly; GitHub Pages or a CDN would work.
- [ ] Demo page on GitHub Pages (test/voice.html with the voice files).
- [ ] First GitHub release (v0.1.0) with `files/`: `copy-files` downloads from it by default.
- [ ] `yomiage/react`: `useVoice()`; React as an optional peer dependency.
- [ ] Test on a real iPhone (sound unlock, loading bar, memory).
- [ ] CI: Node tests and the browser test page.
