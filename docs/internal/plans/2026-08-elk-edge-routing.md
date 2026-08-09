# Plan: ELK-routed edges (replace Dagre + hand-drawn edge paths)

- **Status:** Implemented 2026-08-09.
- **Motivation:** Edge rendering is the app's weakest surface and has resisted
  repeated point fixes. This plan replaces the mechanism, not the parameters.

## 1. Problem

Three structural defects, confirmed on the LLVM CFG and Use-Def views:

1. **`BackEdge.tsx` hardcodes a shape.** A back edge is drawn as two fixed
   ellipse arcs (`rx=90 / ry=50`) joined by a bezier, always bulging 180 px to
   the right of the source, regardless of node sizes, distance, or what else
   occupies that space. This is the "balloon" artifact. No parameter tuning can
   fix a shape that ignores the layout.
2. **Layout and rendering are disconnected.** Dagre computes edge routes
   (`points`) that avoid nodes; `layout.ts` throws them away and lets React
   Flow draw handle-to-handle parametric curves. Edges therefore cross through
   nodes the layout engine had carefully avoided.
3. **One handle per side.** Every node exposes exactly one hidden target handle
   (top center) and one source handle (bottom center), so a back edge must
   leave the _bottom_ of its source and enter the _top_ of a target that sits
   _above_ it — geometrically forcing the wrap-around path. Use-Def phi inputs
   (`[ %v, %bb ]` pairs) have no structural representation at all; they are
   distinguishable only by a dashed stroke and a text label.

Dagre itself is effectively unmaintained and its edge routing is rudimentary
(no orthogonal mode, no ports, poor self-loops), so investing further in it is
throwing good effort after bad.

## 2. Agreed decisions

Discussed and agreed with the project owner (2026-08-09):

1. **Replace Dagre with ELK (`elkjs`)** as the single layout engine for all
   modes. ELK's layered algorithm does real orthogonal edge routing (channel
   routing that avoids nodes, crossing minimization), explicit cycle handling,
   self-loop routing, edge-label placement, and fixed-position **ports**.
2. **Node dragging keeps working, degraded.** A routed edge whose endpoint
   node has moved from its layout position falls back to a live parametric
   path (smoothstep); **Reset layout** restores the fully routed picture.
   Content-only edits preserve positions and keep the stored routes.
3. **Use-Def edges land on per-operand ports.** Instruction cards expose one
   target port per used value, positioned at that operand's character offset in
   the monospace text (and a source port under the defined name). A phi's
   incoming edges therefore point at the exact `[ %v, %bb ]` slot they feed,
   the same structural idiom SelectionDAG already uses. The CFG view keeps
   single top/bottom connection points for now (successor ports are possible
   follow-up work).

## 3. Design

### 3.1 Layout module (`src/utils/layout.ts`)

- `getLayoutedElements(graph, options)` becomes **async** and runs ELK
  (`elkjs`'s bundled build, dynamically imported so the ~350 KB gzip dependency
  stays out of the initial chunk; graphs are small, so main-thread layout is
  fine and no worker is used).
- ELK options: `algorithm: layered`, `elk.direction` from `TD`/`LR`,
  `elk.edgeRouting: ORTHOGONAL`, spacing from the mode's `layoutOptions`
  (replacing `dagreOptions` in the registry).
- Node sizes still come from `converter.ts` estimation. Use-Def instruction
  nodes additionally declare fixed-position ELK ports computed from the same
  font metrics the renderer uses.
- Output: node positions, plus **per-edge routes** — the ELK section's
  `startPoint / bendPoints / endPoint` — stored on the React Flow edge as
  `edge.data.route = { points, sourcePos, targetPos }` where
  `sourcePos`/`targetPos` are the endpoint nodes' layout positions (top-left),
  recorded for staleness detection.
- **Back-edge flag:** after layout, an edge is a back edge when it is a
  self-loop or its target node lies entirely above its source node. Stored as
  `edge.data.isBackEdge`; this is a styling input, not a routing input (ELK
  already routed it).

### 3.2 Edge rendering (`RoutedEdge.tsx`)

One custom edge type, `routed`, replaces both `BackEdge.tsx` and
`CustomBezierEdge.tsx` (deleted):

- Draws `data.route.points` as an orthogonal polyline with rounded corners.
- **Staleness check:** via `useInternalNode`, compares each endpoint node's
  current position with the recorded layout position. If either moved (drag),
  the edge falls back to `getSmoothStepPath` between the live handle
  positions. Reset layout re-runs ELK and restores routes.
- **Self-loops:** if ELK yields no usable section for a self-loop, the edge
  synthesizes a small orthogonal loop hugging the node's right side from the
  node's measured rect (also used in the stale/fallback state).
- Labels (phi edges) render at the route's midpoint via `BaseEdge`'s
  label support.
- **Back-edge styling:** `data.isBackEdge` edges draw in the loop accent color
  (muted purple `#8250df`) with a matching arrowhead — the visual language is
  "colored + upward = loop-carried / control-flow back edge". This is a
  graph-grammar color, deliberately outside the shell chrome's gray palette
  (which still has no accent token).
- SelectionDAG keeps its handle-anchored bezier look via React Flow's built-in
  `default` edge (`pathOptions.curvature`), so `CustomBezierEdge.tsx` is not
  needed there either. ELK supplies its node positions like Dagre did.

### 3.3 Registry contract changes

- `dagreOptions?: Partial<dagre.GraphLabel>` → `layoutOptions?:
Record<string, string>` (ELK layout options) on modes and views.
- `IREdgeBuilder` loses `classifyEdgeType` (it existed to pick between the two
  hand-drawn edge shapes from node positions). A mode now supplies only
  `buildReactFlowEdge(edge)`; the routed/back-edge distinction is computed by
  the layout module from final geometry. SelectionDAG's "keep previous type"
  rule disappears with the classification itself.

### 3.4 Async plumbing (`useGraphData`)

- Topology-changed updates and Reset layout `await` the ELK promise behind a
  generation counter; a newer parse invalidates an in-flight layout.
- Content-only updates stay synchronous: positions are preserved and each
  rebuilt edge inherits the previous edge's `data.route`/`isBackEdge` by id.
  (A content edit can change a node's _size_, which routes don't track; the
  next full layout corrects this. Accepted.)
- The initial `fitView` moves off the `fitView` prop: with async layout the
  first render has zero nodes, so `GraphViewer` fits once via
  `useNodesInitialized` after the first layout lands (same padding rules,
  `specs/graph-view.md` §6.4).

### 3.5 Use-Def ports

- `LLVMUseDefInstructionData` gains `uses: string[]`.
- The builder sets `targetHandle: "u-<name>"` on every use-def edge, and the
  instruction card renders one target `Handle` per used name at the operand's
  first occurrence offset (`getFontMetrics` char width — the same metric the
  size estimator uses), plus a source `Handle` under the defined name. Names
  that cannot be located in the text fall back to the default top/bottom
  handles.
- The layout module mirrors the same offsets as ELK `FIXED_POS` ports so the
  routed edges aim at the exact operand slot.

## 4. Steps

1. Docs (this plan; `specs/graph-view.md` §2–§4, `specs/llvm-use-def-view.md`
   §2.1/§4, `contracts/ir-mode-registry.md`).
2. Swap `dagre` → `elkjs`; rewrite `layout.ts`; registry `layoutOptions`.
3. Async plumbing in `useGraphData` + `useNodesInitialized` fit.
4. `RoutedEdge.tsx`; delete `BackEdge.tsx` / `CustomBezierEdge.tsx`;
   back-edge accent.
5. Use-Def ports (AST field, builder handles, node component, ELK ports).
6. Update unit/hook tests (async layout, new edge contract); `npm run
test:run`, `lint`, `format`; visual verification of all four views.

## 5. Risks and mitigations

- **elkjs bundle size** (~1.4 MB raw): dynamic import; only loaded with the
  first layout. Worker offloading deferred until a graph is actually slow.
- **Async races:** generation counter (§3.4); tests cover the
  parse-during-layout case.
- **ELK self-loop output shape** is the least-documented corner: the renderer
  has a synthesized-loop fallback either way (§3.2).
- **Route staleness after content-only size changes:** accepted, documented;
  fallback rendering keeps edges attached (endpoints come from live handles).

## 6. Out of scope

- Node visual redesign (height/padding/header chip) — separate follow-up
  change under the same "engineer tool" direction.
- CFG successor ports (true/false branch ports on terminators).
- Overlaying use-def information on the CFG view.
