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
signature**: `direction | sorted node ids | sorted source-target pairs | sorted
id:parentId pairs | sorted id:containerDirection pairs`.

- **Signature changed** (first parse, node/edge added or removed, direction changed
  — root or per-container — parent membership changed):
  a **measure-then-layout** pass (§3, §5). Nodes are mounted so React Flow can measure
  them; no positioned graph is committed until ELK has run on those measured sizes.
  A layout that resolves after a newer parse has started is discarded (generation
  counter), so an outdated layout can never overwrite a newer graph.
- **Signature unchanged** (content-only edit, e.g. changing an instruction inside a block):
  synchronous update — node **positions are preserved**, labels/content update in place,
  and edges are rebuilt by the mode's `IREdgeBuilder`, inheriting the previous edge's
  back-edge flag by id (§4). Nothing geometric is inherited: edge geometry is recomputed
  from the live node rectangles on every render (§4), so a content edit that changes a
  node's rendered _size_ is reflected immediately, with no re-layout. The spacing
  promise (§3) is not re-asserted until the next full layout.
- Switching views always changes the signature (the two projections emit different node id
  namespaces), so each view switch performs a full re-layout; **positions are not preserved
  across view switches** — the projections' topologies are unrelated, so there is nothing
  to carry over.

**Reset Layout** re-runs the full (async) layout for the last parsed graph (using the active
view's edge builder and layout options, and the **current** measured sizes) and is a no-op
before the first parse; the graph stays visible while it runs. The viewer then re-fits the
viewport (after a 50 ms delay — _observed, untested_).

> Pinned by: `src/hooks/__tests__/useGraphData.test.ts`

## 3. Layout (ELK — node placement)

Node placement is computed by ELK (`elkjs`, layered algorithm). ELK computes **placement
only** — edge geometry is not taken from it (§4). `getLayoutedElements` is a pure
function of the graph plus a size map: it does not estimate, and it does not read the
DOM. The hook owns the measure pass that produces that map (§5).

- `getLayoutedElements` is **async**: the elkjs bundle is dynamically imported on first use
  and layout runs on the main thread (graphs are small; no worker).
- Rank direction: explicit option → `GraphData.direction` → `"TD"`. The five
  `GraphDirection` values map to ELK `elk.direction` as `TD`/`TB` → `DOWN`,
  `BT` → `UP`, `LR` → `RIGHT`, `RL` → `LEFT`. Any other value is `DOWN`.
- Nested graphs (`contracts/graph-data.md`, Hierarchy) are laid out as ELK compound nodes.
  The root keeps `elk.hierarchyHandling: INCLUDE_CHILDREN`. Each container with children
  is laid out as its own layered graph (`elk.hierarchyHandling: SEPARATE_CHILDREN`) so a
  container can have a different rank direction from its parent. An empty container is a
  leaf as far as ELK is concerned and uses its measured chrome as its size. When a
  container carries `astData.direction`, that value is set as `elk.direction` on that
  compound node; when it is omitted, layout copies the parent's resolved direction onto
  the node. Container size is an ELK **output**: children plus `CONTAINER_PADDING` on the
  sides and bottom plus the measured header height as top padding. The measured chrome is
  a `MINIMUM_SIZE` so a title wider than the children is not clipped. React Flow nodes
  receive `parentId`, parent-relative coordinates, and `extent: parent` after this pass;
  container nodes also receive the ELK width/height so the frame matches the packed box.
- `elk.edgeRouting: ORTHOGONAL` stays set, because ELK consults edge routing when ordering
  nodes within a layer and it therefore improves **placement**. The route points ELK
  produces are **discarded**: they are not stored on the React Flow edges.
- Per-mode `layoutOptions` (ELK option map) merge into the root options (e.g. Use-Def's
  extra layer spacing). _(merging: observed, untested)_
- Node boxes given to ELK are the **measured** sizes from §5, quantized to the same
  integer lattice the router uses (`contracts/edge-routing.md`, Input quantization —
  a size is a rect at the origin). No estimated size is an ELK input. Use-Def
  instruction nodes additionally declare `FIXED_POS` ports at operand text offsets
  (`specs/llvm-use-def-view.md` §4); those offsets stay font-metric estimates, clamped
  to the measured width. The ports shape placement and decide which handle an edge
  attaches to. _(ports: observed, untested)_
- **Spacing promise.** After a full layout, the gap between adjacent live node rects in
  the same layer or consecutive layers is **at least** the configured node spacing
  (`NODE_NODE_SPACING` / `NODE_NODE_BETWEEN_LAYERS` in `src/utils/spacing.ts`). ELK's
  guarantee is a minimum: packing and alignment may leave more. Undershoot against the
  painted boxes is a bug; extra gap is not. The promise applies to full layouts (first
  parse, topology change, Reset Layout), not to content-only updates (§2).
- ELK options and the live router's clearances come from **one** module,
  `src/utils/spacing.ts`. `elk.spacing.edgeNode` / `edgeEdge` (and their between-layer
  counterparts) are derived from `NODE_MARGIN` so they cannot drift from the clearance
  the router actually keeps, even though ELK's own routes are discarded. Lane width for
  non-bundle separation is not in that module yet — it lands with #86.
- The layout is also where the structural back-edge flag is decided (§4).

> Pinned by: `src/utils/__tests__/layout.test.ts`,
> `src/utils/__tests__/spacing.test.ts`

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
  change caused by a content-only edit (§2), with no re-layout involved. Container nodes
  (`graph-group`) are included as rects so they can be endpoints, with `obstacle: false`
  so their interior is not a wall (`contracts/edge-routing.md`).
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
- **During a drag**, routes recompute continuously, throttled to animation frames, through
  **the same code path as at rest** — no incident-only mode and no catch-up pass at drag stop,
  so no edge is ever drawn against a rect the dragged node has already left and nothing jumps
  on drop. A pass does skip edges whose route cannot have changed, which is a pure
  optimization and not a second answer: the router's Locality guarantee makes reusing them
  identical to recomputing them, and `contracts/edge-routing.md` ("Narrowing a pass") states
  the three clauses a caller owes. The narrowing is what keeps a drag inside the frame budget;
  routing _everything_ every frame does not, which is why it is there.
  Measured out of band, full pass, region grid vs. the graph-wide grid it replaces (bare Node,
  warm, median of 9, 2026-08-11, this machine; ELK-layered-shaped graphs, 180×60 px nodes on a
  260×160 px grid): 60 nodes / 117 edges **5–7 ms** vs 9–17 ms, 180 / 370 **14–23 ms** vs
  48–104 ms, 400 / 840 **34–48 ms** vs 214–267 ms. Ranges are across repeated runs on a
  loaded machine, so treat them as an order of magnitude, not a number. Two things follow: the
  region grid is 2–5× cheaper than the graph-wide one at every size, and a full pass still
  exceeds the 16.7 ms budget from roughly 180 nodes, which the Use-Def view can reach since it
  emits one node per instruction. Cost depends on graph shape: on a fixture whose edges span
  the whole graph rather than joining adjacent layers, every region grows to nearly the graph
  and the advantage disappears (400 / 840: 1740 ms vs 1725 ms). Real IR graphs are layered.
  The in-suite 300 ms timing test is a catastrophic-regression guard, not a check of this
  budget.
- **An edge changes only when something near it changed.** Dragging a node re-routes the
  edges whose region it touches and leaves every other route byte-identical — the Locality
  guarantee of `contracts/edge-routing.md`, and the reason a drag no longer perturbs edges
  elsewhere in the graph. It holds for every edge except one that had to fall through to the
  contract's whole-graph retry, which is the rare case of a region offering no path at all
  (no edge in either default LLVM-IR example needs it). Measured on the Use-Def view of the
  default example (2026-08-11, replayed through the router from the app's ELK layout): dragging
  the `%0` argument node by 24 × 16 px changed 4 routes on the graph-wide grid — one of them an
  edge not touching the dragged node at all — against 3 on the region grid, all of them
  incident to it, and **no route outside the dragged node's reach changed at any drag
  distance**.
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
  radius is `BEND_RADIUS` in `src/utils/spacing.ts`, derived from `NODE_MARGIN`, never
  restated as a literal of its own.

  The shrink-to-fit in `roundedPath` (`min(bendRadius, inLen / 2, outLen / 2)`) stays as the
  safety valve, and it engages only where the layout genuinely leaves a corridor narrower
  than `2 × bendRadius`. What is deliberately _not_ done is making the router guarantee a
  minimum run length so the radius is always nominal: that would put a stroke-appearance
  constraint into the topology search and could make an edge unroutable for a cosmetic
  reason. Clearance and topology are the router's concern; stroke appearance is not.

- **Back edges:** after layout, an edge is flagged `data.isBackEdge` when it is a self-loop
  or its target sits entirely against the **root** rank direction, in absolute flow
  coordinates (parent-relative ELK positions are summed up the parent chain). For every
  root direction except `BT` that means the target lies entirely **above** the source
  ("colored + upward = loop-carried"). When the root is `BT`, the test is inverted: the
  target lies entirely **below** the source, so a bottom-to-top graph does not paint
  every forward edge as a loop. Nested container directions do not change this rule.
  Horizontal loops on `LR`/`RL` are not accented. The flag is **structural** — decided
  once from ELK's placement geometry and never re-derived from live rects — so colors
  do not flicker while a node is dragged; only geometry is live. Back edges render in
  the loop accent color (muted purple `#8250df`). The accent **recolors** the stroke
  and whatever markers the edge already has; it does not replace an open, circle, or
  cross marker with a closed arrow. An edge that is not painted (Mermaid `invisible`)
  does not take the accent. This accent is graph grammar, not shell chrome (§6.6: the
  chrome's only non-gray colors are the parse-status ones).
- **Hidden routed edges:** a routed edge with `hidden: true` is omitted from the routing
  pass and is not drawn. Mermaid invisible links use this (`specs/mermaid.md` §5); they
  remain in `GraphData` so ELK ranking still sees them.
- **Known limitations,** both accepted since the alternatives are a stale route or a second
  geometry generator: the final fallback for geometrically unroutable input does no obstacle avoidance
  (`contracts/edge-routing.md`), so dragging one node onto or nearly onto another can make
  a fallback edge visibly thread between the two boxes; and a content-only edit that grows
  a node can close a corridor that the last full layout had reserved, forcing a third edge
  to the fallback until the next full layout re-asserts the spacing promise (§3).
  _(Pinned by: `edgeRouter.clearance.test.ts`, `useEdgeRoutes.test.ts`; content-growth
  presentation remains observed, untested.)_
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
> flagging, no geometry stored on edges, accent recolors markers without replacing
> their kind), `src/hooks/__tests__/useGraphData.test.ts`
> (back-edge flag inherited on content-only updates),
> `src/utils/__tests__/converter.test.ts` (dashed chain/glue, markerStart/markerEnd,
> Mermaid stroke/arrowhead mapping).
>
> Also pinned by: `src/hooks/__tests__/useEdgeRoutes.test.ts` (a narrowed pass equals the
> full pass, including when a node stops obstructing an edge, when a far node reshapes a
> route found on the whole graph, and when a handle moves under a rect that did not).
>
> _(observed, untested)_: live-rect tracking while dragging and after content edits, the
> hook's context publication, the unmeasured-node omission, the midpoint label placement, the
> accent color, and the animation-frame throttling. The frame-budget figures are measured out
> of band, not by the test suite. Locality itself _is_ pinned, at the router boundary
> (`src/utils/__tests__/edgeRouter.test.ts`): what the suite cannot observe is only that the
> hook feeds the router the live rects. The overlap semantics are _specified, unimplemented_ —
> a different marker from the two above: there is nothing to observe and nothing to pin until
> #86–#88 land.

## 5. Node sizing (measure, then lay out)

Nodes size themselves. ELK never sees an estimate: it receives the sizes React Flow
measured after the nodes were mounted, quantized to the router's integer lattice (§3).

**Measure pass.** On a full layout (topology change or first parse):

1. `useGraphData` mounts the new nodes at the origin with `visibility: hidden` and **no
   edges** and **no `parentId`**. Each node is measured independently, including a
   container as its title chrome alone. The canvas ground (background dots, controls)
   stays; the graph itself is not shown. Edges are omitted rather than drawn between
   stacked origin boxes, so the unmeasured-node rule in §4 is not asked to stand in for a
   placeholder geometry.
2. React Flow measures each node's DOM box (`measured.width` / `measured.height`).
3. Once every node has a positive measured size, `GraphViewer` hands that map to
   `applyLayout`. `getLayoutedElements` runs ELK on the quantized sizes and commits
   positions, parent membership, and container sizes. Edges appear with that commit. A
   result whose generation is stale is discarded, as in §2.

Until step 3 commits, **no positioned graph is shown** — not an estimate-based preview,
and not a pile of overlapping origin nodes. Reset Layout skips this hide: the graph
stays visible and ELK re-runs against the current measurements.

**Wrapping.** Width clamps are CSS, in `ch`, not a font-metric pixel guess handed to ELK.
`nodeTextStyle.ts` owns the frame — every length and the font family (`font-mono` 12 px /
line height 16 px, paddings 8×6, border 1 px, radius 4 px, header band 20 px) — for every
node renderer, SelectionDAG included, and the wrap bounds: Mermaid 10–30 ch, LLVM 16–80 ch,
Use-Def code 8–80 ch. SelectionDAG nodes shrink-wrap their table; they have no char clamp.
Change the constant, never a literal.

**HighlightedCode.** LLVM node bodies and the Use-Def instruction card render through
`HighlightedCode.tsx`, which resets the user-agent block margin on Shiki's `<pre>` to `0`
before mounting it — otherwise that margin is part of the measured box — and makes Shiki's
`<pre>`/`<code>` inherit the node's font family rather than the user agent's generic
`monospace`, so code is set in the font the Use-Def port offsets are measured in. (Inline mode, used
by SelectionDAG's `CodeFragment.tsx`, strips the `<pre>`/`<code>` tags entirely; Mermaid
nodes render plain text and are unaffected.) Highlighting is async; the first layout uses
the first complete measurement. A later size change from highlighting is a content-only
size change: edges follow, positions do not.

Use-Def per-operand port _offsets_ still use `getFontMetrics` (`specs/llvm-use-def-view.md`
§4). That is handle placement along a side, not the box ELK packs.

> Pinned by: `src/hooks/__tests__/useGraphData.test.ts`,
> `src/utils/__tests__/layout.test.ts`,
> `src/components/Graph/common/__tests__/HighlightedCode.test.tsx`.
> Wrap bounds and the hidden measure pass: _observed, untested_ except as exercised by
> the layout/hook tests above.

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

- **Header**, left to right: the brand title ("IR Visualizer", semibold, in `ink`),
  the **mode selector**, the **view toggle**, then, pushed to the right edge, a **Clear**
  action and a **collapse** button, both icon-only (accessible names "Clear" and "Collapse
  panel"). At the initial 420 px panel width the header is a single row, even with the view
  toggle present. It may wrap only below that — as the panel approaches its 280 px minimum,
  or on a phone-width narrow-mode sheet — and Clear and collapse then wrap together.
- **Mode selector** lists the registry modes in `IR_MODES` insertion order
  (LLVM-IR, SelectionDAG, Mermaid).
- **View toggle**: when the active mode defines `views`, a `SegmentedControl` next to the
  mode selector lists them in registry order (LLVM-IR: CFG, Use-Def) with the active view
  selected; it is absent for single-view modes. It lives in the panel header, not in the
  canvas control cluster: it selects what is projected, not how the viewport is framed.
- **Clear** (an eraser icon) empties the editor (the subsequent parse of the empty string follows §1: e.g.
  an empty module is valid LLVM-IR, but empty Mermaid input is a parse error).
- **Body / Editor**: Monaco with Shiki `github-light` highlighting; the language follows
  `mode.editorLanguage` (`llvm` for LLVM-IR and SelectionDAG, `mermaid` for Mermaid). The
  editor surface is fully opaque.
- **Event containment**: the panel is a DOM sibling of the React Flow canvas (not a React
  Flow `<Panel>`), so canvas pan/zoom gestures do not reach it; a `stopPropagation` wheel
  handler on the panel root is an additional safety net.
- **Resize**: right-edge drag via `usePaneResize` — min 280 px, max 60 vw, initial 420 px.
  Wide mode only.
- **Collapse**: the panel collapses to a small floating pill, a default `Button` labeled
  `Code`, giving the graph the full viewport. The state is a
  session-local `panelOpen: boolean` (no persistence); the same flag drives wide and narrow
  mode. The pill sits **top-left in wide mode** and **bottom-left in narrow mode**.

> Pinned by: `e2e/smoke.spec.ts` (mode selection by visible label, the CFG/Use-Def
> toggle). Everything else in this subsection, including the mode order: _observed,
> untested_.

### 6.3 Status footer

Monospace text at the bottom of the panel, styled as compiler output. It is the only place
parse status is reported; there is no snackbar over the graph.

- Success: a check icon in `ok`, then `parsed · N nodes · M edges`.
- Failure: `error: <full message>` with a 2 px left rule in `error`. The message is **not
  truncated**; long messages wrap and scroll inside the footer, which caps at roughly 8
  lines. The error clears on the next successful parse (§1).
- Success with diagnostics: the success line, then **one line per diagnostic**, each
  `warning: line <N>: <message>` with a 2 px left rule in `warn`. The prefix is the only
  place severity is written — the parser's message carries no
  severity word (`contracts/ir-mode-registry.md`). Diagnostics are listed in the order the
  parse returned them, none is dropped, and the footer's line cap makes a long list scroll
  rather than truncate.
- `error` outranks `warn` on the left rule, and the two never appear together: a failed parse
  has no diagnostics (§1).

The `warning:` prefix is deliberately not `error:`, so that "did this input parse?" stays
answerable by looking for a single word. Color only restates what the words say: all footer
text, prefixes included, is in `ink-muted`, and the status colors mark only the left rule and
the check icon (§6.6).

> Pinned by: `e2e/smoke.spec.ts` (a parse error reaches the footer),
> `src/components/AppShell/__tests__/EditorPanel.test.tsx` (the three footer states and the
> severity the left rule carries). The exact success wording, the line cap, and the absence of
> truncation are _observed, untested_.

### 6.4 Canvas control cluster

A single floating row at the **bottom-right**: zoom in, zoom out, fit view, a 1 px divider,
then reset layout. The divider separates viewport operations from the position-destroying
reset (§2).

- `fitView` is called with a left `padding` equal to the current panel width plus its margin,
  using the @xyflow/react 12.10 object form (e.g. `fitView({ padding: { left: "436px" } })`),
  so "fit" centers the graph in the _visible_ area. The padding is `0` while the panel is
  collapsed. This applies to the initial fit, the fit-view button, and the re-fit after Reset
  Layout. Because layout is a measure-then-place pass (§5), the initial fit waits until
  the measured layout has been **committed** (not merely until `useNodesInitialized`, which
  fires on the hidden measure mount), not by the `fitView` prop (which would fire before
  any nodes exist). _(observed, untested)_
- The cluster stays clear of any bottom inset the shell reserves: in narrow mode with the
  sheet open it is lifted above the sheet by the sheet's height, and it returns to the
  viewport's bottom-right corner whenever that inset is `0`. _(observed, untested)_

### 6.5 Responsive narrow mode (viewport ≤ 768 px)

The canvas stays full-screen. The editor panel becomes a **bottom sheet** covering ~55 % of
the viewport height, toggled by the pill (bottom-left). There is no Code/Graph toggle. The
drag-resizer is wide-mode-only. _(observed, untested)_

### 6.6 Visual grammar

The shell chrome — editor panel, collapsed pill, canvas control cluster — is a quiet frame
around the canvas: neutral grays, system type, thin lines, and a single soft elevation. The
graph is the subject, so the chrome carries no accent color: wherever it shows a non-gray
color, that color reports parse status.

The language is implemented in one place. `src/theme.ts` holds the Mantine theme (primary
color, radius, component defaults) and the tokens below as CSS variables (`--app-<token>`;
the three status tokens are `--app-status-<token>`), which the `*.module.css` files next to
each component read.
`src/components/AppShell/shellTokens.ts` holds only the numbers the layout computes with
(panel margin and width bounds, the narrow-mode media query, the sheet ratio, the fit-view
padding, the motion duration). Every token value is a Mantine palette color, so the chrome
and Mantine's own components cannot drift apart.

| Token         | Value                     | Use                                                                             |
| ------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `ink`         | `gray.9`                  | Primary text; Mantine's text color (`theme.black`)                              |
| `ink-muted`   | `gray.7`                  | Secondary text: the status footer                                               |
| `line`        | `gray.3`                  | Borders of floating surfaces, internal dividers; Mantine's default border color |
| `surface`     | `white`                   | Panel, pill, and control-cluster surface                                        |
| `canvas`      | `gray.0`                  | The full-viewport canvas ground                                                 |
| `canvas-dots` | `gray.4`                  | The `<Background />` dots                                                       |
| `ok`          | `green.8`                 | Parse success only (check icon) — never decorative                              |
| `warn`        | `yellow.9`                | Recoverable parse diagnostics only (footer left rule) — never decorative        |
| `error`       | `red.8`                   | Parse failure only (footer left rule) — never decorative                        |
| `elevation`   | Mantine `shadow-sm`       | Floating chrome only: panel, pill, control cluster                              |
| `font-mono`   | Mantine's monospace stack | The status footer and the graph nodes (§7)                                      |

- **No accent**: the theme's primary color is `gray` at shade 7, so every place Mantine
  would draw its primary color — the focus ring, a focused input's border, the selected
  option in a dropdown — is neutral. `ok`, `warn` and `error` are the only non-gray colors,
  and they mark only non-text elements, at shades that reach 3:1 against white; no default
  `green` or `yellow` shade reaches the 4.5:1 that text needs, so text is always `ink` or
  `ink-muted`. The muted purple on back edges (§4) is graph grammar, not a chrome token.
- **Surfaces**: every surface is fully opaque (no translucency, no backdrop blur), bordered
  in `line`, rounded at Mantine's `sm` radius, and raised with `elevation`. The narrow-mode
  sheet rounds only its top corners (§6.5).
- **Typography**: no webfonts. The chrome uses Mantine's system sans-serif stack; monospace
  (`font-mono`) is reserved for the status footer, the editor, and the graph nodes.
- **Density**: controls are compact. Inputs, the view toggle, and buttons use Mantine's `xs`
  size, and icon-only buttons are borderless `subtle` gray `ActionIcon`s — the surface around
  them already has a border — that signal hover by fill and focus by the ring. The pill is
  the one exception: in narrow mode it grows to `md` so its touch target clears ~40 px.
- **Motion**: exactly one animation — the panel ⇄ pill morph, a Mantine `Transition`
  (`pop`, 180 ms, ease-out, growing out of the corner the surface is anchored to) on
  enter only, with an animated `fitView` recenter of the same duration. Both are disabled
  under `prefers-reduced-motion` (`respectReducedMotion` in the theme).
- **Color scheme**: fixed to light (`defaultColorScheme="light"`). Monaco (`github-light`)
  and the graph nodes assume a light ground; there is no dark mode.
- **Accessibility floor**: a 2 px focus-visible ring (primary `gray.7`) on all interactive
  chrome, keyboard operability, and WCAG AA contrast for all chrome text (`ink` and
  `ink-muted` both exceed 4.5:1 on `surface`).

Graph nodes speak the same language with their own grammar (§7). The shell chrome never
borrows a node's header band, because the editor panel is chrome around the canvas, not a
node.

_(§6.6 as a whole: observed, untested — the tokens are enforced by review, not by tests.)_

## 7. Node grammar

Nodes are drawn from the same tokens as the chrome (§6.6), so the graph and the frame
around it read as one system. The chrome's principle carries over with one difference: a
node is neutral gray unless a color **encodes a fact about the IR** — basic-block
membership, value kind, opName category. Nothing on a node is colored for decoration, and
the parse-status colors (`ok`, `warn`, `error`) never appear on the graph.

**Frame.** Every node renderer builds on one frame
(`src/components/Graph/common/NodeShell.tsx`; the container frame `GraphGroupNode.tsx`
and `SelectionDAGNode.tsx` reuse its styles):

- a fully opaque `surface` fill, a 1 px `node-line` border, and Mantine's `sm` radius
  (4 px); pill-shaped nodes (Mermaid terminals, the LLVM function header and exit, Use-Def
  values) use a pill radius instead;
- no elevation — `elevation` is reserved for floating chrome (§6.6), and a node lies on
  the canvas;
- `font-mono` at 12 px / 16 px, text in `ink`;
- an optional **header band** carrying the node's name (block label, global name,
  container title): full width, 20 px tall, a `node-header` fill over a `line` hairline,
  the label semibold 11 px in `ink-muted`.

**Tokens.** Two tokens are added to §6.6's for nodes. `node-line` is darker than the
chrome's `line` because a node has no elevation to lift it: it reaches 3:1 against
`canvas`, the floor for a non-text boundary.

| Token         | Value    | Use                                     |
| ------------- | -------- | --------------------------------------- |
| `node-line`   | `gray.6` | Node and container borders, table rules |
| `node-header` | `gray.0` | Header band fill                        |

**Category tints.** Where a node encodes a category by color, the category is a Mantine
hue and its fill is that hue at shade 2; text on a tint stays `ink`, so no hue has to
reach text contrast (same rule as §6.6). The hue tables are per IR:
Use-Def block badges (`specs/llvm-use-def-view.md` §4) and SelectionDAG opName categories
(`specs/selectiondag.md` §4). `red` is never a category hue, so no node reads as an error.
Two single-purpose marks follow the same restraint: a Use-Def value node's kind is a hue
at shade 0 fill with shade 6 border, and a Use-Def terminator is set apart by an `ink`
border — weight, not hue.

**Shape.** Mermaid families differ by border style and radius, never by color
(`specs/mermaid.md` §5).

**Handles are invisible.** Every node component declares its `Handle`s at opacity 0; an
edge ends on the node's border, and nothing marks the port. Handle ids and the points §4
derives from them are part of the edge contract, not of the look.

**Where the values live.** Lengths and the font family are TypeScript constants
(`nodeTextStyle.ts`, and per-IR `*StyleConstants.ts`), because the Use-Def port offsets
compute with them (§5). Paint — colors, weights — lives in each component's
`*.module.css`, read from the `--app-*` variables in `src/theme.ts`; category hues are
listed in TypeScript and rendered as `var(--mantine-color-<hue>-2)`.

_(§7: observed, untested — visual, covered by the node Storybook stories; the category
tables are pinned where each IR spec says.)_
