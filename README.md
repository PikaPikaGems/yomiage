# yomiage

> [!WARNING]
> This project is experimental. Use it at your own risk.

Japanese text-to-speech in the browser with the つくよみちゃん (Tsukuyomi-chan) voice, plus voice presets.
Runs on the device (no server) and works on iPhone Safari. *yomiage* (読み上げ) means "reading aloud".

**Work in progress:** the engine works (tested in Chrome on a Mac); iPhone testing and the first release are next.
The API is in [API.md](API.md).

```js
import { createVoice, CREDIT } from "yomiage";

const voice = createVoice({ preset: "soft" });
await voice.load();
button.onclick = () => voice.speak("こんにちは。");
```

React (optional, React 18 or later): `useYomiage()` and `useYomiageEngine()` from `yomiage/react`, in
[API.md §11](API.md#11-react).

Every app using yomiage must show the Tsukuyomi-chan credit (`CREDIT`); see [NOTICE.md](NOTICE.md).

## Nothing downloads until the user says so

The voice is a 65 MB download and a few hundred MB of memory, so yomiage never fetches or loads it by itself:

- **Opening the page** downloads nothing big. Only a small `manifest.json` is read, when you ask for the size
  (`voice.info()`, or the React hooks), so you can show "Download (65 MB)".
- **Opting in:** only `load()` downloads (the first time) and loads into memory. Call it from something the user chose,
  like a button. Unused memory is freed by itself (after a minute, or when the page is in the background) and comes
  back from the device when needed, without downloading.
- **Opting out:** `clearCache()` ("Delete from device") deletes the files, frees the memory and turns the feature
  off everywhere on the page. Nothing downloads again until the next `load()`.

**Your app remembers the choice.** On every visit, even when the files are already on the device, yomiage starts as
`"not-loaded"` and waits for `load()`. To bring the feature back for a user who opted in before, save their choice
and call `load()` at startup. That reads from the device; nothing is downloaded:

```js
const voice = createVoice();
const { cached } = await voice.info();
if (localStorage.getItem("yomiage") === "on" && cached) await voice.load();   // they said yes before

downloadButton.onclick = async () => { localStorage.setItem("yomiage", "on"); await voice.load(); };
deleteButton.onclick = async () => { localStorage.removeItem("yomiage"); await voice.clearCache(); };
```

With React, the same with `useYomiageEngine()`: `e.cached`, `e.load()` and `e.clearCache()`.

## Voice settings

`preset`, `speed`, `pitch`, `formant`, `breathReduction`, `expressiveness` and `rhythmVariation`: what each does,
their ranges and defaults, and the presets are in [API.md § Settings](API.md#settings).

## How it fits together

```
page:   dist/yomiage.js          createVoice(): settings, sentence splitting, playback, iPhone audio unlock
          │  (kakera: one worker per page, crash guard, timeouts, idle/hidden unloading)
worker: yomiage-worker.js        piper-plus + ONNX Runtime + PSOLA + breath filter, one file
          │  (kakera: parts downloaded once, checked, kept in IndexedDB)
files:  manifest.json + parts    ONNX Runtime wasm, voice model, phonemizer (65 MB to download, parts ≤ 20 MB)
```

The worker file and the voice files both live in the folder `copy-files` fills (`public/yomiage/`), so apps' bundlers
never see ONNX Runtime or the 60 MB phonemizer, and nothing needs configuring. Apps install yomiage with no
dependencies: kakera, ONNX Runtime and piper-plus are bundled in at build time.

## Layout

```
src/index.ts        createVoice, PRESETS, CREDIT, toWav, VoiceError (page side)
src/worker.ts       the engine (runs in the worker)
src/playback.ts     AudioContext, unlocking on taps, gapless scheduling
src/sentences.ts    splitting text into short pieces, keeping their positions (onSentence)
src/presets.ts      presets and setting ranges
src/psola.ts        pitch / formant shifting (PSOLA)
src/dehiss.ts       breath reduction filter (plain JavaScript, matches the Web Audio version)
src/piper-patch.ts  workaround for a piper-plus 0.7.0 speaker-embedding bug
src/wav.ts          toWav
src/react.ts        yomiage/react: the hooks (React is an optional peer dependency)
src/react-state.ts  useYomiage()'s state without React, so Node tests can drive it
bin/yomiage.mjs     yomiage copy-files
scripts/build.mjs   builds dist/yomiage.js, dist/react.js and dist/yomiage-worker.js (esbuild)
scripts/make-files.mjs  makes the voice files (files/) from the model and node_modules
test/               Node tests; voice.html: manual controls + automatic checks in the browser;
                    react.html: the hooks in a small React app + automatic checks
```

## Development

Source is strict TypeScript. `npm run build` checks the source, bundles JavaScript, and generates declarations in
`dist/types/`. Internal modules for Node tests go into `.cache/ts/`. `npm test` builds first. Build scripts stay
JavaScript. The `@webgpu/types` development dependency supplies types referenced by piper-plus; it adds no runtime code.


```bash
npm ci --prefix ../kakera        # build the shared TypeScript dependency first
npm install                     # kakera is linked from ../kakera
npm test                        # Node tests
npm run build                   # dist/
npm run files                   # files/ (downloads the model from Hugging Face once, into .cache/)
                                #   or: node scripts/make-files.mjs --model-dir ../jp-tts-playground/models/tsukuyomi
node bin/yomiage.mjs copy-files test/files --from files
python3 -m http.server 8093     # open http://localhost:8093/test/voice.html, Load voice, Run checks
npm run build:test-react        # test/react-app.js for http://localhost:8093/test/react.html
```

On an iPhone on the same Wi-Fi: serve with `--bind 0.0.0.0` and open `http://<this computer's IP>:8093/test/voice.html`.
(On plain http to a LAN address the browser has no `crypto.subtle`, so checksums are skipped; everything else is the
same as on a real https site.)

Demo site: `npm run publish:demo` builds `demo/` (the test page with the files) and pushes it to the `gh-pages`
branch, served at https://pikapikagems.github.io/yomiage/ (`node scripts/publish-demo.mjs --build` only builds it).

A release will carry `npm pack`'s tarball (what apps install) and the contents of `files/` (what `copy-files`
downloads, from `https://github.com/PikaPikaGems/yomiage/releases/download/v<version>/`).

## Licence

MIT, see [LICENSE](LICENSE). The voice model and libraries it downloads keep their own terms: [NOTICE.md](NOTICE.md).

The PSOLA and filter code started in [jp-tts-playground](https://github.com/PikaPikaGems/jp-tts-playground)
(AGPL-3.0-or-later) and is relicensed here under MIT by its author.
