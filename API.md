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

Status of this page: the API we agreed on; the code is being built (see README).

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

- Copies the voice model, the phonemizer and the ONNX Runtime files into your project (about 70 MB to download
  the first time, to be confirmed). They are downloaded once from the yomiage release and cached on your computer.
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

const off = voice.on("progress", ({ loaded, total }) => showBar(loaded / total));
try {
  await voice.load();                   // resolves { fromCache }
} catch (err) {
  if (err.code === "unavailable") hideSpeakButtons();   // it crashed this device before: see §7
  else showError(err.message);
} finally {
  off();
}
```

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
- Cancel with an `AbortSignal` (`{ signal }`) like any other call.

### Settings

| Setting | Range | Default | What it does |
|---|---|---|---|
| `preset` | see below | `"original"` | Starting values for `pitch`, `formant` and `breathReduction` |
| `speed` | 0.5 – 1.5 | `0.9` | How fast she talks (tempo only, not pitch) |
| `pitch` | −14 – +6 | from preset | Semitones; negative = lower voice |
| `formant` | −8 – +4 | from preset | "Voice size" in semitones; negative = bigger, deeper |
| `breathReduction` | 0 – 1 | from preset | Softens hiss and the airy high frequencies |
| `expressiveness` | 0 – 1 | `0.5` | Variation in tone and intonation (piper's noise scale) |
| `rhythmVariation` | 0 – 1 | `0.5` | Variation in timing (piper's noise W) |

Values outside the range are clamped, never an error, so a slider can't break playback.

| Preset | `pitch` | `formant` | `breathReduction` |
|---|---|---|---|
| `"original"` | 0 | 0 | 0 |
| `"soft"` | −2 | −0.5 | 0.6 |
| `"low"` | −6 | −1.5 | 0.6 |
| `"deep"` | −9 | −4 | 0.6 |
| `"deeper"` | −11 | −5.5 | 0.6 |

`PRESETS` exports this table, e.g. to build your own controls. The presets are filters on Tsukuyomi-chan's voice,
picked by ear; pitch and formants are changed with PSOLA (our own code).

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

## 10. React *(later)*

```jsx
const { speak, stop, status } = useVoice({ preset: "soft" });
```
