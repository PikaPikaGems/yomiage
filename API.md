# yomiage: API (draft)

Japanese text-to-speech in the browser with the つくよみちゃん (Tsukuyomi-chan) voice, plus voice presets. Runs on the
device (no server), works on iPhone Safari.

*yomiage* (読み上げ) means "reading aloud".

```js
import { createVoice, CREDIT } from "yomiage";

const voice = createVoice();
await voice.load();
button.onclick = () => voice.speak("こんにちは。今日はいい天気ですね。");
// and show CREDIT somewhere on the page (required by the voice's terms)
```

Status of this page: implemented as described, except §9 (iPhone memory, not measured yet) and §10 (React, later).

---

## 1. Setup (once per project)

```bash
npm install <yomiage release URL>
```

```json
"scripts": {
  "predev": "yomiage copy-files public/yomiage",
  "prebuild": "yomiage copy-files public/yomiage"
}
```

- Copies the voice model, the phonemizer, the ONNX Runtime files and the engine worker (`yomiage-worker.js`) into
  your project. They are downloaded once (65 MB) from the yomiage release of the installed version and cached on
  your computer (`~/.cache/yomiage`); when the folder is already up to date the command returns at once.
- Nothing to configure in your bundler: the worker runs from that folder, not from your bundle.
- Big files are split into parts of at most 20 MB, so any static host works (GitHub Pages, Cloudflare Pages).
- Add `public/yomiage/` to `.gitignore`.
- Vite, Next.js and Create React App serve `public/` at the site root, so the files end up at `/yomiage/`: the
  default yomiage looks in. Nothing to configure.

## 2. Create a voice

```js
const voice = createVoice();                              // defaults
const narrator = createVoice({ preset: "deep" });         // with your own defaults
const student = createVoice({ preset: "soft", speed: 0.85 });
```

Creating a voice **does nothing**: no download, no memory. A voice is a light handle with default settings; the
heavy part (voice model, phonemizer, runtime) is **shared by all voices on the page** and loaded at most once.

Options (all optional):

| Option | Default | What it does |
|---|---|---|
| `filesUrl` | `"/yomiage/"` | Where `copy-files` put the files, if not the default |
| `preset`, `speed`, `pitch`, `formant`, `breathReduction`, `expressiveness`, `rhythmVariation` | see §4 | Default voice settings for this voice's `speak()` calls |
| `idleTimeout` | `60_000` | Free the memory after this many ms unused. `0` = never |
| `stopWhenHidden` | `true` | Free the memory while the page is in the background (iOS kills heavy background tabs first). Also stops playback |
| `crashGuard` | `{ retryAfterDays: 7 }` | Don't load again right after a load crashed the tab (§7). `false` = off |
| `timeouts` | `{ loadStall: 60_000, speakStall: 20_000 }` | Give up instead of hanging (§7) |
| `persistStorage` | `true` | Ask the browser to keep the downloaded files |

## 3. Load, when you decide

```js
const { cached, downloadMB } = await voice.info();
if (!cached && !confirm(`Download the voice (${downloadMB} MB)?`)) return;

const off = voice.on("progress", (p) => {
  bar.value = p.fraction;                                 // 0 → 1 over the whole load; never goes backwards
  label.textContent =
    p.stage === "downloading" ? `Downloading voice… ${Math.round(p.loaded / 1e6)} / ${Math.round(p.total / 1e6)} MB`
    : p.stage === "preparing" ? "Preparing voice…"
    : "Ready";
});
try {
  await voice.load();                   // resolves { fromCache, ms, timings }
} catch (err) {
  if (err.code === "unavailable") hideSpeakButtons();   // it crashed this device before: see §7
  else showError(err.message);
} finally {
  off();
}
```

Nothing is downloaded or loaded before `load()`, so loading lazily is up to the app: e.g. call `load()` in the
first tap on a speak button (`if (voice.status === "not-loaded") await voice.load();`). Audio still plays from that
tap afterwards.

### Progress

The files stay on the device until the browser deletes them: Safari does that after about 7 days of browsing
without visiting the site (except for web apps added to the Home Screen), other browsers when storage runs low. The
next `load()` then downloads again, and `info()` reports `cached: false` beforehand.


One `progress` event covers the whole load, so a single bar works whether or not the files have to be downloaded:

| Field | What it is |
|---|---|
| `stage` | `"downloading"` (while parts are still arriving: the first time, and whenever the browser has deleted the files since), `"preparing"` (unpacking and starting the engine; every load), `"ready"` (once, at the end). Stable: use it for labels |
| `fraction` | 0 → 1 for the whole load. When downloading, the download counts for most of it; when the files are on the device, preparing counts for all of it |
| `loaded`, `total` | Bytes for the current stage: downloaded / to download, or unpacked / all |
| `step` | What is happening right now, for debugging (may change between versions): `read` (a part from the device), `download`, `verify`, `store`, `unpack`, `file-done`, then the engine's own: `start-runtime-and-voice-model`, `import-phonemizer`, `start-phonemizer`, `start-piper`, and `ready` |
| `file`, `part`, `parts`, `fileIndex`, `files` | Which file and part the step is working on |
| `downloaded`, `toDownload`, `unpacked`, `toUnpack` | The raw byte counts behind `fraction` |
| `ms` | Milliseconds since loading started |

When the files are on the device, the bar moves by time: each load remembers how long each step took on this device, so
the next one keeps the bar moving through long steps (starting the voice model is the longest). Only the very first
load from the device, and loads that download, can pause on a long step; `step` says which one.

For debugging, `load()` also resolves `timings`: every step with its file, part, start (`at`) and duration (`ms`),
and `voice.on("log", fn)` gets a line per step (`"1.23 s  download model.onnx part 1/2"`).

Status: `voice.status` and `voice.on("status", fn)`, with the same values as wakachi: `not-loaded`, `downloading`,
`loading`, `ready`, `stopped` (memory freed; reloads by itself), `unavailable`, `error`.

## 4. Speak

```js
await voice.speak("こんにちは。今日はいい天気ですね。");          // resolves "done", or "stopped" if interrupted
voice.speak(text, { preset: "deep", pitch: -10, speed: 1.1 });   // per-call settings override the voice's defaults
voice.stop();                                                     // stop whatever is playing
```

- **Starts quickly:** the text is split into sentences; the first one plays while the next ones are prepared.
- **One at a time:** a new `speak()` stops whatever is playing on the page (from any voice). For a conversation read
  line by line, pass `{ queue: true }`: it waits for the current speech to finish instead.
- **iPhone:** Safari only plays sound that starts from a tap. yomiage unlocks audio on the first tap or key press
  anywhere on the page, so call `speak()` from a button and it just works. If audio is still blocked,
  `speak()` rejects with `audio-blocked`.
- Cancel with an `AbortSignal` (`{ signal }`): `speak()` then rejects with an `AbortError`, like other calls.
- Call `load()` first; `speak()` before that rejects with `not-loaded`. After the memory was freed (idle, page
  hidden, `unload()`), `speak()` reloads it from the device by itself.

### Settings

Pass any of these to `createVoice()` (defaults for that voice) or to `speak()` / `synthesize()` (one call). Values
outside the range are clamped, never an error, so a slider can't break playback.

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

`DEFAULTS` exports the defaults (`{ preset: "soft", speed: 0.8, expressiveness: 0.5, rhythmVariation: 0.5 }`),
`PRESETS` the preset table and `RANGES` the ranges, e.g. to build your own controls. The presets are filters on
Tsukuyomi-chan's voice, picked by ear; they are not other characters. Pitch and formant are changed with PSOLA (our
own code); formant shifting makes the model speak a little faster first, so `speed` stays what you set.

### Highlighting the sentence being read

```js
voice.speak(text, { onSentence: ({ text, start, end }) => highlight(start, end) });
```

Called as each sentence starts playing; `start`/`end` are positions in the text. Useful for study apps.

### Sentences in other languages

Only sentences with **no Japanese at all** are affected (e.g. "Let's do our best!" between two Japanese sentences);
mixed sentences like 「今日はmeetingがあります。」 are always read normally.

| `otherLanguages` | What happens to such a sentence |
|---|---|
| `"read"` (default) | Tsukuyomi-chan reads it in the model's English mode (with a Japanese-ish accent) |
| `"skip"` | Left out silently |

## 5. Audio without playing it

```js
import { toWav } from "yomiage";

const audio = await voice.synthesize("こんにちは", { preset: "soft" });   // { samples: Float32Array, sampleRate }
const blob = toWav(audio);                                                // a WAV file, e.g. for a download link
```

## 6. Freeing memory and storage

```js
voice.stop();               // stop playback
voice.unload();             // free the memory now (if no other voice on the page needs it); reloads when needed
voice.dispose();            // back to "not-loaded"
await voice.clearCache();   // delete the downloaded files from this device
```

## 7. When things go wrong

Same approach as wakachi:

- **No freezing:** synthesis runs in a Web Worker; the page stays responsive.
- **Never the same crash twice:** if loading crashed the tab (iOS kills tabs that use too much memory), `load()`
  rejects with `unavailable` for `retryAfterDays` instead of crashing again; hide the speak buttons.
  `resetCrashGuard()` clears it.
- **Timeouts measure time without progress:** `loadStall` (no download or startup progress) and `speakStall` (no
  sentence finished). The worker is stopped and the call rejects with `timeout`.

`VoiceError` codes: `not-loaded`, `disposed`, `unavailable`, `unsupported-browser`, `download-failed`,
`checksum-mismatch`, `out-of-memory`, `timeout`, `engine-failed`, `worker-crashed` (all as in wakachi), plus
`audio-blocked` (the browser didn't allow sound: start speaking from a tap).

## 8. Credit (required)

The Tsukuyomi-chan voice may be used freely, including commercially, but **every app must show the credit**:

```js
import { CREDIT } from "yomiage";
footer.textContent = CREDIT;
```

Some uses are prohibited by the voice's terms; see [NOTICE.md](NOTICE.md).

## 9. Memory on iPhone Safari

To be measured. Expect roughly 150–250 MB while loaded (voice model, phonemizer, runtime). With wakachi on the same
page (~150 MB), load one, then the other, not both at the same moment.

## 10. TypeScript

Types are included (`types/index.d.ts`): `Voice`, `VoiceOptions`, `SpeakOptions`, `LoadProgress`, `VoiceError` and
the rest. Nothing to install.

## 11. React *(later)*

```jsx
const { speak, stop, status } = useVoice({ preset: "soft" });
```
