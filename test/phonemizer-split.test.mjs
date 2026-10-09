// The split phonemizer (program without its dictionary + phonemizer-data.bin, see scripts/make-files.mjs) gives
// exactly the same phonemes as the original program. Needs `npm run files` first.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { initWithData } from "kakera/wasm";

const files = new URL("../files/", import.meta.url);
const original = new URL("../node_modules/piper-plus/dist/rust-wasm/", import.meta.url);
const join = (name) => {
  const manifest = JSON.parse(fs.readFileSync(new URL("manifest.json", files)));
  const f = manifest.files.find((x) => x.name === name);
  const zlib = process.getBuiltinModule("node:zlib");
  return { manifest, bytes: Buffer.concat(f.parts.map((p) => { const b = fs.readFileSync(new URL(p.file, files)); return f.gzip ? zlib.gunzipSync(b) : b; })) };
};
const config = fs.readFileSync(new URL("../.cache/model/config.json", import.meta.url), "utf8");
const TEXTS = ["こんにちは。今日はいい天気ですね。", "吾輩は猫である。名前はまだ無い。", "東京都千代田区で3,000円のラーメンを食べた。", "Let's do our best!"];

test("split phonemizer: same phonemes as the original", { skip: !fs.existsSync(new URL("manifest.json", files)) && "run npm run files first" }, async () => {
  const a = await import(new URL("piper_plus_wasm.js?original", original));
  await a.default({ module_or_path: fs.readFileSync(new URL("piper_plus_wasm_bg.wasm", original)) });
  const b = await import(new URL("piper_plus_wasm.js?split", original));
  const { manifest } = join("phonemizer.wasm");
  async function* chunks() { yield join("phonemizer-data.bin").bytes; }
  await initWithData(b.default, join("phonemizer.wasm").bytes, manifest.meta.phonemizerSegments, chunks());

  const pa = new a.WasmPhonemizer(config), pb = new b.WasmPhonemizer(config);
  const out = (r) => ({ ids: [...r.phonemeIds], prosody: [...(r.prosodyFeatures ?? [])] });
  for (const text of TEXTS) {
    for (const lang of ["ja", "en"]) {
      const expected = out(pa.phonemize(text, lang));
      assert.ok(expected.ids.length > 5, `${text} (${lang}) gives phonemes`);
      assert.deepEqual(out(pb.phonemize(text, lang)), expected, `${text} (${lang})`);
    }
  }
});
