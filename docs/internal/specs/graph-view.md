# Spec: Graph view (mode-independent behavior)

Behavior specification for everything the app does around the per-IR pipelines: the parse
cycle, graph updating, layout, node sizing, and the shell UI. Per-IR input syntax and
conversion rules live in `specs/llvm-ir.md`, `specs/mermaid.md`, `specs/selectiondag.md`.

Conventions: every normative statement carries a **Pinned by** reference to the test(s) that
fix the behavior. Statements marked _observed, untested_ describe current behavior with no
covering test.

## 1. Parse cycle

- Editing the code (or switching modes) schedules a parse of the active mode after a
  **750 ms debounce** (`PARSE_DEBOUNCE_MS` in `useIRWorkspace`); intermediate keystrokes cancel
  the pending parse.
- On success the graph updates and any error clears. On failure the **previous graph stays**
  and the error message is shown in a snackbar (truncated to 100 characters).
- Switching modes replaces the editor content with the new mode's `defaultCode`.

> Pinned by (end-to-end): `e2e/smoke.spec.ts` — "editing the code updates the graph",
> "invalid code shows a parse error", the two mode-switching tests. The exact debounce value
> and the 100-char truncation are _observed, untested_.

## 2. Graph updates — topology signature

`useGraphData.updateGraph(graph, mode)` computes a **topology signature**:
`direction | sorted node ids | sorted source-target pairs`.

- **Signature changed** (first parse, node/edge added or removed, direction changed):
  full Dagre re-layout; all positions are recomputed.
- **Signature unchanged** (content-only edit, e.g. changing an instruction inside a block):
  node **positions are preserved**, labels/content update in place, and each edge's rendered
  type is re-derived by the mode's `IREdgeBuilder` with the previous type available
  (SelectionDAG keeps types stable; LLVM/Mermaid re-classify from current positions).

> Pinned by: `src/hooks/__tests__/useGraphData.test.ts` (layout on first call, position
> preservation, re-layout on topology change, SelectionDAG position/edge-type stability)

**Reset Layout** re-runs the full layout for the last parsed graph (using the active mode's
edge builder and dagre options) and is a no-op before the first parse; the viewer then re-fits
the viewport (after a 50 ms delay — _observed, untested_).

> Pinned by: `useGraphData.test.ts` ("resetLayout ...")

## 3. Layout (Dagre)

- Rank direction: explicit option → `GraphData.direction` → `"TD"`. `TD` places sources above
  targets; `LR` places them left of targets.
- Per-mode `dagreOptions` merge into the Dagre graph config (SelectionDAG: `ranksep: 50`).
- Node boxes given to Dagre use the estimated dimensions from §5, so spacing reflects real
  rendered sizes.

> Pinned by: `src/utils/__tests__/layout.test.ts` (positions assigned, direction respected,
> no overlapping positions). `dagreOptions` merging: _observed, untested_.

## 4. Edge classification and rendering

Classification is mode-supplied (`IREdgeBuilder`, see `contracts/ir-mode-registry.md`):

- **LLVM/Mermaid** (`codeGraphEdgeBuilder`): an edge is a `backEdge` when it is a self-loop or
  its source sits at or below its target (`source.y >= target.y`); otherwise `customBezier`.
  `backEdge` renders as the large loop-around curve (`BackEdge.tsx`).
- **SelectionDAG** (`selectionDAGEdgeBuilder`): never re-classifies; keeps the previous type on
  updates, defaults to `customBezier`. Chain/glue edges render dashed and use per-operand/type
  Handles (see `specs/selectiondag.md` §3). SelectionDAG edges place the arrow marker at the
  **start** (pointing at the source), LLVM/Mermaid at the **end**.

> Pinned by: `layout.test.ts` (back edge / self-loop), `useGraphData.test.ts` (self-loop,
> SelectionDAG type stability), `converter.test.ts` (dashed chain/glue, markerStart/markerEnd)

## 5. Node dimension estimation

Dagre needs node sizes before React renders anything, so `converter.ts` estimates them:

- Text nodes: character-count based. Char width/line height come from `getFontMetrics`
  (measures a monospace `M` in the DOM; falls back to 8×20 px in non-browser environments).
  Width clamps per mode: Mermaid 10–30 chars, LLVM 40–80, SelectionDAG fallback 12–50;
  plus `NODE_PADDING` (20 px per side) and a 24 px header offset when a block label chip is
  present (`blockLabel !== undefined`, so labeled and `null`-labeled entry blocks both count).
- SelectionDAG nodes: structural estimation mirroring `SelectionDAGNode.tsx`'s row/cell layout.
- The estimation and the rendered CSS share single-source constants
  (`common/nodeTextStyle.ts`, `SelectionDAG/selectionDAGStyleConstants.ts`,
  `CodeFragment.tsx`'s exported paddings) — when changing node styling, change the constant,
  never a literal, or layout spacing silently drifts from rendering.

> Pinned by: `src/utils/__tests__/converter.test.ts` (mermaid/LLVM/wrapping/header-offset/
> empty-label cases)

## 6. Shell UI

- **Mode selector** lists the registry modes in `IR_MODES` insertion order
  (LLVM-IR, SelectionDAG, Mermaid).
  > Pinned by: `e2e/smoke.spec.ts` (selects each mode by visible label). Order:
  > _observed, untested_.
- **Clear** empties the editor (the subsequent parse of the empty string follows §1: e.g.
  an empty module is valid LLVM-IR, but empty Mermaid input is a parse error).
  _(observed, untested)_
- **Editor**: Monaco with Shiki `github-light` highlighting; the language follows
  `mode.editorLanguage` (`llvm` for LLVM-IR and SelectionDAG, `mermaid` for Mermaid).
  _(observed, untested)_
- **Responsive narrow mode** (viewport ≤ 768 px): panes stack into a single view with a
  Code/Graph toggle in the toolbar; the drag-resizer (min pane width 200 px, initial 500 px)
  is only available in wide mode. _(observed, untested)_
- **Errors** appear as a snackbar over the graph pane and disappear on the next successful
  parse.
  > Pinned by: `e2e/smoke.spec.ts` ("invalid code shows a parse error")
