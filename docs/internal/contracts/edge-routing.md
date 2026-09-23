# Contract: Edge routing (`routeEdges`)

Edge geometry is a pure function of the live node rectangles, computed at render time by
this repo's own orthogonal router. Everything downstream — the one routing pass per graph,
`RoutedEdge`'s per-edge lookup, the router's own test suite — is written against the
module boundary and the guarantees defined here. The router's internal algorithm (the
Hanan grid, the A\* search, the fallback ladder) is an implementation detail behind this
boundary and is not reproduced here — see `src/utils/edgeRouter.ts` and its inline
documentation for how the guarantees below are achieved.

One part of the algorithm is _not_ an implementation detail, because a guarantee is stated
against it: each edge is searched on a grid built from its own **region** rather than from
the whole graph, and that is what makes the Locality guarantee below expressible. The region
is defined under "Per-edge regions"; how the grid over it is searched remains behind the
boundary.

## The frozen boundary

The router implementation and its test suite are written against this boundary. It is
frozen — names and signature are reproduced here verbatim and must not be "improved".

The boundary includes `RouteRequest.bundleId` and `RouteNodeRect.obstacle`
(default `true`). Bundle identity is supplied by the registry, never inferred by the router.

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
  obstacle?: boolean; // default true — false: a frame that does not block
}

export interface RouteRequest {
  id: string; // React Flow edge id
  source: string;
  target: string;
  sourcePoint: Point; // absolute handle position
  targetPoint: Point;
  sourceSide: RouteSide;
  targetSide: RouteSide;
  bundleId?: string; // requests sharing one carry the same value — see Bundles
}

export interface EdgeRouterOptions {
  nodeMargin?: number; // default 12
  bendPenalty?: number; // default 30
  selfLoopGap?: number; // default 24
}

export interface RouteRegion {
  minX: number;
  minY: number; // bounds inclusive — see Per-edge regions
  maxX: number;
  maxY: number;
}

// src/utils/edgeRouter.ts
export const routeEdges: (
  nodes: RouteNodeRect[],
  requests: RouteRequest[],
  options?: EdgeRouterOptions,
) => Map<string, Point[]>; // keyed by RouteRequest.id, >= 2 points, orthogonal

// Locality made usable by a caller — see Per-edge regions, Reusing a pass.
export const ROUTE_REGION_MARGIN: number; // 192
export const routeRegionOf: (
  request: RouteRequest,
  options?: EdgeRouterOptions,
) => RouteRegion;

// Geometric prerequisite for reuse; reservation dependencies must also match.
// A false answer is conservative; every route uses the requested attachments.
export const isRouteLocal: (
  request: RouteRequest,
  points: Point[],
  options?: EdgeRouterOptions,
) => boolean;

// The input-quantization step (Input quantization), so a caller can ask whether
// its input changed in the terms the router will actually see. Idempotent.
export const quantizeRect: (rect: RouteNodeRect) => RouteNodeRect;
export const quantizeRequest: (request: RouteRequest) => RouteRequest;

export interface RoutePassState {
  rects: ReadonlyMap<string, RouteNodeRect>;
  requests: ReadonlyMap<string, RouteRequest>;
  routes: ReadonlyMap<string, Point[]>;
}
export const routeEdgesWithReuse: (
  nodes: RouteNodeRect[],
  requests: RouteRequest[],
  previous: RoutePassState,
) => Map<string, Point[]>; // default options, same result as routeEdges
```

`routeEdges` is a **pure function**: nothing here depends on React Flow or ELK, and no
side effect crosses the boundary in either direction. Rects whose `obstacle` is not
`false` are the solid obstacles. Other bundles reserve directional lane bands:
parallel runs are separated, while perpendicular crossings remain legal. Labels
and markers do not participate in routing. A rect with `obstacle: false` still names an endpoint — missing-node
and self-loop look it up like any other — but it is not inflated, does not contribute
grid lines, and does not block. That is how a container frame can be an edge endpoint
without sealing its interior (`contracts/graph-data.md`, Hierarchy). Routes are not
independent of one another for all that — separation (see Bundles) is a relation between
the returned polylines — but that is a property of the pass, which sees every request at
once, not an obstacle in the search.

### Defaults

| option        | default | meaning                                                                                                                                                               |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeMargin`  | `12`    | clearance kept around every obstacle rect, px — rounded (see below). The number is `NODE_MARGIN` in `src/utils/spacing.ts`, the same module ELK's node spacing reads. |
| `bendPenalty` | `30`    | price of one bend, in px of path length — a cost, never a coordinate                                                                                                  |
| `selfLoopGap` | `24`    | preferred self-loop lane gap, floored at `nodeMargin`, px — rounded. `SELF_LOOP_GAP` in the same module.                                                              |

`nodeMargin` and `selfLoopGap` are distances that end up added to coordinates, so they are
quantized like every other input. That is what makes the integer guarantee below
unconditional instead of a promise kept only for callers that happen to pass integers.
`bendPenalty` is not a coordinate: it is a term in the cost function, compared against path
lengths and never added to a position, so it is left alone and a fractional `bendPenalty`
stays meaningful.

## Input quantization

Every coordinate the router is given is snapped to an integer lattice at the entry of
`routeEdges`, before the obstacle set is built and before any search runs. No coordinate
behind that boundary is ever the fractional value that was passed in.

The reason is that the router's inputs are DOM measurements. Measured rects and live handle
positions arrive with fractional parts as a matter of course — browser zoom alone produces
them — and fractional inputs put fractions into the output: routes whose last decimals
differ between two visually identical states, segments a fraction of a pixel long, and
turning corners whose radius has collapsed to zero. Quantizing at the boundary removes that
class of output _by construction_ rather than by cleaning it up afterwards: no route is
rounded on its way out, and no geometric comparison needs a tolerance, because any two coordinates the router emits are
either equal or a whole pixel apart.

Rounding is `Math.round` throughout — ties go toward positive infinity (`0.5 → 1`,
`-1.5 → -1`) — and a resulting `-0` is normalized to `0`, so no returned coordinate is
ever negative zero.

- **Node rects are quantized by their boundaries, not field by field.** What lands on the
  lattice is the four edges of the rect: `x' = round(x)`,
  `width' = round(x + width) - round(x)`, and correspondingly `y' = round(y)`,
  `height' = round(y + height) - round(y)`. Rounding `x` and `width` independently is a
  different and wrong operation — it can move the rect's right edge by up to a whole pixel,
  so the obstacle would no longer cover what was measured. Under the rule above the left
  edge lands on `round(x)` and the right edge on `round(x + width)`, each within 0.5 px of
  the measurement. `obstacle` is not a coordinate and is copied through unchanged.
- **Request points are quantized per component.** `sourcePoint` and `targetPoint` have their
  `x` and `y` rounded independently. A handle position is a point, not an interval, so there
  is no companion field whose consistency has to be preserved.
- **Options.** `nodeMargin` and `selfLoopGap` are rounded, `bendPenalty` is not, as described
  under Defaults above.
- Everything else in the input is not a coordinate and is untouched: `RouteRequest.id`,
  `source`, `target`, `sourceSide`, `targetSide`, `RouteNodeRect.id` and
  `RouteNodeRect.obstacle` pass through unchanged.

For a caller that already passes integers, quantization is the identity on the
input. Rects, points and options reach the search unchanged. Self-loops use the
same requested endpoints as other edges.

### Degenerate input

Quantization is total — nothing is rejected, and none of the cases below is handled by a
guard of its own.

- A rect thinner than a pixel can collapse to zero width or height
  (`round(x + width) === round(x)`). A collapsed rect is still an obstacle: every rect is
  inflated by `nodeMargin` before the obstacle set is built, so a rect of no extent keeps a
  band of that width clear around where it sits, exactly as a full-size one does. Only when
  `nodeMargin` rounds to `0` as well does it stop blocking anything — the inflated rect then
  has no interior, and the obstacle test is strict-interior.
- Two values that were distinct can round to the same value. For rect boundaries that
  produces a duplicate candidate coordinate, which the router already folds when it builds
  its grid. For handle positions it means two request points less than a pixel apart can
  become one point — `10.2` and `10.4` do, `10.4` and `10.6` do not. For the options it
  means a `nodeMargin` or `selfLoopGap` anywhere in `[-0.5, 0.5)` becomes exactly `0`, which
  can make two vertices of a polyline coincide. Consecutive duplicates are collapsed
  wherever they arise (see Self-loops), and a clearance of `0` is given a shape by the floor
  described below.
- Rounding is monotonic, so no ordering between boundaries can invert: what was to the left
  of something else is afterwards to the left of it or coincident with it, never to the right
  of it. Nothing that depends on an ordering can change sign because of quantization.

**A clearance of zero is floored at one pixel where a shape is synthesized.** A `nodeMargin`
or a `selfLoopGap` of `0` asks for geometry with no room in it. Taken literally there is no
valid answer left: a self-loop asked to leave its node, go around it and come back across no
distance at all doubles back on itself, and coincident request points with a `nodeMargin`
of `0` require a non-empty cycle.
Every shape the router **synthesizes** therefore keeps at least one pixel of room where the
clearance it is given leaves none — the self-loop's lane against its stub
(see Self-loops), and the outward steps of the no-path fallback. A collapsed
self-loop span uses the search's non-empty cycle handling. Search also includes
one-pixel room around its pushed endpoints to turn and close non-empty cycles. The floor
is a maximum against the requested
distance, so it binds only below a pixel: a shape that had room in the first place is not
moved solely by this floor. Independently, a self-loop lane must keep at least `nodeMargin`.
The shape guarantees hold for zero and fractional options too; clearance has only the
geometrically-unroutable exception below.

The floor never applies to the obstacle set: a `nodeMargin` of `0` still
inflates nothing and still blocks nothing (see the collapsed-rect case above), because there
the zero is a meaningful answer rather than an impossible one. The corner it addresses is
not a product of quantization either — an exactly-zero option reaches it with no rounding
involved, and quantization only widens the set of inputs that land there from `{0}` to the
half-open interval `[-0.5, 0.5)` that rounds to it. `bendPenalty` is floored nowhere and
needs no floor: it is a cost, not a clearance, and zero or fractional values of it are
ordinary input.

## Per-edge regions

A routed request is first searched on a grid built from **its own region**, with a
whole-graph retry only when necessary. The region of a request is the axis-aligned bounding
box of the four points that
define it — the quantized `sourcePoint` and `targetPoint`, and the two `nodeMargin`-pushed
points derived from them — inflated by `ROUTE_REGION_MARGIN` (**192 px**) on every side. The
margin is a module constant (`src/utils/edgeRouter.ts`), not an option: no caller has a reason
to vary it, and a search parameter that changes the picture is not something a call site
should be able to disagree about.

192 is measured, not chosen for roundness. Replaying both default LLVM-IR examples through
the router at a range of margins (2026-08-11; the app's own ELK layout, node sizes and port
offsets), the whole-graph retry below fires for one edge in each example at 48 px, for one
edge in the CFG at 96 px, and **for no edge at all from 128 px up**; every margin in 48–384 px
produced byte-identical routes to a graph-wide search, and full-pass timings across that range
differed by less than the run-to-run noise. 192 is therefore the smallest tested value with
real headroom over the threshold where the examples stop needing the retry — the region wants
to be no larger than it has to be, since its size is exactly how much of the graph an edge is
coupled to.

Two rules together make the region the whole of what a search can see.

- **Only intersecting obstacle rects take part.** A rect contributes candidate grid lines, and
  blocks, only when `obstacle !== false` and its _inflated_ rect — the rect grown by
  `nodeMargin`, the same shape the obstacle test uses — intersects the region. Every other
  rect is absent from that edge's search entirely, rather than present but unreachable. A
  non-obstacle rect never takes part, even when it fills the region: it is an endpoint
  frame, not a wall.
- **Candidate lines are clipped to the region.** Of an intersecting rect's four inflated
  boundaries, only those that fall inside the region become grid lines. Every grid vertex
  therefore lies inside the region, so every segment does too. Without the clip, a rect
  straddling the region boundary would extend the grid past it, and a route could then run
  through a rect that was excluded for not reaching the region — the locality guarantee would
  be bought at the price of edges crossing nodes.

The two request points and their pushed points are always grid lines of their own, as they
were before, and they lie inside the region by construction.

The route a search returns is the cheapest one **on that grid**, under the tie-break order
below. It is not promised to be the cheapest orthogonal path in the plane — it was not before
either — and one consequence of the region is worth stating plainly: a detour that would
have to leave the region to be found is not
found, and the request falls to the retry below.

**A request whose region offers no path is retried once, on the whole graph.** The ladder is
exactly two rungs — the region, then every rect — and the second one exists so that this
change cannot make an edge less routable than it was: any request that had a path before still
has the same one available. A request reaches the no-path fallback only when a mandatory
stub is obstructed or
_both_ search rungs fail; these are geometrically unroutable inputs. A request routed
on the second rung is a function of every rect in the graph, and the Locality guarantee below
is not claimed for it; the router does not report which rung it used, so a caller that needs to
know must reproduce the region test itself.

Self-loops use the same region and retry policy. Their preferred right-side shape is
accepted only when it fits inside the request's region and passes obstacle validation;
otherwise the requested attachments and sides are searched, with the same whole-graph
retry as ordinary edges.

The grid includes room to turn at endpoints and outer boundary lines. Exhausting a sparse
grid without that room is not evidence of geometric impossibility. Coincident endpoints
must find a non-empty route, rather than treating a zero-length search as success.
The endpoint side directions still prohibit reversing at departure/arrival when the
corresponding stub has zero length. Distinct attachments whose pushed points coincide may
connect directly through that point when their stubs satisfy these direction constraints.

Pinned by `src/utils/__tests__/edgeRouter.clearance.test.ts`: an independent dense unit-grid
reachability oracle checks sparse-search success and genuine impossibility on small layouts;
adversarial fixtures cover self-loops, endpoint stubs, collapsed rects, zero margins,
container frames, and the measured default LLVM CFG. `src/hooks/__tests__/useEdgeRoutes.test.ts`
checks partial-pass equality, including a distant wall opening a formerly impossible route.

## Guarantees callers may rely on

- **Node avoidance and clearance.** Every segment avoids the strict interior of every
  quantized obstacle rect (`obstacle !== false`) and its `nodeMargin` inflation. Only the
  source and target stubs may enter their respective endpoint's inflated margin; they must
  still avoid that endpoint's actual interior and every other obstacle's inflated interior.
  This applies to ordinary routes and self-loops, including zero clearance and degenerate
  rects. Non-obstacle container frames remain traversable. This is a guarantee about returned
  polylines, not stroke widths, markers, labels, or corner rounding.
- **One exception: geometrically unroutable input.** If the fixed attachments/stubs or the
  free space make a route satisfying these constraints impossible, return the deterministic
  final fallback. Overlapping nodes, an obstructed stub, or an enclosed endpoint can cause
  this even when the raw node interiors do not overlap. The fallback alone may violate node
  avoidance and clearance; integer coordinates, exact attachments, orthogonality, at least
  two points, determinism, and no immediate reversal still hold. Tests must establish that
  exception fixtures are impossible, rather than skip arbitrary fallback-shaped answers.

- **Orthogonality.** Every returned polyline is axis-aligned: consecutive points always
  share exactly one coordinate — never both, so no two consecutive points are identical.
  This holds at any clearance: two request points that quantize to the same point with a
  `nodeMargin` of `0` come back as a non-empty route around that point, not as the point
  twice.
- **Integer coordinates.** Every `x` and every `y` of every point in every returned
  polyline is an integer — searched routes, self-loops and fallback routes alike, for any
  finite input. This is a consequence of the quantization above rather than of a rounding
  step on the way out: every coordinate the router emits is a quantized rect boundary, a
  quantized request point or a quantized option, combined by sums, differences, min/max and
  multiplication by an integer (the fallback steps out along a `±1` direction sign), all of
  which integers are closed under. Callers never have to round router output, and no
  returned coordinate is `-0`.
- **≥ 2 points.** Every entry in the returned map has at least two points, however
  degenerate the rects, the requests and the clearances are.
- **Endpoints are exact on the quantized points.** Every routed polyline, including a self-loop, starts
  exactly at the quantized `RouteRequest.sourcePoint` and ends exactly at the quantized
  `RouteRequest.targetPoint` — that is, at `(round(x), round(y))` of each, with `-0`
  normalized to `0`. The `nodeMargin`-pushed point is an interior bend (`points[1]` and the
  second-to-last point), never the first or last point, so a drawn edge always visually
  touches its handle and no other layer has to close a gap. What a caller passing fractional
  points gives up is absolute equality with the values it passed: the drawn endpoint may sit
  up to 0.5 px away on each axis from the requested point. That trade is deliberate — half a
  pixel at a handle is invisible, and it buys output with no sub-pixel geometry anywhere in
  it. Self-loops preserve both requested endpoints and their sides as well.
- **Interior points are corners, except the two pushed points.** Every interior vertex of a
  routed polyline is either one of the two `nodeMargin`-pushed points above or a **corner**:
  a vertex whose arriving and leaving segments run along different axes. A run that
  continues straight across several rect boundaries comes back as the two ends of that run
  and nothing in between, so a route's point count is set by how many times it actually
  turns and not by how many other nodes happen to sit along the line it takes. The two
  pushed points are the sole interior vertices that survive being collinear with their
  neighbours, and keeping them is what "Endpoints are exact" above requires. This is what
  makes the returned polyline a bend list rather than a trace: a consumer that rounds
  corners has one vertex per corner to round, and adding an unrelated node near a straight
  edge does not change the edge's geometry. Binding on searched and self-loop polylines at
  any clearance; the fallback shape places its vertices by construction (see the ladder named
  in the opening paragraph) and may leave collinear ones among them. The router emits that
  shape only for geometrically unroutable input.
- **Determinism.** Identical input rects and requests always produce byte-identical
  points, with no dependence on the iteration order of either the `nodes` array or the
  `requests` array — reordering either changes no individual route.
- **Locality with route dependencies.** A region-local route depends on its request,
  nearby obstacle rectangles, all other bundles' fixed endpoint stubs reaching the
  region, and earlier requests' reserved segments reaching it (including their
  12 px parallel clearance bands). Requests are processed in ascending edge-id
  order, using JavaScript string comparison, independent of input array order.
  A changed earlier route can therefore affect later routes transitively. A route
  with unchanged dependencies remains byte-identical; a distant independent
  component cannot perturb it. Whole-graph retries and final fallbacks must be
  retried and do not carry this reuse guarantee.
- **A fixed tie-break total order.** When multiple candidate paths are equally cheap, the
  router picks among them by, in order: (1) total cost (`length + bendPenalty * turns`),
  (2) number of bends, (3) the point sequence compared lexicographically by `(x, y)` — a
  shorter sequence that is a prefix of a longer one sorts first. The chosen shape is
  therefore a documented property of the router, not an implementation accident, and this
  is what the determinism guarantee above rests on. **"Equally cheap" means equal to within
  a small tolerance, not bit-equal.** `bendPenalty` is deliberately left unquantized (see
  the options table), so a total cost is a float sum of integer run lengths and fractional
  bend prices, and two candidates that cost the same in exact arithmetic can still land on
  totals differing in their last bits — the search reaches them through different sequences
  of additions. Ranking those by key (1) would decide the shape by accumulated rounding
  error, which is the implementation accident this order exists to rule out; the tolerance
  is what lets keys (2) and (3) decide instead.
- **No immediate reversals.** Binding on every returned polyline — searched, self-loop and
  fallback alike: no interior vertex has its arriving and leaving segments running along
  the same axis in opposite directions. This is the precise, checkable form of "never a
  degenerate hook"; `points[i - 1] !== points[i + 1]` is _not_ an equivalent test (an
  out-16-then-back-48 detour satisfies it while being exactly the shape banned). This holds
  at any clearance: a doubling-back is precisely what a shape with no room to exist has left
  in it, and the one-pixel floor above is what keeps that room. The floor is needed by the
  fallback as much as by the self-loop, since the fallback's detours are sized by
  `selfLoopGap` too.
- **Missing nodes.** A `RouteRequest` whose `source` or `target` id is **not present** in
  the `nodes` array produces **no entry** in the returned map. `routeEdges` does not throw
  and does not substitute a default rect — it simply omits that request. Self-loops are
  subject to the same rule: a self-loop whose node is absent from `nodes` produces no
  entry.
- **Duplicate ids are invalid input the function tolerates rather than rejects.** A
  repeated id in `nodes`, or in `requests`, does not throw. The documented behavior is
  "the last one wins": the last rect with a given id is the one routed against, and the
  last request with a given id is the one left in the returned map.

The following guarantees describe relationships between polylines in the same pass.

## Bundles and separation

Unrelated edges must remain distinguishable even when they use the same corridor. `specs/graph-view.md` §4 fixes what such an overlap is allowed to mean — shared
geometry means one value carried by several edges — and this section is that rule in the
router's own terms. `bundleId` is how the caller states it; the router never asks what an
IR is.

- **Bundle.** The set of requests carrying one `bundleId`. A request whose `bundleId` is
  `undefined` is a bundle of one — `undefined` is not a wildcard, so a caller that supplies
  no bundle ids is asking for pairwise separation of everything. Self-loops take part like
  any other request.
- **Sharing.** Two polylines _share geometry_ when their point sets intersect in a subset
  of positive length — a common sub-segment. Crossing at a point does not count, and
  neither does meeting at a single common endpoint; those are exactly the shapes the spec's
  junction mark is there to tell apart.
- **The guarantee.** For any two requests with distinct ids, the returned polylines share
  geometry **only if** both carry the same defined `bundleId`.

The converse is deliberately not promised. Drawing a bundle as one distribution tree (#88)
is a rendering intent, and stating the biconditional would outlaw a legal shape: a bundle
whose branches leave the source in opposite directions has a zero-length trunk and shares
nothing but its departure point, yet is correctly rendered. "Overlap iff same value" is the
reading given to the picture; "share only if same bundle" is what the router can be held
to.

Parallel segments from different bundles whose projections overlap by positive
length stay at least `EDGE_LANE_GAP = 12` flow pixels apart, including stubs and
self-loops. Perpendicular point crossings and isolated endpoint contacts are allowed.
Candidate lanes and detours respect node clearance; congestion does not authorize
reducing the lane gap. The request-id order chooses which route reserves a lane
first; within each search the cost/bends/point-sequence tie-break above applies.
If this allocation leaves an otherwise routable edge without a lane, the router
repairs the assignment by promoting that edge ahead of its earlier blockers.
Candidate orders are visited deterministically (failed-edge order, then blocker
order); an already visited order is never retried. Repaired passes carry global
route dependencies and are recomputed rather than reused as local searches.
All requests' fixed stubs are reserved before any route is selected, so an earlier
route cannot consume a later request's attachment corridor.

**Geometrically impossible inputs.** Fixed stubs that already violate separation,
blocked attachments, or insufficient free space can make all constraints impossible.
The deterministic fallback keeps edges visible, preserving the unconditional shape
and attachment guarantees; separation and obstacle clearance are conditional in
these cases. A test claiming this exception must establish the obstruction, not
merely recognize a fallback shape. The default LLVM CFG must satisfy separation
without exceptions. A search failure alone is not evidence of impossibility.

CFG and Mermaid assign separate departure points to non-bundled edges. Use-Def
supplies bundle ids from its registry entry, permitting its shared departure stub.
Distribution trees and junction marks remain #88; this change does not force
same-bundle routes to share any additional geometry.

Pinned by: `src/utils/__tests__/edgeRouter.separation.test.ts`,
`src/utils/__tests__/nodePorts.test.ts`, `src/hooks/__tests__/useEdgeRoutes.test.ts`.

## Self-loops (right-side preference)

A self-loop (`source === target`) uses the quantized source/target points and
sides supplied by its caller, exactly like an ordinary edge. It never substitutes
attachments derived from the node rectangle. This applies to LLVM CFG, Use-Def,
and Mermaid alike.

For bottom-to-top requests, a preferred shape leaves the source, runs right,
goes up beside the node, and returns to the target. The lane lies at least
`selfLoopGap` and `nodeMargin` beyond the right edge, and at least one pixel to
the right of both attachments. The two horizontal runs use the requested
`nodeMargin`-pushed endpoints. The shortcut is used only when those runs have
positive vertical separation, it fits inside the request region, and every
segment satisfies obstacle and clearance checks. Other sides, coincident runs,
and blocked shortcuts use the ordinary search and fallback policy.

Right-side appearance never overrides endpoint identity or clearance. Zero-sized
nodes and zero margins still produce non-degenerate, reversal-free routes. The
node's frame may have `obstacle: false`, just like any endpoint.

> Pinned by: `src/utils/__tests__/edgeRouter.test.ts`,
> `src/utils/__tests__/edgeRouter.clearance.test.ts`,
> `src/hooks/__tests__/useEdgeRoutes.test.ts`

## Where the routing pass runs

`routeEdges` takes **all** nodes and **all** requests in one call — it cannot be invoked
from a per-edge component. There is exactly **one routing pass per graph**: it runs in
`src/hooks/useEdgeRoutes.ts`, which reads React Flow's store (measured rects and live
handle positions), builds the `RouteNodeRect[]` / `RouteRequest[]` inputs, and calls
`routeEdges` once per pass. The resulting `Map<string, Point[]>` is published through a
React context; `RoutedEdge` looks up its own entry by edge id and never calls the router
itself. **There is one routing path**, during a drag as much as at rest — no incident-only
mode, and no catch-up pass when a drag stops.

### Reusing a pass

`routeEdgesWithReuse(nodes, requests, previous)` uses the same routing engine and
fixed request order as `routeEdges`; it accepts the previous quantized rectangles,
requests, and routes. It returns exactly the full-pass result, reusing a local
polyline only when its request, endpoint rectangles, nearby obstacles, and local
reservation segments are unchanged. Both the old and new reservation sets are
compared: deletion, movement, bundle changes, and transitive route changes count.
The returned map also carries the deterministic reuse eligibility of the pass;
copying it into a plain map or supplying a result produced with explicit router
options conservatively disables reuse. Repaired passes are
never reused from their final geometry alone. The complete request set is always supplied. Routing an isolated affected subset
is invalid because it would omit occupied lanes.

`useEdgeRoutes` performs this operation once per animation frame with changed
geometry. Whole-graph and fallback answers are retried. There is no incident-only
drag path and no catch-up pass after dropping a node.

Pinned by: `src/hooks/__tests__/useEdgeRoutes.test.ts`.
