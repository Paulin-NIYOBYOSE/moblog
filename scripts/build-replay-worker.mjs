// Bundles the Replay CSV-import Web Worker into /public. Turbopack (Next 16) copies
// `new Worker(new URL(...))` targets as raw assets instead of bundling them, so
// the worker is built separately with esbuild. Runs before `dev` and `build`.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const workers = [
  ["src/lib/replay/import.worker.ts", "public/replay-import.worker.js"],
];
for (const [entry, out] of workers) {
  await build({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(root, out),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    sourcemap: false,
    legalComments: "none",
    alias: { "@": path.join(root, "src") },
    logLevel: "warning",
  });
  console.log(`Built ${out}`);
}
