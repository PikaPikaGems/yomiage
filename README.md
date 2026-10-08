# yomiage

Japanese text-to-speech in the browser with the つくよみちゃん (Tsukuyomi-chan) voice, plus voice presets.
Runs on the device (no server) and works on iPhone Safari. *yomiage* (読み上げ) means "reading aloud".

**Work in progress.** The API is in [API.md](API.md).

```js
import { createVoice, CREDIT } from "yomiage";

const voice = createVoice({ preset: "soft" });
await voice.load();
button.onclick = () => voice.speak("こんにちは。");
```

Every app using yomiage must show the Tsukuyomi-chan credit (`CREDIT`); see [NOTICE.md](NOTICE.md).

## Layout

```
src/index.js        createVoice, PRESETS, CREDIT, toWav            (not built yet)
src/presets.js      presets and setting ranges
src/psola.js        pitch / formant shifting (PSOLA)
src/dehiss.js       breath reduction filter (plain JavaScript, also runs in workers; matches the Web Audio version)
src/piper-patch.js  workaround for a piper-plus 0.7.0 speaker-embedding bug
test/               Node tests
```

The shared plumbing (download in parts, cache, worker host) comes from [kakera](https://github.com/PikaPikaGems/kakera),
a separate repository. yomiage bundles it at build time, so apps only install yomiage. For now it is linked from the
folder next to this one (`"kakera": "file:../kakera"`).

## Licence

MIT, see [LICENSE](LICENSE). The voice model and libraries it downloads keep their own terms: [NOTICE.md](NOTICE.md).

The PSOLA and filter code started in [jp-tts-playground](https://github.com/PikaPikaGems/jp-tts-playground)
(AGPL-3.0-or-later) and is relicensed here under MIT by its author.
