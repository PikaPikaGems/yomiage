// Builds what apps get:
//   dist/yomiage.js         the page side (kakera bundled in; no dependencies left for apps to install)
//   dist/yomiage-worker.js  the engine worker: ONNX Runtime, piper-plus, kakera, the voice filters, in one file.
//                           `yomiage copy-files` puts it next to the voice files, and the page starts it from there.
//   dist/THIRD-PARTY-LICENSES.md  licences of what the worker and the voice files contain (ONNX Runtime, piper-plus
//                           and the Open JTalk / MeCab / NAIST-jdic code and data in its phonemizer); copied with them
import fs from "node:fs";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root)));
const define = { __YOMIAGE_VERSION__: JSON.stringify(pkg.version) };
const nm = (p) => new URL(`node_modules/${p}`, root);
const piperVersion = JSON.parse(fs.readFileSync(nm("piper-plus/package.json"))).version;
const ortVersion = JSON.parse(fs.readFileSync(nm("onnxruntime-web/package.json"))).version;
const banner = { js: `/*! yomiage ${pkg.version} engine worker (MIT). Bundles ONNX Runtime Web ${ortVersion} (MIT, Microsoft) and piper-plus ${piperVersion} (MIT); see THIRD-PARTY-LICENSES.md next to this file. */` };
const common = { bundle: true, format: "esm", platform: "browser", target: "es2022", define, logLevel: "warning", absWorkingDir: root.pathname };

await build({ ...common, entryPoints: ["src/index.js"], outfile: "dist/yomiage.js" });
await build({ ...common, entryPoints: ["src/worker.js"], outfile: "dist/yomiage-worker.js", minify: true, legalComments: "eof", banner });

fs.writeFileSync(new URL("dist/THIRD-PARTY-LICENSES.md", root), [
  `# Third-party licences\n\nyomiage-worker.js (yomiage ${pkg.version}, MIT) and the voice files next to it contain the software below.`,
  "The Tsukuyomi-chan voice model has its own terms, including a required credit: see yomiage's NOTICE.md.\n",
  `## piper-plus ${piperVersion}\n`,
  fs.readFileSync(nm("piper-plus/LICENSE.md"), "utf8").trim(),
  `\n## Components included in piper-plus ${piperVersion} (incl. ONNX Runtime Web)\n`,
  fs.readFileSync(nm("piper-plus/THIRD-PARTY-LICENSES.md"), "utf8").replace(/^# .*\n/, "").trim(),
  "",
].join("\n"));

for (const f of ["yomiage.js", "yomiage-worker.js", "THIRD-PARTY-LICENSES.md"]) {
  console.log(`dist/${f}  ${(fs.statSync(new URL(`dist/${f}`, root)).size / 1024).toFixed(0)} KB`);
}
