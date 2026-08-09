# Spec: Graph view (mode-independent behavior)

Behavior specification for everything the app does around the per-IR pipelines: the parse
cycle, graph updating, layout, node sizing, and the shell UI. Per-IR input syntax and
conversion rules live in `specs/llvm-ir.md`, `specs/mermaid.md`, `specs/selectiondag.md`.

Conventions: every normative statement carries a **Pinned by** reference to the test(s) that
fix the behavior. Statements marked _observed, untested_ describe current behavior with no
covering test.

## 1. Parse cycle

- Editing the code (or switching modes or views) schedules a parse of the active mode's
  active view after a **750 ms debounce** (`PARSE_DEBOUNCE_MS` in `useIRWorkspace`);
  intermediate keystrokes cancel the pending parse.
- On success the graph updates and any error clears. On failure the **previous graph stays**
  and the error message is shown in the editor panel's status footer (§6), in full — it is
  **not truncated**.
- Switching modes replaces the editor content with the new mode's `defaultCode` and resets
  the active view to the mode's default view.
- Switching views (modes with `views`, see `contracts/ir-mode-registry.md`) **keeps the
  editor content** and re-parses it with the new view's `parse`.

> Pinned by (end-to-end): `e2e/smoke.spec.ts` — "editing the code updates the graph",
> "invalid code shows a parse error" (targets the status footer), the two mode-switching
> tests. The exact debounce value and the untruncated rendering are _observed, untested_.

## 2. Graph updates — topology signature

`useGraphData.updateGraph(graph, behavior)` (where `behavior` is the active view's
`edgeBuilder`/`dagreOptions`, structurally satisfied by a mode object — see
`contracts/ir-mode-registry.md`) computes a **topology signature**:
`direction | sorted node ids | sorted source-target pairs`.

- **Signature changed** (first parse, node/edge added or removed, direction changed):
  full Dagre re-layout; all positions are recomputed.
- **Signature unchanged** (content-only edit, e.g. changing an instruction inside a block):
  node **positions are preserved**, labels/content update in place, and each edge's rendered
  type is re-derived by the mode's `IREdgeBuilder` with the previous type available
  (SelectionDAG keeps types stable; LLVM/Mermaid re-classify from current positions).
- Switching views always changes the signature (the two projections emit different node id
  namespaces), so each view switch performs a full re-layout; **positions are not preserved
  across view switches**. This is intended: the two projections have unrelated topologies, so
  there is nothing meaningful to carry over.

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

## 6. Shell UI (canvas-first shell)

The shell is **canvas-first**: the graph canvas fills the viewport and every other surface
floats above it. See `plans/2026-08-canvas-first-shell.md` for the rationale and the agreed
design decisions this section encodes.

### 6.1 Full-bleed canvas

- `GraphViewer` is the root layer (`position: fixed; inset: 0`); its dot `<Background />`
  covers the whole viewport and is the app's ground. There is no full-width app toolbar and
  no separate editor toolbar. _(observed, untested)_
- The canvas allows zooming out to 10 % (`minZoom={0.1}`; React Flow's 0.5 default would
  clamp `fitView` before large graphs — or the narrow-mode visible strip — can contain the
  graph). _(observed, untested)_

### 6.2 Floating editor panel

A single overlay card at the **top-left**, inset from the viewport edges, holding everything
that is not the canvas.

- **Header**, left to right: the brand corner chip (`ir-visualizer`), the **mode selector**,
  the **view toggle**, a **Clear** action, and a **collapse** button.
- **Mode selector** lists the registry modes in `IR_MODES` insertion order
  (LLVM-IR, SelectionDAG, Mermaid).
  > Pinned by: `e2e/smoke.spec.ts` (selects each mode by visible label). Order:
  > _observed, untested_.
- **View toggle**: when the active mode defines `views`, a `ToggleButtonGroup` next to the
  mode selector lists them in registry order (LLVM-IR: CFG, Use-Def) with the active view
  selected; it is absent for single-view modes. It lives in the panel header, not in the
  canvas control cluster: it selects what is projected, not how the viewport is framed.
  > Pinned by: `e2e/smoke.spec.ts` ("LLVM-IR use-def view").
- **Clear** empties the editor (the subsequent parse of the empty string follows §1: e.g.
  an empty module is valid LLVM-IR, but empty Mermaid input is a parse error).
  _(observed, untested)_
- **Body / Editor**: Monaco with Shiki `github-light` highlighting; the language follows
  `mode.editorLanguage` (`llvm` for LLVM-IR and SelectionDAG, `mermaid` for Mermaid). The
  editor surface is fully opaque. _(observed, untested)_
- **Event containment**: the panel is a DOM sibling of the React Flow canvas (not a React
  Flow `<Panel>`), so canvas pan/zoom gestures do not reach it; a `stopPropagation` wheel
  handler on the panel root is an additional safety net. _(observed, untested)_
- **Resize**: right-edge drag via `usePaneResize` — min 280 px, max 60 vw, initial 420 px.
  Wide mode only. _(observed, untested)_
- **Collapse**: the panel collapses to a small floating pill rendered as a miniature node
  (same border and corner-chip grammar) labeled `code`, giving the graph the full viewport.
  The state is a session-local `panelOpen: boolean` (no persistence); the same flag drives
  wide and narrow mode. The pill sits **top-left in wide mode** and **bottom-left in narrow
  mode**. _(observed, untested)_

### 6.3 Status footer

One line of monospace text at the bottom of the panel, styled as a compiler diagnostic. It
is the only place parse status is reported; there is no snackbar over the graph.

- Success: `✓ parsed · N nodes · M edges` — the check glyph in `ok`, the text in `ink-muted`.
- Failure: `error: <full message>` with a 2 px left rule in `error`. The message is **not
  truncated**; long messages wrap and scroll inside the footer, which caps at roughly 8
  lines. The error clears on the next successful parse (§1).
  > Pinned by: `e2e/smoke.spec.ts` ("invalid code shows a parse error"). The exact success
  > wording, the line cap, and the absence of truncation are _observed, untested_.

### 6.4 Canvas control cluster

A single floating row at the **bottom-right**, replacing React Flow's default `<Controls />`
and the ad-hoc top-right Reset Layout `<Panel>`: zoom in, zoom out, fit view, a 1 px divider,
then reset layout. The divider separates viewport operations from the position-destroying
reset (§2).

- `fitView` is called with a left `padding` equal to the current panel width plus its margin,
  using the @xyflow/react 12.10 object form (e.g. `fitView({ padding: { left: "436px" } })`),
  so "fit" centers the graph in the _visible_ area. The padding is `0` while the panel is
  collapsed. This applies to the initial fit, the fit-view button, and the re-fit after Reset
  Layout. _(observed, untested)_
- The cluster stays clear of any bottom inset the shell reserves: in narrow mode with the
  sheet open it is lifted above the sheet by the sheet's height, and it returns to the
  viewport's bottom-right corner whenever that inset is `0`. _(observed, untested)_

### 6.5 Responsive narrow mode (viewport ≤ 768 px)

The canvas stays full-screen. The editor panel becomes a **bottom sheet** covering ~55 % of
the viewport height, toggled by the pill (bottom-left). There is no Code/Graph toggle. The
drag-resizer is wide-mode-only. _(observed, untested)_

### 6.6 Visual grammar and design tokens

All floating chrome — editor panel, collapsed pill, control cluster — reuses the graph
nodes' visual grammar from `src/components/Graph/common/NodeShell.tsx`: `1px solid #777`
border, `4px` radius, white surface, monospace type, and the corner-chip idiom (small label
chip in the top-left corner, grey background, bold 12 px, rounded on the outer top-left and
inner bottom-right corners only). Conceptually, the editor panel is itself a node.

| Token       | Value                                                         | Use                                                      |
| ----------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `ground`    | `#FAFAFA`                                                     | Canvas background; `<Background />` dot color `#D7DBDF`  |
| `paper`     | `#FFFFFF`                                                     | Panel / pill / control-cluster surface (same as nodes)   |
| `line`      | `#777`                                                        | Border color for all floating chrome (same as NodeShell) |
| `ink`       | `#1F2328`                                                     | Primary text                                             |
| `ink-muted` | `#57606A`                                                     | Secondary text (status footer, chip labels)              |
| `ok`        | `#1A7F37`                                                     | Parse success only — never decorative                    |
| `error`     | `#CF222E`                                                     | Parse failure only — never decorative                    |
| `accent`    | `#8250DF`                                                     | Focus rings and selected states only                     |
| elevation   | `0 1px 2px rgba(31,35,40,.08), 0 8px 24px rgba(31,35,40,.08)` | Floating chrome only; graph nodes stay flat (no shadow)  |

- **No translucency and no backdrop blur**: every surface is fully opaque.
- **Typography**: no webfonts. The brand mark, corner chips, mode selector, and status footer
  use the graph nodes' monospace stack (`common/nodeTextStyle.ts`); other UI text uses
  `system-ui`.
- **Motion**: exactly one animation — the panel ⇄ pill collapse/expand morph (~180 ms
  ease-out) with an animated `fitView` recenter. Disabled under `prefers-reduced-motion`.
- **Accessibility floor**: 2 px `accent` focus rings on all interactive chrome, keyboard
  operability, WCAG AA contrast for status-footer text.

_(§6.6 as a whole: observed, untested — the tokens are enforced by review, not by tests.)_
