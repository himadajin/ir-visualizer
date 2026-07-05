# 2026-07 Project Revival Roadmap

- **Status:** Phase 0, 1, and 2 complete (2026-07-04); Phase 3 not started
- **Created:** 2026-07-04
- **Background:** Development of this project had been stalled for several months. A full audit was performed on 2026-07-04 to restart it. This plan is based on the findings of that audit.

## 1. Audit summary

### What is healthy

- `build` / `lint` / `test` (166 tests) all pass. TypeScript strict flags are fully enabled.
- Parser (`src/parser`) and graph builder (`src/graphBuilder`) tests are behavior-based and thorough.
- CI (lint / format:check / test) and GitHub Pages deployment are operational.

### Problems (root causes of "adding a feature breaks something")

1. **Scattered IR-type dispatch.** Branches on llvm / mermaid / selectionDAG are spread across
   roughly 14 locations (parser selection, editor language selection, and layout-reset selection in
   `App.tsx`; SelectionDAG-specific methods in `useGraphData.ts`; duplicated functions in
   `layout.ts`; nodeTypes registration in `GraphViewer.tsx`; sizing branches in `converter.ts`; etc.).
   Adding one IR requires editing all of them, and missing one breaks existing features.
2. **`App.tsx` (477 lines) is a god component.** It owns layout, mode switching, debouncing,
   parsing, resizing, and error handling.
3. **SelectionDAG has its own separate code path.** `updateSelectionDAGGraph` /
   `getSelectionDAGLayoutedElements` / a 224-line custom node implementation that bypasses
   NodeShell — the bolt-on additions have hardened into structure.
4. **A hole in the type system.** `GraphNode.astData?: Record<string, any>` (`src/types/graph.ts`)
   means the AST → UI handoff relies entirely on `as` casts; the compiler cannot catch type drift.
5. **Manually synchronized style constants.** Font sizes and similar values are duplicated across
   `converter.ts` / `NodeShell.tsx` / `SelectionDAGNode.tsx` / `selectionDAGLayoutUtils.ts`, kept in
   sync by "MUST stay in sync" comments. Visual changes silently desynchronize layout math.
6. **No UI-layer tests.** No tests exist for components or the `useGraphData` hook, and vitest runs
   with `environment: "node"`, so component tests cannot be written.
7. **No documentation.** README was the stock Vite template; the only substantive document was
   AGENTS.md.

## 2. Decisions

| Decision                       | Details                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Close PR #48 (package split)   | It only moved files and did not address the root causes, so it was discarded. Package splitting will be reconsidered if external consumption is ever needed.                                |
| Redesign within `src/`         | No monorepo conversion; first complete the unification of IR dispatch inside `src/`.                                                                                                        |
| Documentation-first workflow   | `docs/` is the source of truth; update documents before changing code (see `docs/README.md`). During this plan, docs work is batched into Phase 3, except the contracts written in Phase 2. |
| Safety net before refactoring  | Do not restructure while the UI layer has zero automated tests. Phase 1 (E2E, hook tests, Storybook) must be completed before Phase 2.                                                      |
| All artifacts in English       | Code, comments, and all documentation are written in English.                                                                                                                               |
| Owner performs commits and PRs | Agents prepare changes in the working tree; the owner reviews, commits, and opens PRs.                                                                                                      |

## 3. Phase plan

### Phase 0 — Groundwork (complete)

Low-risk, immediately effective cleanup. No behavior changes.

- [x] Establish the docs directory structure (`docs/README.md`) and document this plan
- [x] Close PR #48 and delete its branch
- [x] Delete merged remote branches (20 branches, including `develop` / `refactor`) — done by the owner
- [x] Rewrite README.md with project-specific content
- [x] Add an `npm run build` step to CI (catch production-build breakage)
- [x] Introduce coverage measurement (`@vitest/coverage-v8` + `test:coverage` script)
- [x] Pin Node 24 via `.nvmrc` and the `engines` field in `package.json`
- [x] Reflect the docs structure and documentation-first rule in AGENTS.md
- [x] Add LICENSE (MIT)

Exit criteria: CI verifies lint / format / test / build, no stale branches remain, and the README describes the actual project.

### Phase 1 — Build the safety net (complete)

Make refactoring regressions detectable. **Must be completed before Phase 2.**

- [x] Add a jsdom environment + Testing Library to vitest (`// @vitest-environment jsdom`
      pragma per file; default environment stays `"node"` for the existing parser/graphBuilder tests)
- [x] Unit tests for `useGraphData` (`src/hooks/__tests__/useGraphData.test.ts`): layout on first run,
      position preservation on same-topology updates, re-layout on topology change, backEdge
      detection, `resetLayout`/`resetSelectionDAGLayout`
- [x] Introduce Storybook (`@storybook/react-vite`). Migrated the hand-rolled node gallery in
      `src/pages/Debug` (NodeDebugPage / \*NodeDefs) to `*.stories.tsx` files colocated with each
      node component, via a shared `NodeStoryCanvas` helper (node components need a real ReactFlow
      instance for Handles to work). Deleted `src/pages/Debug`, `src/debug.tsx`, `debug.html`, and
      the `debug` Vite build input once migration was verified in the Storybook dev server.
      Dropped `@storybook/addon-vitest`'s browser-mode story testing after it proved flaky
      (dynamically-imported-module fetch failures) — Storybook is a visual catalog only; behavior
      is covered by the E2E suite below.
- [x] Introduce Playwright (`@playwright/test`, `e2e/smoke.spec.ts`). Smoke E2E: each of the three
      modes renders a graph from its default code; editing the code updates the graph; invalid code
      shows a parse error. Note: Monaco's EditContext-based input surface (`.native-edit-context`)
      has no visible size, so tests focus the editor by clicking the visible `.view-lines` area, and
      `keyboard.type(...)` uses a small per-key delay — typing too fast drops keystrokes under this
      Monaco version's EditContext input path.
- [x] Wired into CI (`.github/workflows/ci.yml`): `build-storybook`, Playwright browser install, and
      `test:e2e`, with the Playwright HTML report uploaded as an artifact on failure.

Exit criteria: every node component has a story, the E2E smoke suite runs in CI, and `useGraphData` is tested. — met.

### Phase 2 — The refactoring itself (complete)

The core was **centralizing IR mode definitions**. Contracts were written first
(documentation-first) and implemented as designed:

- [x] `contracts/ir-mode-registry.md` — the `IRModeDefinition` interface every IR mode
      implements (parser, nodeTypes, editorLanguage, defaultCode, edgeBuilder, dagreOptions),
      aggregated in `src/irModes/` (`llvmMode.ts`, `mermaidMode.ts`, `selectionDAGMode.ts`,
      `index.ts`).
- [x] `contracts/graph-data.md` — `GraphNode.astData` is now a discriminated union keyed on
      `nodeType`; `GraphEdge` absorbed SelectionDAG's extra optional fields
      (`sourceHandle`/`targetHandle`/`isChainOrGlue`) so `GraphData` is one type for every mode.

Implementation:

1. [x] IR mode registry (`src/irModes/`) replaces the ~14 scattered branches. `App.tsx`,
       `useGraphData`, and `GraphViewer` all look up behavior from the active mode object instead
       of branching on a string. Adding a 4th IR now means one registry entry plus that IR's own
       parser/AST/graphBuilder/node-component files.
2. [x] `useGraphData`'s `updateGraph(graph, mode)`/`resetLayout()` are single functions for every
       mode; `layout.ts`'s `getLayoutedElements(graph, options)` takes an `edgeBuilder` +
       `dagreOptions` per mode instead of a separate SelectionDAG function. See
       `IREdgeBuilder` in `src/utils/layout.ts` for why edge classification is mode-supplied
       rather than one universal algorithm.
3. [x] `astData` is a discriminated union (`src/types/graph.ts`); the `as unknown as
   Record<string, unknown>` casts in all three graphBuilders are gone. Node components still
       do one cast at the React Flow `NodeProps.data` boundary — that's consuming a third-party
       API's loose typing, not the hole this closes (see `contracts/graph-data.md`).
4. [x] `App.tsx` is 477 → ~95 lines. `useIRWorkspace` (mode/code/debounced parse/error) and
       `usePaneResize` (drag-to-resize) hooks extracted to `src/hooks/`; `ToolbarPane`,
       `EditorToolbar`, `EditorPane`, `GraphPane` extracted to `src/components/AppShell/`.
5. [x] Style constants centralized: `src/components/Graph/common/nodeTextStyle.ts` (font),
       `src/components/Graph/SelectionDAG/selectionDAGStyleConstants.ts` (border/cell/item
       padding), and `CodeFragment.tsx`'s own exported padding constants. `converter.ts`,
       `NodeShell.tsx`, `SelectionDAGNode.tsx`, and `selectionDAGLayoutUtils.ts` import from these
       instead of duplicating pixel values behind "MUST stay in sync" comments.
6. [x] Parser layer unified via `src/parser/grammarCache.ts`'s `createLazyGrammar` (used by all
       three parsers; `mermaid.ts` was previously eager and is now lazy like the others). Removed
       redundant `console.error` calls (the caller already surfaces parse errors to the user).
       SelectionDAG's per-line tolerant fallback (unparseable lines become comments) is documented
       in place as intentional, not removed — see the code comment in `parseSelectionDAGNode` and
       "Known behavior difference" in `contracts/ir-mode-registry.md`.

Notable implementation detail not anticipated in the original plan: `IRModeDefinition.key` needed
`as const` (not just a `satisfies IRModeDefinition` assertion) for `IRModeKey` to resolve to a
literal union instead of `string` — otherwise MUI's `Select` generic inference broke. `IR_MODES`
in `src/irModes/index.ts` also uses explicit string-literal object keys rather than computed
`[mode.key]:` keys, so the exported `IRModeKey` type is reliably a literal union.

Exit criteria: adding a new IR only requires one registry entry plus the new IR's own files. All
tests, lint, build, Storybook build, and E2E pass — verified, including a manual browser check of
all three modes (mode switching, editing, and error display).

### Phase 3 — Documentation

- `docs/internal/specs/` — accepted syntax and graph conversion rules for each IR (derivable from parser tests)
- `docs/internal/contracts/` — finalize the contracts written in Phase 2
- `docs/user/` — usage, supported IR formats, known limitations
- Update AGENTS.md (new structure, documentation-first rule), architecture overview (data-flow diagram)

## 4. Out of scope

- Package split (monorepo) — reconsider when there is demand for external consumption
- Feature issues (#42 node inlining, #14 canvas.json, #6 BackEdge curve, #5 outline)
  — start after Phase 2. #42 in particular benefits from the Phase 2 registry design
- Shiki bundle-size optimization (build warning exists) — handle in a separate plan when needed
