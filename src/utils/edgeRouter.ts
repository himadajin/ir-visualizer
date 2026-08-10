import type {
  EdgeRouterOptions,
  Point,
  RouteNodeRect,
  RouteRequest,
  RouteSide,
} from "../types/edgeRouting";

/**
 * Self-contained orthogonal edge router (`contracts/edge-routing.md`,
 * `specs/graph-view.md` §4). Every input coordinate is snapped to an integer
 * lattice at the entry of `routeEdges`; node rects are the only obstacles; a
 * sparse Hanan grid over the inflated rects is searched per edge with A*, and
 * the result is a rounded-corner-ready polyline. A routed edge begins and ends
 * exactly at its quantized handle positions; a self-loop is synthesized from its
 * node's rect alone and is exempt from that rule.
 */

/** Clearance kept around every node rect, px. */
export const DEFAULT_NODE_MARGIN = 12;
/** Price of one bend, expressed in px of path length (`length + bendPenalty * turns`). */
export const DEFAULT_BEND_PENALTY = 30;
/** Distance from a node's right edge to its self-loop lane, px. */
export const DEFAULT_SELF_LOOP_GAP = 24;

/**
 * Costs closer than this count as equal, so that geometrically symmetric
 * alternatives fall through to the documented tie-break order (§3.1) instead of
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

/** A handle position moved `distance` px out of the node along its side (§3.1 step 5). */
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
 */
const quantizeRect = (rect: RouteNodeRect): RouteNodeRect => {
  const x = quantize(rect.x);
  const y = quantize(rect.y);
  return {
    id: rect.id,
    x,
    y,
    width: quantize(rect.x + rect.width) - x,
    height: quantize(rect.y + rect.height) - y,
  };
};

/**
 * Quantizes the two handle positions of a request per component. A handle
 * position is a point, not an interval, so there is no companion field whose
 * consistency has to be preserved and `x` and `y` round independently.
 * Everything else — the ids and the two sides — is not a coordinate and passes
 * through untouched.
 */
const quantizeRequest = (request: RouteRequest): RouteRequest => ({
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

/** Lexicographic order on point sequences, prefix-first (§3.1 tie-breaking). */
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

/**
 * "Is this point strictly inside an obstacle?" over a uniform spatial hash.
 * Built once per `routeEdges` call rather than once per edge, which is what
 * keeps the 60-node / 80-edge pass inside the 50 ms budget (§2 decision 10).
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
  return (
    x: number,
    y: number,
    exemptA: string | null,
    exemptB: string | null,
  ): boolean => {
    const bucket = buckets.get(cellOf(x) * CELL_KEY_STRIDE + cellOf(y));
    if (bucket === undefined) return false;
    for (const rect of bucket) {
      if (rect.id === exemptA || rect.id === exemptB) continue;
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

interface RouterContext {
  nodeMargin: number;
  bendPenalty: number;
  gridXs: number[];
  gridYs: number[];
  isBlocked: (
    x: number,
    y: number,
    exemptA: string | null,
    exemptB: string | null,
  ) => boolean;
}

/** Binary heap over the §3.1 total order. */
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
 */
const routeOnGrid = (
  request: RouteRequest,
  start: Point,
  end: Point,
  context: RouterContext,
): Point[] | null => {
  // Candidate lines: every inflated rect edge, plus this edge's endpoints. The
  // pushed points are included as well so that they are always grid vertices,
  // even for a handle that does not sit on its node's boundary.
  const xs = sortedUnique([
    ...context.gridXs,
    request.sourcePoint.x,
    request.targetPoint.x,
    start.x,
    end.x,
  ]);
  const ys = sortedUnique([
    ...context.gridYs,
    request.sourcePoint.y,
    request.targetPoint.y,
    start.y,
    end.y,
  ]);
  const xIndex = new Map(xs.map((value, index) => [value, index]));
  const yIndex = new Map(ys.map((value, index) => [value, index]));

  const startXi = xIndex.get(start.x) ?? -1;
  const startYi = yIndex.get(start.y) ?? -1;
  const endXi = xIndex.get(end.x) ?? -1;
  const endYi = yIndex.get(end.y) ?? -1;
  if (startXi < 0 || startYi < 0 || endXi < 0 || endYi < 0) return null;

  const width = xs.length;
  const height = ys.length;
  const { bendPenalty } = context;
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

  // The total order of §3.1: cost, then bend count, then the point sequence.
  // Every key is non-decreasing along a path, so the first pop of a state is
  // its optimum under that order.
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

  const stateKey = (label: Label): number =>
    label.goal ? -1 : (label.yi * width + label.xi) * 4 + label.dir;

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
    // double back on the approach, which the no-immediate-reversal rule forbids
    // (§3.1). Such an approach simply cannot finish; if nothing else reaches T,
    // the edge falls back to D4.
    if (
      label.xi === endXi &&
      label.yi === endYi &&
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
    const labelAtStart = label.xi === startXi && label.yi === startYi;
    const labelAtEnd = label.xi === endXi && label.yi === endYi;
    for (let dir = 0; dir < 4; dir++) {
      if (dir === reverseDir(label.dir)) continue; // doubling back is never optimal
      const nextXi = label.xi + DIR_DX[dir];
      const nextYi = label.yi + DIR_DY[dir];
      if (nextXi < 0 || nextXi >= width || nextYi < 0 || nextYi >= height) {
        continue;
      }
      const nextX = xs[nextXi];
      const nextY = ys[nextYi];
      // §3.1 step 3: the exemption is per endpoint. The source node's rect is
      // exempt only for the segments incident to S, the target's only for those
      // incident to T; every other segment treats both as obstacles, so a
      // searched route can never clip its own endpoint node. Where that makes
      // the edge unroutable the no-path fallback takes over.
      const nextAtStart = nextXi === startXi && nextYi === startYi;
      const nextAtEnd = nextXi === endXi && nextYi === endYi;
      if (
        context.isBlocked(
          (x + nextX) / 2,
          (y + nextY) / 2,
          labelAtStart || nextAtStart ? request.source : null,
          labelAtEnd || nextAtEnd ? request.target : null,
        )
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
 * (§3.1 "No immediate reversals"). Note that `points[i - 1] !== points[i + 1]`
 * is _not_ an equivalent test: "out 16, back 48" passes it and is exactly the
 * shape being banned.
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
 * Deterministic shape used when the grid offers no path (§3.1 "No-path
 * fallback"): `sourcePoint → S → P1 → connector → P2 → T → targetPoint`.
 *
 * `P1` steps a further `selfLoopGap` out along the source normal and `P2` sits a
 * `selfLoopGap` outside `T`, so the polyline always leaves straight and always
 * approaches the target from outside. That makes the no-reversal rule hold at
 * `S` and `T` unconditionally, and reduces the whole problem to two conditions on
 * the connector: its first segment must not run along `-n_s`, its last must not
 * run along `+n_t`.
 *
 * Connector candidates are tried in a fixed order and the first one satisfying
 * the rule wins, which keeps the choice deterministic. Two segments suffice for
 * most geometry; 36 of the 144 side/direction combinations need the three-segment
 * lateral dog-leg, and coincident handles on the same side need the four-segment
 * rectangle (§3.1 documents the full ladder).
 */
const fallbackPoints = (
  request: RouteRequest,
  nodeMargin: number,
  selfLoopGap: number,
): Point[] => {
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
    nodeMargin + selfLoopGap,
  );
  const p2 = pushOutward(
    request.targetPoint,
    request.targetSide,
    nodeMargin + selfLoopGap,
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
  // Three-segment lateral dog-legs, positive side first (R1's convention).
  const xPositive = Math.max(p1.x, p2.x) + selfLoopGap;
  const xNegative = Math.min(p1.x, p2.x) - selfLoopGap;
  const yPositive = Math.max(p1.y, p2.y) + selfLoopGap;
  const yNegative = Math.min(p1.y, p2.y) - selfLoopGap;
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
    const lateralX = verticalExit ? selfLoopGap : 0;
    const lateralY = verticalExit ? 0 : selfLoopGap;
    const outX = DIR_DX[sourceNormal] * selfLoopGap;
    const outY = DIR_DY[sourceNormal] * selfLoopGap;
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

/**
 * Self-loops are synthesized, not routed (`contracts/edge-routing.md`,
 * "Self-loops"): always on the node's right side, out of the bottom edge at 75 %
 * of the width, around a lane `selfLoopGap` clear of the node, and back into the
 * top edge at the same offset. The rect and both clearances are already
 * quantized, so the only fractional value the six points can contain is the
 * 75 %-of-width stub offset — three quarters of an integer width is fractional
 * unless that width is a multiple of 4 — and it is rounded here, where it is
 * formed. This is the one rounding that happens behind the input boundary.
 *
 * Consecutive duplicates are collapsed, the same way searched and fallback
 * routes are: a clearance that quantizes to `0` makes two of the six points
 * coincide, and a coincident pair shares both coordinates instead of exactly
 * one, which would break orthogonality. A self-loop therefore returns at most
 * six points.
 */
const selfLoopPoints = (
  rect: RouteNodeRect,
  nodeMargin: number,
  selfLoopGap: number,
): Point[] => {
  const x = quantize(rect.x + rect.width * 0.75);
  const lane = rect.x + rect.width + selfLoopGap;
  const below = rect.y + rect.height + nodeMargin;
  const above = rect.y - nodeMargin;
  return dropDuplicates([
    { x, y: rect.y + rect.height },
    { x, y: below },
    { x: lane, y: below },
    { x: lane, y: above },
    { x, y: above },
    { x, y: rect.y },
  ]);
};

/**
 * Routes every request against the live node rects. Pure: the same rects and
 * requests always produce byte-identical polylines, and no route depends on the
 * order of either input array (§3.1 "Determinism is a hard requirement").
 *
 * Keyed by `RouteRequest.id`; a request naming a node absent from `nodes` gets
 * no entry at all (§3.1 "Missing nodes").
 *
 * Every coordinate in the input is quantized here, before the obstacle set is
 * built and before any search runs, so every returned coordinate is an integer
 * (`contracts/edge-routing.md`, "Integer coordinates"). A routed polyline's
 * endpoints are exact on the quantized request points, not on the fractional
 * ones a caller passed.
 *
 * Every returned polyline — searched, self-loop and fallback alike — is
 * orthogonal, has at least 2 points, and contains **no immediate reversal**: at
 * no interior vertex do the arriving and leaving segments run along the same
 * axis in opposite directions (§3.1 "No immediate reversals"). That is the
 * checkable form of "never a degenerate hook". The search gets it by refusing to
 * double back, the self-loop by construction, the fallback via its lateral
 * detour case.
 */
export const routeEdges = (
  nodes: RouteNodeRect[],
  requests: RouteRequest[],
  options: EdgeRouterOptions = {},
): Map<string, Point[]> => {
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
  const quantizedRequests = requests.map(quantizeRequest);

  // Duplicate ids are invalid input; the documented rule is that the last one
  // wins. Deduping before the obstacle index is built matters: otherwise a
  // superseded earlier rect keeps blocking segments even though nothing is
  // routed against it.
  const rectById = new Map(nodes.map((node) => [node.id, quantizeRect(node)]));
  const inflated: InflatedRect[] = [...rectById.values()].map((node) => ({
    id: node.id,
    minX: node.x - nodeMargin,
    minY: node.y - nodeMargin,
    maxX: node.x + node.width + nodeMargin,
    maxY: node.y + node.height + nodeMargin,
  }));
  const context: RouterContext = {
    nodeMargin,
    bendPenalty,
    gridXs: inflated.flatMap((rect) => [rect.minX, rect.maxX]),
    gridYs: inflated.flatMap((rect) => [rect.minY, rect.maxY]),
    isBlocked: buildObstacleIndex(inflated),
  };

  const routes = new Map<string, Point[]>();
  for (const request of quantizedRequests) {
    const sourceRect = rectById.get(request.source);
    const targetRect = rectById.get(request.target);
    if (sourceRect === undefined || targetRect === undefined) {
      // Last wins here too: a skipped request must not leave an earlier
      // duplicate of the same id standing.
      routes.delete(request.id);
      continue;
    }

    if (request.source === request.target) {
      routes.set(
        request.id,
        selfLoopPoints(sourceRect, nodeMargin, selfLoopGap),
      );
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
    const grid = routeOnGrid(request, start, end, context);
    const points = dropDuplicates(
      grid !== null
        ? [
            clonePoint(request.sourcePoint),
            ...grid,
            clonePoint(request.targetPoint),
          ]
        : fallbackPoints(request, nodeMargin, selfLoopGap),
    );
    routes.set(
      request.id,
      points.length >= 2
        ? points
        : [clonePoint(request.sourcePoint), clonePoint(request.targetPoint)],
    );
  }
  return routes;
};
