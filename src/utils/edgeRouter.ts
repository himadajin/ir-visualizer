import type {
  EdgeRouterOptions,
  Point,
  RouteNodeRect,
  RouteRegion,
  RouteRequest,
  RouteSide,
  RoutePassState,
} from "../types/edgeRouting";
import { NODE_MARGIN, SELF_LOOP_GAP } from "./spacing";

import {
  conflictsWith,
  reservationGrid,
  reservationReaches,
  reservationSignature,
  sameBundle,
  segmentsOf,
  type ReservedSegment,
} from "./routeReservations";

/**
 * Self-contained orthogonal edge router (`contracts/edge-routing.md`,
 * `specs/graph-view.md` §4). Every input coordinate is snapped to an integer
 * lattice at the entry of `routeEdges`; rects whose `obstacle` is not `false`
 * are the only obstacles; each edge is searched with A* over a sparse Hanan
 * grid built from the rects near **it** — its region — and the result is a
 * rounded-corner-ready polyline. A routed edge begins and ends exactly at its
 * quantized handle positions, including self-loops. Bottom-to-top self-loops
 * prefer a validated right-side shape.
 *
 * Region-local searches depend on nearby rects and directional reservations.
 * Unchanged dependencies allow exact reuse; a changed earlier lane may propagate
 * to later edges. Congested passes repair the allocation before falling back.
 */

/** Clearance kept around every node rect, px (`NODE_MARGIN` in spacing.ts). */
export const DEFAULT_NODE_MARGIN = NODE_MARGIN;
/** Price of one bend, expressed in px of path length (`length + bendPenalty * turns`). */
export const DEFAULT_BEND_PENALTY = 30;
/** Preferred self-loop lane gap, floored at nodeMargin for clearance, px. */
export const DEFAULT_SELF_LOOP_GAP = SELF_LOOP_GAP;

/**
 * How far beyond its own endpoints an edge's search may look, px
 * (`contracts/edge-routing.md`, "Per-edge regions"). A request is searched on a
 * grid built from the rects intersecting its region — the bounding box of its
 * two request points and their two pushed points, inflated by this — which is
 * the scope of the direct dependencies. Changes outside it can affect a route
 * only through changed reservations or a whole-graph/repair retry.
 *
 * It is a constant rather than an `EdgeRouterOptions` field on purpose. No
 * caller has a reason to vary it, and it is not a preference: it trades how far
 * a detour may be looked for against how much of the graph an edge is coupled
 * to, and both sides of that trade are properties of this router, not of a call
 * site.
 */
export const ROUTE_REGION_MARGIN = 192;

/**
 * Room a synthesized shape keeps where the clearance it is given leaves none
 * (`contracts/edge-routing.md`, "A clearance of zero is floored at one pixel").
 * A `nodeMargin` or `selfLoopGap` of `0` asks a self-loop to go around its node
 * across no distance at all, and asks the fallback to approach a target it is
 * already standing on; both answers are a doubling-back, which the no-reversal
 * guarantee forbids. Flooring the room these shapes are built from is what
 * makes that guarantee — and orthogonality, and `>= 2` points — hold for every
 * input rather than only for callers that pass a clearance of at least a pixel.
 *
 * Applied to shape/search room only, never to the obstacle set: a `nodeMargin` of `0`
 * genuinely means "inflate nothing", and the search is entitled to that answer.
 */
const MIN_CLEARANCE = 1;

/**
 * Costs closer than this count as equal, so that geometrically symmetric
 * alternatives fall through to the documented tie-break order
 * (`contracts/edge-routing.md`, "A fixed tie-break total order") instead of
 * being decided by float noise.
 */
const COST_EPSILON = 1e-9;

/** Spatial-hash cell size of the obstacle index, px. */
const OBSTACLE_CELL_SIZE = 128;
/** Folds a 2-D cell coordinate into one numeric map key. */
const CELL_KEY_STRIDE = 1_000_003;

// Directions are indexed so that `(dir + 2) % 4` is the reverse direction.
const DIR_RIGHT = 0;
const DIR_DOWN = 1;
const DIR_LEFT = 2;
const DIR_UP = 3;
const DIR_DX = [1, 0, -1, 0];
const DIR_DY = [0, 1, 0, -1];

/** The direction pointing out of a node through the given side. */
const OUTWARD_DIR: Record<RouteSide, number> = {
  right: DIR_RIGHT,
  bottom: DIR_DOWN,
  left: DIR_LEFT,
  top: DIR_UP,
};

const reverseDir = (dir: number): number => (dir + 2) % 4;

/**
 * A handle position moved `distance` px out of the node along its side. At
 * `nodeMargin` this is the interior bend that `contracts/edge-routing.md`
 * ("Endpoints are exact on the quantized points") keeps off the ends of the
 * polyline.
 */
const pushOutward = (
  point: Point,
  side: RouteSide,
  distance: number,
): Point => ({
  x: point.x + DIR_DX[OUTWARD_DIR[side]] * distance,
  y: point.y + DIR_DY[OUTWARD_DIR[side]] * distance,
});

/**
 * Returned polylines never alias the caller's `Point` objects: the consumer
 * (`useEdgeRoutes`) publishes them through a React context, where a point shared
 * with a `RouteRequest` would be a mutation trap.
 */
const clonePoint = (point: Point): Point => ({ x: point.x, y: point.y });

/**
 * Snaps one coordinate to the integer lattice (`contracts/edge-routing.md`,
 * "Input quantization"). The router's inputs are DOM measurements, which carry
 * fractional parts as a matter of course, and a fraction anywhere in the input
 * puts fractions in the output: routes whose last decimals differ between two
 * visually identical states, segments a fraction of a pixel long, corners whose
 * bend radius has collapsed to zero. Quantizing once at the boundary removes
 * that class of output by construction — integers are closed under the sums,
 * differences, min/max and ±1-scaled steps every route below is built from — so
 * nothing has to be rounded on the way out and no geometric comparison here
 * needs a tolerance.
 *
 * `Math.round`, so ties go toward positive infinity, with `-0` normalized to `0`
 * so that no returned coordinate is ever negative zero.
 */
const quantize = (value: number): number => {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded; // `-0 === 0`, so this catches `-0`
};

/**
 * Quantizes a rect **by its boundaries, never field by field**: the left edge
 * lands on `round(x)` and the right edge on `round(x + width)`, each within half
 * a pixel of what was measured. Rounding `x` and `width` independently is a
 * different and wrong operation — the two errors add, so the right edge can move
 * by a whole pixel and the obstacle would no longer cover the node it stands
 * for.
 *
 * A rect thinner than a pixel can collapse to zero extent. That is left to
 * happen rather than guarded: a collapsed rect still blocks, because obstacles
 * are these rects inflated by `nodeMargin`, and a band of that width around a
 * rect of no extent still has an interior. Coincident boundaries are likewise
 * left alone — `sortedUnique` already folds them when the grid is built.
 *
 * Exported because a caller that wants to know whether its input has really
 * changed has to ask in the router's terms: two measurements a fraction of a
 * pixel apart are the same input here, and rounding the four fields
 * independently is not the same question — it can call `x = 10.0, w = 20.4` and
 * `x = 10.4, w = 20.4` equal, where this makes them 20 px and 21 px wide.
 * Re-passing an already-quantized rect to `routeEdges` is the identity.
 */
export const quantizeRect = (rect: RouteNodeRect): RouteNodeRect => {
  const x = quantize(rect.x);
  const y = quantize(rect.y);
  return {
    id: rect.id,
    x,
    y,
    width: quantize(rect.x + rect.width) - x,
    height: quantize(rect.y + rect.height) - y,
    ...(rect.obstacle === false ? { obstacle: false } : {}),
  };
};

/**
 * Quantizes the two handle positions of a request per component. A handle
 * position is a point, not an interval, so there is no companion field whose
 * consistency has to be preserved and `x` and `y` round independently.
 * Everything else — the ids and the two sides — is not a coordinate and passes
 * through untouched. Exported for the same reason as `quantizeRect` above.
 */
export const quantizeRequest = (request: RouteRequest): RouteRequest => ({
  ...request,
  sourcePoint: {
    x: quantize(request.sourcePoint.x),
    y: quantize(request.sourcePoint.y),
  },
  targetPoint: {
    x: quantize(request.targetPoint.x),
    y: quantize(request.targetPoint.y),
  },
});

const dropDuplicates = (points: Point[]): Point[] =>
  points.filter(
    (point, i) =>
      i === 0 || point.x !== points[i - 1].x || point.y !== points[i - 1].y,
  );

/**
 * Collapses runs of collinear points into their end points. The first and last
 * points are always kept: for a routed edge they are the `nodeMargin`-pushed
 * bends, which `contracts/edge-routing.md` ("Endpoints are exact on the
 * quantized points") requires to survive as `points[1]` and the second-to-last
 * point even when the route runs straight through them.
 */
const dropCollinearInterior = (points: Point[]): Point[] => {
  if (points.length <= 2) return points;
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const previous = kept[kept.length - 1];
    const current = points[i];
    const next = points[i + 1];
    const collinear =
      (previous.x === current.x && current.x === next.x) ||
      (previous.y === current.y && current.y === next.y);
    if (!collinear) kept.push(current);
  }
  kept.push(points[points.length - 1]);
  return kept;
};

/**
 * Lexicographic order on point sequences, prefix-first — the third and last key
 * of `contracts/edge-routing.md`, "A fixed tie-break total order".
 */
const comparePointSequences = (a: Point[], b: Point[]): number => {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a[i].x !== b[i].x) return a[i].x < b[i].x ? -1 : 1;
    if (a[i].y !== b[i].y) return a[i].y < b[i].y ? -1 : 1;
  }
  return a.length - b.length;
};

const sortedUnique = (values: number[]): number[] => {
  const sorted = [...values].sort((a, b) => a - b);
  const unique: number[] = [];
  for (const value of sorted) {
    if (unique.length === 0 || unique[unique.length - 1] !== value) {
      unique.push(value);
    }
  }
  return unique;
};

interface InflatedRect {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Strict-interior intersection, including a zero-length endpoint check. */
const segmentIntersects = (a: Point, b: Point, rect: InflatedRect): boolean =>
  a.x === b.x
    ? a.x > rect.minX &&
      a.x < rect.maxX &&
      Math.max(a.y, b.y) > rect.minY &&
      Math.min(a.y, b.y) < rect.maxY
    : a.y > rect.minY &&
      a.y < rect.maxY &&
      Math.max(a.x, b.x) > rect.minX &&
      Math.min(a.x, b.x) < rect.maxX;

const containsPoint = (region: RouteRegion, point: Point): boolean =>
  point.x >= region.minX &&
  point.x <= region.maxX &&
  point.y >= region.minY &&
  point.y <= region.maxY;

/**
 * A stub may cross its own margin, never its own interior or another margin.
 * Checking the whole segment matters: a midpoint can miss a thin obstruction.
 */
const stubIsClear = (
  a: Point,
  b: Point,
  owner: RouteNodeRect,
  inflated: InflatedRect[],
): boolean =>
  !inflated.some((rect) =>
    segmentIntersects(
      a,
      b,
      rect.id === owner.id
        ? {
            id: owner.id,
            minX: owner.x,
            minY: owner.y,
            maxX: owner.x + owner.width,
            maxY: owner.y + owner.height,
          }
        : rect,
    ),
  );

/**
 * "Is this point strictly inside an obstacle?" over a uniform spatial hash.
 * Built once per `routeEdges` call rather than once per edge, which is what
 * keeps a full pass inside the frame budget measured in `specs/graph-view.md`
 * §4.
 *
 * A grid segment runs between two consecutive grid lines and every rect edge is
 * a grid line, so a segment lies either wholly inside a rect's interior or
 * wholly outside it — testing its midpoint decides the whole segment.
 */
const buildObstacleIndex = (rects: InflatedRect[]) => {
  const cellOf = (value: number) => Math.floor(value / OBSTACLE_CELL_SIZE);
  const buckets = new Map<number, InflatedRect[]>();
  for (const rect of rects) {
    for (let cx = cellOf(rect.minX); cx <= cellOf(rect.maxX); cx++) {
      for (let cy = cellOf(rect.minY); cy <= cellOf(rect.maxY); cy++) {
        const key = cx * CELL_KEY_STRIDE + cy;
        const bucket = buckets.get(key);
        if (bucket === undefined) buckets.set(key, [rect]);
        else bucket.push(rect);
      }
    }
  }
  return (x: number, y: number): boolean => {
    const bucket = buckets.get(cellOf(x) * CELL_KEY_STRIDE + cellOf(y));
    if (bucket === undefined) return false;
    for (const rect of bucket) {
      if (x > rect.minX && x < rect.maxX && y > rect.minY && y < rect.maxY) {
        return true;
      }
    }
    return false;
  };
};

/**
 * One search state: a grid vertex reached travelling in `dir`. `goal` marks the
 * terminal state reached from the target vertex once the arrival turn has been
 * paid, so that the tie-break keys of a finished route include that last bend.
 */
interface Label {
  xi: number;
  yi: number;
  dir: number;
  goal: boolean;
  cost: number;
  bends: number;
  priority: number;
  parent: Label | null;
  points: Point[] | null;
}

/** "Is this point strictly inside an obstacle the route must respect?" */
type IsBlocked = (x: number, y: number) => boolean;

/**
 * Everything one search may see: the candidate grid lines and the obstacles.
 * There are two of these per pass — one built per edge from its own region, and
 * the graph-wide one kept for the retry rung (`contracts/edge-routing.md`,
 * "Per-edge regions"). Confining a search to a scope is what makes the Locality
 * guarantee true by construction rather than by argument: a rect outside the
 * scope is not reachable-but-unchosen, it is absent.
 */
interface SearchScope {
  gridXs: number[];
  gridYs: number[];
  isBlocked: IsBlocked;
  region?: RouteRegion;
  reservations?: readonly ReservedSegment[];
}

/**
 * The region of a request: the bounding box of the four points that define it —
 * the two quantized request points and the two `nodeMargin`-pushed points — with
 * `ROUTE_REGION_MARGIN` added on every side.
 */
const regionOf = (points: Point[]): RouteRegion => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    minX: minX - ROUTE_REGION_MARGIN,
    minY: minY - ROUTE_REGION_MARGIN,
    maxX: maxX + ROUTE_REGION_MARGIN,
    maxY: maxY + ROUTE_REGION_MARGIN,
  };
};

/**
 * Overlap test used to select the rects of a region, deliberately **non-strict**
 * — a rect touching the region along a boundary is taken in. Blocking is a
 * strict-interior test, so such a rect can block nothing inside the region and
 * taking it in changes no route; the conservative direction is the safe one to
 * be wrong in, and it keeps this test independent of the blocking one.
 */
const intersectsRegion = (rect: InflatedRect, region: RouteRegion): boolean =>
  rect.minX <= region.maxX &&
  rect.maxX >= region.minX &&
  rect.minY <= region.maxY &&
  rect.maxY >= region.minY;

/**
 * The scope of one request: the rects whose inflated form reaches its region,
 * and of their boundaries only those falling **inside** the region.
 *
 * The clip is what confines the search to the region, and it is load-bearing
 * rather than tidy. A rect straddling the region boundary contributes a far
 * boundary outside it; keeping that line would let the grid — and a route on
 * it — run past the region and into a rect that was excluded for not reaching
 * the region, so an edge could cross a node that was never given a chance to
 * block it. With the clip every grid vertex lies inside the region, so every
 * segment does too.
 *
 * That last fact is also why the obstacle test does not have to be rebuilt per
 * region: a rect containing a point inside the region necessarily intersects
 * the region, so asking the graph-wide index about a point in here can only
 * ever be answered by a rect this region selected. The shared index is
 * therefore the same function as a region-local one would be, at the cost of
 * building it once per pass instead of once per edge.
 */
const scopeOfRegion = (
  inflated: InflatedRect[],
  region: RouteRegion,
  isBlocked: IsBlocked,
): SearchScope => {
  const gridXs: number[] = [region.minX, region.maxX];
  const gridYs: number[] = [region.minY, region.maxY];
  for (const rect of inflated) {
    if (!intersectsRegion(rect, region)) continue;
    if (rect.minX >= region.minX && rect.minX <= region.maxX) {
      gridXs.push(rect.minX);
    }
    if (rect.maxX >= region.minX && rect.maxX <= region.maxX) {
      gridXs.push(rect.maxX);
    }
    if (rect.minY >= region.minY && rect.minY <= region.maxY) {
      gridYs.push(rect.minY);
    }
    if (rect.maxY >= region.minY && rect.maxY <= region.maxY) {
      gridYs.push(rect.maxY);
    }
  }
  return { gridXs, gridYs, isBlocked, region };
};

/**
 * Binary heap over the tie-break total order (`contracts/edge-routing.md`,
 * "A fixed tie-break total order").
 */
const createQueue = (compare: (a: Label, b: Label) => number) => {
  const items: Label[] = [];
  return {
    push: (label: Label) => {
      items.push(label);
      let child = items.length - 1;
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (compare(items[child], items[parent]) >= 0) break;
        [items[parent], items[child]] = [items[child], items[parent]];
        child = parent;
      }
    },
    pop: (): Label | undefined => {
      if (items.length === 0) return undefined;
      const top = items[0];
      const last = items.pop();
      if (items.length > 0 && last !== undefined) {
        items[0] = last;
        let parent = 0;
        for (;;) {
          const left = parent * 2 + 1;
          const right = left + 1;
          let smallest = parent;
          if (
            left < items.length &&
            compare(items[left], items[smallest]) < 0
          ) {
            smallest = left;
          }
          if (
            right < items.length &&
            compare(items[right], items[smallest]) < 0
          ) {
            smallest = right;
          }
          if (smallest === parent) break;
          [items[parent], items[smallest]] = [items[smallest], items[parent]];
          parent = smallest;
        }
      }
      return top;
    },
  };
};

/**
 * Lower bound on the number of turns still to come, so A* can prune the plateau
 * of equal-length detours a plain Manhattan heuristic leaves open. Obstacles can
 * only force more turns, so the bound stays admissible.
 */
const remainingTurnsBound = (
  dx: number,
  dy: number,
  dir: number,
  arrivalDir: number,
): number => {
  if (dx === 0 && dy === 0) return dir === arrivalDir ? 0 : 1;
  const horizontal = dir === DIR_RIGHT || dir === DIR_LEFT;
  const along = horizontal ? dx : dy;
  const step = horizontal ? DIR_DX[dir] : DIR_DY[dir];
  const across = horizontal ? dy : dx;
  if (along === 0) return 1;
  if (Math.sign(along) !== step) return 2; // heading away: turn off and back
  if (across !== 0) return 1;
  return dir === arrivalDir ? 0 : 1;
};

/**
 * Cheapest grid path from the pushed source point to the pushed target point,
 * or `null` when the grid offers none. Returns `[S, ...bends, T]`; the exact
 * handle positions are added by the caller.
 *
 * "The grid" is the given scope's — this edge's region, or the whole graph on
 * the retry rung. The search below cannot tell the two apart, which is the
 * point: locality is a property of what the scope contains, not of the search.
 */
const routeOnGrid = (
  request: RouteRequest,
  start: Point,
  end: Point,
  scope: SearchScope,
  bendPenalty: number,
): Point[] | null => {
  // Candidate lines: every inflated rect edge in scope, plus this edge's
  // endpoints. The pushed points are included as well so that they are always
  // grid vertices, even for a handle that does not sit on its node's boundary.
  const xs = sortedUnique(
    [
      ...scope.gridXs,
      request.sourcePoint.x,
      request.targetPoint.x,
      start.x - 1,
      start.x,
      start.x + 1,
      end.x - 1,
      end.x,
      end.x + 1,
    ].filter(
      (x) =>
        scope.region === undefined ||
        (x >= scope.region.minX && x <= scope.region.maxX),
    ),
  );
  const ys = sortedUnique(
    [
      ...scope.gridYs,
      request.sourcePoint.y,
      request.targetPoint.y,
      start.y - 1,
      start.y,
      start.y + 1,
      end.y - 1,
      end.y,
      end.y + 1,
    ].filter(
      (y) =>
        scope.region === undefined ||
        (y >= scope.region.minY && y <= scope.region.maxY),
    ),
  );
  const xIndex = new Map(xs.map((value, index) => [value, index]));
  const yIndex = new Map(ys.map((value, index) => [value, index]));

  const startXi = xIndex.get(start.x) ?? -1;
  const startYi = yIndex.get(start.y) ?? -1;
  const endXi = xIndex.get(end.x) ?? -1;
  const endYi = yIndex.get(end.y) ?? -1;
  if (startXi < 0 || startYi < 0 || endXi < 0 || endYi < 0) return null;

  const width = xs.length;
  const height = ys.length;
  // The route leaves along the source handle's outward normal and arrives along
  // the target handle's inward normal, so turns are counted over the whole
  // returned polyline, stubs included.
  const startDir = OUTWARD_DIR[request.sourceSide];
  const arrivalDir = reverseDir(OUTWARD_DIR[request.targetSide]);

  const pointsOf = (label: Label): Point[] => {
    if (label.points === null) {
      const reversed: Point[] = [];
      for (let node: Label | null = label; node !== null; node = node.parent) {
        reversed.push({ x: xs[node.xi], y: ys[node.yi] });
      }
      reversed.reverse();
      label.points = dropCollinearInterior(dropDuplicates(reversed));
    }
    return label.points;
  };

  // The contract's tie-break total order: cost, then bend count, then the point
  // sequence. Every key is non-decreasing along a path, so the first pop of a
  // state is its optimum under that order.
  const compare = (a: Label, b: Label): number => {
    if (a.priority - b.priority > COST_EPSILON) return 1;
    if (b.priority - a.priority > COST_EPSILON) return -1;
    if (a.bends !== b.bends) return a.bends - b.bends;
    return comparePointSequences(pointsOf(a), pointsOf(b));
  };

  const heuristic = (x: number, y: number, dir: number): number => {
    const dx = end.x - x;
    const dy = end.y - y;
    return (
      Math.abs(dx) +
      Math.abs(dy) +
      bendPenalty * remainingTurnsBound(dx, dy, dir, arrivalDir)
    );
  };

  // Keep the initial state separate from revisiting the same vertex/direction:
  // coincident endpoints may need a real cycle whose arrival direction equals
  // its departure direction. The zero-cost initial label must not prune it.
  const stateKey = (label: Label): number =>
    label.goal
      ? -1
      : label.parent === null
        ? -2
        : (label.yi * width + label.xi) * 4 + label.dir;

  const best = new Map<number, Label>();
  const queue = createQueue(compare);
  const relax = (label: Label) => {
    const key = stateKey(label);
    const current = best.get(key);
    if (current !== undefined && compare(current, label) <= 0) return;
    best.set(key, label);
    queue.push(label);
  };

  relax({
    xi: startXi,
    yi: startYi,
    dir: startDir,
    goal: false,
    cost: 0,
    bends: 0,
    priority: heuristic(start.x, start.y, startDir),
    parent: null,
    points: null,
  });

  for (;;) {
    const label = queue.pop();
    if (label === undefined) return null;
    if (best.get(stateKey(label)) !== label) continue; // superseded
    if (label.goal) return pointsOf(label);

    // Arriving at T along +n_t would make the mandated `T → targetPoint` stub
    // double back on the approach, which `contracts/edge-routing.md` ("No
    // immediate reversals") forbids. Such an approach simply cannot finish; if
    // nothing else reaches T, the edge falls back to `fallbackPoints` below.
    if (
      label.xi === endXi &&
      label.yi === endYi &&
      (label.parent !== null ||
        request.sourcePoint.x !== request.targetPoint.x ||
        request.sourcePoint.y !== request.targetPoint.y) &&
      label.dir !== reverseDir(arrivalDir)
    ) {
      const turned = label.dir !== arrivalDir;
      relax({
        ...label,
        goal: true,
        cost: label.cost + (turned ? bendPenalty : 0),
        bends: label.bends + (turned ? 1 : 0),
        priority: label.cost + (turned ? bendPenalty : 0),
        parent: label,
        points: null,
      });
    }

    const x = xs[label.xi];
    const y = ys[label.yi];
    for (let dir = 0; dir < 4; dir++) {
      if (dir === reverseDir(label.dir)) continue; // doubling back is never optimal
      const nextXi = label.xi + DIR_DX[dir];
      const nextYi = label.yi + DIR_DY[dir];
      if (nextXi < 0 || nextXi >= width || nextYi < 0 || nextYi >= height) {
        continue;
      }
      const nextX = xs[nextXi];
      const nextY = ys[nextYi];
      // Stubs are checked separately. No searched segment is exempt from
      // either endpoint's clearance, even the first/last grid segment.
      if (
        scope.isBlocked((x + nextX) / 2, (y + nextY) / 2) ||
        (scope.reservations !== undefined &&
          conflictsWith({ x, y }, { x: nextX, y: nextY }, scope.reservations))
      ) {
        continue;
      }
      const turned = dir !== label.dir;
      const cost =
        label.cost +
        Math.abs(nextX - x) +
        Math.abs(nextY - y) +
        (turned ? bendPenalty : 0);
      relax({
        xi: nextXi,
        yi: nextYi,
        dir,
        goal: false,
        cost,
        bends: label.bends + (turned ? 1 : 0),
        priority: cost + heuristic(nextX, nextY, dir),
        parent: label,
        points: null,
      });
    }
  }
};

/**
 * An interior vertex where the arriving and leaving segments run along the same
 * axis in opposite directions — the one and only form of the no-reversal rule
 * (`contracts/edge-routing.md`, "No immediate reversals"). Note that
 * `points[i - 1] !== points[i + 1]` is _not_ an equivalent test: "out 16, back
 * 48" passes it and is exactly the shape being banned.
 */
const hasImmediateReversal = (points: Point[]): boolean => {
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    if (
      previous.x === corner.x &&
      corner.x === next.x &&
      (corner.y - previous.y) * (next.y - corner.y) < 0
    ) {
      return true;
    }
    if (
      previous.y === corner.y &&
      corner.y === next.y &&
      (corner.x - previous.x) * (next.x - corner.x) < 0
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Deterministic shape used when the grid offers no path — the no-path fallback
 * of `specs/graph-view.md` §4, which does no obstacle avoidance at all:
 * `sourcePoint → S → P1 → connector → P2 → T → targetPoint`.
 *
 * `P1` steps a further `gap` out along the source normal and `P2` sits a `gap`
 * outside `T`, so the polyline always leaves straight and always approaches the
 * target from outside. That makes the no-reversal rule hold at `S` and `T`
 * unconditionally, and reduces the whole problem to two conditions on the
 * connector: its first segment must not run along `-n_s`, its last must not run
 * along `+n_t`.
 *
 * The whole ladder is sized by that one distance, which is why it is the
 * `selfLoopGap` floored at `MIN_CLEARANCE` rather than the raw option: at a
 * `selfLoopGap` of `0` every step out has zero length, `P2` lands on `T`, and
 * the approach doubles back over the segment that reached it — the shape the
 * no-reversal guarantee exists to forbid.
 *
 * Connector candidates are tried in a fixed order and the first one satisfying
 * the rule wins, which keeps the choice deterministic. Two segments suffice for
 * most geometry; 36 of the 144 side/direction combinations need the three-segment
 * lateral dog-leg, and coincident handles on the same side need the four-segment
 * rectangle. The full ladder is the `connectors` array below, in order.
 */
const fallbackPoints = (
  request: RouteRequest,
  nodeMargin: number,
  selfLoopGap: number,
): Point[] => {
  const gap = Math.max(selfLoopGap, MIN_CLEARANCE);
  const sourceNormal = OUTWARD_DIR[request.sourceSide];
  const start = pushOutward(
    request.sourcePoint,
    request.sourceSide,
    nodeMargin,
  );
  const end = pushOutward(request.targetPoint, request.targetSide, nodeMargin);
  const p1 = pushOutward(
    request.sourcePoint,
    request.sourceSide,
    nodeMargin + gap,
  );
  const p2 = pushOutward(
    request.targetPoint,
    request.targetSide,
    nodeMargin + gap,
  );
  const verticalExit = sourceNormal === DIR_UP || sourceNormal === DIR_DOWN;

  const connectors: Point[][] = [];
  if (p1.x === p2.x || p1.y === p2.y) {
    connectors.push([]); // straight run, or nothing at all when P1 === P2
  } else {
    // Continue along the exit axis first when that is legal; it reads as a
    // simple L rather than an immediate sidestep.
    const alongExit = { x: p1.x, y: p2.y };
    const acrossExit = { x: p2.x, y: p1.y };
    connectors.push(
      verticalExit ? [alongExit] : [acrossExit],
      verticalExit ? [acrossExit] : [alongExit],
    );
  }
  // Three-segment lateral dog-legs, positive side first — a fixed order, so the
  // choice stays deterministic.
  const xPositive = Math.max(p1.x, p2.x) + gap;
  const xNegative = Math.min(p1.x, p2.x) - gap;
  const yPositive = Math.max(p1.y, p2.y) + gap;
  const yNegative = Math.min(p1.y, p2.y) - gap;
  connectors.push(
    [
      { x: xPositive, y: p1.y },
      { x: xPositive, y: p2.y },
    ],
    [
      { x: p1.x, y: yPositive },
      { x: p2.x, y: yPositive },
    ],
    [
      { x: xNegative, y: p1.y },
      { x: xNegative, y: p2.y },
    ],
    [
      { x: p1.x, y: yNegative },
      { x: p2.x, y: yNegative },
    ],
  );
  if (p1.x === p2.x && p1.y === p2.y) {
    // Coincident handles on the same side: the only way back to a point without
    // retracing is to go around it.
    const lateralX = verticalExit ? gap : 0;
    const lateralY = verticalExit ? 0 : gap;
    const outX = DIR_DX[sourceNormal] * gap;
    const outY = DIR_DY[sourceNormal] * gap;
    connectors.push([
      { x: p1.x + lateralX, y: p1.y + lateralY },
      { x: p1.x + lateralX + outX, y: p1.y + lateralY + outY },
      { x: p1.x + outX, y: p1.y + outY },
    ]);
  }

  let candidate: Point[] = [];
  for (const connector of connectors) {
    candidate = dropDuplicates([
      clonePoint(request.sourcePoint),
      start,
      p1,
      ...connector,
      p2,
      end,
      clonePoint(request.targetPoint),
    ]);
    if (!hasImmediateReversal(candidate)) return candidate;
  }
  return candidate;
};

/** Preferred right-side shape. It is only returned after clearance validation. */
const selfLoopPoints = (
  request: RouteRequest,
  rect: RouteNodeRect,
  nodeMargin: number,
  selfLoopGap: number,
): Point[] | null => {
  if (request.sourceSide !== "bottom" || request.targetSide !== "top")
    return null;
  const start = pushOutward(
    request.sourcePoint,
    request.sourceSide,
    nodeMargin,
  );
  const end = pushOutward(request.targetPoint, request.targetSide, nodeMargin);
  // A collapsed vertical span needs the search's non-empty cycle handling.
  if (start.y <= end.y) return null;
  const lane = Math.max(
    rect.x + rect.width + Math.max(selfLoopGap, nodeMargin),
    start.x + MIN_CLEARANCE,
    end.x + MIN_CLEARANCE,
  );
  return dropDuplicates([
    clonePoint(request.sourcePoint),
    start,
    { x: lane, y: start.y },
    { x: lane, y: end.y },
    end,
    clonePoint(request.targetPoint),
  ]);
};

/** Mandatory endpoint segments, reserved before any route is chosen. */
const requestStubs = (
  request: RouteRequest,
  margin: number,
): ReservedSegment[] => [
  ...segmentsOf([
    request.sourcePoint,
    pushOutward(request.sourcePoint, request.sourceSide, margin),
  ]),
  ...segmentsOf([
    request.targetPoint,
    pushOutward(request.targetPoint, request.targetSide, margin),
  ]),
];

const withReservations = (
  scope: SearchScope,
  reservations: readonly ReservedSegment[],
): SearchScope => {
  const { xs, ys } = reservationGrid(reservations);
  return {
    ...scope,
    gridXs: [...scope.gridXs, ...xs],
    gridYs: [...scope.gridYs, ...ys],
    reservations,
  };
};

const localSignature = (
  request: RouteRequest,
  rects: readonly RouteNodeRect[],
  reservations: readonly ReservedSegment[],
): string => {
  const region = routeRegionOf(request);
  const nearby = rects
    .filter(
      (r) =>
        r.id === request.source ||
        r.id === request.target ||
        (r.obstacle !== false &&
          intersectsRegion(
            {
              id: r.id,
              minX: r.x - DEFAULT_NODE_MARGIN,
              minY: r.y - DEFAULT_NODE_MARGIN,
              maxX: r.x + r.width + DEFAULT_NODE_MARGIN,
              maxY: r.y + r.height + DEFAULT_NODE_MARGIN,
            },
            region,
          )),
    )
    .map((r) => JSON.stringify(r))
    .sort();
  return JSON.stringify([request, nearby, reservationSignature(reservations)]);
};

/** A repair depends on the failed allocations too, not only the final geometry. */
class RouteMap extends Map<string, Point[]> {
  readonly reusable: boolean;

  constructor(entries?: Iterable<readonly [string, Point[]]>, reusable = true) {
    super(entries);
    this.reusable = reusable;
  }
}

interface RouteAttempt {
  routes: RouteMap;
  blocked: { id: string; blockers: string[] }[];
}

const routeAll = (
  nodes: RouteNodeRect[],
  requests: RouteRequest[],
  options: EdgeRouterOptions = {},
  previous?: RoutePassState,
  order?: readonly string[],
): RouteAttempt => {
  // The quantization boundary: nothing below this point sees a coordinate the
  // caller passed, only its lattice-snapped image. `nodeMargin` and
  // `selfLoopGap` are distances that end up added to coordinates, so they are
  // quantized with everything else — that is what makes the integer guarantee
  // unconditional rather than a promise kept only for callers that happen to
  // pass integers. `bendPenalty` is a term in the cost function, compared
  // against path lengths and never added to a position, so it is left alone and
  // a fractional one stays meaningful (which is why `COST_EPSILON` is still
  // needed above).
  const nodeMargin = quantize(options.nodeMargin ?? DEFAULT_NODE_MARGIN);
  const bendPenalty = options.bendPenalty ?? DEFAULT_BEND_PENALTY;
  const selfLoopGap = quantize(options.selfLoopGap ?? DEFAULT_SELF_LOOP_GAP);
  const quantizedRequests = [
    ...new Map(requests.map((r) => [r.id, quantizeRequest(r)])).values(),
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Duplicate ids are invalid input; the documented rule is that the last one
  // wins. Deduping before the obstacle index is built matters: otherwise a
  // superseded earlier rect keeps blocking segments even though nothing is
  // routed against it.
  const rectById = new Map(nodes.map((node) => [node.id, quantizeRect(node)]));
  const inflated: InflatedRect[] = [...rectById.values()]
    .filter((node) => node.obstacle !== false)
    .map((node) => ({
      id: node.id,
      minX: node.x - nodeMargin,
      minY: node.y - nodeMargin,
      maxX: node.x + node.width + nodeMargin,
      maxY: node.y + node.height + nodeMargin,
    }));
  // The retry rung: every rect, unclipped, which is what the search saw for
  // every edge before regions existed. Its obstacle index is built once per
  // pass rather than once per edge — the cost that used to buy a graph-wide
  // search for everyone now only has to be worth it for the requests that
  // actually fall through.
  const globalScope: SearchScope = {
    gridXs: inflated.flatMap((rect) => [rect.minX, rect.maxX]),
    gridYs: inflated.flatMap((rect) => [rect.minY, rect.maxY]),
    isBlocked: buildObstacleIndex(inflated),
  };

  // An exterior corridor must exist even when all existing lines are blocked.
  if (inflated.length > 0) {
    globalScope.gridXs.push(
      Math.min(...globalScope.gridXs) - 1,
      Math.max(...globalScope.gridXs) + 1,
    );
    globalScope.gridYs.push(
      Math.min(...globalScope.gridYs) - 1,
      Math.max(...globalScope.gridYs) + 1,
    );
  }

  if (order !== undefined) {
    const rank = new Map(order.map((id, index) => [id, index]));
    quantizedRequests.sort(
      (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    );
  }
  const validRequests = quantizedRequests.filter(
    (r) => rectById.has(r.source) && rectById.has(r.target),
  );
  const stubs = new Map(
    validRequests.map((r) => [r.id, requestStubs(r, nodeMargin)]),
  );
  const oldRequests =
    previous === undefined
      ? []
      : [...previous.requests.values()]
          .map(quantizeRequest)
          .filter(
            (r) => previous.rects.has(r.source) && previous.rects.has(r.target),
          );
  const oldStubs = new Map(
    oldRequests.map((r) => [r.id, requestStubs(r, nodeMargin)]),
  );
  const reserved = new Map<string, ReservedSegment[]>();
  const oldReserved = new Map(
    oldRequests.map((r) => [
      r.id,
      segmentsOf(previous?.routes.get(r.id) ?? []),
    ]),
  );
  const reservationsFor = (
    request: RouteRequest,
    all: RouteRequest[],
    fixed: Map<string, ReservedSegment[]>,
    paths: Map<string, ReservedSegment[]>,
    old = false,
  ) =>
    all.flatMap((other) =>
      other.id === request.id || sameBundle(request, other)
        ? []
        : [
            ...(fixed.get(other.id) ?? []),
            ...(old && other.id >= request.id
              ? []
              : (paths.get(other.id) ?? [])),
          ],
    );
  const routes = new RouteMap();
  const blocked: RouteAttempt["blocked"] = [];
  const save = (request: RouteRequest, points: Point[]) => {
    routes.set(request.id, points);
    reserved.set(request.id, segmentsOf(points));
  };
  for (const request of quantizedRequests) {
    const sourceRect = rectById.get(request.source);
    const targetRect = rectById.get(request.target);
    if (sourceRect === undefined || targetRect === undefined) {
      // Last wins here too: a skipped request must not leave an earlier
      // duplicate of the same id standing.
      routes.delete(request.id);
      continue;
    }

    const start = pushOutward(
      request.sourcePoint,
      request.sourceSide,
      nodeMargin,
    );
    const end = pushOutward(
      request.targetPoint,
      request.targetSide,
      nodeMargin,
    );
    const region = routeRegionOf(request, options);
    const reservations = reservationsFor(
      request,
      validRequests,
      stubs,
      reserved,
    );
    const localReservations = reservations.filter((s) =>
      reservationReaches(s, region),
    );
    const oldRequest = previous?.requests.get(request.id);
    const oldRoute = previous?.routes.get(request.id);
    if (
      previous !== undefined &&
      oldRequest !== undefined &&
      oldRoute !== undefined &&
      isRouteLocal(oldRequest, oldRoute) &&
      localSignature(request, [...rectById.values()], localReservations) ===
        localSignature(
          quantizeRequest(oldRequest),
          [...previous.rects.values()].map(quantizeRect),
          reservationsFor(
            quantizeRequest(oldRequest),
            oldRequests,
            oldStubs,
            oldReserved,
            true,
          ).filter((s) => reservationReaches(s, routeRegionOf(oldRequest))),
        )
    ) {
      save(request, oldRoute);
      continue;
    }
    const stubsClear =
      stubIsClear(request.sourcePoint, start, sourceRect, inflated) &&
      stubIsClear(end, request.targetPoint, targetRect, inflated);

    if (stubsClear && request.source === request.target) {
      const preferred = selfLoopPoints(
        request,
        sourceRect,
        nodeMargin,
        selfLoopGap,
      );
      // Keep the shortcut local: otherwise a remote rect could select a different
      // shape inside the region without invalidating the caller's cached route.
      const clear =
        preferred !== null &&
        preferred.every((point) => containsPoint(region, point)) &&
        preferred.slice(1).every((point, i) => {
          if (conflictsWith(preferred[i], point, localReservations))
            return false;
          if (i === 0)
            return stubIsClear(preferred[i], point, sourceRect, inflated);
          if (i === preferred.length - 2)
            return stubIsClear(preferred[i], point, targetRect, inflated);
          return !inflated.some((rect) =>
            segmentIntersects(preferred[i], point, rect),
          );
        });
      if (clear && preferred !== null) {
        save(request, preferred);
        continue;
      }
    }

    const grid = stubsClear
      ? (routeOnGrid(
          request,
          start,
          end,
          withReservations(
            scopeOfRegion(inflated, region, globalScope.isBlocked),
            localReservations,
          ),
          bendPenalty,
        ) ??
        routeOnGrid(
          request,
          start,
          end,
          withReservations(globalScope, reservations),
          bendPenalty,
        ))
      : null;
    if (grid === null && stubsClear) {
      const fixed = reservationsFor(request, validRequests, stubs, new Map());
      const compatibleStubs =
        !conflictsWith(request.sourcePoint, start, fixed) &&
        !conflictsWith(end, request.targetPoint, fixed);
      const independent = compatibleStubs
        ? routeOnGrid(
            request,
            start,
            end,
            withReservations(globalScope, fixed),
            bendPenalty,
          )
        : null;
      if (independent !== null) {
        const blockers = validRequests
          .filter(
            (other) =>
              other.id !== request.id &&
              !sameBundle(request, other) &&
              independent
                .slice(1)
                .some((point, i) =>
                  conflictsWith(
                    independent[i],
                    point,
                    reserved.get(other.id) ?? [],
                  ),
                ),
          )
          .map((other) => other.id);
        blocked.push({ id: request.id, blockers });
      }
    }
    save(
      request,
      grid === null
        ? fallbackPoints(request, nodeMargin, selfLoopGap)
        : dropDuplicates([
            clonePoint(request.sourcePoint),
            ...grid,
            clonePoint(request.targetPoint),
          ]),
    );
  }
  return { routes, blocked };
};

/** Repair greedy lane allocations before treating congestion as unroutable. */
const routeWithRepair = (
  nodes: RouteNodeRect[],
  requests: RouteRequest[],
  options: EdgeRouterOptions,
  previous?: RoutePassState,
): Map<string, Point[]> => {
  const initialOrder = [...new Set(requests.map((r) => r.id))].sort();
  const pending = [initialOrder];
  const visited = new Set([JSON.stringify(initialOrder)]);
  let best: RouteAttempt | undefined;
  for (let index = 0; index < pending.length; index++) {
    const order = pending[index];
    const result = routeAll(
      nodes,
      requests,
      options,
      index === 0 ? previous : undefined,
      order,
    );
    if (best === undefined || result.blocked.length < best.blocked.length)
      best = result;
    if (result.blocked.length === 0) {
      // Insertion order is deterministic too, regardless of the repair order.
      return new RouteMap(
        [...result.routes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        index === 0 && Object.keys(options).length === 0,
      );
    }
    for (const failed of result.blocked) {
      const position = order.indexOf(failed.id);
      for (const blocker of failed.blockers) {
        const before = order.indexOf(blocker);
        const next = [...order];
        next.splice(position, 1);
        next.splice(before, 0, failed.id);
        const key = JSON.stringify(next);
        if (!visited.has(key)) {
          visited.add(key);
          pending.push(next);
        }
      }
    }
  }
  return new RouteMap(
    [...(best?.routes ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    false,
  );
};

/** A fresh, deterministic pass over the complete request set. */
export const routeEdges = (
  nodes: RouteNodeRect[],
  requests: RouteRequest[],
  options: EdgeRouterOptions = {},
): Map<string, Point[]> => routeWithRepair(nodes, requests, options);

/** Same pass with default options, reusing only proven-unchanged local searches. */
export const routeEdgesWithReuse = (
  nodes: RouteNodeRect[],
  requests: RouteRequest[],
  previous: RoutePassState,
): Map<string, Point[]> =>
  routeWithRepair(
    nodes,
    requests,
    {},
    previous.routes instanceof RouteMap && previous.routes.reusable
      ? previous
      : undefined,
  );

/**
 * The region one request is searched in (`contracts/edge-routing.md`, "Per-edge
 * regions"), on the quantized request — the same box `routeEdges` builds, from
 * the same `regionOf`.
 *
 * Used with the nearby reservations and endpoint rectangles to determine
 * whether the exact local search inputs have changed. The region alone is not
 * sufficient for reuse: earlier lanes can move without any nearby node moving.
 */
export const routeRegionOf = (
  request: RouteRequest,
  options: EdgeRouterOptions = {},
): RouteRegion => {
  const nodeMargin = quantize(options.nodeMargin ?? DEFAULT_NODE_MARGIN);
  const quantized = quantizeRequest(request);
  return regionOf([
    quantized.sourcePoint,
    quantized.targetPoint,
    pushOutward(quantized.sourcePoint, quantized.sourceSide, nodeMargin),
    pushOutward(quantized.targetPoint, quantized.targetSide, nodeMargin),
  ]);
};

/**
 * Conservative geometric part of the reuse proof. Final fallbacks can
 * become routable when an enclosing obstacle far outside the region moves.
 * Comparing the full deterministic shape may also classify a searched route
 * as global; that only costs a recomputation, never leaves a stale result.
 */
export const isRouteLocal = (
  request: RouteRequest,
  points: Point[],
  options: EdgeRouterOptions = {},
): boolean => {
  const region = routeRegionOf(request, options);
  if (!points.every((point) => containsPoint(region, point))) return false;
  const fallback = fallbackPoints(
    quantizeRequest(request),
    quantize(options.nodeMargin ?? DEFAULT_NODE_MARGIN),
    quantize(options.selfLoopGap ?? DEFAULT_SELF_LOOP_GAP),
  );
  return comparePointSequences(points, fallback) !== 0;
};
