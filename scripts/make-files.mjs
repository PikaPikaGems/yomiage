// Makes the voice files that `yomiage copy-files` installs into apps (and that a GitHub release will carry):
//
//   node scripts/make-files.mjs [--model-dir <dir>] [--out <dir>]
//
// Input:  the Tsukuyomi-chan model (model.onnx + config.json; downloaded from Hugging Face into .cache/ unless
//         --model-dir has them), ONNX Runtime's wasm and the piper-plus phonemizer from node_modules.
// Output: <out> (default files/): parts of at most 20 MB + manifest.json (kakera's format).
// The ONNX Runtime and phonemizer files must come from the same versions that dist/yomiage-worker.js was built with,
// so run this after `npm install`, from the same checkout.
import fs from "node:fs";
import path from "node:path";
import { splitFile, writeManifest, contentVersion } from "kakera/split";
import { splitWasm } from "kakera/wasm";

const root = new URL("../", import.meta.url).pathname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const outDir = path.resolve(opt("out") ?? path.join(root, "files"));
const mb = (n) => (n / 1048576).toFixed(1);

const MODEL_REPO = "ayousanz/piper-plus-tsukuyomi-chan";
const MODEL_BASE = `https://huggingface.co/${MODEL_REPO}/resolve/main`;
const MODEL_FILE = "tsukuyomi-chan-6lang-fp16.onnx";

async function download(url, dest) {
  if (fs.existsSync(dest)) return;
  console.log(`downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(`${dest}.tmp`, new Uint8Array(await res.arrayBuffer()));
  fs.renameSync(`${dest}.tmp`, dest);
}

let modelDir = opt("model-dir");
if (!modelDir) {
  modelDir = path.join(root, ".cache/model");
  await download(`${MODEL_BASE}/${MODEL_FILE}`, path.join(modelDir, "model.onnx"));
  await download(`${MODEL_BASE}/config.json`, path.join(modelDir, "config.json"));
}

const nm = (p) => path.join(root, "node_modules", p);
const version = (p) => JSON.parse(fs.readFileSync(nm(`${p}/package.json`))).version;
// Order matters: the worker turns each file into what it becomes as soon as it arrives (see src/worker.ts).
const inputs = [
  ["ort.wasm", nm("onnxruntime-web/dist/ort-wasm-simd-threaded.wasm")],
  ["config.json", path.join(modelDir, "config.json")],
  ["model.onnx", path.join(modelDir, "model.onnx")],
  ["phonemizer.js", nm("piper-plus/dist/rust-wasm/piper_plus_wasm.js")],
  ["phonemizer.wasm", nm("piper-plus/dist/rust-wasm/piper_plus_wasm_bg.wasm")],
];

// The phonemizer's 59 MB dictionary is built into its wasm as data segments. Browsers would keep it twice (in the
// compiled program and in its memory), so it ships as its own file, phonemizer-data.bin, which the worker writes
// straight into the phonemizer's memory (kakera/wasm). manifest.meta.phonemizerSegments says where each piece goes.
const phonemizer = splitWasm(new Uint8Array(fs.readFileSync(inputs.at(-1)[1])));
const phonemizerSegments = phonemizer.segments.map((s) => ({ offset: s.offset, length: s.bytes.length }));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const buffers = [], files = [];
const contents = inputs.map(([name, src]) => [name, new Uint8Array(fs.readFileSync(src))]);
contents.splice(-1, 1, ["phonemizer.wasm", phonemizer.code], ["phonemizer-data.bin", Buffer.concat(phonemizer.segments.map((s) => s.bytes))]);
for (const [name, bytes] of contents) {
  buffers.push(bytes);
  const f = splitFile(bytes, { name, outDir });
  files.push(f);
  console.log(`${name.padEnd(16)} ${mb(f.size).padStart(6)} MB -> ${f.parts.length} part(s), ${mb(f.parts.reduce((n, p) => n + p.size, 0))} MB on the server${f.gzip ? " (gzip)" : ""}`);
}
const m = writeManifest(outDir, {
  name: "yomiage-tsukuyomi",
  version: contentVersion(...buffers),
  files,
  meta: { yomiage: pkg.version, onnxruntimeWeb: version("onnxruntime-web"), piperPlus: version("piper-plus"), model: `${MODEL_REPO}/${MODEL_FILE}`, phonemizerSegments },
});
console.log(`\n${outDir}/manifest.json: download ${mb(m.downloadSize)} MB`);
