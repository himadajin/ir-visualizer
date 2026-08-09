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
  across view switches**. This is intended: the two projections have unrelated topologies, so
  there is nothing meaningful to carry over.

> Pinned by: `src/hooks/__tests__/useGraphData.test.ts` (layout on first call, position
> preservation, re-layout on topology change, SelectionDAG position/edge-type stability)

**Reset Layout** re-runs the full (async) layout for the last parsed graph (using the active
mode's edge builder and layout options) and is a no-op before the first parse; the viewer then
re-fits the viewport (after a 50 ms delay — _observed, untested_).

> Pinned by: `useGraphData.test.ts` ("resetLayout ...")

## 3. Layout (ELK — node placement)

Node placement is computed by ELK (`elkjs`, layered algorithm). ELK is the single placement
engine because its ports, cycle handling and layer ordering keep node geometry connected to
what React Flow renders. It computes **placement only** — edge geometry is not taken from it
(§4).

- `getLayoutedElements` is **async**: the elkjs bundle is dynamically imported on first use
  and layout runs on the main thread (graphs are small; no worker).
- Rank direction: explicit option → `GraphData.direction` → `"TD"`. `TD` maps to ELK
  `elk.direction: DOWN`, `LR` to `RIGHT`.
- `elk.edgeRouting: ORTHOGONAL` stays set, because ELK consults edge routing when ordering
  nodes within a layer and it therefore improves **placement**. The route points ELK
  produces are **discarded**: they are not stored on the React Flow edges.
- Per-mode `layoutOptions` (ELK option map) merge into the root options (e.g. Use-Def's
  tighter spacing, SelectionDAG's layer spacing).
- Node boxes given to ELK use the estimated dimensions from §5, so spacing reflects real
  rendered sizes. Use-Def instruction nodes additionally declare `FIXED_POS` ports at
  operand text offsets (`specs/llvm-use-def-view.md` §4); the ports shape placement and
  decide which handle an edge attaches to, which is what the router then routes between
  — _(observed, untested)_.
- The layout is also where the structural back-edge flag is decided (§4).

> Pinned by: `src/utils/__tests__/layout.test.ts` (positions assigned, direction respected,
> no overlapping positions, back-edge flagging, no geometry attached to edges).
> `layoutOptions` merging: _observed, untested_.

## 4. Edge routing and rendering

Every LLVM/Mermaid edge is rendered by one custom edge type, `routed` (`RoutedEdge.tsx`).
**Edge geometry is a pure function of the live node rectangles**, computed at render time
by this repo's own orthogonal router (`src/utils/edgeRouter.ts`; the module boundary and
its guarantees are frozen in `contracts/edge-routing.md`). There is exactly one geometry
generator: no stored geometry, no second path shape that appears once a node moves, and no
notion of geometry that can go out of date.

- **Inputs** are React Flow's measured rects (`internals.positionAbsolute`,
  `measured.width` / `measured.height`) and the live handle positions. Because those track
  the current DOM, an edge follows its node while the node is dragged, and follows a size
  change caused by a content-only edit (§2), with no re-layout involved.
- **One pass per graph.** `routeEdges` takes all nodes and all requests at once, so it is
  not called per edge. `src/hooks/useEdgeRoutes.ts` reads React Flow's store, calls the
  router once per pass, and publishes the resulting `Map<edgeId, Point[]>` through a React
  context; `RoutedEdge` looks up its own entry by edge id.
- **Algorithm:** a sparse Hanan grid over node rects inflated by `nodeMargin` (default 12),
  seeded per edge from the rect lines plus that edge's own endpoints. A grid segment is
  traversable when it does not cross the interior of an inflated rect. The endpoint-node
  exemption is **per endpoint**: the source node's rect is exempt only for the segments
  incident to the pushed source point, the target node's only for those incident to the
  pushed target point, and every other segment treats both as obstacles — so a **searched**
  route never crosses the interior of its own endpoint nodes. That clearance is a property
  of searched routes only, and of their **routed** segments only: the fallback below is
  exempt **entirely** — its connector does no obstacle avoidance by design, being the last
  resort once the search has proved no clear path exists — and a searched route's two
  mandated stubs are exempt too, since with overlapping node rects one node's stub
  necessarily lies inside the other's. Where the tighter rule leaves no path, the
  fallback applies. The route is the cheapest grid path under `length + bendPenalty * turns`
  (`bendPenalty` default 30), with turns counted over the whole polyline, stubs included.
  Endpoints are pushed `nodeMargin` outward along their handle's side before joining the
  grid.
- **Endpoints are exact:** the polyline starts exactly at the source handle position and
  ends exactly at the target handle position. The `nodeMargin`-pushed point is an interior
  bend, never `points[0]` or the last point, so a drawn edge always touches its handle.
  Collinear interior points are collapsed to their bends, but the two pushed points are
  never collapsed away. **Self-loops are the one exception** — see below.
- Every route is **orthogonal** and has **≥ 2 points**, and routing is **deterministic**:
  identical input rects produce identical points, with no dependence on iteration order.
  **Ties are broken by a fixed total order** — lowest total cost, then fewest bends, then
  the point sequence compared lexicographically by `(x, y)` — so the chosen shape is a
  documented property, not an implementation accident.
- **No path found** yields a fully determined orthogonal fallback, built as a skeleton
  `sourcePoint → S → P1 → connector → P2 → T → targetPoint`. `S` and `T` are the handles
  pushed `nodeMargin` outward along their sides; `P1` and `P2` are pushed a further
  `selfLoopGap` out, so the polyline always leaves straight and always approaches the
  target from outside — which is what makes the no-reversal rule hold at both stubs
  unconditionally. The connector is chosen from a fixed ladder (straight run, two-segment
  elbow continuing along the exit axis, then three-segment lateral dog-legs ordered
  +x, +y, −x, −y, then a four-segment rectangle for coincident handles), taking the first
  candidate that satisfies the no-reversal rule; consecutive duplicate points are dropped.
  **Two connector segments are provably not always enough:** when the source and target
  normals lie on the same axis pointing opposite ways and the displacement runs backwards
  along it (e.g. a `bottom → top` pair where the target sits above the source), both
  two-segment orderings reverse at one of the two stubs, so a three-segment dog-leg is
  required there — the longer candidates in the ladder are a minimum, not a convenience.
  The fallback's connector does **no obstacle avoidance whatsoever, by design**: it picks a
  shape from the endpoint geometry alone and never consults the node rects, because it is
  reached only after the grid search has already proved no clear path exists — a shape that
  avoided obstacles is not on offer at that point, only a determined shape that may clip or
  no edge at all.
  **Known limitations,** both accepted rather than fixed since the alternatives are a stale
  route or a second geometry generator:
  - Because the fallback does no obstacle avoidance, a fallback edge in overlapping-rect
    geometry can visibly thread between the two boxes. Reachable only by dragging one node
    onto or nearly onto another — ELK's placement does not produce two _directly connected_
    nodes whose inflated boxes overlap. _(observed, untested)_
  - ELK's placement can still leave two _unrelated_ node rects closer than `2 × nodeMargin`
    apart with no drag at all, closing the corridor a third edge would otherwise route
    through and forcing that edge to the fallback — a layout-constant question, not a router
    defect. _(observed, untested)_
- **No immediate reversals:** no returned polyline — searched, self-loop or fallback — has
  an interior vertex whose arriving and leaving segments run along the same axis in
  opposite directions. This is the checkable form of "never a degenerate hook", and it is
  the rule's only form: "perpendicular segments and `points[i-1] !== points[i+1]`" is not
  equivalent and must not be substituted. The search satisfies it by never doubling back
  and by refusing to finish at the target along the target side's outward normal (an edge
  that leaves unreachable falls back instead); the self-loop and the fallback satisfy it by
  construction.
- **Self-loops** are synthesized on the node's **right** side rather than routed, and are
  the only edges exempt from the exact-endpoint rule: they are built from the node rect
  alone, so the request's source and target handle positions are ignored (React Flow's
  default bottom handle is centred, not at 75 %). For a rect `(x, y, w, h)` with
  `laneX = x + w + selfLoopGap` (default 24), the polyline is exactly six points —
  `(x + 0.75w, y + h)` on the bottom edge, `(x + 0.75w, y + h + nodeMargin)`,
  `(laneX, y + h + nodeMargin)`, `(laneX, y - nodeMargin)`,
  `(x + 0.75w, y - nodeMargin)`, and `(x + 0.75w, y)` on the top edge. The two
  `nodeMargin` steps are what keep the horizontal runs off the node's own bottom and top
  borders.
- **Missing nodes:** a routing request whose source or target id is **not present in the
  `nodes` array** produces **no entry** in the returned map — the router does not throw and
  does not substitute a default rect, it omits the request (self-loops included).
- **Unmeasured endpoints** follow from that rule: `useEdgeRoutes` omits nodes React Flow
  has not measured yet from the rects it passes in, so their edges resolve to no entry and
  are **not drawn** for that frame, appearing once measurement lands. There is deliberately
  no placeholder shape — one would reintroduce the second geometry generator this design
  removes.
- **Obstacles are node rectangles only.** Edge labels and other edges are not obstacles,
  and there is no edge-crossing penalty.
- **During a drag**, routes recompute continuously, throttled to animation frames, and
  only the edges incident to a moved node are re-routed; a full pass runs on drag stop.
  That split is required rather than opportunistic: a full pass overruns the 16.7 ms frame
  budget from roughly 180 nodes, which the Use-Def view can reach since it emits one node
  per instruction.
- **Performance:** a full routing pass over a synthetic 60-node / 80-edge graph completes
  in under 50 ms, measured out of band (bare Node, warm, median of N). Routing cost depends
  on graph shape as well as size — the repo's own test graph measures ~6–14 ms at that size,
  an adjacent-layer graph of the same size ~2–4 ms — so the figure is a budget, not a
  constant. The in-suite timing test is a catastrophic-regression guard at 300 ms, not a
  check of this budget: inside a parallel test runner the number measures contention as
  much as the router. Measured scaling on an ELK-layered-shaped CFG (bare Node, warm,
  median of N, 2026-08-09):

  | nodes | edges | median ms |
  | ----- | ----- | --------- |
  | 60    | 117   | 2.9       |
  | 120   | 245   | 7.6       |
  | 180   | ~370  | ~16       |
  | 260   | 542   | 31.1      |
  | 400   | 840   | 71.8      |

  This is the basis for the ~180-node threshold above: the 16.7 ms animation-frame budget
  — the one that matters, since a full pass runs per frame during a drag — is exceeded
  around there, which is what makes the incident-edges-only drag path required rather than
  an optimization held in reserve.

- **Rendering:** `RoutedEdge` draws the returned points as an orthogonal polyline with
  **rounded corners**; edge labels (phi) render at the polyline's arc-length midpoint.
- **Back edges:** after layout, an edge is flagged `data.isBackEdge` when it is a self-loop
  or its target node lies entirely above its source node. The flag is **structural** —
  decided once from ELK's placement geometry and never re-derived from live rects — so
  colors do not flicker while a node is dragged; only geometry is live. Back edges render
  in the loop accent color (muted purple `#8250df`, matching arrowhead) — "colored + upward
  = loop-carried". This accent is graph grammar, not shell chrome (§6.6 still has no accent
  token).
- **Reset layout** (§2) re-runs ELK placement and nothing else. It has no role in edge
  rendering: edge geometry is always current, dragged or not.
- **SelectionDAG**: unaffected by routing — its edges connect per-operand/type Handles
  and keep the handle-anchored bezier look via React Flow's built-in `default` edge with
  `pathOptions.curvature`. Chain/glue edges render dashed (see `specs/selectiondag.md`
  §3). SelectionDAG edges place the arrow marker at the **start** (pointing at the
  source), LLVM/Mermaid at the **end**.

> Pinned by: `src/utils/__tests__/edgeRouter.test.ts` (orthogonality, ≥ 2 points, exact
> endpoints, obstacle avoidance including that a searched route never crosses the interior
> of its own endpoint nodes, tie-breaking and determinism, the six-point right-side
> self-loop and its exemption from the exact-endpoint rule,
> the no-path fallback skeleton and its connector ladder, the no-immediate-reversal rule
> across searched, self-loop and fallback routes,
> omission of requests naming a node absent from
> `nodes`, and a 300 ms catastrophic-regression guard on the 60-node / 80-edge graph),
> `src/utils/__tests__/layout.test.ts` (back-edge / self-loop
> flagging,
> no geometry stored on edges), `src/hooks/__tests__/useGraphData.test.ts` (back-edge flag
> inherited on content-only updates), `src/utils/__tests__/converter.test.ts` (dashed
> chain/glue, markerStart/markerEnd).
>
> _(observed, untested)_: that edges track the live DOM rects — following a node while it
> is dragged and following a size change from a content-only edit — since no named test
> drives a drag; the one-pass-per-graph `useEdgeRoutes` hook and its context; that
> `useEdgeRoutes` omits unmeasured nodes from the rects it passes in, and that an edge with
> no map entry is not drawn; the rounded corners; the midpoint label placement; the accent
> color; the animation-frame throttling during a drag and the incident-edges-only drag
> pass; that turns are counted over the whole polyline including the stubs; and the 50 ms
> budget itself, which is measured out of band rather than by any test in the suite.
> The **no-immediate-reversal** rule now holds for all three route kinds and is
> additionally verified out of band (0 violations across a 40,401-position sweep, a
> 4,096-case grid over all 16 side pairs, and 30,000 random all-sides graphs).

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
- Every LLVM node body and the Use-Def instruction card render their code line(s) through
  `HighlightedCode.tsx`, which wraps Shiki's own `<pre>` output (block mode; SelectionDAG's
  `CodeFragment.tsx` uses the same component in `inline` mode instead, which strips the
  `<pre>`/`<code>` tags entirely, so it never carries this margin). Shiki's `<pre>` carries
  the user-agent default block margin (12 px top/bottom, observed in this app's rendering);
  `HighlightedCode.tsx` resets it to `0` on the generated HTML before mounting it, because the
  estimate above assumes no margin. Mermaid nodes render plain text (`MermaidNode.tsx`, no
  `HighlightedCode` involved) and were never affected.

> Pinned by: `src/utils/__tests__/converter.test.ts` (mermaid/LLVM/wrapping/header-offset/
> empty-label cases), `src/components/Graph/common/__tests__/HighlightedCode.test.tsx` (the
> rendered `<pre>` carries no margin in block mode; inline mode still strips the tag).

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
