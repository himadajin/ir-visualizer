# Contract: Edge routing (`routeEdges`)

Edge geometry is a pure function of the live node rectangles, computed at render time by
this repo's own orthogonal router. Everything downstream — the one routing pass per graph,
`RoutedEdge`'s per-edge lookup, the router's own test suite — is written against the
module boundary and the guarantees defined here. The router's internal algorithm (the
Hanan grid, the A\* search, the fallback ladder) is an implementation detail behind this
boundary and is not reproduced here — see `src/utils/edgeRouter.ts` and its inline
documentation for how the guarantees below are achieved.

## The frozen boundary

The router implementation and its test suite are written against this boundary. It is
frozen — names and signature are reproduced here verbatim and must not be "improved".

One exception to "verbatim", and it is deliberate: `RouteRequest.bundleId` is not in
`src/types/edgeRouting.ts` yet. It is fixed here ahead of its use so the boundary is
decided once rather than reopened twice, and it lands in code with #86. Everything else in
the block is what the source declares today.

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
  bundleId?: string; // requests sharing one carry the same value — see Bundles
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
there is no notion of edges, labels, or anything else blocking a route. Routes are not
independent of one another for all that — separation (see Bundles) is a relation between
the returned polylines — but that is a property of the pass, which sees every request at
once, not an obstacle in the search.

### Defaults

| option        | default | meaning                                                               |
| ------------- | ------- | --------------------------------------------------------------------- |
| `nodeMargin`  | `12`    | clearance kept around every node rect, px — rounded (see below)       |
| `bendPenalty` | `30`    | price of one bend, in px of path length — a cost, never a coordinate  |
| `selfLoopGap` | `24`    | distance from a node's right edge to its self-loop lane, px — rounded |

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
  the measurement.
- **Request points are quantized per component.** `sourcePoint` and `targetPoint` have their
  `x` and `y` rounded independently. A handle position is a point, not an interval, so there
  is no companion field whose consistency has to be preserved.
- **Options.** `nodeMargin` and `selfLoopGap` are rounded, `bendPenalty` is not, as described
  under Defaults above.
- Everything else in the input is not a coordinate and is untouched: `RouteRequest.id`,
  `source`, `target`, `sourceSide`, `targetSide` and `RouteNodeRect.id` pass through
  unchanged.

For a caller that already passes integers, quantization is the identity **on the input**:
every rect, point and option reaches the router unchanged, so the obstacle set and the
search see exactly what they saw before. Two behavioral changes still reach such a caller,
both of them in self-loops (see Self-loops). The stub offset is now rounded, so a node whose
integer width is not a multiple of 4 has its loop leave and re-enter at `round(x + 0.75w)`,
up to half a pixel from where it did before — a quarter of a pixel for a width that is odd,
half a pixel for one that is even but not a multiple of 4. And a self-loop's consecutive
duplicate vertices are now collapsed, which a caller passing `nodeMargin: 0` or
`selfLoopGap: 0` can observe.

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
  wherever they arise (see Self-loops); what is promised once a clearance has reached `0` is
  bounded by the note below.
- Rounding is monotonic, so no ordering between boundaries can invert: what was to the left
  of something else is afterwards to the left of it or coincident with it, never to the right
  of it. Nothing that depends on an ordering can change sign because of quantization.

**Clearance that rounds to zero is outside the domain.** A `nodeMargin` or `selfLoopGap` of
`0` asks for geometry with no room in it, and such a shape has degenerated rather than
merely lost precision. A self-loop is asked to leave its node, go around it and come back
across no distance at all: on a narrow enough rect the lane coincides with the stub, the
loop has nowhere to run, and what is left of it doubles back on itself. A routed edge is
asked for something equally impossible when its two request points quantize to the same
point and `nodeMargin` is `0` — what comes back can then be nothing but that one point,
twice. Three of the guarantees below are therefore stated for a `nodeMargin` and a
`selfLoopGap` that round to at least `1`: **Orthogonality**, **≥ 2 points** and **no
immediate reversals**. What the router returns outside that domain is left unspecified here
on purpose — a follow-up issue covers making these shapes well defined at zero clearance,
and pinning values now would pin values that issue is going to change.

The remaining guarantees are unconditional. **Integer coordinates**, **determinism**, the
**tie-break order**, **missing-node omission** and **duplicate-id handling** hold whatever
the options are, fractional or zero — fractional options are exactly the input this
quantization exists to serve, so the bound must not touch them. The bound itself is a
property of asking for geometry with no room to exist, not of quantization: an exactly-zero
option reaches the same corner with no rounding involved, and quantization only widens the
set of inputs that land there from `{0}` to the half-open interval `[-0.5, 0.5)` that rounds
to it. `bendPenalty` carries no such bound either: it is a cost, not a clearance, and zero
or fractional values of it are ordinary input.

## Guarantees callers may rely on

- **Orthogonality.** Every returned polyline is axis-aligned: consecutive points always
  share exactly one coordinate. Stated within the clearance domain above (`nodeMargin` and
  `selfLoopGap` rounding to at least `1`): at a `nodeMargin` of `0`, two request points that
  quantize to the same point can leave nothing to return but that point twice.
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
  degenerate the rects and the requests are. Stated within the clearance domain above.
- **Endpoints are exact on the quantized points.** A routed (non-self-loop) polyline starts
  exactly at the quantized `RouteRequest.sourcePoint` and ends exactly at the quantized
  `RouteRequest.targetPoint` — that is, at `(round(x), round(y))` of each, with `-0`
  normalized to `0`. The `nodeMargin`-pushed point is an interior bend (`points[1]` and the
  second-to-last point), never the first or last point, so a drawn edge always visually
  touches its handle and no other layer has to close a gap. What a caller passing fractional
  points gives up is absolute equality with the values it passed: the drawn endpoint may sit
  up to 0.5 px away on each axis from the requested point. That trade is deliberate — half a
  pixel at a handle is invisible, and it buys output with no sub-pixel geometry anywhere in
  it. **Self-loops are exempt from this rule**: they are synthesized from the node rect alone
  (see below), so `sourcePoint`/`targetPoint` play no part in their shape at all.
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
  edge does not change the edge's geometry. Stated within the clearance domain above, and
  binding on routed and self-loop polylines; the fallback shape the router emits for an
  edge it can find no path for places its vertices by construction (see the ladder named in
  the opening paragraph) and may leave collinear ones among them.
- **Determinism.** Identical input rects and requests always produce byte-identical
  points, with no dependence on the iteration order of either the `nodes` array or the
  `requests` array — reordering either changes no individual route.
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
  out-16-then-back-48 detour satisfies it while being exactly the shape banned). Stated
  within the clearance domain above, for the reason given there: a shape with no room to
  exist has nothing but a doubling-back left in it. A `selfLoopGap` of `0` reaches this for
  fallback routes as well as for self-loops, since the fallback's detours are sized by it.
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

## Self-loops (right side, six points)

A self-loop request (`source === target`) is synthesized rather than searched. For a node
rect `(x, y, w, h)` — the **quantized** rect, so `x`, `y`, `w` and `h` are integers — the
polyline runs through these six points in this order, subject to the collapse described
below, with

- `stubX = round(x + 0.75w)`, the offset along the bottom and top edges where the loop
  leaves and re-enters, and
- `laneX = x + w + selfLoopGap`, the vertical lane to the right of the node:

| #   | point                         |                            |
| --- | ----------------------------- | -------------------------- |
| 0   | `(stubX, y + h)`              | leaves the **bottom** edge |
| 1   | `(stubX, y + h + nodeMargin)` | steps clear of the node    |
| 2   | `(laneX, y + h + nodeMargin)` | runs **right** to the lane |
| 3   | `(laneX, y - nodeMargin)`     | runs **up** past the node  |
| 4   | `(stubX, y - nodeMargin)`     | comes back **left**        |
| 5   | `(stubX, y)`                  | re-enters the **top** edge |

`laneX` needs no rounding of its own — `x`, `w` and `selfLoopGap` are all integers by the
time it is formed — and neither do the four `y` values. `stubX` is the only non-integer
value that can reach the output: three quarters of a width is fractional whenever the width
is not a multiple of 4, so the sum is rounded there and the integer guarantee holds for
self-loops too. For example `w = 100` gives `stubX = x + 75`, `w = 101` gives
`x + 75.75 → x + 76`, and `w = 102` gives `x + 76.5 → x + 77` (ties round up). `w = 103`
gives `x + 77.25 → x + 77`. Because `x` is an integer, rounding the
sum and rounding only the `0.75w` term give the same result once `-0` is normalized (they
differ only in the sign of zero, e.g. `x = -1, w = 1`).

**Consecutive duplicate vertices are collapsed.** The table gives the shape; what is
returned is that shape with every pair of identical consecutive points folded into one. This
is required behavior, not an incidental detail, and it is the same duplicate collapse that
searched and fallback routes already pass through — self-loops are no longer the exception.
It is load-bearing because an option can round to zero: a `nodeMargin` in `[-0.5, 0.5)`
makes points 0 and 1 coincide (and 4 and 5), and a `selfLoopGap` in `[-0.5, 0.5)` makes
`stubX === laneX` on a rect that quantizes to `w ≤ 2`, which makes 1 coincide with 2 and 3
with 4. Two identical consecutive points share both coordinates rather than exactly one, so
leaving them in the output would break Orthogonality.

A self-loop therefore returns **at most** six points, and can return fewer when a clearance
rounds to zero — whether it does depends on the rect, and a `selfLoopGap` of `0` folds
nothing unless the rect is narrow enough for the lane to reach the stub. What is returned in
that case is left unspecified here, since those inputs are outside the domain the guarantees
are given for (see "Clearance that rounds to zero" above). What the collapse does buy is
that **a self-loop is orthogonal at any clearance**: no two consecutive returned points are
ever identical, so every consecutive pair shares exactly one coordinate, in domain or out of
it. Within the domain there is nothing to fold — with `nodeMargin` and `selfLoopGap` of `1`
or more, no two _consecutive_ vertices of the six coincide — so the collapse is only ever
observable outside it.

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
the frame-budget measurement behind that split.
