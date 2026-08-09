# Plan: Live edge routing (edge geometry as a function of live node rects)

- **Status:** Planned 2026-08-09.
- **Motivation:** `plans/2026-08-elk-edge-routing.md` fixed the _shape_ of edges but
  tied it to a snapshot of the layout. The moment a user drags a node, the picture
  degrades into a second, worse visual grammar. This plan removes the snapshot —
  and with it the whole "stale route" concept — by making edge geometry a pure
  function of the live node rectangles.

## 1. Problem

Today LLVM and Mermaid edges are drawn by `src/components/Graph/RoutedEdge.tsx`,
which chooses between two completely different geometry generators:

- if both endpoint nodes are still within 0.5 px (`STALE_TOLERANCE`) of the
  position recorded at layout time, it draws the polyline ELK computed
  (`edge.data.route.points`);
- otherwise it falls back to React Flow's `getSmoothStepPath` between the live
  handles.

Confirmed in the running app on 2026-08-09:

1. **The transition is a discontinuity.** Moving a node ~40 px flips its edges to a
   visibly different shape — a change out of all proportion to the input.
2. **The fallback is wrong, not merely plainer.** Fallback edges pass _behind_ node
   boxes, gain S-kinks, and a Mermaid back edge (`Fixed? -->|No| Debug it`)
   collapses into a degenerate hook, because a smoothstep from a bottom source
   handle to a top target handle is degenerate when the target sits above the
   source. This is the same artifact class `plans/2026-08-elk-edge-routing.md` was
   written to eliminate.
3. **Two grammars in one picture.** Edges the user did not touch keep the ELK look,
   so a single screenshot shows both languages at once.
4. **The only repair is destructive.** _Reset layout_ restores routed rendering, but
   it also recomputes node positions and therefore discards the arrangement the
   user just made by hand.
5. **Staleness happens with no drag at all.** A content-only edit can change a
   node's measured size while the stored route is carried forward unchanged;
   `specs/graph-view.md` §2 currently documents this as accepted drift.

## 2. Agreed decisions

**Edge geometry becomes a pure function of the live node rectangles.**

1. **A self-contained orthogonal router owned by this repo** computes edge geometry
   at render time from React Flow's **measured** rects
   (`internals.positionAbsolute` and `measured.width` / `measured.height`).
2. **ELK keeps doing node placement only.** Its edge route points are no longer
   stored on edges and are no longer rendered.
3. **No "stale route" concept and no second path generator.** One grammar always,
   including mid-drag. Problem 5 disappears for free: measured rects already
   reflect a size change.
4. **`Reset layout` keeps its current meaning** (re-run ELK placement). It simply
   stops being the only way to repair edge rendering.
5. **Mid-drag routing.** Routes recompute while a node is being dragged, throttled
   to animation frames. Documented degradation if a frame-budget problem is
   measured later: during a drag, re-route only the edges incident to a moved node
   and run a full pass on drag stop.
6. **Back-edge coloring stays structural.** `data.isBackEdge` is still decided at
   layout time from ELK's geometry, not re-derived from live rects, so colors do
   not flicker while dragging. Only _geometry_ is live.
7. **ELK options unchanged.** `elk.edgeRouting: ORTHOGONAL` stays set: ELK uses
   edge routing when ordering nodes within a layer, so it still improves placement
   even though the route points are now discarded.
8. **SelectionDAG is untouched.** It keeps React Flow's built-in `default` edge and
   handle-anchored beziers.
9. **Obstacles are node rectangles only.** Edge labels and other edges are not
   obstacles; an edge-crossing penalty is out of scope.
10. **Performance budget.** A synthetic 60-node / 80-edge graph must route in under
    50 ms per full pass, asserted in a unit test.
11. **No visual-regression harness** is added by this change. Acceptance rests on
    unit-level geometric assertions, the existing Playwright smoke test, and manual
    browser checking.

## 3. Design

### 3.1 Router algorithm — sparse Hanan grid

1. Inflate every node rect by `nodeMargin`.
2. Candidate X lines = each inflated rect's left and right edge, plus each
   endpoint's x. Candidate Y lines likewise. The routing grid is their cross
   product.
3. A grid segment is traversable when it does not cross the interior of any
   inflated rect. The source and target node's own rects are exempt for the
   segments that leave and enter them.
4. Per edge, run Dijkstra / A\* over that grid with
   `cost = length + bendPenalty * turns`.
5. Endpoints are the live handle positions, pushed outward along the handle's side
   by `nodeMargin` before joining the grid.
6. Self-loops are synthesized (see "Self-loops" below).
7. If no path exists, emit the deterministic fallback below. Never a degenerate
   hook.

**Determinism is a hard requirement:** identical input rects must produce identical
points. No randomness, no dependence on object iteration order.

#### Endpoints are exact

The returned polyline **starts exactly at `RouteRequest.sourcePoint` and ends exactly
at `RouteRequest.targetPoint`.** The `nodeMargin`-pushed point of step 5 is an
_interior bend_, not an endpoint: it appears as `points[1]` (and symmetrically as the
second-to-last point), never as `points[0]`. The drawn edge therefore visually touches
its handle and no other layer has to close a gap.

#### Tie-breaking

Equal-cost paths are resolved by a **fixed, documented total order**. Among all
candidate paths, compare by, in order:

1. total cost (`length + bendPenalty * turns`);
2. number of bends;
3. the point sequence compared lexicographically by `(x, y)` — i.e. compare
   `points[0].x`, then `points[0].y`, then `points[1].x`, and so on; a shorter
   sequence that is a prefix of a longer one sorts first.

The smallest under that order wins. The chosen shape is therefore a documented
property of the router, not an implementation accident, and this is what the
determinism requirement rests on.

#### Self-loops — the node's **right** side

A self-loop is synthesized rather than routed, matching the shape
`selfLoopPoints()` in `RoutedEdge.tsx` already draws
(`lane = rect.x + rect.width + selfLoopGap`). The loop:

- leaves the node's **bottom** edge at **75 % of the node's width**,
- runs **right** to the lane at `rect.x + rect.width + selfLoopGap`,
- runs **up** past the node,
- comes back **left**, and re-enters the node's **top** edge at the same **75 %**
  width offset.

The side is the **right** side, always. It is not chosen per node and not derived
from free space.

#### No-path fallback

Fully specified so it is directly assertable. Let

- `S` = `sourcePoint` pushed `nodeMargin` outward along `sourceSide`,
- `T` = `targetPoint` pushed `nodeMargin` outward along `targetSide`.

The fallback polyline is `sourcePoint → S → (elbow) → T → targetPoint`, where the
elbow is:

- **omitted** when `S` and `T` already share an x or a y;
- `(S.x, T.y)` when `sourceSide` is `"top"` or `"bottom"` (a vertical exit);
- `(T.x, S.y)` when `sourceSide` is `"left"` or `"right"` (a horizontal exit).

Consecutive duplicate points are dropped.

#### Missing nodes, and unmeasured endpoints

`routeEdges` is a pure function over `RouteNodeRect[]`; it has no way to know that a
node is "unmeasured". The router's rule is therefore stated purely in terms of its
inputs, and the unmeasured case is a consequence of it, not a separate rule.

**The router rule.** A `RouteRequest` whose `source` or `target` id is **not present
in the `nodes` array** produces **no entry** in the returned map. `routeEdges` does
not throw and does not substitute a default rect for the missing node — it simply
omits that request. Self-loops are subject to the same rule: a self-loop whose node
is absent from `nodes` produces no entry.

**The consequence in the app.** `useEdgeRoutes` (§3.4) is what implements the
unmeasured-endpoint behavior on top of that rule: it **omits nodes React Flow has not
measured yet** from the `RouteNodeRect[]` it builds, so those nodes' edges naturally
resolve to no entry and are **not drawn** for that frame. They appear as soon as
measurement lands. There is deliberately **no placeholder shape**: introducing one
would recreate exactly the two-generator problem this plan exists to remove.

### 3.2 Frozen module boundary

The router implementation and its test suite are written in parallel against this
boundary. It is frozen — names and signature are reproduced here verbatim and must
not be "improved".

```ts
// src/types/edgeRouting.ts
export interface Point {
  x: number;
  y: number;
}
export type RouteSide = "top" | "right" | "bottom" | "left";

export interface RouteNodeRect {
  id: string;
  x: number;
  y: number; // absolute top-left
  width: number;
  height: number;
}

export interface RouteRequest {
  id: string; // React Flow edge id
  source: string;
  target: string;
  sourcePoint: Point; // absolute handle position
  targetPoint: Point;
  sourceSide: RouteSide;
  targetSide: RouteSide;
}

export interface EdgeRouterOptions {
  nodeMargin?: number; // default 16
  bendPenalty?: number; // default 30
  selfLoopGap?: number; // default 24
}

// src/utils/edgeRouter.ts
export const routeEdges: (
  nodes: RouteNodeRect[],
  requests: RouteRequest[],
  options?: EdgeRouterOptions,
) => Map<string, Point[]>; // keyed by RouteRequest.id, >= 2 points, orthogonal
```

### 3.3 Layout module (`src/utils/layout.ts`)

- `getLayoutedElements` keeps running ELK asynchronously and keeps returning node
  positions and `data.isBackEdge`.
- It **stops** writing `edge.data.route`. The `{ points, sourcePos, targetPos }`
  shape and the layout-position bookkeeping it existed for are removed.
- ELK options are unchanged (§2 decision 7), including the Use-Def view's
  `FIXED_POS` operand ports: ports still shape placement and still determine which
  handle an edge attaches to.

### 3.4 Where the routing pass runs (`src/hooks/useEdgeRoutes.ts`)

`routeEdges` takes **all** nodes and **all** requests in one call, so it cannot be
invoked from a per-edge component — `RoutedEdge` does **not** call the router.

The design is **one routing pass per graph**:

- A new hook `src/hooks/useEdgeRoutes.ts` reads React Flow's store (measured rects
  and live handle positions), builds the `RouteNodeRect[]` / `RouteRequest[]` inputs,
  and calls `routeEdges` **once** per pass.
- It publishes the resulting `Map<string, Point[]>` through a React context.
- `RoutedEdge` looks up its own entry by edge id and renders it. An edge with no
  entry is not drawn (§3.1, "Unmeasured endpoints").
- The pass is throttled to animation frames, which is what makes mid-drag routing
  affordable (§2 decision 5).

### 3.5 Edge rendering (`RoutedEdge.tsx`)

- `roundedPath` and `midpoint` are kept as-is.
- `near()` / `STALE_TOLERANCE` and the `getSmoothStepPath` branch are deleted, along
  with the `RoutedEdgeData.route` field.
- Points are read from the context published by `useEdgeRoutes` (§3.4) — the same
  source for every edge, including the one being dragged.
- Back-edge styling and label placement are unchanged; the label still sits at the
  polyline's arc-length midpoint.

### 3.6 Graph updates (`useGraphData`)

- `inheritRoutedEdgeData` no longer carries a route forward — only `isBackEdge`
  survives a content-only update, and it is the structural flag from the last full
  layout.
- The `nodesRef`/`edgesRef` mirroring stays. `updateGraph` must not depend on
  `nodes`/`edges` state directly: an unstable `updateGraph` identity previously
  caused an infinite re-parse loop.

## 4. Steps

1. Docs (this plan; `specs/graph-view.md` §2–§4, `architecture.md`).
2. `src/types/edgeRouting.ts` + `src/utils/edgeRouter.ts` implementing §3.2
   verbatim, with `src/utils/__tests__/edgeRouter.test.ts` covering orthogonality,
   exact endpoints, obstacle avoidance, tie-breaking and determinism, the
   right-side self-loop, the no-path fallback, omission of requests naming a node
   absent from `nodes`, and the 60-node / 80-edge performance budget.
3. `src/hooks/useEdgeRoutes.ts` + its context (§3.4); consume it in
   `RoutedEdge.tsx` and delete the staleness check and the smoothstep fallback.
4. Drop route storage from `layout.ts` and route inheritance from `useGraphData`;
   update `layout.test.ts` and `useGraphData.test.ts` accordingly.
5. `npm run test:run`, `npm run format`, `npm run lint`; manual browser check of all
   four views, including a drag of a node in each.

## 5. Risks and mitigations

- **Per-frame routing cost.** Mitigated by the 50 ms budget test (§2 decision 10)
  and the documented degradation path (§2 decision 5): incident-edge-only routing
  during a drag, full pass on drag stop.
- **Grid blow-up on dense graphs.** The Hanan grid is O(nodes²) segments in the
  worst case; the budget test is the guard, and the router is a pure function so it
  can later be memoized on the rect set without changing its boundary.
- **Router output differing from ELK's chosen channels.** Accepted: consistency with
  itself matters more than agreement with the placement engine, and ELK's routes are
  no longer visible anywhere.
- **Determinism regressions** (e.g. iterating a `Map` built in input order but keyed
  by object identity) are the most likely silent bug; `edgeRouter.test.ts` asserts
  point-for-point equality across repeated and reordered runs.

## 6. Rejected alternatives

1. **Re-running ELK with fixed or interactive positions** to re-route on drag stop.
   `org.eclipse.elk.fixed` does not do orthogonal routing, and `elk.layered` with
   INTERACTIVE strategies re-snaps node coordinates onto layers — i.e. it moves the
   user's nodes.
2. **Removing free node placement**, treating a drag as a reorder intent that always
   triggers a full re-layout.
3. **Keeping the two-generator design** and only making the smoothstep fallback avoid
   node boxes. This still leaves two visual grammars in one picture.
4. **Deriving back-edge coloring from live rects.** Colors would flicker mid-drag;
   the flag stays structural (§2 decision 6).

## 7. Out of scope

- Edge-crossing penalties and edge labels as routing obstacles (§2 decision 9).
- A visual-regression harness (§2 decision 11).
- SelectionDAG edge rendering (§2 decision 8).
- `GraphViewer`'s `InitialFit`, which fits the view only once per mount and so
  leaves a newly switched IR mode un-fitted. A real, separate defect found during
  the same investigation; not part of this change.
