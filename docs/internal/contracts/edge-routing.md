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

Two fields are fixed here ahead of a later payer so the boundary is decided once rather
than reopened: `RouteRequest.bundleId` is not in `src/types/edgeRouting.ts` yet and lands
with #86; `RouteNodeRect.obstacle` **is** in the source (default `true`). Everything else
in the block is what the source declares today.

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

// Locality made usable by a caller — see Per-edge regions, Narrowing a pass.
export const ROUTE_REGION_MARGIN: number; // 192
export const routeRegionOf: (
  request: RouteRequest,
  options?: EdgeRouterOptions,
) => RouteRegion;

// Whether an existing result may be reused under the region rules. A false
// answer is conservative; the source rect is needed for self-loop attachments.
export const isRouteLocal: (
  request: RouteRequest,
  points: Point[],
  sourceRect: RouteNodeRect,
  options?: EdgeRouterOptions,
) => boolean;

// The input-quantization step (Input quantization), so a caller can ask whether
// its input changed in the terms the router will actually see. Idempotent.
export const quantizeRect: (rect: RouteNodeRect) => RouteNodeRect;
export const quantizeRequest: (request: RouteRequest) => RouteRequest;
```

`routeEdges` is a **pure function**: nothing here depends on React Flow or ELK, and no
side effect crosses the boundary in either direction. Rects whose `obstacle` is not
`false` are the only obstacles; there is no notion of edges, labels, or anything else
blocking a route. A rect with `obstacle: false` still names an endpoint — missing-node
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
rounded on its way out — the only rounding applied to a coordinate behind the boundary is
the self-loop's 75 %-of-width offset, rounded where it is formed (see Self-loops) — and no
geometric comparison needs a tolerance, because any two coordinates the router emits are
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

For a caller that already passes integers, quantization is the identity **on the input**:
every rect, point and option reaches the router unchanged, so the obstacle set and the
search see exactly what they saw before. One behavioral change still reaches such a caller,
and it is in self-loops (see Self-loops): the stub offset is now rounded, so a node whose
integer width is not a multiple of 4 has its loop leave and re-enter at `round(x + 0.75w)`,
up to half a pixel from where it did before — a quarter of a pixel for a width that is odd,
half a pixel for one that is even but not a multiple of 4. A caller passing a clearance of
`0` sees two more: the duplicate collapse, and the one-pixel floor below.

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
clearance it is given leaves none — the self-loop's lane against its stub and its vertical
extent (see Self-loops), and the outward steps of the no-path fallback. Search also includes
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
otherwise their fixed bottom/top attachments are searched. If those attachments lie outside
the request's region, search starts on the whole graph.

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
  which integers are closed under. The one value on that path that is not an integer — the
  self-loop's 75 %-of-width offset, a multiplication by `0.75` — is rounded where it is
  formed (see Self-loops below). Callers therefore never have to round router output, and no
  returned coordinate is `-0`.
- **≥ 2 points.** Every entry in the returned map has at least two points, however
  degenerate the rects, the requests and the clearances are.
- **Endpoints are exact on the quantized points.** A routed (non-self-loop) polyline starts
  exactly at the quantized `RouteRequest.sourcePoint` and ends exactly at the quantized
  `RouteRequest.targetPoint` — that is, at `(round(x), round(y))` of each, with `-0`
  normalized to `0`. The `nodeMargin`-pushed point is an interior bend (`points[1]` and the
  second-to-last point), never the first or last point, so a drawn edge always visually
  touches its handle and no other layer has to close a gap. What a caller passing fractional
  points gives up is absolute equality with the values it passed: the drawn endpoint may sit
  up to 0.5 px away on each axis from the requested point. That trade is deliberate — half a
  pixel at a handle is invisible, and it buys output with no sub-pixel geometry anywhere in
  it. **Self-loops are exempt from this rule**: their attachments are derived from the node rect
  (see below), rather than the requested handle positions.
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
- **Locality.** A route found on its own region (see Per-edge regions) is a function of the
  obstacle rects intersecting that region and of its own request — of nothing else in the
  input. Adding, removing, moving or resizing any other rect, including a non-obstacle
  frame that is not an endpoint of this request, leaves that polyline byte-identical, so an
  edge changes only when something near it changed. This is the guarantee that makes the router
  _stable_ as well as deterministic: determinism says the same input gives the same output,
  which a search over a graph-wide grid satisfies while still letting an unrelated node's
  one-pixel move flip a route through the tie-break. Locality is what rules that out, and it
  is a property of the pure function, not of a cache — no route is ever kept because it was
  the previous answer. It is claimed for searched routes on the first rung and validated
  self-loop shapes
  inside the region. It is **not** claimed for whole-graph retries or final fallbacks: a
  distant obstacle can open a route and replace a previously necessary fallback.
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

Every guarantee above is a property of one polyline in isolation. How two of them may
relate is the separate question below, and it is not yet answered by the implementation.

## Bundles and separation

Nothing above says whether two returned polylines may run along the same pixels. Today they
may and do: every route is searched on the same grid, so unrelated edges coincide by
accident. `specs/graph-view.md` §4 fixes what such an overlap is allowed to mean — shared
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

**Status: not held.** The router ignores `bundleId`; the guarantee and the unit tests that
pin it land with #86. Search behavior is not the only thing in the way — two facts about
the handles produce shared geometry whatever the search does, and neither is fixable here:
every in-edge of a node ends at one top-center handle (#87) and CFG successors leave
through one bottom-center handle (#67), so those routes share a tail or a stub before the
router has any say. (#88, the distribution tree, is the other half of the picture — the
sharing this contract permits but does not yet produce.) Until #86, an edge overlap in the
output is not a contract violation but unspecified behavior, so `docs/README.md`'s "code
that violates a contract is a bug" does not apply to it.

## Self-loops (right-side preference)

A self-loop (`source === target`) attaches to the bottom and top of its quantized node at
`stubX = round(x + 0.75 * width)`. These attachments remain fixed while the route detours.
The preferred shape leaves the bottom, runs right, goes up beside the node, then returns
left to the top. Its lane is `max(right + selfLoopGap, right + nodeMargin, stubX + 1)`;
its upper run is `top - nodeMargin`, and its lower run is
`max(bottom + nodeMargin, upperRun + 1)`. Consecutive duplicate points are collapsed.

This preserves the ordinary six-point shape wherever it is safe and fits the local region. Every segment is validated
against all obstacles, with only the own-endpoint margin exemptions above. If the shape is
blocked, search may change its lane, number of corners, and side; right-side appearance
never overrides clearance. A `selfLoopGap` smaller than `nodeMargin` cannot reduce clearance.
Zero-sized nodes and zero margins still produce non-degenerate, reversal-free routes.
An impossible self-loop uses the same final fallback policy as an ordinary edge, with these
bottom/top attachments. The node's frame may have `obstacle: false`, just like any endpoint.

## Where the routing pass runs

`routeEdges` takes **all** nodes and **all** requests in one call — it cannot be invoked
from a per-edge component. There is exactly **one routing pass per graph**: it runs in
`src/hooks/useEdgeRoutes.ts`, which reads React Flow's store (measured rects and live
handle positions), builds the `RouteNodeRect[]` / `RouteRequest[]` inputs, and calls
`routeEdges` once per pass. The resulting `Map<string, Point[]>` is published through a
React context; `RoutedEdge` looks up its own entry by edge id and never calls the router
itself. **There is one routing path**, during a drag as much as at rest — no incident-only
mode, and no catch-up pass when a drag stops.

### Narrowing a pass

A caller that holds the previous pass's input and output may route a **subset** of the
requests and reuse the rest. Locality is what makes that a pure optimization rather than a
second answer: an edge whose region nothing near has changed would be re-routed to the
polyline the caller already holds, so computing it and keeping it are indistinguishable.
`routeRegionOf(request)` exports the region rule so the caller asks the router where an edge
looks rather than reimplementing the box.

The subset must be a superset of what can actually change, which takes three clauses — the
third is the one that is easy to miss:

1. a request that is **new, or whose own record changed** (either point, either side, either
   endpoint id) — its region moved with it;
2. a request whose region a changed rect reaches **in either its old or its new position** —
   the space a node vacates matters as much as the space it takes, and an edge that was
   detouring around it must be allowed to straighten;
3. a request whose **previous polyline has a point outside its own region**, or equals its
   final fallback. Neither can be reused on the strength of Locality. `isRouteLocal`
   implements this conservative check: a shape coinciding with the deterministic fallback
   is re-routed even if it happened to be found by search. This avoids adding hidden mutable
   routing state or changing the points-map return type.

A narrowed pass still passes the **complete** `nodes` array: a route must avoid every
obstacle whether or not that obstacle moved.

This is not a licence to keep a stale route. What the old drag-time split did — route only
the edges incident to the dragged node, then a full pass on drop — is not an instance of this
rule: the edges it left out were routing around a rect the dragged node had already vacated,
which is clause 2, and the "full pass on drag stop" was the moment they all caught up at once.
`src/hooks/useEdgeRoutes.ts` implements the rule, and
`src/hooks/__tests__/useEdgeRoutes.test.ts` pins the only property that matters: a narrowed
pass equals the full pass entry for entry. See `specs/graph-view.md` §4 for the frame budget
that makes the narrowing worth having.
