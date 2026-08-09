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
`edgeBuilder`/`layoutOptions`, structurally satisfied by a mode object — see
`contracts/ir-mode-registry.md`) computes a **topology signature**:
`direction | sorted node ids | sorted source-target pairs`.

- **Signature changed** (first parse, node/edge added or removed, direction changed):
  full **asynchronous** ELK re-layout; all positions and edge routes are recomputed. A
  layout that resolves after a newer parse has started is discarded (generation counter),
  so a stale layout can never overwrite a newer graph.
- **Signature unchanged** (content-only edit, e.g. changing an instruction inside a block):
  synchronous update — node **positions are preserved**, labels/content update in place,
  edges are rebuilt by the mode's `IREdgeBuilder` and inherit the previous edge's stored
  route and back-edge flag by id (§4). A content edit can change a node's _size_, which the
  stored route does not track; the next full layout corrects this (accepted drift).
- Switching views always changes the signature (the two projections emit different node id
  namespaces), so each view switch performs a full re-layout; **positions are not preserved
  across view switches**. This is intended: the two projections have unrelated topologies, so
  there is nothing meaningful to carry over.

> Pinned by: `src/hooks/__tests__/useGraphData.test.ts` (layout on first call, position
> preservation, re-layout on topology change, SelectionDAG position/edge-type stability)

**Reset Layout** re-runs the full (async) layout for the last parsed graph (using the active
mode's edge builder and layout options) and is a no-op before the first parse; the viewer then
re-fits the viewport (after a 50 ms delay — _observed, untested_).

> Pinned by: `useGraphData.test.ts` ("resetLayout ...")

## 3. Layout (ELK)

Layout and edge routing are both computed by ELK (`elkjs`, layered algorithm). ELK is the single
layout engine because its orthogonal routes, ports, cycle handling, and self-loop routing keep
layout geometry connected to what React Flow renders.

- `getLayoutedElements` is **async**: the elkjs bundle is dynamically imported on first use
  and layout runs on the main thread (graphs are small; no worker).
- Rank direction: explicit option → `GraphData.direction` → `"TD"`. `TD` maps to ELK
  `elk.direction: DOWN`, `LR` to `RIGHT`.
- Edge routing is `ORTHOGONAL`; per-mode `layoutOptions` (ELK option map) merge into the
  root options (e.g. Use-Def's tighter spacing, SelectionDAG's layer spacing).
- Node boxes given to ELK use the estimated dimensions from §5, so spacing reflects real
  rendered sizes. Use-Def instruction nodes additionally declare `FIXED_POS` ports at
  operand text offsets (`specs/llvm-use-def-view.md` §4).

> Pinned by: `src/utils/__tests__/layout.test.ts` (positions assigned, direction respected,
> no overlapping positions, routes attached). `layoutOptions` merging: _observed, untested_.

## 4. Edge routing and rendering

Every LLVM/Mermaid edge is rendered by one custom edge type, `routed`
(`RoutedEdge.tsx`), which draws the ELK-computed route; there are no hand-drawn edge
shapes anymore.

- The layout stores each edge's route on the React Flow edge:
  `data.route = { points, sourcePos, targetPos }` — the orthogonal polyline's points and
  the two endpoint nodes' layout positions (top-left), recorded for staleness detection.
- `RoutedEdge` draws `points` as an orthogonal polyline with **rounded corners**; edge
  labels (phi) render at the route midpoint.
- **Drag fallback:** when an endpoint node's current position differs from the recorded
  layout position (the user dragged it), the edge falls back to a live smoothstep path
  between the current handle positions. **Reset layout** restores routed rendering.
- **Back edges:** after layout, an edge is flagged `data.isBackEdge` when it is a
  self-loop or its target node lies entirely above its source node. Back edges render in
  the loop accent color (muted purple `#8250df`, matching arrowhead) — "colored + upward
  = loop-carried". This accent is graph grammar, not shell chrome (§6.6 still has no
  accent token).
- **Self-loops:** when ELK yields no usable route (and in the drag-fallback state), the
  edge synthesizes a small orthogonal loop hugging the node's right side.
- **SelectionDAG**: unaffected by routing — its edges connect per-operand/type Handles
  and keep the handle-anchored bezier look via React Flow's built-in `default` edge with
  `pathOptions.curvature`. Chain/glue edges render dashed (see `specs/selectiondag.md`
  §3). SelectionDAG edges place the arrow marker at the **start** (pointing at the
  source), LLVM/Mermaid at the **end**.

> Pinned by: `layout.test.ts` (route attachment, back-edge / self-loop flagging),
> `useGraphData.test.ts` (route preservation on content-only updates),
> `converter.test.ts` (dashed chain/glue, markerStart/markerEnd)

## 5. Node dimension estimation

ELK needs node sizes before React renders anything, so `converter.ts` estimates them:

- Text nodes: character-count based. Char width/line height come from `getFontMetrics`
  (measures a monospace `M` in the DOM; falls back to 8×16 px in non-browser environments).
  Width clamps per mode: Mermaid 10–30 chars, LLVM 16–80, SelectionDAG fallback 12–50. The
  estimated box is exactly the rendered NodeShell frame:
  `chars·charW + 2·(NODE_PADDING_X + NODE_BORDER_WIDTH)` wide and
  `lines·lineHeight + 2·(NODE_PADDING_Y + NODE_BORDER_WIDTH)` tall, plus
  `NODE_HEADER_HEIGHT` when a block label band is present (`blockLabel !== undefined`, so
  labeled and `null`-labeled entry blocks both count).
- SelectionDAG nodes: structural estimation mirroring `SelectionDAGNode.tsx`'s row/cell layout.
- The estimation and the rendered CSS share single-source constants — `common/nodeTextStyle.ts`
  owns the whole node frame (font 12 px / line height 16 px, paddings 8×6, border 1 px, radius
  2 px, header band 20 px), with `SelectionDAG/selectionDAGStyleConstants.ts` and
  `CodeFragment.tsx`'s exported paddings for their structures. When changing node styling,
  change the constant, never a literal, or layout spacing silently drifts from rendering.

> Pinned by: `src/utils/__tests__/converter.test.ts` (mermaid/LLVM/wrapping/header-offset/
> empty-label cases)

## 6. Shell UI (canvas-first shell)

The shell is **canvas-first**: the graph canvas fills the viewport and every other surface
floats above it. This keeps the visualization as the primary workspace while the editor and
controls remain available as overlays.

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

- **Header**, left to right: the brand title ("IR Visualizer", small sans-serif, ~13 px,
  `#333`), the **mode selector**, the **view toggle**, a **Clear** action, and a **collapse**
  button.
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
- **Collapse**: the panel collapses to a small floating pill styled as a plain small button
  with a sans-serif `Code` label, giving the graph the full viewport. The state is a
  session-local `panelOpen: boolean` (no persistence); the same flag drives wide and narrow
  mode. The pill sits **top-left in wide mode** and **bottom-left in narrow mode**.
  _(observed, untested)_

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
  Layout. Because layout is async (§2), the initial fit is triggered by
  `useNodesInitialized` once the first layout's nodes are measured, not by the `fitView`
  prop (which would fire before any nodes exist). _(observed, untested)_
- The cluster stays clear of any bottom inset the shell reserves: in narrow mode with the
  sheet open it is lifted above the sheet by the sheet's height, and it returns to the
  viewport's bottom-right corner whenever that inset is `0`. _(observed, untested)_

### 6.5 Responsive narrow mode (viewport ≤ 768 px)

The canvas stays full-screen. The editor panel becomes a **bottom sheet** covering ~55 % of
the viewport height, toggled by the pill (bottom-left). There is no Code/Graph toggle. The
drag-resizer is wide-mode-only. _(observed, untested)_

### 6.6 Visual grammar and design tokens

Floating chrome — editor panel, collapsed pill, control cluster — uses the quiet gray
language: neutral grays, sans-serif type, and light borders, distinct from the graph nodes'
own grammar in `src/components/Graph/common/NodeShell.tsx` (`1px solid #777` border, `2px`
radius, white surface, dense 12 px monospace, full-width header band). That NodeShell grammar — including the header
band — remains exclusively a graph-node affordance; the shell chrome does not borrow it, and
the editor panel is chrome around the canvas, not a node itself.

| Token          | Value                                                                  | Use                                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ground`       | `#FAFAFA`                                                              | Canvas background; `<Background />` dot color `#D7DBDF`                                                                                                                                                                                      |
| `paper`        | `#FFFFFF`                                                              | Panel / pill / control-cluster surface (same as nodes)                                                                                                                                                                                       |
| `control`      | `#d0d0d0` (hover `controlHover` `#999`, focused `controlFocus` `#777`) | Border on bordered interactive controls (select, toggle group, outlined buttons); `controlHover` applies to all of them, `controlFocus` only to the select's focused field border — toggles and buttons signal focus via `focusRing` instead |
| `line`         | `#999`                                                                 | Outer border of floating surfaces (panel, pill, control cluster)                                                                                                                                                                             |
| `ink`          | `#1F2328`                                                              | Primary text                                                                                                                                                                                                                                 |
| `ink-muted`    | `#57606A`                                                              | Secondary text (status footer)                                                                                                                                                                                                               |
| `ok`           | `#1A7F37`                                                              | Parse success only — never decorative                                                                                                                                                                                                        |
| `error`        | `#CF222E`                                                              | Parse failure only — never decorative                                                                                                                                                                                                        |
| `selectedFill` | `#e8e8e8` (text `#222`, weight 600)                                    | Selected toggle-button state                                                                                                                                                                                                                 |
| `hoverFill`    | `#f0f0f0`                                                              | Hover fill for shell chrome buttons                                                                                                                                                                                                          |
| `focusRing`    | 2 px `#57606A`                                                         | Focus-visible ring on all interactive shell chrome (neutral, not accent)                                                                                                                                                                     |
| elevation      | `0 1px 2px rgba(31,35,40,.05), 0 4px 12px rgba(31,35,40,.06)`          | Floating chrome only; graph nodes stay flat (no shadow)                                                                                                                                                                                      |

There is no `accent` token: the purple accent used by the shipped shell (PR #60) has been
removed. `ok` (green) and `error` (red) are the only semantic, non-gray colors anywhere in the
shell chrome. Graph nodes keep their existing `1px solid #777` border unchanged — that border
belongs to NodeShell, not to a shell-chrome token, and node styling is out of scope here.

- **No translucency and no backdrop blur**: every surface is fully opaque.
- **Typography**: no webfonts. All shell chrome — brand title, mode selector, view toggle,
  buttons — uses the app's system sans-serif stack (`system-ui`). Monospace is reserved for
  the status footer (compiler-output feel) and the canvas/graph nodes; it is no longer used
  anywhere in the shell chrome.
- **Icon-only buttons are deliberately borderless**: the panel collapse button and the canvas
  control cluster's zoom / fit / reset buttons carry no `control` border of their own — their
  enclosing surface (panel, pill, cluster) already has one via `line` — and signal
  hover/focus with `hoverFill` and `focusRing` instead.
- **Motion**: exactly one animation — the panel ⇄ pill collapse/expand morph (~180 ms
  ease-out) with an animated `fitView` recenter. Disabled under `prefers-reduced-motion`.
- **Accessibility floor**: 2 px `focusRing` (neutral gray `#57606A`, not accent) on all
  interactive chrome, keyboard operability, WCAG AA contrast for status-footer text.

_(§6.6 as a whole: observed, untested — the tokens are enforced by review, not by tests.)_
