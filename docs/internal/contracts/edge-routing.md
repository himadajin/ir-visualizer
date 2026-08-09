# Contract: Edge routing (`routeEdges`)

- **Status:** Implemented (2026-08-09)
- **Motivation:** edge geometry is a pure function of the live node rectangles, computed
  at render time by this repo's own orthogonal router. Everything downstream — the one
  routing pass per graph, `RoutedEdge`'s per-edge lookup, the router's own test suite — is
  written against a specific module boundary and a specific set of guarantees about what
  it returns. Both used to live only in a plan file; this contract is their permanent home.
  The router's internal algorithm (the Hanan grid, the A\* search, the fallback ladder) is
  an implementation detail behind this boundary and is not reproduced here — see
  `src/utils/edgeRouter.ts` and its inline documentation for how the guarantees below are
  achieved.

## The frozen boundary

The router implementation and its test suite are written against this boundary. It is
frozen — names and signature are reproduced here verbatim and must not be "improved".

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
  nodeMargin?: number; // default 12
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

`routeEdges` is a **pure function**: nothing here depends on React Flow or ELK, and no
side effect crosses the boundary in either direction. `nodes` are the only obstacles;
there is no notion of edges, labels, or anything else blocking a route.

### Defaults

| option        | default | meaning                                                     |
| ------------- | ------- | ----------------------------------------------------------- |
| `nodeMargin`  | `12`    | clearance kept around every node rect, px                   |
| `bendPenalty` | `30`    | price of one bend, in px of path length                     |
| `selfLoopGap` | `24`    | distance from a node's right edge to its self-loop lane, px |

## Guarantees callers may rely on

- **Orthogonality.** Every returned polyline is axis-aligned: consecutive points always
  share exactly one coordinate.
- **≥ 2 points.** Every entry in the returned map has at least two points, even in
  degenerate input.
- **Endpoints are exact.** A routed (non-self-loop) polyline starts exactly at
  `RouteRequest.sourcePoint` and ends exactly at `RouteRequest.targetPoint`. The
  `nodeMargin`-pushed point is an interior bend (`points[1]` and the second-to-last point),
  never the first or last point, so a drawn edge always visually touches its handle and no
  other layer has to close a gap. **Self-loops are exempt from this rule**: they are
  synthesized from the node rect alone (see below), so `sourcePoint`/`targetPoint` play no
  part in their shape at all.
- **Determinism.** Identical input rects and requests always produce byte-identical
  points, with no dependence on the iteration order of either the `nodes` array or the
  `requests` array — reordering either changes no individual route.
- **A fixed tie-break total order.** When multiple candidate paths are equally cheap, the
  router picks among them by, in order: (1) total cost (`length + bendPenalty * turns`),
  (2) number of bends, (3) the point sequence compared lexicographically by `(x, y)` — a
  shorter sequence that is a prefix of a longer one sorts first. The chosen shape is
  therefore a documented property of the router, not an implementation accident, and this
  is what the determinism guarantee above rests on.
- **No immediate reversals.** Binding on every returned polyline — searched, self-loop and
  fallback alike: no interior vertex has its arriving and leaving segments running along
  the same axis in opposite directions. This is the precise, checkable form of "never a
  degenerate hook"; `points[i - 1] !== points[i + 1]` is _not_ an equivalent test (an
  out-16-then-back-48 detour satisfies it while being exactly the shape banned).
- **Missing nodes.** A `RouteRequest` whose `source` or `target` id is **not present** in
  the `nodes` array produces **no entry** in the returned map. `routeEdges` does not throw
  and does not substitute a default rect — it simply omits that request. Self-loops are
  subject to the same rule: a self-loop whose node is absent from `nodes` produces no
  entry.
- **Duplicate ids are invalid input the function tolerates rather than rejects.** A
  repeated id in `nodes`, or in `requests`, does not throw. The documented behavior is
  "the last one wins": the last rect with a given id is the one routed against, and the
  last request with a given id is the one left in the returned map.

## Self-loops (right side, six points)

A self-loop request (`source === target`) is synthesized rather than searched. For a node
rect `(x, y, w, h)` the polyline is always exactly these six points, with
`laneX = x + w + selfLoopGap`:

| #   | point                             |                            |
| --- | --------------------------------- | -------------------------- |
| 0   | `(x + 0.75w, y + h)`              | leaves the **bottom** edge |
| 1   | `(x + 0.75w, y + h + nodeMargin)` | steps clear of the node    |
| 2   | `(laneX, y + h + nodeMargin)`     | runs **right** to the lane |
| 3   | `(laneX, y - nodeMargin)`         | runs **up** past the node  |
| 4   | `(x + 0.75w, y - nodeMargin)`     | comes back **left**        |
| 5   | `(x + 0.75w, y)`                  | re-enters the **top** edge |

The side is the **right** side, always — not chosen per node and not derived from free
space. Points 1 and 4 are load-bearing, not decoration: without them the first/last
horizontal run would sit exactly on the node's own bottom/top border.

## Where the routing pass runs

`routeEdges` takes **all** nodes and **all** requests in one call — it cannot be invoked
from a per-edge component. There is exactly **one routing pass per graph**: it runs in
`src/hooks/useEdgeRoutes.ts`, which reads React Flow's store (measured rects and live
handle positions), builds the `RouteNodeRect[]` / `RouteRequest[]` inputs, and calls
`routeEdges` once per pass. The resulting `Map<string, Point[]>` is published through a
React context; `RoutedEdge` looks up its own entry by edge id and never calls the router
itself. During a drag the hook narrows `requests` to the edges incident to the dragged
node (still passing the **complete** `nodes` array, since a partial route must still avoid
every obstacle) and runs a full pass once the drag stops — see `specs/graph-view.md` §4 for
why that split is required rather than an optimization held in reserve.
