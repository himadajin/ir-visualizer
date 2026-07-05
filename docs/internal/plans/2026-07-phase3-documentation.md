# 2026-07 Phase 3: Documentation Plan

- **Status:** Complete (2026-07-05)
- **Created:** 2026-07-05
- **Parent plan:** `2026-07-refactoring-roadmap.md` (Phase 3 section)

## 0. Outcome (added on completion)

All deliverables in §3 were produced as planned. Deviations and byproducts:

- Writing `specs/mermaid.md` uncovered a real bug: `%%` comment lines are accepted by the
  grammar but crash `toAST` at runtime ("Missing semantic action for 'comment'"). Fixing
  behavior is out of scope for this phase, so it is documented as a known limitation in the
  spec and queued as a standalone follow-up task (add the semantic action + pinning test, then
  update the spec).
- Three trivial pinning tests were added while writing specs (per principle 1): LLVM
  unsupported-terminator throws, LLVM `;` comments accepted (both in
  `src/parser/__tests__/llvm/errors.test.ts`), and Mermaid double-quoted labels keeping their
  quotes (`src/parser/__tests__/mermaid/nodes.test.ts`, which also pins that the grammar's
  `squareQuote` alternative is unreachable).
- User-doc examples were verified by running them through the real `parse` pipeline
  (same code path the app uses), in addition to the default-code examples already covered by
  the Playwright suite.

## 1. Re-audit after Phase 2 (what exists now)

Documentation:

| Area                       | State                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `docs/internal/contracts/` | 2 docs (`ir-mode-registry.md`, `graph-data.md`), written during Phase 2 against the code that merged — current.    |
| `docs/internal/specs/`     | Empty. No behavior specification exists for any of the three IRs or for the viewer itself.                         |
| `docs/user/`               | Empty.                                                                                                             |
| `README.md` / `AGENTS.md`  | Accurate through Phase 2 (registry, directory layout, commands). No architecture overview / data-flow diagram yet. |

Code (all relevant to what the specs must describe):

- Parser/graphBuilder behavior is pinned by 175 tests. The test inventory covers, per IR:
  - **LLVM-IR**: module structure, top-level declarations (globals, declarations, metadata,
    attribute groups, target, source_filename), instructions (assign/store/call/cmpxchg/atomicrmw),
    terminators (`br` cond/uncond, `ret`, `switch` with cases), error behavior (throws on invalid
    input); CFG construction (header/block/exit nodes, true/false edges, switch default+case
    edges, one exit node per function, per-function block-ID namespacing).
  - **Mermaid**: `graph`/`flowchart` headers, all direction tokens, three node shapes
    (square/round/curly), arrow/line edges, node deduplication, semicolon separators, and the
    **pipe-label quirk** (edge labels keep their `|...|` delimiters — pinned by tests, so it is
    current intended behavior and must be documented as such).
  - **SelectionDAG**: node-line grammar (`tN: types = opName ...`), old hex-ID format and
    `[ORD=N]` verbose fields, operand kinds (node/inline/immediate/null, wrapped, source index),
    register syntaxes (NoReg/Stack/VirtReg/PhysReg/Numbered/Bare), flags, ValueType nodes,
    per-line tolerant fallback (non-node lines become comments); DAG construction
    (operand→edge with operand/type Handles, chain/glue dashed flag, skipping inline/null/unknown
    operands).
- Viewer behavior that exists but is written down **nowhere**: 750 ms debounced parsing, error
  snackbar (message truncated to 100 chars), topology-signature-based position preservation,
  Reset Layout, mode-dependent edge classification (back-edge detection vs. type stability),
  node dimension estimation (font metrics + centralized style constants), SelectionDAG node
  color categories, responsive narrow mode (768 px breakpoint, Code/Graph toggle), Clear button.

## 2. Principles

1. **Specs describe current behavior and every normative claim is traceable to a test.** Each
   spec section ends with a "Pinned by" line referencing the test file(s). A claim with no
   covering test is either (a) given a trivial pinning test as part of this phase, or (b)
   explicitly marked _observed, untested_ — never silently asserted.
2. **No duplication of code.** Specs state behavior ("a conditional `br` produces two edges
   labeled `true`/`false`"), not implementation. Grammar files are referenced, not copied.
3. **Contracts vs. specs**: contracts define interfaces between layers (already done in
   Phase 2); specs define externally observable behavior. The plan adds no new contracts —
   node-sizing consistency is now enforced by shared constant imports, so it needs a sentence in
   the viewer spec, not a contract document.
4. All documents in English, kebab-case file names, prettier-formatted.

## 3. Deliverables

### 3.1 `docs/internal/architecture.md` (new top-level internal doc)

One page: Mermaid data-flow diagram (editor → debounce → `mode.parse` → AST → graphBuilder →
`GraphData` → `useGraphData` → layout/converter → React Flow), a layer-responsibility table
(parser / ast / graphBuilder / irModes / hooks / components / utils), and links into the
contracts and specs. This is the entry point a newcomer (or future agent session) reads first.

> Structure note: this adds one file directly under `docs/internal/` (not in
> contracts/plans/specs). `docs/README.md` will be updated to list it. If the owner prefers to
> keep the four-directory structure strict, the fallback is `docs/internal/specs/architecture.md`.

### 3.2 `docs/internal/specs/` — four behavior specs

1. **`llvm-ir.md`** — Accepted syntax subset (module structure; supported top-level entries;
   instruction forms; terminators incl. `switch`; debug records; what is textually preserved vs.
   structurally parsed), CFG conversion rules (node kinds and their `nodeType`s; edge rules:
   conditional/unconditional/switch/exit; ID namespacing), known limitations (e.g. `restOfLine`-
   style rules mean many constructs are captured as raw text, unsupported syntax throws).
2. **`mermaid.md`** — Accepted flowchart subset (`graph`/`flowchart` + direction; node shapes;
   edge forms with/without labels; separators; node dedup and label back-fill), conversion rules,
   known quirks (pipe delimiters retained in edge labels), limitations (subgraphs, styling, other
   Mermaid features not supported).
3. **`selectiondag.md`** — Input model (line-based; header/free text tolerated as comments —
   the intentional fallback documented in Phase 2), node-line grammar (types, opName incl.
   `NS::name` machine ops and `<<unknown>>` forms, details/flags/registers/verbose), operand
   kinds, DAG conversion rules (edges from operands, operand/type Handles, chain/glue rendering,
   skipped operand kinds), node color categories (`selectionDAGNodeColor.ts` classification).
4. **`graph-view.md`** — Mode-independent viewer behavior: debounced parse cycle and error
   display; topology signature and position preservation on content-only edits; Reset Layout;
   edge classification per mode (delegated to `IREdgeBuilder`, cross-ref the registry contract);
   node dimension estimation and its relationship to the centralized style constants; responsive
   narrow mode; Clear button; editor language/highlighting per mode.

### 3.3 `docs/user/` — two user-facing docs

1. **`getting-started.md`** — What the app is, the demo URL, UI walkthrough (mode selector,
   editor, Clear, graph pane, Reset Layout, drag/zoom, narrow-screen Code/Graph toggle).
2. **`supported-formats.md`** — Per-mode: what input looks like (copy-paste example), where to
   get it (for SelectionDAG: how to obtain a dump from `llc`), and a user-level summary of
   limitations (distilled from the specs, not duplicated in detail).

### 3.4 Maintenance updates (same PR)

- `docs/README.md`: add `architecture.md` to the structure listing.
- `README.md`: link to `docs/internal/architecture.md` and `docs/user/`.
- `AGENTS.md`: add a pointer to `architecture.md` in "How it Works".
- `2026-07-refactoring-roadmap.md`: mark Phase 3 complete; set final status (all phases done).

## 4. Execution order

1. Quick re-verification pass over the two Phase 2 contracts against merged `main` (file paths,
   type names) — fix drift if any.
2. `architecture.md` (everything else links to it).
3. The three IR specs, then `graph-view.md`. While writing each spec, cross-check claims against
   the test inventory; add at most trivial pinning tests where a claim would otherwise be
   untested, and record anything larger as a follow-up list at the end of the spec.
4. User docs (distilled from the specs).
5. Maintenance updates, prettier/lint/test run, final self-review pass for
   English consistency and dead links.

## 5. Exit criteria

- `specs/` contains the four documents above; every normative claim has a "Pinned by" test
  reference or an explicit _observed, untested_ marker.
- `docs/user/` covers usage and all three input formats with working examples (examples verified
  by pasting into the running app).
- `architecture.md` diagram matches the actual import graph (spot-checked).
- All CI checks pass (`format:check` covers the Markdown).

## 6. Out of scope

- Any behavior change, refactoring, or non-trivial test additions (recorded as follow-ups
  instead).
- Japanese translations (repository language is English).
- Library/API documentation for external consumers (no package split).
- Storybook/E2E expansion (Phase 1 assets are considered sufficient harness for now).
