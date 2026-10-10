// Builds what apps get:
//   dist/yomiage.js         the page side (kakera bundled in; no dependencies left for apps to install)
//   dist/react.js           yomiage/react: the hooks. React stays out (a peer dependency), and so does the main
//                           bundle: it imports ./yomiage.js, so the page has one voice engine
//   dist/yomiage-worker.js  the engine worker: ONNX Runtime, piper-plus, kakera, the voice filters, in one file.
//                           `yomiage copy-files` puts it next to the voice files, and the page starts it from there.
//   dist/THIRD-PARTY-LICENSES.md  licences of what the worker and the voice files contain (ONNX Runtime, piper-plus
//                           and the Open JTalk / MeCab / NAIST-jdic code and data in its phonemizer); copied with them
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root)));
const kakera = JSON.parse(fs.readFileSync(new URL("../kakera/package.json", root)));
const define = { __YOMIAGE_VERSION__: JSON.stringify(pkg.version), __KAKERA_VERSION__: JSON.stringify(kakera.version) };
const nm = (p) => new URL(`node_modules/${p}`, root);
const piperVersion = JSON.parse(fs.readFileSync(nm("piper-plus/package.json"))).version;
const ortVersion = JSON.parse(fs.readFileSync(nm("onnxruntime-web/package.json"))).version;
const banner = { js: `/*! yomiage ${pkg.version} engine worker (MIT). Bundles ONNX Runtime Web ${ortVersion} (MIT, Microsoft) and piper-plus ${piperVersion} (MIT); see THIRD-PARTY-LICENSES.md next to this file. */` };
const common = { bundle: true, format: "esm", platform: "browser", target: "es2022", define, logLevel: "warning", absWorkingDir: root.pathname };

execFileSync(process.execPath, [new URL("node_modules/typescript/bin/tsc", root).pathname, "-p", "tsconfig.json"], { cwd: root, stdio: "inherit" });

fs.mkdirSync(new URL("dist/types/", root), { recursive: true });
for (const name of ["index", "types", "presets", "wav", "react", "react-state"]) {
  fs.copyFileSync(new URL(`.cache/ts/${name}.d.ts`, root), new URL(`dist/types/${name}.d.ts`, root));
}

await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/yomiage.js" });
const mainBundle = {
  name: "main-bundle",
  setup(b) { b.onResolve({ filter: /^\.\/index\.js$/ }, () => ({ path: "./yomiage.js", external: true })); },
};
await build({ ...common, entryPoints: ["src/react.ts"], outfile: "dist/react.js", external: ["react"], plugins: [mainBundle] });
await build({ ...common, entryPoints: ["src/worker.ts"], outfile: "dist/yomiage-worker.js", minify: true, legalComments: "eof", banner });

fs.writeFileSync(new URL("dist/THIRD-PARTY-LICENSES.md", root), [
  `# Third-party licences\n\nyomiage-worker.js (yomiage ${pkg.version}, MIT) and the voice files next to it contain the software below.`,
  "The Tsukuyomi-chan voice model has its own terms, including a required credit: see yomiage's NOTICE.md.\n",
  `## piper-plus ${piperVersion}\n`,
  fs.readFileSync(nm("piper-plus/LICENSE.md"), "utf8").trim(),
  `\n## Components included in piper-plus ${piperVersion} (incl. ONNX Runtime Web)\n`,
  fs.readFileSync(nm("piper-plus/THIRD-PARTY-LICENSES.md"), "utf8").replace(/^# .*\n/, "").trim(),
  "",
].join("\n"));

for (const f of ["yomiage.js", "react.js", "yomiage-worker.js", "THIRD-PARTY-LICENSES.md"]) {
  console.log(`dist/${f}  ${(fs.statSync(new URL(`dist/${f}`, root)).size / 1024).toFixed(0)} KB`);
}
