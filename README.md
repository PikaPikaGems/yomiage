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

## Voice settings

Pass any of these to `createVoice()` (defaults for that voice) or to `speak()` / `synthesize()` (one call).
Values outside the range are clamped, so a slider can never break playback.

```js
const voice = createVoice({ preset: "deep", speed: 0.9 });
voice.speak("こんにちは。", { pitch: -10 });   // this call only
```

| Setting | Range | Default | What it does |
|---|---|---|---|
| `preset` | `original` `soft` `low` `deep` `deeper` | `soft` | A starting point for `pitch`, `formant` and `breathReduction` (table below). Settings you also pass override it |
| `speed` | 0.5 – 1.5 | 0.8 | How fast she talks. 1 is the model's natural pace, 0.5 half as fast. Changes the tempo only, not the pitch |
| `pitch` | −14 – +6 | from preset | How high or low the voice is, in semitones (12 = one octave). −2 is slightly lower, −12 an octave down. On its own, a big change sounds like the same small speaker sped up or slowed down; combine it with `formant` for a different-sounding voice |
| `formant` | −8 – +4 | from preset | The "size" of the voice, in semitones: the resonances of the throat and mouth, independent of pitch. Negative sounds like a bigger, deeper body (more mature or masculine); positive sounds smaller (younger). Large values start to sound artificial |
| `breathReduction` | 0 – 1 | from preset | Softens the hissy, airy high frequencies. Shifted voices pick up some breath noise, so the presets that shift use 0.6. Higher is cleaner but makes s / sh sounds duller |
| `expressiveness` | 0 – 1 | 0.5 | How much the tone and intonation vary. Low is flat and steady, a bit robotic; high is livelier but can wobble. (piper's *noise scale*) |
| `rhythmVariation` | 0 – 1 | 0.5 | How much the length of sounds and pauses varies. Low is metronome-steady; high is more natural but uneven. (piper's *noise W*) |

| Preset | `pitch` | `formant` | `breathReduction` | Sounds like |
|---|---|---|---|---|
| `original` | 0 | 0 | 0 | Tsukuyomi-chan's own voice, unfiltered |
| `soft` | −2 | −0.5 | 0.6 | A little calmer and lower; the default |
| `low` | −6 | −1.5 | 0.6 | A lower, mature voice |
| `deep` | −9 | −4 | 0.6 | A deep voice |
| `deeper` | −11 | −5.5 | 0.6 | The deepest preset |

The presets are filters on Tsukuyomi-chan's voice, picked by ear; they are not other characters. `PRESETS`, `RANGES`
and `DEFAULTS` are exported, e.g. to build your own controls. Pitch and formant are changed with PSOLA (our own
code); formant shifting makes the model speak a little faster first, so `speed` stays what you set.

Per call there are also `queue`, `onSentence`, `otherLanguages` and `signal`; see [API.md](API.md#4-speak).

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
