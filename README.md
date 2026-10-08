# yomiage

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

Every app using yomiage must show the Tsukuyomi-chan credit (`CREDIT`); see [NOTICE.md](NOTICE.md).

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
src/index.js        createVoice, PRESETS, CREDIT, toWav, VoiceError (page side)
src/worker.js       the engine (runs in the worker)
src/playback.js     AudioContext, unlocking on taps, gapless scheduling
src/sentences.js    splitting text into short pieces, keeping their positions (onSentence)
src/presets.js      presets and setting ranges
src/psola.js        pitch / formant shifting (PSOLA)
src/dehiss.js       breath reduction filter (plain JavaScript, matches the Web Audio version)
src/piper-patch.js  workaround for a piper-plus 0.7.0 speaker-embedding bug
src/wav.js          toWav
bin/yomiage.mjs     yomiage copy-files
scripts/build.mjs   builds dist/yomiage.js and dist/yomiage-worker.js (esbuild)
scripts/make-files.mjs  makes the voice files (files/) from the model and node_modules
test/               Node tests; voice.html: manual controls + automatic checks in the browser
```

## Development

```bash
npm install                     # kakera is linked from ../kakera
npm test                        # Node tests
npm run build                   # dist/
npm run files                   # files/ (downloads the model from Hugging Face once, into .cache/)
                                #   or: node scripts/make-files.mjs --model-dir ../jp-tts-playground/models/tsukuyomi
node bin/yomiage.mjs copy-files test/files --from files
python3 -m http.server 8093     # open http://localhost:8093/test/voice.html, Load voice, Run checks
```

On an iPhone on the same Wi-Fi: serve with `--bind 0.0.0.0` and open `http://<this computer's IP>:8093/test/voice.html`.
(On plain http to a LAN address the browser has no `crypto.subtle`, so checksums are skipped; everything else is the
same as on a real https site.)

A release will carry `npm pack`'s tarball (what apps install) and the contents of `files/` (what `copy-files`
downloads, from `https://github.com/PikaPikaGems/yomiage/releases/download/v<version>/`).

## Licence

MIT, see [LICENSE](LICENSE). The voice model and libraries it downloads keep their own terms: [NOTICE.md](NOTICE.md).

The PSOLA and filter code started in [jp-tts-playground](https://github.com/PikaPikaGems/jp-tts-playground)
(AGPL-3.0-or-later) and is relicensed here under MIT by its author.
