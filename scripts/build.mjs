// Builds what apps get:
//   dist/yomiage.js         the page side (kakera bundled in; no dependencies left for apps to install)
//   dist/yomiage-worker.js  the engine worker: ONNX Runtime, piper-plus, kakera, the voice filters, in one file.
//                           `yomiage copy-files` puts it next to the voice files, and the page starts it from there.
import fs from "node:fs";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root)));
const define = { __YOMIAGE_VERSION__: JSON.stringify(pkg.version) };
const common = { bundle: true, format: "esm", platform: "browser", target: "es2022", define, logLevel: "warning", absWorkingDir: root.pathname };

await build({ ...common, entryPoints: ["src/index.js"], outfile: "dist/yomiage.js" });
await build({ ...common, entryPoints: ["src/worker.js"], outfile: "dist/yomiage-worker.js", minify: true, legalComments: "eof" });

for (const f of ["yomiage.js", "yomiage-worker.js"]) {
  console.log(`dist/${f}  ${(fs.statSync(new URL(`dist/${f}`, root)).size / 1024).toFixed(0)} KB`);
}
