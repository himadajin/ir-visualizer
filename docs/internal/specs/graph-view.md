# Spec: Graph view (mode-independent behavior)

Behavior specification for everything the app does around the per-IR pipelines: the parse
cycle, graph updating, layout, node sizing, and the shell UI. Per-IR input syntax and
conversion rules live in `specs/llvm-ir.md`, `specs/mermaid.md`, `specs/selectiondag.md`.

Conventions: every normative statement is covered by a **Pinned by** reference to the test
file(s) that fix the behavior. Statements marked _observed, untested_ describe current
behavior with no covering test.

## 1. Parse cycle

- Editing the code (or switching modes or views) schedules a parse of the active mode's
  active view after a **750 ms debounce** (`PARSE_DEBOUNCE_MS` in `useIRWorkspace`);
  intermediate keystrokes cancel the pending parse.
- On success the graph updates, any error clears, and the parse's recoverable diagnostics
  (`contracts/ir-mode-registry.md`, "Recoverable diagnostics") replace the previous ones — an
  empty set when the parse was clean. On failure the **previous graph stays** and the error
  message is shown, untruncated, in the editor panel's status footer (§6).
- A failed parse also **clears the diagnostics**. They are line-anchored statements about the
  text that produced them; keeping them alongside an error about newer text would point their
  line numbers at lines that no longer say what they described.
- Switching modes replaces the editor content with the new mode's `defaultCode` and resets
  the active view to the mode's default view.
- Switching views (modes with `views`, see `contracts/ir-mode-registry.md`) **keeps the
  editor content** and re-parses it with the new view's `parse`.

> Pinned by: `e2e/smoke.spec.ts`. The exact debounce value and the untruncated rendering
> are _observed, untested_.

## 2. Graph updates — topology signature

`useGraphData.updateGraph(graph, behavior)` (where `behavior` is the active view's
`edgeBuilder`/`layoutOptions` — see `contracts/ir-mode-registry.md`) computes a **topology
signature**: `direction | sorted node ids | sorted source-target pairs`.

- **Signature changed** (first parse, node/edge added or removed, direction changed):
  full **asynchronous** ELK re-layout; all node positions are recomputed. A layout that
  resolves after a newer parse has started is discarded (generation counter), so an
  outdated layout can never overwrite a newer graph.
- **Signature unchanged** (content-only edit, e.g. changing an instruction inside a block):
  synchronous update — node **positions are preserved**, labels/content update in place,
  and edges are rebuilt by the mode's `IREdgeBuilder`, inheriting the previous edge's
  back-edge flag by id (§4). Nothing geometric is inherited: edge geometry is recomputed
  from the live node rectangles on every render (§4), so a content edit that changes a
  node's rendered _size_ is reflected immediately, with no re-layout needed.
- Switching views always changes the signature (the two projections emit different node id
  namespaces), so each view switch performs a full re-layout; **positions are not preserved
  across view switches** — the projections' topologies are unrelated, so there is nothing
  to carry over.

**Reset Layout** re-runs the full (async) layout for the last parsed graph (using the active
view's edge builder and layout options) and is a no-op before the first parse; the viewer
then re-fits the viewport (after a 50 ms delay — _observed, untested_).

> Pinned by: `src/hooks/__tests__/useGraphData.test.ts`

## 3. Layout (ELK — node placement)

Node placement is computed by ELK (`elkjs`, layered algorithm). ELK computes **placement
only** — edge geometry is not taken from it (§4).

- `getLayoutedElements` is **async**: the elkjs bundle is dynamically imported on first use
  and layout runs on the main thread (graphs are small; no worker).
- Rank direction: explicit option → `GraphData.direction` → `"TD"`. `TD` maps to ELK
  `elk.direction: DOWN`, `LR` to `RIGHT`.
- `elk.edgeRouting: ORTHOGONAL` stays set, because ELK consults edge routing when ordering
  nodes within a layer and it therefore improves **placement**. The route points ELK
  produces are **discarded**: they are not stored on the React Flow edges.
- Per-mode `layoutOptions` (ELK option map) merge into the root options (e.g. Use-Def's
  tighter spacing, SelectionDAG's layer spacing). _(merging: observed, untested)_
- Node boxes given to ELK use the estimated dimensions from §5, so spacing reflects real
  rendered sizes. Use-Def instruction nodes additionally declare `FIXED_POS` ports at
  operand text offsets (`specs/llvm-use-def-view.md` §4); the ports shape placement and
  decide which handle an edge attaches to. _(observed, untested)_
- The layout is also where the structural back-edge flag is decided (§4).

> Pinned by: `src/utils/__tests__/layout.test.ts`

## 4. Edge routing and rendering

Every LLVM/Mermaid edge is rendered by one custom edge type, `routed` (`RoutedEdge.tsx`).
**Edge geometry is a pure function of the live node rectangles**, computed at render time
by this repo's own orthogonal router. There is exactly one geometry generator: no stored
geometry, and no notion of geometry that can go out of date. The router's module boundary,
its guarantees (orthogonality, integer coordinates from quantized inputs, determinism,
endpoints exact on the quantized handle points, the self-loop shape, the no-path fallback,
no immediate reversals, missing-node omission), and its option defaults are frozen in
`contracts/edge-routing.md`; the algorithm behind those guarantees is documented in
`src/utils/edgeRouter.ts` itself.

**Overlap is a meaning, not an accident.** Two edges drawn along the same pixels read as
one flow, so the router may only produce that shape where it is true. Three rules fix what
shared geometry means:

1. **Two edges share geometry iff they carry the same value.** A _bundle_ is the fan-out
   of one entity — in the Use-Def view, the out-edges of a single def. Within a bundle,
   edges share a trunk and split at explicit junction points; between bundles nothing may
   be shared. Bundle membership is IR-specific and is declared by the mode registry's
   `bundleOf` (`contracts/ir-mode-registry.md`). An edge in no bundle is a bundle of one,
   so "this mode has no bundles" means "nothing here may overlap".
2. **Junctions are marked.** A split inside a bundle carries a visible junction mark — the
   circuit-schematic idiom: a dot means connected, an unmarked crossing means two unrelated
   edges pass over each other.
3. **Convergence is never drawn.** Fan-in edges stay geometrically independent all the way
   to the target, each keeping its own arrival point and its own arrowhead. This is
   semantically load-bearing at a phi node, where every incoming edge carries a _different_
   value: one shared tail into the node would assert the opposite.

CFG conditional successors (`br i1`, `switch`) are mutually exclusive alternatives rather
than one flow that splits, and they carry distinct labels besides, so they are never
bundled. That the CFG view therefore holds no bundles at all is a consequence of these
semantics, not a gap in them.

The bundle id reaches the router through the existing pipeline rather than a second
channel: `getLayoutedElements` stamps `bundleOf(edge)` onto the React Flow edge's
`data.bundleId`, and `useEdgeRoutes` copies it into `RouteRequest.bundleId`
(`contracts/edge-routing.md`). The router is never told what an IR is.

**These rules are not yet held.** They are the target the router is being moved toward, and
four things stand in the way: every in-edge of a node lands on one top-center handle (#87),
CFG successors leave through one bottom-center handle (#67), unrelated routes coincide by
accident on the shared search grid (#86), and same-value fan-out is not drawn as a trunk at
all (#88). Until those land, an overlap in the rendered graph means nothing.

- **Inputs** are React Flow's measured rects (`internals.positionAbsolute`,
  `measured.width` / `measured.height`) and the live handle positions. Because those track
  the current DOM, an edge follows its node while the node is dragged, and follows a size
  change caused by a content-only edit (§2), with no re-layout involved.
- **Endpoints are node-boundary anchors, not handle-box anchors.** The coordinate _along_ a
  side comes from the handle, so per-operand ports (the Use-Def view) keep their own
  offsets; the coordinate _across_ it comes from the node's measured rect — `rect.y` for a
  `top` handle, `rect.y + rect.height` for a `bottom` one, and correspondingly for `left` /
  `right`. The reason is that a handle is positioned from the node's **padding** box, so its
  measured bounds sit inside the rect the router uses as the obstacle — 1 px in, the width
  of the node border (`NODE_BORDER_WIDTH`, §5). Anchoring on the handle box makes the drawn
  attachment point and the router's clearance geometry two independently derived numbers: the
  `nodeMargin`-pushed point then lands 1 px inside the node's own inflated boundary, and
  the search has to step that pixel before it can turn, leaving a pair of bends whose
  corner radius has collapsed to half a pixel at every departure and arrival. Projecting
  onto the rect edge makes the pushed point coincide with the inflated boundary by
  construction, whatever the handle's CSS does, and the edge touches the node's visible
  border exactly. `useEdgeRoutes` therefore deliberately does **not** mirror React Flow's
  own `getHandlePosition`, which is where the inset was inherited from.
- **One pass per graph:** `src/hooks/useEdgeRoutes.ts` reads React Flow's store, calls
  `routeEdges` once per pass, and publishes the resulting `Map<edgeId, Point[]>` through a
  React context; `RoutedEdge` looks up its own entry by edge id and never calls the router
  itself.
- **Unmeasured endpoints:** the hook omits nodes React Flow has not measured yet from the
  rects it passes in; per the contract's missing-node rule their edges get no map entry and
  are **not drawn** for that frame, appearing once measurement lands. There is deliberately
  no placeholder shape — one would reintroduce a second geometry generator.
- **During a drag**, routes recompute continuously, throttled to animation frames, and only
  the edges incident to a moved node are re-routed (still against the complete obstacle
  set); a full pass runs on drag stop. The split is required, not opportunistic: a full
  pass exceeds the 16.7 ms animation-frame budget from roughly **180 nodes**, which the
  Use-Def view can reach since it emits one node per instruction. Measured out of band on
  an ELK-layered-shaped CFG (bare Node, warm, median of N, 2026-08-09): 60 nodes / 117
  edges ≈ 3 ms, 180 / ~370 ≈ 16 ms, 400 / 840 ≈ 72 ms; cost depends on graph shape as
  well as size. The in-suite 300 ms timing test is a catastrophic-regression guard, not a
  check of this budget.
- **Rendering:** `RoutedEdge` draws the returned points as an orthogonal polyline with
  **rounded corners**; edge labels (phi) render at the polyline's arc-length midpoint.
- **The bend radius is derived from the router's node margin, not chosen.** Two
  inequalities relate it to the spacing constants around it:

  ```
  2 · bendRadius ≤ nodeMargin
  2 · nodeMargin + 2 · bendRadius ≤ ELK node spacing
  ```

  The first is what makes a bend at a route's first and last corner drawable at full size:
  the contract's exact-endpoints rule (`contracts/edge-routing.md`) means the pushed point
  survives as `points[1]` and as the second-to-last point, so every route's end segments are
  exactly `nodeMargin` long and a corner there can consume at most half of that. The second
  is the same statement for the interior: the corridor between two nodes' clearance bands is
  `spacing − 2 × nodeMargin` wide, and one bend needs `2 × bendRadius` of it.

  Both are solved by **`bendRadius = nodeMargin / 2`** — 6 px at the default `nodeMargin` of
  12, requiring 36 px of node spacing, which every configured ELK value already exceeds (40
  / 50 by default, 40 / 60 in the Use-Def view). Holding the radius at 8 instead would
  demand `nodeMargin = 16` and 48 px of spacing, above the configured `elk.spacing.nodeNode`,
  and would widen the clearance band that already closes corridors between unrelated rects
  ("Known limitations" below); shrinking the radius is the safer of the two directions. The
  radius is therefore computed from the router's exported margin
  (`src/components/Graph/roundedPath.ts`), never restated as a literal of its own; it moves
  into the shared spacing module once #91 introduces one.

  The shrink-to-fit in `roundedPath` (`min(bendRadius, inLen / 2, outLen / 2)`) stays as the
  safety valve, and after this it engages only where the layout genuinely leaves a corridor
  narrower than `2 × bendRadius` — today, where ELK lays out on estimated rather than
  measured sizes and delivers less gap than it was asked for (#91). What is deliberately
  _not_ done is making the router guarantee a minimum run length so the radius is always
  nominal: that would put a stroke-appearance constraint into the topology search and could
  make an edge unroutable for a cosmetic reason. Clearance and topology are the router's
  concern; stroke appearance is not.

- **Back edges:** after layout, an edge is flagged `data.isBackEdge` when it is a self-loop
  or its target node lies entirely above its source node. The flag is **structural** —
  decided once from ELK's placement geometry and never re-derived from live rects — so
  colors do not flicker while a node is dragged; only geometry is live. Back edges render
  in the loop accent color (muted purple `#8250df`, matching arrowhead) — "colored + upward
  = loop-carried". This accent is graph grammar, not shell chrome (§6.6 has no accent
  token).
- **Known limitations,** both accepted since the alternatives are a stale route or a second
  geometry generator: the no-path fallback does no obstacle avoidance
  (`contracts/edge-routing.md`), so dragging one node onto or nearly onto another can make
  a fallback edge visibly thread between the two boxes; and ELK's placement can leave two
  _unrelated_ node rects closer than `2 × nodeMargin` apart, closing the corridor a third
  edge would otherwise route through and forcing that edge to the fallback — a
  layout-constant question, not a router defect. _(observed, untested)_
- **Reset layout** (§2) re-runs ELK placement and nothing else. It has no role in edge
  rendering: edge geometry is always current, dragged or not.
- **SelectionDAG**: unaffected by routing — its edges connect per-operand/type Handles and
  keep the handle-anchored bezier look via React Flow's built-in `default` edge with
  `pathOptions.curvature`. Chain/glue edges render dashed (see `specs/selectiondag.md`
  §3). SelectionDAG edges place the arrow marker at the **start** (pointing at the
  source), LLVM/Mermaid at the **end**.

> Pinned by: `src/utils/__tests__/edgeRouter.test.ts` (the contract's guarantees),
> `src/components/Graph/__tests__/roundedPath.test.ts` (the bend radius and its derivation
> from the node margin), `src/utils/__tests__/layout.test.ts` (back-edge / self-loop
> flagging, no geometry stored on edges), `src/hooks/__tests__/useGraphData.test.ts`
> (back-edge flag inherited on content-only updates),
> `src/utils/__tests__/converter.test.ts` (dashed chain/glue, markerStart/markerEnd).
>
> _(observed, untested)_: live-rect tracking while dragging and after content edits, the
> one-pass `useEdgeRoutes` hook and its context, the unmeasured-node omission, the midpoint
> label placement, the accent color, and the drag-time
> throttling/incident-edges pass. The frame-budget figures are measured out of band, not by
> the test suite. The overlap semantics are _specified, unimplemented_ — a different marker
> from the two above: there is nothing to observe and nothing to pin until #86–#88 land.

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
- LLVM node bodies and the Use-Def instruction card render their code line(s) through
  `HighlightedCode.tsx`, which resets the user-agent block margin on Shiki's `<pre>` output
  to `0` before mounting it — the estimate above assumes no margin. (Inline mode, used by
  SelectionDAG's `CodeFragment.tsx`, strips the `<pre>`/`<code>` tags entirely; Mermaid
  nodes render plain text and are unaffected.)

> Pinned by: `src/utils/__tests__/converter.test.ts`,
> `src/components/Graph/common/__tests__/HighlightedCode.test.tsx`

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

- **Header**, left to right: the brand title ("IR Visualizer", small sans-serif, ~13 px),
  the **mode selector**, the **view toggle**, a **Clear** action, and a **collapse** button.
- **Mode selector** lists the registry modes in `IR_MODES` insertion order
  (LLVM-IR, SelectionDAG, Mermaid).
- **View toggle**: when the active mode defines `views`, a `ToggleButtonGroup` next to the
  mode selector lists them in registry order (LLVM-IR: CFG, Use-Def) with the active view
  selected; it is absent for single-view modes. It lives in the panel header, not in the
  canvas control cluster: it selects what is projected, not how the viewport is framed.
- **Clear** empties the editor (the subsequent parse of the empty string follows §1: e.g.
  an empty module is valid LLVM-IR, but empty Mermaid input is a parse error).
- **Body / Editor**: Monaco with Shiki `github-light` highlighting; the language follows
  `mode.editorLanguage` (`llvm` for LLVM-IR and SelectionDAG, `mermaid` for Mermaid). The
  editor surface is fully opaque.
- **Event containment**: the panel is a DOM sibling of the React Flow canvas (not a React
  Flow `<Panel>`), so canvas pan/zoom gestures do not reach it; a `stopPropagation` wheel
  handler on the panel root is an additional safety net.
- **Resize**: right-edge drag via `usePaneResize` — min 280 px, max 60 vw, initial 420 px.
  Wide mode only.
- **Collapse**: the panel collapses to a small floating pill styled as a plain small button
  with a sans-serif `Code` label, giving the graph the full viewport. The state is a
  session-local `panelOpen: boolean` (no persistence); the same flag drives wide and narrow
  mode. The pill sits **top-left in wide mode** and **bottom-left in narrow mode**.

> Pinned by: `e2e/smoke.spec.ts` (mode selection by visible label, the CFG/Use-Def
> toggle). Everything else in this subsection, including the mode order: _observed,
> untested_.

### 6.3 Status footer

Monospace text at the bottom of the panel, styled as compiler output. It is the only place
parse status is reported; there is no snackbar over the graph.

- Success: `✓ parsed · N nodes · M edges` — the check glyph in `ok`, the text in `ink-muted`.
- Failure: `error: <full message>` with a 2 px left rule in `error`. The message is **not
  truncated**; long messages wrap and scroll inside the footer, which caps at roughly 8
  lines. The error clears on the next successful parse (§1).
- Success with diagnostics: the success line, then **one line per diagnostic**, each
  `warning: line <N>: <message>` with the `warning:` prefix in `warn` and a 2 px left rule in
  `warn`. The prefix is the only place severity is written — the parser's message carries no
  severity word (`contracts/ir-mode-registry.md`). Diagnostics are listed in the order the
  parse returned them, none is dropped, and the footer's line cap makes a long list scroll
  rather than truncate.
- `error` outranks `warn` on the left rule, and the two never appear together: a failed parse
  has no diagnostics (§1).

The `warning:` prefix is deliberately not `error:`, so that "did this input parse?" stays
answerable by looking for a single word.

> Pinned by: `e2e/smoke.spec.ts` (a parse error reaches the footer),
> `src/components/AppShell/__tests__/EditorPanel.test.tsx` (the three footer states and the
> severity precedence). The exact success wording, the line cap, and the absence of
> truncation are _observed, untested_.

### 6.4 Canvas control cluster

A single floating row at the **bottom-right**: zoom in, zoom out, fit view, a 1 px divider,
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

Floating chrome — editor panel, collapsed pill, control cluster — uses a quiet gray
language: neutral grays, sans-serif type, and light borders. Graph nodes keep their own
grammar in `src/components/Graph/common/NodeShell.tsx` (`1px solid #777` border, `2px`
radius, white surface, dense 12 px monospace, full-width header band); the shell chrome
never borrows it — including the header band — because the editor panel is chrome around
the canvas, not a node.

| Token          | Value                                                                  | Use                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ground`       | `#FAFAFA`                                                              | Canvas background; `<Background />` dot color `#D7DBDF`                                                                                                      |
| `paper`        | `#FFFFFF`                                                              | Panel / pill / control-cluster surface (same as nodes)                                                                                                       |
| `control`      | `#d0d0d0` (hover `controlHover` `#999`, focused `controlFocus` `#777`) | Border on bordered interactive controls; `controlFocus` applies only to the select's focused field border — toggles and buttons signal focus via `focusRing` |
| `line`         | `#999`                                                                 | Outer border of floating surfaces (panel, pill, control cluster)                                                                                             |
| `ink`          | `#1F2328`                                                              | Primary text                                                                                                                                                 |
| `ink-muted`    | `#57606A`                                                              | Secondary text (status footer)                                                                                                                               |
| `ok`           | `#1A7F37`                                                              | Parse success only — never decorative                                                                                                                        |
| `error`        | `#CF222E`                                                              | Parse failure only — never decorative                                                                                                                        |
| `warn`         | `#9A6700`                                                              | Recoverable parse diagnostics only — never decorative                                                                                                        |
| `selectedFill` | `#e8e8e8` (text `#222`, weight 600)                                    | Selected toggle-button state                                                                                                                                 |
| `hoverFill`    | `#f0f0f0`                                                              | Hover fill for shell chrome buttons                                                                                                                          |
| `focusRing`    | 2 px `#57606A`                                                         | Focus-visible ring on all interactive shell chrome (neutral, not accent)                                                                                     |
| elevation      | `0 1px 2px rgba(31,35,40,.05), 0 4px 12px rgba(31,35,40,.06)`          | Floating chrome only; graph nodes stay flat (no shadow)                                                                                                      |

- There is no `accent` token: `ok` (green), `warn` (amber) and `error` (red) are the only
  semantic, non-gray colors in the shell chrome, and all three report parse status. The muted
  purple on back edges (§4) is graph grammar, not a shell token.
- **No translucency and no backdrop blur**: every surface is fully opaque.
- **Typography**: no webfonts. All shell chrome uses the app's system sans-serif stack
  (`system-ui`). Monospace is reserved for the status footer (compiler-output feel) and
  the canvas/graph nodes.
- **Icon-only buttons are borderless**: the panel collapse button and the control cluster's
  zoom / fit / reset buttons carry no `control` border of their own — their enclosing
  surface already has one via `line` — and signal hover/focus with `hoverFill` and
  `focusRing`.
- **Motion**: exactly one animation — the panel ⇄ pill collapse/expand morph (~180 ms
  ease-out) with an animated `fitView` recenter. Disabled under `prefers-reduced-motion`.
- **Accessibility floor**: 2 px `focusRing` on all interactive chrome, keyboard
  operability, WCAG AA contrast for status-footer text.

_(§6.6 as a whole: observed, untested — the tokens are enforced by review, not by tests.)_
