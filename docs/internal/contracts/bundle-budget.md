# Contract: bundle budget

The production build holds itself to two numbers. They are enforced by
`npm run check:bundle` and by CI, so a change that exceeds either one fails the build
rather than being noticed later.

| metric                        | budget | what it is                                                        |
| ----------------------------- | ------ | ----------------------------------------------------------------- |
| initial-load JavaScript, gzip | 250 kB | every script `dist/index.html` loads or preloads, gzipped, summed |
| total `dist`                  | 4.0 MB | every emitted file, uncompressed                                  |

The first number is what a visitor waits for. The second is what gets deployed, and it is
the one that catches a dependency shipping code nobody asked for: a lazy chunk costs a
visitor nothing but still lands in `dist`, so without it an all-in-one dependency can grow
without limit unnoticed.

## Per-chunk size is not the metric

Vite's default `chunkSizeWarningLimit` (500 kB) is switched off in `vite.config.ts`. It
reports on an axis that does not describe this app: it does not distinguish a chunk fetched
on first paint from one that may never be fetched at all. `elk.bundled` is 1.4 MB and is
deliberately lazy (`src/utils/layout.ts`), so a correctly optimized build trips the warning;
elkjs also ships as a single file, so no chunking strategy can bring it under the limit. A
threshold that cannot be satisfied trains us to ignore it, which is how a real regression
gets through.

## The two rules that keep the budget

**A dependency is imported by what is used, never as an all-in-one entry point.** The
canonical failure is Shiki: `import { createHighlighter } from "shiki"` resolves to
`shiki/bundle/full`, which carries every bundled grammar and theme as an object of dynamic
imports. Rollup resolves those statically, so a chunk is emitted for each — 285 chunks and
8.5 MB for two grammars and one theme. Naming `langs`/`themes` at the call site narrows what
is _loaded at runtime_, not what is _emitted_. `src/utils/highlighter.ts` therefore builds
its highlighter from `shiki/core` with the grammars, theme, and engine named explicitly.

**An IR mode's parser lives behind a lazy boundary.** A mode's `parse` dynamic-imports its
parser module, so only the parser of the mode the visitor actually selects is fetched
(`contracts/ir-mode-registry.md`, "Parsing is asynchronous"). Without this, every IR's parser
lands in the initial chunk: the default mode is LLVM-IR, yet ohm-js (SelectionDAG) and the
upstream mermaid flowchart parser would be downloaded on first paint.

Mermaid mode imports mermaid's flowchart parser/DB chunk, not the all-diagram `mermaid`
entry. That entry statically `import()`s every diagram type, which Rollup would emit into
`dist` even if none of them ran. Layout engines and KaTeX that the flowchart module also
`import()`s are stubbed at the Vite boundary so they are not emitted; they are renderer
code this app never calls (`specs/mermaid.md`). The total-dist budget is 4.0 MB to hold
that parser chunk (about 0.6 MB lazy) on top of elkjs.

Both rules are about the same thing. The build only splits where the source says it may, so
these boundaries are stated in code, not inferred by the bundler.

## How it is measured

`scripts/check-bundle-budget.mjs` reads the built `dist/`:

- **Initial-load JavaScript** — parse `dist/index.html` for `<script type="module" src>` and
  `<link rel="modulepreload" href>`, gzip each referenced file at the default level, and sum.
  Preloads count because the browser fetches them alongside the entry.
- **Total `dist`** — the byte size of every file under `dist/`.

The script prints both figures against their budgets and exits non-zero when either is
exceeded. It needs a build to already exist; `npm run check:bundle` does not build.

Changing a budget number means changing it here and in the script, in the same commit, with
the reason.
