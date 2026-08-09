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
   to animation frames. The degradation this decision originally held in reserve
   is now **required, not contingent**: during a drag, re-route only the edges
   incident to a moved node, and run a full pass on drag stop. Measurement forced
   it — a full pass exceeds the 16.7 ms animation-frame budget at around 180
   nodes (§5), and the Use-Def view emits one node per instruction, so that is a
   reachable size for a real function. It lives in `useEdgeRoutes` (§3.4), not in
   the router; the module boundary in §3.2 does not change.
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
    50 ms per full pass. The budget is verified **out of band** — bare Node, warm,
    median of N — because a wall-clock assertion inside a parallel vitest run
    measures contention as much as it measures the router. The in-suite test still
    routes that graph but asserts only a generous **300 ms** ceiling, as a
    catastrophic-regression guard rather than a budget check.
11. **No visual-regression harness** is added by this change. Acceptance rests on
    unit-level geometric assertions, the existing Playwright smoke test, and manual
    browser checking.

## 3. Design

### 3.1 Router algorithm — sparse Hanan grid

1. Inflate every node rect by `nodeMargin`.
2. **The grid is seeded per edge.** Candidate X lines = each inflated rect's left
   and right edge, plus the four x coordinates of _the edge being routed_ — its
   raw `sourcePoint` / `targetPoint` and its `nodeMargin`-pushed `S` / `T`
   (step 5). Candidate Y lines likewise. The routing grid is their cross product.
   Seeding from that one edge rather than from every request's endpoints is what
   makes "reordering `requests` changes no individual route" hold structurally
   instead of by luck; including the pushed points guarantees `S` and `T` are
   grid vertices even for a handle that does not sit exactly on its node's
   boundary.
3. A grid segment is traversable when it does not cross the interior of any
   inflated rect. Only the strict interior blocks: a segment lying exactly along
   an inflated rect's edge is traversable. The source and target node's own rects
   are exempt **only for the segments incident to `S` and `T`** — the ones that
   leave and enter them. The exemption is both restrictive and **per endpoint**:
   the source rect is exempt only for segments incident to `S`, the target rect
   only for those incident to `T`, and every other segment treats both as
   obstacles. That is what makes "a route never crosses the interior of its own
   endpoint nodes" true — **of searched routes**. See "Own-node clearance is a
   searched-route property" below for why the fallback cannot share it.
4. Per edge, run Dijkstra / A\* over that grid with
   `cost = length + bendPenalty * turns`, where **turns are counted over the whole
   returned polyline, stubs included**: leaving the source handle in any direction
   other than its outward normal costs a bend, and so does the final transition
   from `T` into `targetPoint`. Without that the router exits handles sideways for
   free, which looks wrong.
5. Endpoints are the live handle positions, pushed outward along the handle's side
   by `nodeMargin` before joining the grid.
6. The returned polyline is `sourcePoint → S → (bends) → T → targetPoint`.
   Collinear interior vertices are collapsed, so the interior points are the bends
   — but **`S` and `T` are never dropped**, which is what keeps `points[1]` the
   pushed point even on a dead-straight route ("Endpoints are exact" below). A
   naive "collapse every collinear point" deletes `S` and breaks that rule.
   Consecutive duplicate points are dropped.
7. Self-loops are synthesized (see "Self-loops" below).
8. If no path exists, emit the deterministic fallback below. Never a degenerate
   hook — made precise as the no-immediate-reversal rule below, which binds every
   returned polyline, not just the fallback.

**Determinism is a hard requirement:** identical input rects must produce identical
points. No randomness, no dependence on object iteration order.

#### Endpoints are exact

The returned polyline **starts exactly at `RouteRequest.sourcePoint` and ends exactly
at `RouteRequest.targetPoint`.** The `nodeMargin`-pushed point of step 5 is an
_interior bend_, not an endpoint: it appears as `points[1]` (and symmetrically as the
second-to-last point), never as `points[0]`. The drawn edge therefore visually touches
its handle and no other layer has to close a gap.

**Self-loops are exempt from this rule.** They are synthesized from the node rect
(see "Self-loops" below), so their first and last points are the 75 %-width offsets
on the node's bottom and top edges and their `sourcePoint` / `targetPoint` are
ignored entirely. The two rules genuinely conflict — React Flow's default bottom
handle is centred, not at 75 % — and the self-loop shape is the more specific rule,
so it wins. This subsection governs routed (searched) edges only.

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

The order above is the specification. As an **implementation guard**, the router
compares costs with a 1e-9 epsilon so that two geometrically equal costs
accumulated in a different summation order still tie on the first key and fall
through to the bend and lexicographic keys, instead of being separated by float
noise. That is a detail of how the documented order is realised, not a fourth
rule — nothing about the router's contract depends on the epsilon's value.

#### Self-loops — the node's **right** side

A self-loop is synthesized rather than routed, reproducing the shape
`selfLoopPoints()` in `RoutedEdge.tsx` already draws. For a node rect
`(x, y, w, h)` the polyline is exactly these **six** points, with
`laneX = x + w + selfLoopGap`:

| #   | point                             |                            |
| --- | --------------------------------- | -------------------------- |
| 0   | `(x + 0.75w, y + h)`              | leaves the **bottom** edge |
| 1   | `(x + 0.75w, y + h + nodeMargin)` | steps clear of the node    |
| 2   | `(laneX, y + h + nodeMargin)`     | runs **right** to the lane |
| 3   | `(laneX, y - nodeMargin)`         | runs **up** past the node  |
| 4   | `(x + 0.75w, y - nodeMargin)`     | comes back **left**        |
| 5   | `(x + 0.75w, y)`                  | re-enters the **top** edge |

At the default options (`nodeMargin` 16, `selfLoopGap` 24) this is pixel-identical
to what the app draws today — which is the point of anchoring the shape to the
existing function. The two formerly hardcoded `16`s are the `nodeMargin` option.

Points 1 and 4 are not decoration: without them the first horizontal segment would
run along `y = rect.y + rect.height`, i.e. exactly on the node's own bottom border.

The side is the **right** side, always. It is not chosen per node and not derived
from free space. `sourcePoint` and `targetPoint` play no part — see the exemption
under "Endpoints are exact".

#### No-path fallback

Fully specified so it is directly assertable. Let

- `S` = `sourcePoint` pushed `nodeMargin` outward along `sourceSide`,
- `T` = `targetPoint` pushed `nodeMargin` outward along `targetSide`.

and let `n_s` / `n_t` be the outward normals of `sourceSide` / `targetSide`, and
`g = selfLoopGap`. The fallback is a **skeleton plus an invariant**, not a list of
branches:

```
sourcePoint → S → P1 → …connector… → P2 → T → targetPoint
```

- `P1` = `sourcePoint` pushed `nodeMargin + g` outward along `sourceSide`
  (i.e. `S + n_s·g`) — the polyline always steps _further out_ before going
  anywhere;
- `P2` = `targetPoint` pushed `nodeMargin + g` outward along `targetSide`
  (i.e. `T + n_t·g`) — the polyline always approaches `T` from outside.

**Why the skeleton is the whole trick.** `sourcePoint → S → P1` runs along `+n_s`
throughout and `P2 → T → targetPoint` runs along `−n_t` throughout, so neither
mandated stub can ever reverse — the vertices at `S` and `T` are collinear, not
corners. That reduces the entire no-reversal problem to two conditions on the
connector, which is what makes this construction closed rather than patchable:

- the connector's **first** segment must not run along `−n_s`;
- the connector's **last** segment must not run along `+n_t`.

**Connector.** Candidates are generated in the fixed order below and the **first
one whose full polyline satisfies the no-reversal rule wins**. All coordinates are
exact, so the expected polyline is recomputable without reference to the code.
Write `dx = P2.x − P1.x`, `dy = P2.y − P1.y`.

| #   | Candidate      | Intermediate points                                        | Offered when          |
| --- | -------------- | ---------------------------------------------------------- | --------------------- |
| 1   | direct         | _(none)_                                                   | `dx = 0` or `dy = 0`  |
| 2   | along-exit     | `(P1.x, P2.y)` if `n_s` vertical, else `(P2.x, P1.y)`      | `dx ≠ 0` and `dy ≠ 0` |
| 3   | across-exit    | `(P2.x, P1.y)` if `n_s` vertical, else `(P1.x, P2.y)`      | `dx ≠ 0` and `dy ≠ 0` |
| 4   | dog-leg **+x** | `(Xp, P1.y)`, `(Xp, P2.y)` with `Xp = max(P1.x, P2.x) + g` | always                |
| 5   | dog-leg **+y** | `(P1.x, Yp)`, `(P2.x, Yp)` with `Yp = max(P1.y, P2.y) + g` | always                |
| 6   | dog-leg **−x** | `(Xn, P1.y)`, `(Xn, P2.y)` with `Xn = min(P1.x, P2.x) − g` | always                |
| 7   | dog-leg **−y** | `(P1.x, Yn)`, `(P2.x, Yn)` with `Yn = min(P1.y, P2.y) − g` | always                |
| 8   | rectangle      | `P1 + l·g`, `P1 + l·g + n_s·g`, `P1 + n_s·g`               | `P1 = P2`             |

Candidate 2 is tried before 3 so a route continues along its exit axis when that
is legal, which reads as a plain L rather than an immediate sidestep. The dog-legs
are ordered **+x, +y, −x, −y**, so the positive side is preferred exactly as the
right-side self-loop convention requires.

**The negative rungs are reachable and must not be pruned.** They are selected in
**8 of the 144** combinations, all of them the degenerate ones where `P1` and `P2`
share a coordinate. That is the key point: candidates 2 and 3 are offered _only_
when `dx ≠ 0` **and** `dy ≠ 0`, so in an axis-aligned configuration the ladder
falls straight from `direct` to the dog-legs, and the positive dog-leg then either
arrives along `+n_t` or collapses to a zero-length leg. Worked example —
`sourceSide: "top"`, `targetSide: "left"`, `sourcePoint (100, 100)`,
`targetPoint (140, 200)`, so `P1 = (100, 60)`, `P2 = (100, 200)`, `dx = 0`:

- `direct` — one vertical run `P1 → P2` heading down, which is `−n_s`; reverses at `P1`.
- `dog-leg +x` — corner `x = 124`, so the last segment runs `(124, 200) → (100, 200)`,
  i.e. `−x`, which is `+n_t` for a target entered from the left; reverses at `P2`.
- `dog-leg +y` — `P1.x = P2.x`, so both corner points are `(100, 224)`; they
  collapse and the connector becomes a vertical out-and-back; reverses.
- `dog-leg −x` — corner `x = 76`; first segment `−x`, last segment `+x`. Valid, and
  the router returns
  `(100,100) (100,84) (100,60) (76,60) (76,200) (100,200) (124,200) (140,200)`.

In candidate 8, `l` is the lateral unit vector — `+x` when `n_s` is vertical, `+y`
when horizontal; that case arises only when the two handles coincide _and_ sit on
the same side, where returning to a point without retracing requires going around
it.

Consecutive duplicate points are dropped before the rule is checked, so a
zero-length leg collapses instead of producing a spur — which is why candidates
that degenerate (a dog-leg whose middle segment has zero length, say) are
rejected by the rule rather than needing a separate guard.

**Coverage.** Enumerating all 16 `sourceSide × targetSide` combinations against
all 9 sign patterns of `(dx, dy)` — 144 cases — every one is solvable: 48 by the
direct candidate, 56 by a two-segment elbow (32 across-exit, 24 along-exit), 36 by
a three-segment dog-leg (14 `+x`, 14 `+y`, 4 `−x`, 4 `−y`), and 4 by the
rectangle. **Two connector segments are provably not always enough**, so
the ladder is the minimal relaxation, not an implementation convenience: when
`n_s` and `n_t` lie on the same axis pointing opposite ways and the displacement
runs backwards along it (e.g. `bottom → top` with `P2` above `P1`), the
vertical-first ordering reverses at `P1` and the horizontal-first ordering
reverses at `P2`, and those are the only two-segment orthogonal connectors that
exist. Three are required there, and four in the coincident-handle case.

#### Own-node clearance is a searched-route property

"A route never crosses the interior of its own endpoint nodes" holds for **searched
routes only**, and within those, for their **routed segments only**. Two separate
exemptions, for two separate reasons.

**The fallback is exempt from clearance entirely.** Not partially, not "except in
overlapping geometry" — entirely. Its connector performs **no obstacle avoidance
whatsoever, by design**: the ladder in "No-path fallback" above picks a shape from
the endpoint geometry alone and never consults the node rects. That is what makes
it the last resort. It is reached only when the grid search has already proved no
clear path exists, so a shape that avoided obstacles is not on offer — the choice
there is between a determined shape that may clip and no edge at all. The
conflict is also formally unavoidable: when the target's pushed point `T` lands
inside the _source_ node's rect, "Endpoints are exact" mandates a final
`T → targetPoint` stub inside that rect, so no conforming implementation can
satisfy both, and exactness wins.

> **Known limitation.** In overlapping-rect geometry a fallback edge can visibly
> thread between (and through) the two boxes. This is only reachable when a user
> has dragged one node onto or nearly onto another: ELK's own placement never
> produces rects whose `nodeMargin`-inflated boxes merge, so it cannot occur in a
> freshly laid-out graph. It is accepted rather than fixed — the alternative is
> either a stale route or a second geometry generator, both of which this plan
> exists to remove.

**Searched routes are exempt for their two mandated stubs.** Clearance comes from
the traversability rule in step 3, which governs grid segments; `sourcePoint → S`
and `T → targetPoint` are mandated by "Endpoints are exact" and are never subject
to it. They normally sit in their own node's margin band and cross nothing, but
with overlapping rects one node's stub can lie inside the other's rect. Measured:
over a 4,096-case grid of all 16 side pairs against overlapping and
non-overlapping rects, every own-rect crossing by a searched route came from a
stub — **zero came from a routed segment**.

**Consequently, anything asserting clearance must classify first.** A result equal
to the D4 construction for that request is a fallback and is skipped outright.
Only the remainder are searched routes, and for those the assertion should cover
the routed segments — excluding the first and last — or restrict itself to
non-overlapping rects.

#### No immediate reversals

Binding on **every** returned polyline — searched, self-loop and fallback alike:
no interior vertex may have its arriving and leaving segments running along the
same axis in opposite directions.

**That is the only form of the rule.** In particular, "the two segments are
perpendicular and `points[i - 1] !== points[i + 1]`" is _not_ an equivalent test
and must not be used: out 16 then back 48 satisfies it while being exactly the
shape banned.

This is the precise, checkable form of "never a degenerate hook", which was
previously only a slogan attached to the fallback. Each route kind satisfies it by
construction:

- **searched** — the grid search never doubles back, the initial direction is
  `+n_s` so the exit cannot reverse at `S`, and **a search state at `T` whose
  travel direction is `+n_t` is not allowed to finish**, since the mandated
  `T → targetPoint` stub would double back on it. If that leaves the target
  unreachable, the edge falls back to D4;
- **self-loop** — the six-point shape turns at every corner;
- **fallback** — the skeleton makes `S` and `T` collinear and the connector ladder
  supplies the rest.

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

#### Duplicate ids

A repeated id in `nodes`, or in `requests`, is invalid input. The router documents
what it does rather than defending against it: **the last one wins** — the last
rect with a given id is the one routed against, and the last request with a given
id is the one left in the returned map. `routeEdges` does not throw.

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
- **During a drag the hook re-routes only the edges incident to a moved node, and
  runs a full pass on drag stop.** This is required, not an optimisation held in
  reserve: a full pass overruns the 16.7 ms frame budget from roughly 180 nodes
  (§5). The router's boundary is unchanged — the hook simply passes a subset of
  requests, since `routeEdges` already routes each edge independently of the rest.

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
   absent from `nodes`, and a 300 ms catastrophic-regression guard on the
   60-node / 80-edge graph (the 50 ms budget itself is measured out of band —
   §2 decision 10).
3. `src/hooks/useEdgeRoutes.ts` + its context (§3.4); consume it in
   `RoutedEdge.tsx` and delete the staleness check and the smoothstep fallback.
4. Drop route storage from `layout.ts` and route inheritance from `useGraphData`;
   update `layout.test.ts` and `useGraphData.test.ts` accordingly.
5. `npm run test:run`, `npm run format`, `npm run lint`; manual browser check of all
   four views, including a drag of a node in each.

## 5. Risks and mitigations

- **Per-frame routing cost — the binding constraint.** Measured 2026-08-09 in bare
  Node, warm, median of N. The repo's own 60-node / 80-edge test graph routes in
  **~6–14 ms**; an adjacent-layer graph of the same size routes in ~2–4 ms. Cost
  depends strongly on graph _shape_, not just on node and edge counts, so no
  single figure is a property of the size class. Scaling on an ELK-layered-shaped
  CFG:

  | nodes | edges | median ms |
  | ----- | ----- | --------- |
  | 60    | 117   | 2.9       |
  | 120   | 245   | 7.6       |
  | 180   | ~370  | ~16       |
  | 260   | 542   | 31.1      |
  | 400   | 840   | 71.8      |

  The 50 ms per-pass budget (§2 decision 10) therefore holds at 60 nodes, but the
  **16.7 ms animation-frame budget — the one that matters, since the pass runs per
  frame during a drag — is exceeded at around 180 nodes.** That is a reachable
  size: the Use-Def view emits one node per instruction. This is why the
  incident-edges-only drag path in §2 decision 5 is required rather than
  contingent.

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
