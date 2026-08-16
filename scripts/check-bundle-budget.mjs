#!/usr/bin/env node
// Enforces docs/internal/contracts/bundle-budget.md against an existing build.
// Reads dist/ only; it does not build. See the contract for why per-chunk size
// is not the metric.
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUDGET = {
  /** Gzipped bytes of everything dist/index.html loads or preloads. */
  initialJsGzip: 250_000,
  /** Uncompressed bytes of every emitted file. */
  distTotal: 4_000_000,
};

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

let html;
try {
  html = readFileSync(join(distDir, "index.html"), "utf8");
} catch {
  console.error(
    "No dist/index.html — run `npm run build` before `npm run check:bundle`.",
  );
  process.exit(1);
}

// Vite emits the entry as <script type="module" src> and any chunk the browser
// needs alongside it as <link rel="modulepreload">. Both are part of the wait.
const entryRefs = [
  ...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
].map((match) => match[1]);

if (entryRefs.length === 0) {
  console.error("dist/index.html references no module scripts — build broken?");
  process.exit(1);
}

const allFiles = walk(distDir);

// The hrefs are site-absolute (they carry vite's `base`), so resolve them
// against dist/ by their hashed basename rather than by path arithmetic.
const byBasename = new Map(allFiles.map((file) => [basename(file), file]));
const initialFiles = entryRefs.map((ref) => {
  const file = byBasename.get(basename(ref));
  if (!file) {
    console.error(`dist/index.html references a missing file: ${ref}`);
    process.exit(1);
  }
  return file;
});

const initialJsGzip = initialFiles.reduce(
  (total, file) => total + gzipSync(readFileSync(file)).byteLength,
  0,
);
const distTotal = allFiles.reduce(
  (total, file) => total + statSync(file).size,
  0,
);

const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;
const MB = (bytes) => `${(bytes / 1_000_000).toFixed(2)} MB`;

const results = [
  {
    label: `initial-load JS, gzip (${initialFiles.length} file(s))`,
    actual: initialJsGzip,
    budget: BUDGET.initialJsGzip,
    format: kB,
  },
  {
    label: `total dist (${allFiles.length} files)`,
    actual: distTotal,
    budget: BUDGET.distTotal,
    format: MB,
  },
];

let failed = false;
for (const { label, actual, budget, format } of results) {
  const over = actual > budget;
  failed ||= over;
  const share = ((actual / budget) * 100).toFixed(0);
  console.log(
    `${over ? "FAIL" : "ok  "}  ${label}: ${format(actual)} / ${format(budget)} (${share}%)`,
  );
}

if (failed) {
  console.error(
    "\nBundle budget exceeded. See docs/internal/contracts/bundle-budget.md —\n" +
      "either bring the build back under the budget, or change the budget there\n" +
      "and in this script together, with the reason.",
  );
  process.exit(1);
}
