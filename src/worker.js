// The engine, inside a Web Worker: piper-plus with the Tsukuyomi-chan model, plus the voice filters (PSOLA, breath
// reduction). Built into a single file, dist/yomiage-worker.js, which `yomiage copy-files` puts next to the voice
// files; the page starts it from there (see index.js), so apps' bundlers never have to handle it.
//
// Files (from the manifest, in this order; each is turned into what it becomes as soon as it arrives, so only one
// big file is in memory at a time):
//   ort.wasm         ONNX Runtime                 -> kept until the model session is created, then dropped
//   config.json      the voice's settings
//   model.onnx       the voice                    -> ONNX session (the bytes are dropped)
//   phonemizer.js    wasm-bindgen glue            -> imported from a blob URL
//   phonemizer.wasm  Japanese phonemizer, without its built-in dictionary (1.4 MB) -> kept until started
//   phonemizer-data.bin  that dictionary (59 MB)  -> streamed straight into the phonemizer's memory as it is
//                    created, before its start code runs, so the browser holds it once, not twice (kakera/wasm)
import * as ort from "onnxruntime-web/wasm";
import { PiperPlus } from "piper-plus";
import { serveEngine, withTransfer } from "kakera/worker";
import { collect } from "kakera/files";
import { codedError } from "kakera/errors";
import { initWithData } from "kakera/wasm";
import { shiftVoicePsola, VOICE_SHIFT } from "./psola.js";
import { reduceBreath } from "./dehiss.js";
import { patchSpeakerEmbeddingDim } from "./piper-patch.js";

// Set by the build (scripts/build.mjs). The page checks it, so a stale copy of the files is reported clearly.
const VERSION = typeof __YOMIAGE_VERSION__ === "string" ? __YOMIAGE_VERSION__ : "dev";

ort.env.wasm.numThreads = 1; // threads need cross-origin isolation, which most sites don't have
ort.env.wasm.proxy = false;

let piper = null;

// Warnings piper-plus prints that don't apply here, so apps' consoles stay clean: the speaker embedding is handled
// by piper-patch.js (it warns on every sentence), and Chinese isn't used.
const QUIET = ["[piper-plus] Model expects 'speaker_embedding'", "[piper-plus] Chinese pinyin dictionaries"];
const warn = console.warn.bind(console);
console.warn = (first, ...rest) => { if (!QUIET.some((q) => String(first).startsWith(q))) warn(first, ...rest); };

async function load(_msg, ctx) {
  let config = null, session = null, glue = null, phonemizerCode = null, phonemizerStarted = false;
  await ctx.loadFiles({
    onFile: async (file, chunks, manifest) => {
      if (file.name === "phonemizer-data.bin") {
        if (!glue || !phonemizerCode) throw codedError("engine-failed", "phonemizer-data.bin came before phonemizer.js / phonemizer.wasm in the manifest");
        ctx.step("start-phonemizer", { file: file.name });
        await initWithData(glue.default, phonemizerCode, manifest.meta.phonemizerSegments, chunks);
        phonemizerCode = null;
        phonemizerStarted = true;
        return;
      }
      const bytes = await collect(chunks, file.size);
      ctx.alive();
      switch (file.name) {
        case "ort.wasm":
          ort.env.wasm.wasmBinary = bytes;
          break;
        case "config.json":
          config = JSON.parse(new TextDecoder().decode(bytes));
          break;
        case "model.onnx":
          ctx.step("start-runtime-and-voice-model", { file: file.name });
          session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "extended" });
          ort.env.wasm.wasmBinary = undefined; // ONNX Runtime is running; free its copy of the binary
          break;
        case "phonemizer.js": {
          ctx.step("import-phonemizer", { file: file.name });
          const url = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
          try { glue = await import(/* @vite-ignore */ url); } finally { URL.revokeObjectURL(url); }
          break;
        }
        case "phonemizer.wasm":
          phonemizerCode = bytes;
          break;
        default:
          ctx.log(`ignoring unknown file ${file.name}`);
      }
    },
  });
  if (!config || !session || !phonemizerStarted) throw codedError("engine-failed", "the voice files are incomplete (run yomiage copy-files again)");

  // piper-plus wants a model URL and fetches the config next to it, then creates the ONNX session itself. Both were
  // already done above (from the stored parts), so hand it the results instead. It also fetches Chinese dictionaries
  // from /assets/ on the app's site; Tsukuyomi-chan doesn't need them, so those requests never leave the worker.
  const modelUrl = "https://yomiage.invalid/model.onnx";
  const realFetch = self.fetch;
  self.fetch = (url, ...rest) => {
    const u = String(url);
    if (u.startsWith("https://yomiage.invalid/")) return Promise.resolve(new Response(JSON.stringify(config), { headers: { "content-type": "application/json" } }));
    if (/\/pinyin_(single|phrases)\.json$/.test(u)) return Promise.resolve(new Response(null, { status: 404 }));
    return realFetch(url, ...rest);
  };
  ctx.step("start-piper");
  patchSpeakerEmbeddingDim({ _session: session }, ort, ctx.log);
  try {
    piper = await PiperPlus.initialize({
      model: modelUrl,
      ort: { ...ort, InferenceSession: { create: async () => session } },
      wasmLoader: async () => glue,
    });
  } finally {
    self.fetch = realFetch;
  }
  // piper-plus quietly drops Japanese (with only a console warning) when its phonemizer fails to start
  if (!piper._phonemizer?._phonemizers?.has("ja")) {
    throw codedError("engine-failed", "the Japanese phonemizer did not start (see the console)");
  }
  return { version: VERSION };
}

/**
 * One sentence to audio, with the voice settings applied.
 * Formants are moved by resampling, which also slows the speech down by the same ratio, so the model is asked to
 * speak faster by that ratio first; PSOLA then sets the final pitch.
 */
async function synth({ text, language, speed, pitch, formant, breathReduction, expressiveness, rhythmVariation }) {
  const ratio = 2 ** (formant / 12);
  const audio = await piper.synthesize(text, {
    language,
    lengthScale: ratio / speed,
    noiseScale: expressiveness,
    noiseW: rhythmVariation,
  });
  const { sampleRate } = audio;
  const shifted = shiftVoicePsola(audio.samples, sampleRate, pitch, formant, VOICE_SHIFT);
  let samples = reduceBreath(shifted, sampleRate, breathReduction);
  if (samples.buffer.byteLength !== samples.byteLength) samples = samples.slice(); // transfer exactly these bytes
  return withTransfer({ samples, sampleRate }, [samples.buffer]);
}

serveEngine({
  load,
  calls: {
    version: async () => VERSION,
    synth,
  },
});
