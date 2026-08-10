import { describe, it, expect } from "vitest";
import { routeEdges } from "../edgeRouter";
import type {
  Point,
  RouteNodeRect,
  RouteRequest,
  RouteSide,
} from "../../types/edgeRouting";

// ---------------------------------------------------------------------------
// Local geometry helpers. The router's frozen boundary
// (`contracts/edge-routing.md`, "The frozen boundary") only returns points, so
// intersection/orthogonality checks live here rather than depending on any
// router internals.
// ---------------------------------------------------------------------------

/** True when every consecutive pair of points forms an axis-aligned segment. */
function isOrthogonalPolyline(points: Point[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * True when the axis-aligned segment a→b passes through the *interior* of
 * `rect` (touching an edge/corner does not count as crossing the interior,
 * matching the router's own traversability rule: a grid segment is traversable
 * when it does not cross the interior of any inflated rect — see
 * `src/utils/edgeRouter.ts`).
 */
function segmentCrossesRectInterior(a: Point, b: Point, rect: Rect): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  if (a.y === b.y) {
    // Horizontal segment at y = a.y.
    const y = a.y;
    if (y <= top || y >= bottom) return false; // on/outside the rect's y-span
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    // Overlaps the open x-interval (left, right)?
    return x2 > left && x1 < right;
  }
  if (a.x === b.x) {
    // Vertical segment at x = a.x.
    const x = a.x;
    if (x <= left || x >= right) return false;
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    return y2 > top && y1 < bottom;
  }
  // Diagonal segments are not orthogonal; treat as not our concern here.
  return false;
}

function anySegmentCrossesRectInterior(points: Point[], rect: Rect): boolean {
  for (let i = 1; i < points.length; i++) {
    if (segmentCrossesRectInterior(points[i - 1], points[i], rect)) {
      return true;
    }
  }
  return false;
}

/**
 * Same as `anySegmentCrossesRectInterior`, but excludes the first segment
 * (`points[0]` -> `points[1]`) and the last segment (the final pair) — the
 * two mandated stubs (`sourcePoint -> S` and `T -> targetPoint`), which
 * "Endpoints are exact on the quantized points" can force through a node's own
 * rect when a pushed point lands inside it. For a polyline with fewer than 4
 * points there is no segment other than the first/last, so this is trivially
 * false.
 */
function anyMiddleSegmentCrossesRectInterior(
  points: Point[],
  rect: Rect,
): boolean {
  for (let i = 2; i < points.length - 1; i++) {
    if (segmentCrossesRectInterior(points[i - 1], points[i], rect)) {
      return true;
    }
  }
  return false;
}

/** The center point of one side of a rect — a plain geometric helper, not a
 * reimplementation of any router logic. */
function sideCenterPoint(rect: Rect, side: RouteSide): Point {
  switch (side) {
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

function outwardNormal(side: RouteSide): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

/**
 * True when `points` is shaped like the no-path fallback rather than a searched
 * route, without mirroring the whole connector ladder. Only the fallback
 * skeleton (`fallbackPoints` in `src/utils/edgeRouter.ts`) mandates a *second*
 * outward step past `S`, to `P1 = S + n_s·selfLoopGap` — a searched route's
 * third point is whatever the grid search finds next and has no reason to
 * land exactly there. So `points[2] === P1` identifies a fallback: it is
 * the one point every fallback shape is guaranteed to contain and a
 * searched route has no reason to reproduce by coincidence.
 */
function isFallbackShape(
  points: Point[],
  request: RouteRequest,
  nodeMargin = 12,
  selfLoopGap = 24,
): boolean {
  if (points.length < 3) return false;
  const n = outwardNormal(request.sourceSide);
  const s: Point = {
    x: request.sourcePoint.x + n.x * nodeMargin,
    y: request.sourcePoint.y + n.y * nodeMargin,
  };
  const p1: Point = {
    x: s.x + n.x * selfLoopGap,
    y: s.y + n.y * selfLoopGap,
  };
  return points[2].x === p1.x && points[2].y === p1.y;
}

/**
 * True when `points` contains an "immediate reversal": an interior vertex
 * where the segment arriving and the segment leaving run along the same
 * axis but in opposite directions (`contracts/edge-routing.md`, "No immediate
 * reversals" — the checkable form of "never a degenerate hook").
 */
function hasImmediateReversal(points: Point[]): boolean {
  for (let i = 1; i < points.length - 1; i++) {
    const inDx = points[i].x - points[i - 1].x;
    const inDy = points[i].y - points[i - 1].y;
    const outDx = points[i + 1].x - points[i].x;
    const outDy = points[i + 1].y - points[i].y;

    const bothHorizontal =
      inDy === 0 && outDy === 0 && inDx !== 0 && outDx !== 0;
    const bothVertical = inDx === 0 && outDx === 0 && inDy !== 0 && outDy !== 0;

    if (bothHorizontal && Math.sign(inDx) === -Math.sign(outDx)) return true;
    if (bothVertical && Math.sign(inDy) === -Math.sign(outDy)) return true;
  }
  return false;
}

/**
 * The interior vertices that are neither of the two pushed points, i.e. the
 * ones the contract ("Interior points are corners, except the two pushed
 * points") requires to be corners. Interior vertices run from index 1 to
 * `length - 2`; `points[1]` and `points[length - 2]` are the pushed points and
 * are exempt.
 */
function nonPushedInteriorIndices(points: Point[]): number[] {
  const indices: number[] = [];
  for (let i = 2; i < points.length - 2; i++) indices.push(i);
  return indices;
}

/**
 * True when every interior vertex other than the two pushed points is a
 * corner: its arriving and leaving segments run along different axes. A vertex
 * that fails this is a point in the middle of a straight run — the polyline is
 * then a trace of the vertices it passed rather than a list of its bends.
 */
function interiorVerticesAreCorners(points: Point[]): boolean {
  return nonPushedInteriorIndices(points).every((i) => {
    const arrivesHorizontally = points[i - 1].y === points[i].y;
    const leavesHorizontally = points[i].y === points[i + 1].y;
    return arrivesHorizontally !== leavesHorizontally;
  });
}

// ---------------------------------------------------------------------------
// Quantization helpers (contract "Input quantization"). `q` restates the
// contract's own rounding rule — `Math.round`, with `-0` normalized to `0` —
// so a test can name the quantized input without importing anything from the
// router. The rest are plain predicates over returned points.
// ---------------------------------------------------------------------------

/** `Math.round` with `-0` normalized to `0`. */
function q(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

/** True when every coordinate of every point is an integer. */
function allCoordinatesAreIntegers(points: Point[]): boolean {
  return points.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y));
}

/**
 * True when any coordinate is negative zero. `Number.isInteger(-0)` is `true`,
 * so `allCoordinatesAreIntegers` cannot see this on its own — the contract
 * ("Rounding is `Math.round` throughout") bans `-0` separately.
 */
function hasNegativeZeroCoordinate(points: Point[]): boolean {
  return points.some((p) => Object.is(p.x, -0) || Object.is(p.y, -0));
}

/**
 * True when two consecutive points are identical. Such a pair shares *both*
 * coordinates rather than exactly one, which `isOrthogonalPolyline` cannot
 * detect (it only rejects pairs sharing *neither*). The contract's self-loop
 * section makes the absence of these unconditional: "no two consecutive
 * returned points are ever identical … in domain or out of it".
 */
function hasConsecutiveDuplicatePoint(points: Point[]): boolean {
  for (let i = 1; i < points.length; i++) {
    if (points[i].x === points[i - 1].x && points[i].y === points[i - 1].y) {
      return true;
    }
  }
  return false;
}

/**
 * Length of the shortest run, or `Infinity` when there is no segment at all.
 * Segments are axis-aligned, so `|dx| + |dy|` is the run length.
 */
function shortestSegmentLength(points: Point[]): number {
  let shortest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const run =
      Math.abs(points[i].x - points[i - 1].x) +
      Math.abs(points[i].y - points[i - 1].y);
    if (run < shortest) shortest = run;
  }
  return shortest;
}

/** Total Manhattan length of an orthogonal polyline. */
function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total +=
      Math.abs(points[i].x - points[i - 1].x) +
      Math.abs(points[i].y - points[i - 1].y);
  }
  return total;
}

/**
 * A deterministic stream of fractions in [0, 1) with three decimals, used by
 * the fractional sweeps below. A plain LCG rather than `Math.random` so that a
 * failure is reproducible and the suite cannot pass or fail by luck.
 */
function fractionStream(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return (state % 1000) / 1000;
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Two nodes side by side with nothing between them. */
function simpleTwoNodeCase(): {
  nodes: RouteNodeRect[];
  request: RouteRequest;
} {
  const nodes: RouteNodeRect[] = [
    { id: "A", x: 0, y: 0, width: 40, height: 40 },
    { id: "B", x: 200, y: 0, width: 40, height: 40 },
  ];
  const request: RouteRequest = {
    id: "e-A-B",
    source: "A",
    target: "B",
    sourcePoint: { x: 40, y: 20 },
    targetPoint: { x: 200, y: 20 },
    sourceSide: "right",
    targetSide: "left",
  };
  return { nodes, request };
}

describe("routeEdges — orthogonality and point count", () => {
  it("returns an orthogonal polyline with at least 2 points for a simple route", () => {
    const { nodes, request } = simpleTwoNodeCase();
    const routes = routeEdges(nodes, [request]);
    const points = routes.get(request.id)!;

    expect(points).toBeDefined();
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(isOrthogonalPolyline(points)).toBe(true);
  });
});

describe("routeEdges — exact endpoints (contract: 'Endpoints are exact on the quantized points')", () => {
  it("starts exactly at sourcePoint and ends exactly at targetPoint", () => {
    const { nodes, request } = simpleTwoNodeCase();
    const routes = routeEdges(nodes, [request]);
    const points = routes.get(request.id)!;

    expect(points[0]).toEqual(request.sourcePoint);
    expect(points[points.length - 1]).toEqual(request.targetPoint);
  });

  it("keeps the endpoints exact even when a detour around an obstacle is required", () => {
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      { id: "OBS", x: 100, y: 0, width: 40, height: 40 },
      { id: "B", x: 200, y: 0, width: 40, height: 40 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 200, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };
    const routes = routeEdges(nodes, [request]);
    const points = routes.get(request.id)!;

    expect(points[0]).toEqual(request.sourcePoint);
    expect(points[points.length - 1]).toEqual(request.targetPoint);
  });
});

describe("routeEdges — obstacle avoidance (nodes are the only obstacles)", () => {
  it("never draws a segment through the interior of a node squarely between source and target", () => {
    const obstacle: RouteNodeRect = {
      id: "OBS",
      x: 100,
      y: 0,
      width: 40,
      height: 40,
    };
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      obstacle,
      { id: "B", x: 200, y: 0, width: 40, height: 40 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 200, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };
    const routes = routeEdges(nodes, [request]);
    const points = routes.get(request.id)!;

    // Sanity: a real (non-fallback) route should exist here — there's open
    // space above and below the obstacle to route through.
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(anySegmentCrossesRectInterior(points, obstacle)).toBe(false);
  });
});

describe("routeEdges — determinism (contract: 'Determinism')", () => {
  it("returns identical points for identical input on repeated calls", () => {
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      { id: "OBS", x: 100, y: 0, width: 40, height: 40 },
      { id: "B", x: 200, y: 0, width: 40, height: 40 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 200, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };

    const first = routeEdges(nodes, [request]).get(request.id);
    const second = routeEdges(nodes, [request]).get(request.id);

    expect(second).toEqual(first);
  });

  it("gives each request the same route regardless of the order of the nodes and requests arrays", () => {
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      { id: "OBS", x: 100, y: 0, width: 40, height: 40 },
      { id: "B", x: 200, y: 0, width: 40, height: 40 },
      { id: "C", x: 0, y: 200, width: 40, height: 40 },
    ];
    const requests: RouteRequest[] = [
      {
        id: "e-A-B",
        source: "A",
        target: "B",
        sourcePoint: { x: 40, y: 20 },
        targetPoint: { x: 200, y: 20 },
        sourceSide: "right",
        targetSide: "left",
      },
      {
        id: "e-A-C",
        source: "A",
        target: "C",
        sourcePoint: { x: 20, y: 40 },
        targetPoint: { x: 20, y: 200 },
        sourceSide: "bottom",
        targetSide: "top",
      },
    ];

    const forward = routeEdges(nodes, requests);
    const reversed = routeEdges([...nodes].reverse(), [...requests].reverse());

    for (const request of requests) {
      expect(reversed.get(request.id)).toEqual(forward.get(request.id));
    }
  });
});

describe("routeEdges — tie-breaking (contract: 'A fixed tie-break total order')", () => {
  // A perfectly mirror-symmetric obstacle scenario: S, the obstacle, and T
  // all share the same x-span (0..40), so the grid's candidate X lines are
  // exactly {left-inflated, 20 (both endpoints' x), right-inflated} and the
  // whole grid is symmetric about x = 20. Any left-detour path around the
  // obstacle therefore has an exact mirror right-detour path of identical
  // length and identical bend count — a genuine, spec-derivable tie.
  //
  // Ties are broken by comparing the point sequence lexicographically
  // by (x, y). Both candidate paths coincide through points[0] (sourcePoint,
  // x=20) and points[1] (the nodeMargin-pushed point, still x=20 because the
  // push is purely vertical). At the first point where the two candidates
  // diverge, the mirror relationship forces one candidate's x below 20 and
  // the other's above 20 (reflection x -> 40 - x around the axis of
  // symmetry) — so the smaller-x (left) candidate must sort first and win,
  // regardless of exactly which grid line the router picks for the detour.
  it("breaks a symmetric tie toward the lexicographically smaller (left) detour", () => {
    const nodes: RouteNodeRect[] = [
      { id: "S", x: 0, y: 0, width: 40, height: 40 },
      { id: "OBS", x: 0, y: 120, width: 40, height: 40 },
      { id: "T", x: 0, y: 240, width: 40, height: 40 },
    ];
    const request: RouteRequest = {
      id: "e-S-T",
      source: "S",
      target: "T",
      sourcePoint: { x: 20, y: 40 },
      targetPoint: { x: 20, y: 240 },
      sourceSide: "bottom",
      targetSide: "top",
    };

    const points = routeEdges(nodes, [request]).get(request.id)!;

    // A real route must exist (there's room to detour on both sides).
    expect(points.length).toBeGreaterThan(2);

    const diverging = points.find((p) => p.x !== 20);
    expect(diverging).toBeDefined();
    expect(diverging!.x).toBeLessThan(20);
  });
});

describe("routeEdges — self-loops hug the node's right side (contract: 'Self-loops (right side, six points)')", () => {
  it("produces the documented six-point right-side loop shape, derived from the rect and not from sourcePoint/targetPoint", () => {
    const rect: RouteNodeRect = { id: "A", x: 0, y: 0, width: 100, height: 50 };
    const nodeMargin = 12; // contract default
    const selfLoopGap = 24; // contract default
    const laneX = rect.x + rect.width + selfLoopGap;

    // Self-loops are synthesized from the node rect and are exempt from the
    // exact-endpoints rule — sourcePoint/targetPoint are ignored. Use React
    // Flow's real default (a centred handle), deliberately *not* the
    // 75%-offset point, so this test actually pins that the loop shape comes
    // from the rect rather than merely echoing back a pre-shaped request.
    const centredBottom: Point = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height,
    };
    const centredTop: Point = { x: rect.x + rect.width / 2, y: rect.y };

    const request: RouteRequest = {
      id: "loop-A",
      source: "A",
      target: "A",
      sourcePoint: centredBottom,
      targetPoint: centredTop,
      sourceSide: "bottom",
      targetSide: "top",
    };

    const points = routeEdges([rect], [request]).get(request.id)!;

    // The contract's six-point form, exact vertex table.
    const expected: Point[] = [
      { x: rect.x + 0.75 * rect.width, y: rect.y + rect.height },
      { x: rect.x + 0.75 * rect.width, y: rect.y + rect.height + nodeMargin },
      { x: laneX, y: rect.y + rect.height + nodeMargin },
      { x: laneX, y: rect.y - nodeMargin },
      { x: rect.x + 0.75 * rect.width, y: rect.y - nodeMargin },
      { x: rect.x + 0.75 * rect.width, y: rect.y },
    ];
    expect(points).toEqual(expected);

    // The exemption in action: the loop does not start/end at the centred
    // handle we supplied — it starts/ends at the 75%-offset points derived
    // from rect.
    expect(points[0]).not.toEqual(request.sourcePoint);
    expect(points[points.length - 1]).not.toEqual(request.targetPoint);

    expect(isOrthogonalPolyline(points)).toBe(true);
  });
});

describe("routeEdges — no-path fallback: the skeleton + connector ladder (`fallbackPoints`)", () => {
  // A single huge obstacle node, distinct from source and target, that
  // encloses the entire region every fixture below uses. Because the
  // source/target rect exemption only applies to the
  // source and target's *own* rects, every grid path must cross this
  // obstacle's interior somewhere — guaranteeing routeEdges finds no path
  // and must emit the fully-specified fallback. A and B's own rects are
  // placeholders: the fallback is a pure function of the request's own
  // sourcePoint/targetPoint/sides, never of node rects.
  const wall: RouteNodeRect = {
    id: "WALL",
    x: -1000,
    y: -1000,
    width: 3000,
    height: 3000,
  };
  const a: RouteNodeRect = { id: "A", x: -900, y: -900, width: 10, height: 10 };
  const b: RouteNodeRect = { id: "B", x: 900, y: 900, width: 10, height: 10 };
  const nodes = [a, b, wall];

  const nodeMargin = 12; // contract default
  const g = 24; // selfLoopGap contract default — also the ladder's own gap

  // Every expected polyline below is hand-computed directly from the
  // skeleton (sourcePoint -> S -> P1 -> …connector… -> P2 -> T ->
  // targetPoint, with P1 = S + n_s·g, P2 = T + n_t·g) and its candidate
  // table, not by calling any reimplementation of the ladder.

  it("rung 1 — direct: P1..P2 collapse to a single straight run when they share an axis", () => {
    // n_s = (1,0) ("right"), n_t = (-1,0) ("left").
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 400, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };

    const s: Point = { x: 40 + nodeMargin, y: 20 };
    const p1: Point = { x: s.x + g, y: 20 };
    const t: Point = { x: 400 - nodeMargin, y: 20 };
    const p2: Point = { x: t.x - g, y: 20 };
    // dy = p2.y - p1.y = 0, so "direct" is offered, and a single straight
    // run (40 -> 56 -> 80 -> 360 -> 384 -> 400, all +x) has no reversal —
    // rank 1 wins immediately.
    const expected: Point[] = [
      request.sourcePoint,
      s,
      p1,
      p2,
      t,
      request.targetPoint,
    ];

    const points = routeEdges(nodes, [request]).get(request.id)!;
    expect(points).toEqual(expected);
  });

  it("rung 2 — along-exit L: the connector continues along the source's exit axis first", () => {
    // n_s = (0,1) ("bottom", vertical), n_t = (-1,0) ("left").
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 20, y: 40 },
      targetPoint: { x: 300, y: 170 },
      sourceSide: "bottom",
      targetSide: "left",
    };

    const s: Point = { x: 20, y: 40 + nodeMargin };
    const p1: Point = { x: 20, y: s.y + g };
    const t: Point = { x: 300 - nodeMargin, y: 170 };
    const p2: Point = { x: t.x - g, y: 170 };
    // dx = p2.x - p1.x = 240, dy = p2.y - p1.y = 90: both nonzero, so
    // "direct" is not offered. n_s is vertical, so along-exit's
    // intermediate is (P1.x, P2.y) = (20, 170): the connector's first
    // segment (P1 -> intermediate) continues +y, the same direction as
    // n_s, so it cannot run along -n_s — valid, and it's tried before
    // across-exit.
    const intermediate: Point = { x: p1.x, y: p2.y };
    const expected: Point[] = [
      request.sourcePoint,
      s,
      p1,
      intermediate,
      p2,
      t,
      request.targetPoint,
    ];

    const points = routeEdges(nodes, [request]).get(request.id)!;
    expect(points).toEqual(expected);
  });

  it("rung 3 — across-exit L: selected once along-exit would run backward into -n_s", () => {
    // n_s = (0,1) ("bottom", vertical), n_t = (1,0) ("right").
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 300, y: -50 },
      sourceSide: "bottom",
      targetSide: "right",
    };

    const s: Point = { x: 0, y: nodeMargin };
    const p1: Point = { x: 0, y: s.y + g }; // (0, 40)
    const t: Point = { x: 300 + nodeMargin, y: -50 };
    const p2: Point = { x: t.x + g, y: -50 }; // (340, -50)
    // dx = 340, dy = -90: both nonzero. along-exit's intermediate would be
    // (P1.x, P2.y) = (0, -50); its first segment P1 -> (0,-50) runs -y,
    // which *is* -n_s (n_s = +y for "bottom") — invalid, rejected.
    // across-exit's intermediate is (P2.x, P1.y) = (340, 40): first
    // segment (340,0) is horizontal, never along the vertical -n_s;
    // last segment (0,-90) is vertical, but n_t is horizontal ("right"),
    // so it can't run along +n_t either — valid.
    const intermediate: Point = { x: p2.x, y: p1.y };
    const expected: Point[] = [
      request.sourcePoint,
      s,
      p1,
      intermediate,
      p2,
      t,
      request.targetPoint,
    ];

    const points = routeEdges(nodes, [request]).get(request.id)!;
    expect(points).toEqual(expected);
  });

  it("rung 4 — dog-leg +x: selected when source and target share the vertical axis pointing opposite ways, running backward", () => {
    // n_s = (0,1) ("bottom"), n_t = (0,-1) ("top") — the "same axis,
    // opposite ways" case that needs 3 segments.
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 200, y: 0 },
      sourceSide: "bottom",
      targetSide: "top",
    };

    const s: Point = { x: 0, y: nodeMargin };
    const p1: Point = { x: 0, y: s.y + g }; // (0, 40)
    const t: Point = { x: 200, y: -nodeMargin };
    const p2: Point = { x: 200, y: t.y - g }; // (200, -40)
    // dx = 200, dy = -80: both nonzero. Both along-exit and across-exit
    // fail here — P2 sits "behind" P1 along the shared vertical axis, so
    // whichever L goes vertical-first reverses at P1 and whichever goes
    // horizontal-first reverses at P2. Dog-leg +x's
    // segments are horizontal, orthogonal to the vertical n_s/n_t, so
    // neither of its two guard conditions can ever fire — it's always
    // valid whenever offered, and it's tried before +y.
    const xp = Math.max(p1.x, p2.x) + g; // max(0,200)+24 = 224
    const expected: Point[] = [
      request.sourcePoint,
      s,
      p1,
      { x: xp, y: p1.y },
      { x: xp, y: p2.y },
      p2,
      t,
      request.targetPoint,
    ];

    const points = routeEdges(nodes, [request]).get(request.id)!;
    expect(points).toEqual(expected);
  });

  it("rung 8 — rectangle: selected when the two pushed points coincide", () => {
    // Source and target handles coincide and sit on the same side, so
    // P1 = P2 exactly — "the two handles coincide and sit on the same
    // side, where returning to a point without retracing requires going
    // around it". n_s = (0,1) ("bottom").
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 0, y: 0 },
      sourceSide: "bottom",
      targetSide: "bottom",
    };

    const s: Point = { x: 0, y: nodeMargin };
    const p1: Point = { x: 0, y: s.y + g }; // (0, 40) — also P2 and T.
    // Both dx=0 and dy=0, so "direct" is nominally offered, but its only
    // segment would be zero-length and the vertex it merges into reverses
    // (S->P1 runs +n_s, P2->T runs -n_t, and n_s = n_t here) — rejected.
    // dx=dy=0 also means along-exit/across-exit are never offered (they
    // require both nonzero). Every dog-leg (+x, +y, -x, -y) degenerates
    // the same way: since P1.x=P2.x and P1.y=P2.y, both of a dog-leg's
    // intermediate points coincide, so it collapses into an out-and-
    // straight-back spur on one axis — a reversal, rejected in turn.
    // Only the rectangle candidate (n_s vertical -> lateral unit l=(1,0))
    // goes around instead of retracing.
    const l: Point = { x: 1, y: 0 };
    const pt1: Point = { x: p1.x + l.x * g, y: p1.y + l.y * g }; // (24, 40)
    const pt2: Point = { x: pt1.x, y: pt1.y + g }; // (24, 64)
    const pt3: Point = { x: p1.x, y: p1.y + g }; // (0, 64)
    const expected: Point[] = [
      request.sourcePoint,
      s,
      p1,
      pt1,
      pt2,
      pt3,
      p1, // P2, numerically identical to P1
      s, // T, numerically identical to S
      request.targetPoint,
    ];

    const points = routeEdges(nodes, [request]).get(request.id)!;
    expect(points).toEqual(expected);
  });
});

describe("routeEdges — requests naming a node absent from `nodes` (contract: 'Missing nodes')", () => {
  const nodes: RouteNodeRect[] = [
    { id: "A", x: 0, y: 0, width: 40, height: 40 },
    { id: "B", x: 200, y: 0, width: 40, height: 40 },
  ];

  it("produces no map entry when the source id is absent, without throwing", () => {
    const request: RouteRequest = {
      id: "e-missing-source",
      source: "GHOST",
      target: "B",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 200, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };

    expect(() => routeEdges(nodes, [request])).not.toThrow();
    const routes = routeEdges(nodes, [request]);
    expect(routes.has("e-missing-source")).toBe(false);
  });

  it("produces no map entry when the target id is absent, without throwing", () => {
    const request: RouteRequest = {
      id: "e-missing-target",
      source: "A",
      target: "GHOST",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 0, y: 0 },
      sourceSide: "right",
      targetSide: "left",
    };

    expect(() => routeEdges(nodes, [request])).not.toThrow();
    const routes = routeEdges(nodes, [request]);
    expect(routes.has("e-missing-target")).toBe(false);
  });

  it("applies the same omission to a self-loop whose node is absent", () => {
    const request: RouteRequest = {
      id: "loop-missing",
      source: "GHOST",
      target: "GHOST",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 0, y: 0 },
      sourceSide: "bottom",
      targetSide: "top",
    };

    expect(() => routeEdges(nodes, [request])).not.toThrow();
    expect(routeEdges(nodes, [request]).has("loop-missing")).toBe(false);
  });

  it("still routes the other requests when one request names an absent node", () => {
    const valid: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 200, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };
    const invalid: RouteRequest = {
      id: "e-missing",
      source: "GHOST",
      target: "B",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 200, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };

    const routes = routeEdges(nodes, [valid, invalid]);
    expect(routes.has("e-missing")).toBe(false);
    expect(routes.has("e-A-B")).toBe(true);
    expect(routes.get("e-A-B")!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("routeEdges — pushed points survive collinear collapse (contract: 'Endpoints are exact on the quantized points')", () => {
  // Collinear interior points are collapsed, but the two pushed points are
  // never collapsed away: points[1] must be sourcePoint pushed
  // nodeMargin outward along sourceSide, and the second-to-last point must
  // be targetPoint pushed outward along targetSide, even when those pushed
  // points are collinear with everything around them — the case a naive
  // "collapse all collinear points" pass would break.
  const nodeMargin = 12; // contract default

  it("keeps points[1] / second-to-last as the pushed points on a dead-straight route", () => {
    // simpleTwoNodeCase: A's right-center to B's left-center, both at y=20 —
    // a straight horizontal line with no obstacle, so a naive collapse would
    // be tempted to reduce the whole thing to just [sourcePoint, targetPoint].
    const { nodes, request } = simpleTwoNodeCase();

    const points = routeEdges(nodes, [request]).get(request.id)!;

    const pushedSource: Point = {
      x: request.sourcePoint.x + nodeMargin, // sourceSide "right" -> +x
      y: request.sourcePoint.y,
    };
    const pushedTarget: Point = {
      x: request.targetPoint.x - nodeMargin, // targetSide "left" -> -x
      y: request.targetPoint.y,
    };

    expect(points[1]).toEqual(pushedSource);
    expect(points[points.length - 2]).toEqual(pushedTarget);
  });

  it("keeps points[1] / second-to-last as the pushed points on a route that detours around an obstacle", () => {
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      { id: "OBS", x: 100, y: 0, width: 40, height: 40 },
      { id: "B", x: 200, y: 0, width: 40, height: 40 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 200, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };

    const points = routeEdges(nodes, [request]).get(request.id)!;

    const pushedSource: Point = {
      x: request.sourcePoint.x + nodeMargin,
      y: request.sourcePoint.y,
    };
    const pushedTarget: Point = {
      x: request.targetPoint.x - nodeMargin,
      y: request.targetPoint.y,
    };

    expect(points[1]).toEqual(pushedSource);
    expect(points[points.length - 2]).toEqual(pushedTarget);
  });
});

describe("routeEdges — a straight run is returned as its end points (contract: 'Interior points are corners, except the two pushed points')", () => {
  // The companion of the block above, pinning the other half of the same
  // sentence. That block fixes which collinear points are *kept* (the two
  // pushed ones); this one fixes that every other point in the middle of a
  // straight run is *dropped*, so that a route's point count is set by how
  // many times it turns and not by how many rects happen to sit along the
  // line it takes. The difference is invisible on `simpleTwoNodeCase` —
  // nothing there puts a rect boundary between the two pushed points — so
  // each fixture below deliberately spreads unrelated nodes along the route's
  // straight legs.

  /**
   * Bystander nodes strung out along one horizontal line. They block nothing —
   * the fixtures place them clear of the route — but each contributes a pair
   * of vertical rect boundaries the route runs straight through.
   */
  function bystandersAlongX(xs: number[], y: number): RouteNodeRect[] {
    return xs.map((x) => ({
      id: `BY-${x}-${y}`,
      x,
      y,
      width: 40,
      height: 40,
    }));
  }

  it("returns a dead-straight route as four points, however many rect boundaries it crosses", () => {
    // A -> B is a clear horizontal line at y = 20. The bystanders sit far
    // below it and block nothing, but their left and right boundaries cross
    // the line at x = 68, 132, 148, 212, 228, 292, 308 and 372 — eight
    // points the route runs straight through.
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      { id: "B", x: 400, y: 0, width: 40, height: 40 },
      ...bystandersAlongX([80, 160, 240, 320], 200),
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 400, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };

    const points = routeEdges(nodes, [request]).get(request.id)!;

    // sourcePoint, the pushed source, the pushed target, targetPoint — and
    // nothing else: the whole route is one straight run.
    expect(points).toEqual([
      { x: 40, y: 20 },
      { x: 52, y: 20 },
      { x: 388, y: 20 },
      { x: 400, y: 20 },
    ]);
  });

  it("returns each leg of a one-corner route as its end points", () => {
    // Right side of A to top of B, which a single corner at (420, 20)
    // connects. Bystanders cross the horizontal leg (below it) and the
    // vertical leg (to its right), so both legs run straight through several
    // boundaries.
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      { id: "B", x: 400, y: 400, width: 40, height: 40 },
      ...bystandersAlongX([80, 160, 240], 600),
      { id: "BY-right-1", x: 600, y: 100, width: 40, height: 40 },
      { id: "BY-right-2", x: 600, y: 180, width: 40, height: 40 },
      { id: "BY-right-3", x: 600, y: 260, width: 40, height: 40 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 420, y: 400 },
      sourceSide: "right",
      targetSide: "top",
    };

    const points = routeEdges(nodes, [request]).get(request.id)!;

    expect(points).toEqual([
      { x: 40, y: 20 },
      { x: 52, y: 20 },
      { x: 420, y: 20 }, // the one corner
      { x: 420, y: 388 },
      { x: 420, y: 400 },
    ]);
  });

  it("reports only corners at the interior vertices of every route across a field of obstacles", () => {
    // The two fixtures above pin exact shapes; this widens the same property
    // to a sweep whose routes have to bend around a 3x3 field of nodes. Every
    // interior vertex that is not one of the two pushed points must be a
    // corner. Fallback-shaped results are skipped: their vertices are placed
    // by the ladder rather than found, and the contract exempts them.
    const field: RouteNodeRect[] = [];
    for (const x of [120, 240, 360]) {
      for (const y of [120, 240, 360]) {
        field.push({ id: `F-${x}-${y}`, x, y, width: 60, height: 60 });
      }
    }
    const aRect: RouteNodeRect = { id: "A", x: 0, y: 0, width: 60, height: 60 };
    const bPositions = [
      { x: 480, y: 0 },
      { x: 480, y: 240 },
      { x: 480, y: 480 },
      { x: 240, y: 480 },
      { x: 0, y: 480 },
    ];
    const sidePairs: { sourceSide: RouteSide; targetSide: RouteSide }[] = [
      { sourceSide: "right", targetSide: "left" },
      { sourceSide: "right", targetSide: "top" },
      { sourceSide: "bottom", targetSide: "top" },
      { sourceSide: "bottom", targetSide: "left" },
    ];

    const failures: string[] = [];
    let checked = 0;
    let withInteriorCorner = 0;

    for (const position of bPositions) {
      for (const { sourceSide, targetSide } of sidePairs) {
        const bRect: RouteNodeRect = {
          id: "B",
          x: position.x,
          y: position.y,
          width: 60,
          height: 60,
        };
        const request: RouteRequest = {
          id: "e-A-B",
          source: "A",
          target: "B",
          sourcePoint: sideCenterPoint(aRect, sourceSide),
          targetPoint: sideCenterPoint(bRect, targetSide),
          sourceSide,
          targetSide,
        };

        const points = routeEdges([aRect, bRect, ...field], [request]).get(
          request.id,
        )!;
        if (isFallbackShape(points, request)) continue;

        checked++;
        if (nonPushedInteriorIndices(points).length > 0) withInteriorCorner++;
        if (!interiorVerticesAreCorners(points)) {
          failures.push(
            `B at (${position.x},${position.y}) ${sourceSide}->${targetSide}: ` +
              `${JSON.stringify(points)}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
    // The sweep is only worth anything if it produced routes with interior
    // vertices to judge in the first place.
    expect(checked).toBeGreaterThan(0);
    expect(withInteriorCorner).toBeGreaterThan(0);
  });
});

describe("routeEdges — own-node clearance is a searched-route property (the per-endpoint obstacle exemption in `edgeRouter.ts`)", () => {
  // The no-clipping rule binds *searched* routes only. The no-path fallback
  // is exempt by design — its skeleton mandates a second outward step past S
  // to P1, which can land inside the *other* node's rect when the two nodes
  // are close or overlapping, and its connector ladder does no obstacle
  // avoidance at all (`specs/graph-view.md` §4, "Known limitations"). A
  // fallback-shaped result is identified via `isFallbackShape`
  // (points[2] === P1) and skipped rather than asserted clear; every other
  // (searched) result must stay clear on every segment but the first and the
  // last (the two mandated stubs, which "Endpoints are exact on the quantized
  // points" can force through a node's own rect even for a searched route
  // when a pushed point lands inside it).

  it("keeps every non-stub segment of a searched route clear of A's and B's own rect interiors across a sweep of B's position", () => {
    // Regression case origin: two ordinary basic-block-sized nodes,
    // bottom-of-A to top-of-B, with B dragged up and to the left of where a
    // plain top-to-bottom CFG layout would place it — the reviewer found
    // the router cutting through the endpoint node's own rect here at 66 of
    // 1681 sampled positions. This sweeps a small grid of offsets around
    // that case rather than asserting a single position.
    const aRect: RouteNodeRect = {
      id: "A",
      x: 0,
      y: 0,
      width: 120,
      height: 50,
    };
    const baseB = { x: -50, y: 50, width: 120, height: 50 };
    const offsets = [-30, -15, 0, 15, 30];

    const failures: string[] = [];

    for (const dx of offsets) {
      for (const dy of offsets) {
        const bRect: RouteNodeRect = {
          id: "B",
          x: baseB.x + dx,
          y: baseB.y + dy,
          width: baseB.width,
          height: baseB.height,
        };
        const request: RouteRequest = {
          id: "e-A-B",
          source: "A",
          target: "B",
          sourcePoint: {
            x: aRect.x + aRect.width / 2,
            y: aRect.y + aRect.height,
          },
          targetPoint: { x: bRect.x + bRect.width / 2, y: bRect.y },
          sourceSide: "bottom",
          targetSide: "top",
        };

        const points = routeEdges([aRect, bRect], [request]).get(request.id)!;

        // The fallback is exempt — skip a fallback-shaped result rather than
        // asserting clearance on it.
        if (isFallbackShape(points, request)) continue;

        if (anyMiddleSegmentCrossesRectInterior(points, aRect)) {
          failures.push(
            `dx=${dx},dy=${dy}: non-stub segment crosses A's own rect`,
          );
        }
        if (anyMiddleSegmentCrossesRectInterior(points, bRect)) {
          failures.push(
            `dx=${dx},dy=${dy}: non-stub segment crosses B's own rect`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("holds the no-reversal and orthogonality invariants (not clearance) for forced no-path fallback routes, including overlapping source/target rects", () => {
    // These configs are forced into the no-path fallback via WALL (same
    // technique as the "no-path fallback" describe block above), which is
    // exempt from own-node clearance by design — so this checks the
    // invariants the fallback *is* bound by instead: every returned
    // polyline is still orthogonal and still has no immediate reversal.
    // Overlapping rects are exactly the case where a mandated stub can
    // legitimately land inside the *other* node's rect; a non-overlapping
    // config is included too, to broaden the sample.
    const wall: RouteNodeRect = {
      id: "WALL",
      x: -1000,
      y: -1000,
      width: 3000,
      height: 3000,
    };

    const configs: {
      a: RouteNodeRect;
      b: RouteNodeRect;
      sourceSide: RouteSide;
      targetSide: RouteSide;
    }[] = [
      {
        a: { id: "A", x: 0, y: 0, width: 120, height: 50 },
        b: { id: "B", x: -50, y: 30, width: 120, height: 50 }, // overlaps A
        sourceSide: "bottom",
        targetSide: "top",
      },
      {
        a: { id: "A", x: 0, y: 0, width: 60, height: 60 },
        b: { id: "B", x: 20, y: 20, width: 60, height: 60 }, // overlaps A
        sourceSide: "right",
        targetSide: "left",
      },
      {
        a: { id: "A", x: 0, y: 0, width: 40, height: 40 },
        b: { id: "B", x: 500, y: 300, width: 40, height: 40 },
        sourceSide: "right",
        targetSide: "top",
      },
    ];

    const failures: string[] = [];
    for (const { a, b, sourceSide, targetSide } of configs) {
      const nodes = [a, b, wall];
      const request: RouteRequest = {
        id: "e-A-B",
        source: "A",
        target: "B",
        sourcePoint: sideCenterPoint(a, sourceSide),
        targetPoint: sideCenterPoint(b, targetSide),
        sourceSide,
        targetSide,
      };
      const points = routeEdges(nodes, [request]).get(request.id)!;

      if (!isOrthogonalPolyline(points)) {
        failures.push(`${sourceSide}->${targetSide}: not orthogonal`);
      }
      if (hasImmediateReversal(points)) {
        failures.push(
          `${sourceSide}->${targetSide}: has an immediate reversal`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});

describe("routeEdges — no immediate reversal / never a degenerate hook (contract: 'No immediate reversals')", () => {
  // "No polyline may contain an immediate reversal: no interior vertex where
  // the segment arriving and the segment leaving run along the same axis in
  // opposite directions." Binding on every returned polyline — searched,
  // self-loop, and fallback alike. The defect this guards against (an earlier
  // fallback shape collapsing onto one line and retracing part of itself) only
  // showed up in 0.83% of fallbacks per the reviewer's sampling, so each
  // case below sweeps a range of configurations rather than asserting one.

  it("holds for searched (non-fallback) routes across a range of obstacle configurations", () => {
    const configs: { nodes: RouteNodeRect[]; request: RouteRequest }[] = [];

    // Horizontal detours: an obstacle at a range of x-offsets between A and B.
    for (const obsX of [80, 100, 120, 140]) {
      const nodes: RouteNodeRect[] = [
        { id: "A", x: 0, y: 0, width: 40, height: 40 },
        { id: "OBS", x: obsX, y: 0, width: 40, height: 40 },
        { id: "B", x: 260, y: 0, width: 40, height: 40 },
      ];
      const request: RouteRequest = {
        id: "e-A-B",
        source: "A",
        target: "B",
        sourcePoint: { x: 40, y: 20 },
        targetPoint: { x: 260, y: 20 },
        sourceSide: "right",
        targetSide: "left",
      };
      configs.push({ nodes, request });
    }

    // Vertical detours: an obstacle at a range of y-offsets between S and T.
    for (const obsY of [80, 120, 160]) {
      const nodes: RouteNodeRect[] = [
        { id: "S", x: 0, y: 0, width: 40, height: 40 },
        { id: "OBS", x: 0, y: obsY, width: 40, height: 40 },
        { id: "T", x: 0, y: 320, width: 40, height: 40 },
      ];
      const request: RouteRequest = {
        id: "e-S-T",
        source: "S",
        target: "T",
        sourcePoint: { x: 20, y: 40 },
        targetPoint: { x: 20, y: 320 },
        sourceSide: "bottom",
        targetSide: "top",
      };
      configs.push({ nodes, request });
    }

    const failures: number[] = [];
    configs.forEach(({ nodes, request }, i) => {
      const points = routeEdges(nodes, [request]).get(request.id)!;
      if (hasImmediateReversal(points)) failures.push(i);
    });

    expect(failures).toEqual([]);
  });

  it("holds for self-loops across a range of node rect sizes", () => {
    const rects: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 20 },
      { id: "A", x: 0, y: 0, width: 100, height: 50 },
      { id: "A", x: 0, y: 0, width: 200, height: 80 },
      { id: "A", x: 10, y: 10, width: 60, height: 30 },
    ];

    const failures: number[] = [];
    rects.forEach((rect, i) => {
      const request: RouteRequest = {
        id: "loop-A",
        source: "A",
        target: "A",
        sourcePoint: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
        targetPoint: { x: rect.x + rect.width / 2, y: rect.y },
        sourceSide: "bottom",
        targetSide: "top",
      };
      const points = routeEdges([rect], [request]).get(request.id)!;
      if (hasImmediateReversal(points)) failures.push(i);
    });

    expect(failures).toEqual([]);
  });

  it("holds for the no-path fallback across sourceSide/direction combinations and every ladder rung", () => {
    // A single huge wall forces every one of these requests into the no-path
    // fallback (same technique as the "no-path fallback" describe block
    // above). A and B are placed far from the geometry the requests
    // describe — the fallback construction depends only on the request's
    // own sourcePoint/targetPoint/sides, never on the node rects, so their
    // exact position is irrelevant once the wall guarantees no path exists.
    const wall: RouteNodeRect = {
      id: "WALL",
      x: -1000,
      y: -1000,
      width: 3000,
      height: 3000,
    };
    const a: RouteNodeRect = {
      id: "A",
      x: -5000,
      y: -5000,
      width: 10,
      height: 10,
    };
    const b: RouteNodeRect = {
      id: "B",
      x: 5000,
      y: 5000,
      width: 10,
      height: 10,
    };
    const nodes = [a, b, wall];

    interface Config {
      label: string;
      sourcePoint: Point;
      targetPoint: Point;
      sourceSide: RouteSide;
      targetSide: RouteSide;
    }

    // For each vertical/horizontal exit side, one config where source and
    // target push in the same direction along that axis and one where they
    // push oppositely (the "down 16, up 48, down 16" degenerate hook of the
    // earlier fallback design lived exactly here — sourceSide "bottom"
    // below), plus two generic configs and one config landing on each of the
    // connector ladder's dog-leg and rectangle rungs, for direct breadth on
    // the newest part of the construction.
    const configs: Config[] = [
      {
        label: "bottom, with normal (elbow omitted, unchanged)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: 0, y: 200 },
        sourceSide: "bottom",
        targetSide: "top",
      },
      {
        label: "bottom, against normal (retracing, new)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: 0, y: -34 },
        sourceSide: "bottom",
        targetSide: "top",
      },
      {
        label: "top, with normal (elbow omitted, unchanged)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: 0, y: -216 },
        sourceSide: "top",
        targetSide: "bottom",
      },
      {
        label: "top, against normal (retracing, new)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: 0, y: 34 },
        sourceSide: "top",
        targetSide: "bottom",
      },
      {
        label: "left, with normal (elbow omitted, unchanged)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: -216, y: 0 },
        sourceSide: "left",
        targetSide: "right",
      },
      {
        label: "left, against normal (retracing, new)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: 34, y: 0 },
        sourceSide: "left",
        targetSide: "right",
      },
      {
        label: "right, with normal (elbow omitted, unchanged)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: 216, y: 0 },
        sourceSide: "right",
        targetSide: "left",
      },
      {
        label: "right, against normal (retracing, new)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: -34, y: 0 },
        sourceSide: "right",
        targetSide: "left",
      },
      {
        label: "bottom -> left, generic elbow",
        sourcePoint: { x: 20, y: 40 },
        targetPoint: { x: 300, y: 170 },
        sourceSide: "bottom",
        targetSide: "left",
      },
      {
        label: "right -> bottom, generic elbow",
        sourcePoint: { x: 40, y: 20 },
        targetPoint: { x: 220, y: 190 },
        sourceSide: "right",
        targetSide: "bottom",
      },
      {
        // Same source/target as the "no-path fallback" describe block's
        // dog-leg +x fixture — lands on the 3-segment connector rung.
        label: "bottom -> top, backward along the shared axis (dog-leg)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: 200, y: 0 },
        sourceSide: "bottom",
        targetSide: "top",
      },
      {
        // Same source/target as the "no-path fallback" describe block's
        // rectangle fixture — P1 = P2, lands on the rectangle rung.
        label: "bottom -> bottom, coincident handles (rectangle)",
        sourcePoint: { x: 0, y: 0 },
        targetPoint: { x: 0, y: 0 },
        sourceSide: "bottom",
        targetSide: "bottom",
      },
    ];

    const failures: string[] = [];
    for (const config of configs) {
      const request: RouteRequest = {
        id: "e-A-B",
        source: "A",
        target: "B",
        sourcePoint: config.sourcePoint,
        targetPoint: config.targetPoint,
        sourceSide: config.sourceSide,
        targetSide: config.targetSide,
      };
      const points = routeEdges(nodes, [request]).get(request.id)!;
      if (hasImmediateReversal(points)) failures.push(config.label);
    }

    expect(failures).toEqual([]);
  });
});

// ===========================================================================
// Input quantization (contract "Input quantization", issue #89).
//
// Everything below is derived from `docs/internal/contracts/edge-routing.md`,
// not from the router source. Every fixture in this file above this point uses
// integer coordinates, where quantization is the identity; the fixtures below
// are deliberately fractional, which is the only way the rule is observable.
// ===========================================================================

/**
 * One fractional scenario: two node-sized rects with an obstacle between them,
 * every coordinate carrying a fraction, plus a routed request and a self-loop.
 * Shapes and spacing are those of a CFG basic block (~120x50, ~150px apart) so
 * the sweep exercises the geometry the router actually sees, and the obstacle
 * is placed to force a real detour rather than a straight run.
 */
function fractionalScenario(next: () => number, i: number) {
  const aRect: RouteNodeRect = {
    id: "A",
    x: next(),
    y: next(),
    width: 120 + next(),
    height: 50 + next(),
  };
  const obstacle: RouteNodeRect = {
    id: "OBS",
    x: -30 + (i % 5) * 25 + next(),
    y: 100 + next(),
    width: 100 + next(),
    height: 40 + next(),
  };
  // B's column is offset from A's by a multiple of 30 px *plus a fraction*, so
  // one case in seven has the two blocks sharing a column to within a fraction
  // of a pixel — the CFG geometry that produces sub-pixel jogs in the app.
  const bRect: RouteNodeRect = {
    id: "B",
    x: aRect.x - 60 + (i % 7) * 30 + next(),
    y: 210 + next(),
    width: 120 + next(),
    height: 50 + next(),
  };
  const edge: RouteRequest = {
    id: "e-A-B",
    source: "A",
    target: "B",
    sourcePoint: sideCenterPoint(aRect, "bottom"),
    targetPoint: sideCenterPoint(bRect, "top"),
    sourceSide: "bottom",
    targetSide: "top",
  };
  const loop: RouteRequest = {
    id: "loop-A",
    source: "A",
    target: "A",
    sourcePoint: sideCenterPoint(aRect, "bottom"),
    targetPoint: sideCenterPoint(aRect, "top"),
    sourceSide: "bottom",
    targetSide: "top",
  };
  // Fractional options too: the contract makes the integer guarantee
  // unconditional by rounding `nodeMargin` and `selfLoopGap`. Both stay in the
  // stated clearance domain (they round to 12/13 and 24/25, never to 0), so
  // orthogonality and no-immediate-reversal are in force here.
  const options = {
    nodeMargin: 12 + next(),
    selfLoopGap: 24 + next(),
    bendPenalty: 30 + next(),
  };
  return { nodes: [aRect, obstacle, bRect], requests: [edge, loop], options };
}

describe("routeEdges — quantization: integer coordinates (contract 'Integer coordinates')", () => {
  // "Every `x` and every `y` of every point in every returned polyline is an
  // integer — searched routes, self-loops and fallback routes alike, for any
  // finite input." Catches the whole class of no-quantization implementations,
  // and (via the self-loop half) one that quantizes rects and request points
  // but forgets the 75%-of-width offset.

  it("returns only integer coordinates for searched routes and self-loops across a sweep of fractional rects, handles and options", () => {
    const next = fractionStream(89);
    const failures: string[] = [];

    for (let i = 0; i < 60; i++) {
      const { nodes, requests, options } = fractionalScenario(next, i);
      const routes = routeEdges(nodes, requests, options);

      for (const request of requests) {
        const points = routes.get(request.id)!;
        if (!allCoordinatesAreIntegers(points)) {
          failures.push(
            `case ${i} ${request.id}: non-integer coordinate in ${JSON.stringify(points)}`,
          );
        }
        if (hasNegativeZeroCoordinate(points)) {
          failures.push(`case ${i} ${request.id}: contains -0`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("returns only integer coordinates for fallback routes on fractional input", () => {
    // Same forced-no-path technique as the fallback describe block above, with
    // every rect and handle carrying a fraction. The fallback inherits
    // quantization from the quantized request and options — it does no
    // rounding of its own — so this is the half of the guarantee an
    // implementation that quantized only the obstacle set would miss.
    const wall: RouteNodeRect = {
      id: "WALL",
      x: -1000.3,
      y: -1000.4,
      width: 3000.4,
      height: 3000.9,
    };
    const a: RouteNodeRect = {
      id: "A",
      x: -900.2,
      y: -900.7,
      width: 10.4,
      height: 10.4,
    };
    const b: RouteNodeRect = {
      id: "B",
      x: 900.6,
      y: 900.2,
      width: 10.9,
      height: 10.1,
    };
    const nodes = [a, b, wall];

    const configs: {
      label: string;
      sourcePoint: Point;
      targetPoint: Point;
      sourceSide: RouteSide;
      targetSide: RouteSide;
    }[] = [
      {
        label: "direct rung",
        sourcePoint: { x: 40.4, y: 20.2 },
        targetPoint: { x: 399.5, y: 19.7 },
        sourceSide: "right",
        targetSide: "left",
      },
      {
        label: "L rung",
        sourcePoint: { x: 20.3, y: 40.9 },
        targetPoint: { x: 300.7, y: 170.4 },
        sourceSide: "bottom",
        targetSide: "left",
      },
      {
        label: "dog-leg rung",
        sourcePoint: { x: 0.4, y: -0.3 },
        targetPoint: { x: 200.6, y: 0.2 },
        sourceSide: "bottom",
        targetSide: "top",
      },
      {
        label: "rectangle rung (coincident quantized handles)",
        sourcePoint: { x: 0.2, y: 0.4 },
        targetPoint: { x: -0.3, y: -0.4 },
        sourceSide: "bottom",
        targetSide: "bottom",
      },
    ];

    const failures: string[] = [];
    for (const config of configs) {
      const request: RouteRequest = {
        id: "e-A-B",
        source: "A",
        target: "B",
        sourcePoint: config.sourcePoint,
        targetPoint: config.targetPoint,
        sourceSide: config.sourceSide,
        targetSide: config.targetSide,
      };
      const points = routeEdges(nodes, [request], {
        nodeMargin: 12.4,
        selfLoopGap: 23.6,
      }).get(request.id)!;

      if (!allCoordinatesAreIntegers(points)) {
        failures.push(`${config.label}: ${JSON.stringify(points)}`);
      }
      if (hasNegativeZeroCoordinate(points)) {
        failures.push(`${config.label}: contains -0`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("builds the fallback skeleton from the quantized request and the quantized options", () => {
    // The exact "direct" rung, hand-computed from the *quantized* values:
    // sourcePoint (40.4, 20.2) -> (40, 20); targetPoint (399.5, 19.7) ->
    // (400, 20) (ties round toward +infinity); nodeMargin 12.4 -> 12;
    // selfLoopGap 23.6 -> 24. dy is then 0, so the direct rung applies:
    // 40 -> S=52 -> P1=76 -> P2=364 -> T=388 -> 400.
    // An implementation that quantized rects but left the request points or
    // the options fractional produces a different polyline on every vertex.
    const wall: RouteNodeRect = {
      id: "WALL",
      x: -1000.3,
      y: -1000.4,
      width: 3000.4,
      height: 3000.9,
    };
    const a: RouteNodeRect = {
      id: "A",
      x: -900.2,
      y: -900.7,
      width: 10.4,
      height: 10.4,
    };
    const b: RouteNodeRect = {
      id: "B",
      x: 900.6,
      y: 900.2,
      width: 10.9,
      height: 10.1,
    };
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40.4, y: 20.2 },
      targetPoint: { x: 399.5, y: 19.7 },
      sourceSide: "right",
      targetSide: "left",
    };

    const points = routeEdges([a, b, wall], [request], {
      nodeMargin: 12.4,
      selfLoopGap: 23.6,
    }).get(request.id)!;

    expect(points).toEqual([
      { x: 40, y: 20 },
      { x: 52, y: 20 },
      { x: 76, y: 20 },
      { x: 364, y: 20 },
      { x: 388, y: 20 },
      { x: 400, y: 20 },
    ]);
  });
});

describe("routeEdges — quantization: no sub-pixel runs (issue #89 acceptance criterion)", () => {
  // The visible defect this change exists to remove. Integer coordinates plus
  // the duplicate collapse mean "any two coordinates the router emits are
  // either equal or a whole pixel apart" (contract, "Input quantization"), so
  // no run can be shorter than 1 px. The first case below is the discriminating
  // one — it reproduces the app's jog and fails against an unquantized router.
  // The two sweeps that follow are breadth: they catch the residue an integer
  // check alone cannot see, a run of length *zero* left behind when two
  // distinct fractional coordinates round onto the same lattice point and the
  // duplicate collapse does not fold the resulting pair.

  it("removes the sub-pixel jog between two blocks whose measured columns differ by a fraction of a pixel", () => {
    // The shape the issue is about, reduced to its smallest form: two
    // basic-block-sized nodes stacked in what looks like one column, whose
    // measured x differs by delta < 1 px — exactly what browser zoom produces.
    // Their bottom/top handle centres are then delta apart, so the edge
    // between them contains a horizontal run delta px long: a jog that renders
    // as a kink at a corner radius of zero. Verified against the pre-change
    // router, which returns runs of exactly delta here for every delta below.
    // Quantization makes both handle columns land on the same integer (or a
    // whole pixel apart), so the jog is either gone or a full pixel wide.
    const failures: string[] = [];

    for (const delta of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
      const aRect: RouteNodeRect = {
        id: "A",
        x: 0.4,
        y: 0.4,
        width: 120.4,
        height: 50.4,
      };
      const obstacle: RouteNodeRect = {
        id: "OBS",
        x: 95.2,
        y: 100.6,
        width: 100.8,
        height: 40.4,
      };
      const bRect: RouteNodeRect = {
        id: "B",
        x: 0.4 + delta,
        y: 210.9,
        width: 120.4,
        height: 50.5,
      };
      const request: RouteRequest = {
        id: "e-A-B",
        source: "A",
        target: "B",
        sourcePoint: sideCenterPoint(aRect, "bottom"),
        targetPoint: sideCenterPoint(bRect, "top"),
        sourceSide: "bottom",
        targetSide: "top",
      };

      const points = routeEdges([aRect, obstacle, bRect], [request], {
        nodeMargin: 12.8,
        selfLoopGap: 24,
      }).get(request.id)!;

      const shortest = shortestSegmentLength(points);
      if (shortest < 1) {
        failures.push(
          `delta=${delta}: run of ${shortest} in ${JSON.stringify(points)}`,
        );
      }
      if (!allCoordinatesAreIntegers(points)) {
        failures.push(`delta=${delta}: non-integer coordinate`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("emits no run shorter than 1 px across a sweep of fractional rects, handles and options", () => {
    const next = fractionStream(1789);
    const failures: string[] = [];

    for (let i = 0; i < 60; i++) {
      const { nodes, requests, options } = fractionalScenario(next, i);
      const routes = routeEdges(nodes, requests, options);

      for (const request of requests) {
        const points = routes.get(request.id)!;
        const shortest = shortestSegmentLength(points);
        if (shortest < 1) {
          failures.push(
            `case ${i} ${request.id}: shortest run ${shortest} in ${JSON.stringify(points)}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps orthogonality and the no-reversal invariant on fractional input", () => {
    // Both guarantees are stated for a `nodeMargin` and `selfLoopGap` that
    // round to at least 1, which every option this sweep generates does.
    const next = fractionStream(4211);
    const failures: string[] = [];

    for (let i = 0; i < 60; i++) {
      const { nodes, requests, options } = fractionalScenario(next, i);
      const routes = routeEdges(nodes, requests, options);

      for (const request of requests) {
        const points = routes.get(request.id)!;
        if (points.length < 2)
          failures.push(`case ${i} ${request.id}: < 2 pts`);
        if (!isOrthogonalPolyline(points)) {
          failures.push(`case ${i} ${request.id}: not orthogonal`);
        }
        if (hasConsecutiveDuplicatePoint(points)) {
          failures.push(`case ${i} ${request.id}: consecutive duplicate point`);
        }
        if (hasImmediateReversal(points)) {
          failures.push(`case ${i} ${request.id}: immediate reversal`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

describe("routeEdges — quantization: the rounding rule (contract 'Rounding is Math.round throughout')", () => {
  // "ties go toward positive infinity (`0.5 -> 1`, `-1.5 -> -1`) — and a
  // resulting `-0` is normalized to `0`". Each case below is falsifiable only
  // against one specific wrong rule: `Math.floor`/`Math.trunc`, or a
  // `Math.round` whose `-0` is left alone.

  it("rounds a .5 tie toward positive infinity, not down", () => {
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      { id: "B", x: 200, y: 0, width: 40, height: 40 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      // 19.5 is the tie: Math.round -> 20, Math.floor/trunc -> 19.
      sourcePoint: { x: 40, y: 19.5 },
      targetPoint: { x: 200, y: 19.5 },
      sourceSide: "right",
      targetSide: "left",
    };

    const points = routeEdges(nodes, [request]).get(request.id)!;

    expect(points[0]).toEqual({ x: 40, y: 20 });
    expect(points[points.length - 1]).toEqual({ x: 200, y: 20 });
  });

  it("rounds a negative tie toward positive infinity (-1.5 -> -1)", () => {
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: -21.5, width: 40, height: 40 },
      { id: "B", x: 200, y: -21.5, width: 40, height: 40 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      // Math.round(-1.5) === -1; a "round half away from zero" rule gives -2.
      sourcePoint: { x: 40, y: -1.5 },
      targetPoint: { x: 200, y: -1.5 },
      sourceSide: "right",
      targetSide: "left",
    };

    const points = routeEdges(nodes, [request]).get(request.id)!;

    expect(points[0]).toEqual({ x: 40, y: -1 });
    expect(points[points.length - 1]).toEqual({ x: 200, y: -1 });
  });

  it("normalizes -0 to 0 on a coordinate that rounds out of [-0.5, 0)", () => {
    // The only inputs `Math.round` turns into `-0`. A's rect is placed so its
    // right-side centre handle is exactly (-0.3, -0.4): the rect spans
    // x -40.3..-0.3 and y -20.4..19.6, both of whose quantized right/centre
    // values sit in that interval. Vitest's toEqual/toBe/toStrictEqual all
    // distinguish -0 from 0, and Object.is makes the intent explicit.
    const nodes: RouteNodeRect[] = [
      { id: "A", x: -40.3, y: -20.4, width: 40, height: 40 },
      { id: "B", x: 200, y: -20, width: 40, height: 40 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: -0.3, y: -0.4 },
      targetPoint: { x: 200, y: 0 },
      sourceSide: "right",
      targetSide: "left",
    };

    const points = routeEdges(nodes, [request]).get(request.id)!;

    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(Object.is(points[0].x, 0)).toBe(true);
    expect(Object.is(points[0].y, 0)).toBe(true);
    expect(hasNegativeZeroCoordinate(points)).toBe(false);
  });
});

describe("routeEdges — quantization: node rects are quantized by boundary (contract 'Node rects are quantized by their boundaries, not field by field')", () => {
  // "`width' = round(x + width) - round(x)` … Rounding `x` and `width`
  // independently is a different and wrong operation — it can move the rect's
  // right edge by up to a whole pixel". Both cases below use x = 100.4 with
  // width = 39.4: the boundary rule gives x' = 100 and a right edge at
  // round(139.8) = 140, while rounding the fields independently gives
  // 100 + round(39.4) = 139. One whole pixel, and both cases pin the
  // consequence rather than the arithmetic.

  it("puts the obstacle's inflated right boundary a whole pixel where field-by-field rounding would not", () => {
    // LEFTWALL's inflated rect reaches x = 92 and OBS's reaches x = 88, so the
    // two overlap and the band y in [88, 152] is sealed everywhere left of
    // OBS. The only way from S down to T is around OBS's right inflated
    // boundary, which is the single grid line the two rounding rules disagree
    // about: 140 + 12 = 152 under the boundary rule, 139 + 12 = 151 under the
    // wrong one. Verified against integer-coordinate rects of width 40 and 39,
    // which reproduce 152 and 151 respectively.
    const obstacle: RouteNodeRect = {
      id: "OBS",
      x: 100.4,
      y: 100,
      width: 39.4,
      height: 40,
    };
    const nodes: RouteNodeRect[] = [
      { id: "S", x: 100, y: 0, width: 40, height: 40 },
      { id: "T", x: 100, y: 240, width: 40, height: 40 },
      obstacle,
      { id: "LEFTWALL", x: -400, y: -400, width: 480, height: 1000 },
    ];
    const request: RouteRequest = {
      id: "e-S-T",
      source: "S",
      target: "T",
      sourcePoint: { x: 120, y: 40 },
      targetPoint: { x: 120, y: 240 },
      sourceSide: "bottom",
      targetSide: "top",
    };

    const points = routeEdges(nodes, [request]).get(request.id)!;

    expect(points.some((p) => p.x === 152)).toBe(true);
    expect(points.some((p) => p.x === 151)).toBe(false);
    // The quantized obstacle, inflated by the default nodeMargin: nothing may
    // cross its interior, which a route hugging x = 151 would.
    expect(
      anySegmentCrossesRectInterior(points, {
        x: 88,
        y: 88,
        width: 64,
        height: 64,
      }),
    ).toBe(false);
  });

  it("derives a self-loop from the boundary-quantized rect on all four edges", () => {
    // A self-loop reads the rect and nothing else, so it exposes all four
    // quantized boundaries at once. Rect (100.4, 200.4, 39.4, 49.4) quantizes
    // to x 100..140 and y 200..250, i.e. w = 40 and h = 50. Field-by-field
    // rounding would give w = 39 and h = 49 and move four of the six vertices.
    const rect: RouteNodeRect = {
      id: "A",
      x: 100.4,
      y: 200.4,
      width: 39.4,
      height: 49.4,
    };
    const request: RouteRequest = {
      id: "loop-A",
      source: "A",
      target: "A",
      sourcePoint: { x: 120.1, y: 249.8 },
      targetPoint: { x: 120.1, y: 200.4 },
      sourceSide: "bottom",
      targetSide: "top",
    };

    const points = routeEdges([rect], [request]).get(request.id)!;

    // stubX = round(100 + 0.75 * 40) = 130; laneX = 100 + 40 + 24 = 164;
    // the node's own edges are y = 200 and y = 250, margin 12 either side.
    expect(points).toEqual([
      { x: 130, y: 250 },
      { x: 130, y: 262 },
      { x: 164, y: 262 },
      { x: 164, y: 188 },
      { x: 130, y: 188 },
      { x: 130, y: 200 },
    ]);
  });
});

describe("routeEdges — quantization: a rect that collapses to zero extent still blocks (contract 'Degenerate input')", () => {
  // "A collapsed rect is still an obstacle: every rect is inflated by
  // `nodeMargin` before the obstacle set is built, so a rect of no extent keeps
  // a band of that width clear around where it sits, exactly as a full-size one
  // does." Unconditional — not one of the three guarantees bounded to a
  // clearance of at least 1, and not left unspecified.
  //
  // The wrong implementation is the tempting one: drop rects whose quantized
  // extent is zero from the obstacle set, on the reasoning that a rect of no
  // area cannot contain anything. It would silently unblock every real node
  // that happens to measure sub-pixel-thin, and nothing else in this file
  // notices, because every other fixture uses a rect with extent to spare.
  //
  // What is asserted is the contract's own property — the band stays clear —
  // rather than "the route differs from a control", which is only its symptom.
  // The obstacle is neither source nor target, so no stub exemption applies and
  // the full-polyline check is the right one.
  const nodeMargin = 12; // default

  const aRect: RouteNodeRect = { id: "A", x: 0, y: 0, width: 40, height: 40 };
  const bRect: RouteNodeRect = { id: "B", x: 200, y: 0, width: 40, height: 40 };
  const request: RouteRequest = {
    id: "e-A-B",
    source: "A",
    target: "B",
    sourcePoint: { x: 40, y: 20 },
    targetPoint: { x: 200, y: 20 },
    sourceSide: "right",
    targetSide: "left",
  };

  // Each rect is sub-pixel-thin on one or both axes and sits squarely on the
  // straight line from A's right handle to B's left handle. `band` is the
  // quantized rect inflated by `nodeMargin`, hand-computed: a zero-extent rect
  // still inflates to a band `2 * nodeMargin` wide with a non-empty interior.
  const collapsed: { label: string; rect: RouteNodeRect; band: Rect }[] = [
    {
      label: "zero height (y 19.8..20.2 -> 20..20)",
      rect: { id: "THIN", x: 100, y: 19.8, width: 40, height: 0.4 },
      band: { x: 88, y: 8, width: 64, height: 2 * nodeMargin },
    },
    {
      label: "zero width (x 119.8..120.2 -> 120..120)",
      rect: { id: "THIN", x: 119.8, y: 0, width: 0.4, height: 40 },
      band: { x: 108, y: -12, width: 2 * nodeMargin, height: 64 },
    },
    {
      label: "zero on both axes",
      rect: { id: "THIN", x: 119.8, y: 19.8, width: 0.4, height: 0.4 },
      band: { x: 108, y: 8, width: 2 * nodeMargin, height: 2 * nodeMargin },
    },
  ];

  it("keeps a nodeMargin-wide band clear around a rect whose quantized extent is zero", () => {
    const failures: string[] = [];

    for (const { label, rect, band } of collapsed) {
      const points = routeEdges([aRect, bRect, rect], [request]).get(
        request.id,
      )!;

      if (anySegmentCrossesRectInterior(points, band)) {
        failures.push(
          `${label}: crosses the inflated band ${JSON.stringify(band)} — ${JSON.stringify(points)}`,
        );
      }
      // The endpoints stay exact while the route goes around it: the clearance
      // is bought with a detour, not by moving the handles.
      if (points[0].x !== 40 || points[0].y !== 20) {
        failures.push(`${label}: source endpoint moved`);
      }
      if (!allCoordinatesAreIntegers(points)) {
        failures.push(`${label}: non-integer coordinate`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("control: with the collapsed rect absent, the route runs straight through that same band", () => {
    // Without this, the assertion above could be satisfied by a band the route
    // was never going to enter anyway. A's and B's handles are both at y = 20,
    // so with nothing in between the route is a straight horizontal run — and
    // it crosses the interior of all three bands.
    const points = routeEdges([aRect, bRect], [request]).get(request.id)!;

    expect(points).toEqual([
      { x: 40, y: 20 },
      { x: 52, y: 20 },
      { x: 188, y: 20 },
      { x: 200, y: 20 },
    ]);
    for (const { band } of collapsed) {
      expect(anySegmentCrossesRectInterior(points, band)).toBe(true);
    }
  });
});

describe("routeEdges — quantization: endpoints are exact on the quantized points (contract 'Endpoints are exact on the quantized points')", () => {
  // "A routed (non-self-loop) polyline starts exactly at the quantized
  // `RouteRequest.sourcePoint` and ends exactly at the quantized
  // `RouteRequest.targetPoint` … the drawn endpoint may sit up to 0.5 px away
  // on each axis from the requested point."

  it("starts and ends on the quantized request points, not the fractional ones", () => {
    const nodes: RouteNodeRect[] = [
      { id: "A", x: -0.3, y: -0.4, width: 40.2, height: 40.4 },
      { id: "B", x: 199.6, y: 0.2, width: 40.3, height: 40.1 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 39.9, y: 19.5 },
      targetPoint: { x: 199.6, y: 20.4 },
      sourceSide: "right",
      targetSide: "left",
    };

    const points = routeEdges(nodes, [request]).get(request.id)!;
    const last = points[points.length - 1];

    expect(points[0]).toEqual({ x: 40, y: 20 });
    expect(last).toEqual({ x: 200, y: 20 });
    // …and emphatically not the values the caller passed.
    expect(points[0]).not.toEqual(request.sourcePoint);
    expect(last).not.toEqual(request.targetPoint);
  });

  it("never moves an endpoint more than 0.5 px on either axis, across the fractional sweep", () => {
    // The documented price of the guarantee. A quantizer using a coarser
    // lattice, or scaling before rounding, would break this bound long before
    // it broke the integer guarantee.
    const next = fractionStream(3607);
    const failures: string[] = [];

    for (let i = 0; i < 60; i++) {
      const { nodes, requests, options } = fractionalScenario(next, i);
      const routes = routeEdges(nodes, requests, options);
      const edge = requests[0]; // requests[1] is the self-loop, which is exempt
      const points = routes.get(edge.id)!;
      const last = points[points.length - 1];

      const expectedFirst = {
        x: q(edge.sourcePoint.x),
        y: q(edge.sourcePoint.y),
      };
      const expectedLast = {
        x: q(edge.targetPoint.x),
        y: q(edge.targetPoint.y),
      };

      if (points[0].x !== expectedFirst.x || points[0].y !== expectedFirst.y) {
        failures.push(
          `case ${i}: first point ${JSON.stringify(points[0])} !== ${JSON.stringify(expectedFirst)}`,
        );
      }
      if (last.x !== expectedLast.x || last.y !== expectedLast.y) {
        failures.push(
          `case ${i}: last point ${JSON.stringify(last)} !== ${JSON.stringify(expectedLast)}`,
        );
      }
      if (
        Math.abs(points[0].x - edge.sourcePoint.x) > 0.5 ||
        Math.abs(points[0].y - edge.sourcePoint.y) > 0.5 ||
        Math.abs(last.x - edge.targetPoint.x) > 0.5 ||
        Math.abs(last.y - edge.targetPoint.y) > 0.5
      ) {
        failures.push(`case ${i}: endpoint moved more than 0.5 px`);
      }
    }

    expect(failures).toEqual([]);
  });
});

describe("routeEdges — quantization: options (contract 'Defaults' and 'Options')", () => {
  // "`nodeMargin` and `selfLoopGap` are rounded, `bendPenalty` is not."

  it("rounds nodeMargin: the pushed points sit at the rounded distance", () => {
    // points[1] is sourcePoint pushed outward by nodeMargin (the guarantee
    // "Endpoints are exact" already pins its role), so it reads the option
    // back directly. 11.6 and 12.4 both round to 12; truncation would give 11
    // for the first and no rounding at all 11.6.
    const { nodes, request } = simpleTwoNodeCase();

    for (const nodeMargin of [11.6, 12.4]) {
      const points = routeEdges(nodes, [request], { nodeMargin }).get(
        request.id,
      )!;
      expect(points[1]).toEqual({ x: 52, y: 20 });
      expect(points[points.length - 2]).toEqual({ x: 188, y: 20 });
    }

    // A second, different margin, so the assertion cannot be satisfied by an
    // implementation that ignores the option and always uses the default 12.
    for (const nodeMargin of [19.6, 20.4]) {
      const points = routeEdges(nodes, [request], { nodeMargin }).get(
        request.id,
      )!;
      expect(points[1]).toEqual({ x: 60, y: 20 });
      expect(points[points.length - 2]).toEqual({ x: 180, y: 20 });
    }
  });

  it("rounds selfLoopGap: the lane sits at the rounded distance from the node's right edge", () => {
    const rect: RouteNodeRect = { id: "A", x: 0, y: 0, width: 100, height: 50 };
    const request: RouteRequest = {
      id: "loop-A",
      source: "A",
      target: "A",
      sourcePoint: { x: 50, y: 50 },
      targetPoint: { x: 50, y: 0 },
      sourceSide: "bottom",
      targetSide: "top",
    };

    for (const selfLoopGap of [23.6, 24.4]) {
      const points = routeEdges([rect], [request], { selfLoopGap }).get(
        request.id,
      )!;
      // laneX = x + w + round(selfLoopGap) = 0 + 100 + 24 = 124.
      expect(points).toEqual([
        { x: 75, y: 50 },
        { x: 75, y: 62 },
        { x: 124, y: 62 },
        { x: 124, y: -12 },
        { x: 75, y: -12 },
        { x: 75, y: 0 },
      ]);
    }
  });

  it("does not round bendPenalty: two fractional values inside one rounding bucket still choose different routes", () => {
    // Two walls, each with a slit on the opposite side of the straight line
    // from A to B. Threading both slits is short and bendy; dropping below
    // both walls in one sweep is longer and straighter. Measured on this
    // fixture: the slit route is 928 px with 6 bends, the under route 944 px
    // with 4 bends, so the two costs cross at bendPenalty = (944 - 928) / 2 =
    // 8 exactly. 7.6 and 8.4 sit either side of that crossing and *both round
    // to 8* — an implementation that quantized bendPenalty along with the
    // coordinates would return the same route for both, which is precisely
    // what this asserts against. All coordinates here are integers, so
    // quantization is the identity and the crossing point cannot move.
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      { id: "B", x: 600, y: 0, width: 40, height: 40 },
      // Wall 1, spanning y -200..200 with a slit at y 100..160.
      { id: "W1a", x: 200, y: -200, width: 40, height: 300 },
      { id: "W1b", x: 200, y: 160, width: 40, height: 40 },
      // Wall 2, spanning y -200..200 with a slit at y -120..-60.
      { id: "W2a", x: 400, y: -200, width: 40, height: 80 },
      { id: "W2b", x: 400, y: -60, width: 40, height: 260 },
    ];
    const request: RouteRequest = {
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y: 20 },
      targetPoint: { x: 600, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    };

    const cheapBends = routeEdges(nodes, [request], { bendPenalty: 7.6 }).get(
      request.id,
    )!;
    const dearBends = routeEdges(nodes, [request], { bendPenalty: 8.4 }).get(
      request.id,
    )!;

    expect(cheapBends).not.toEqual(dearBends);
    // …and in the documented direction: a cheaper bend buys a shorter path.
    expect(polylineLength(cheapBends)).toBeLessThan(polylineLength(dearBends));
  });

  it("treats a fractional bendPenalty as ordinary input: the output is still integral and orthogonal", () => {
    const next = fractionStream(9001);
    const failures: string[] = [];

    for (let i = 0; i < 20; i++) {
      const { nodes, requests } = fractionalScenario(next, i);
      const routes = routeEdges(nodes, requests, { bendPenalty: 30.5 });
      for (const request of requests) {
        const points = routes.get(request.id)!;
        if (!allCoordinatesAreIntegers(points)) {
          failures.push(`case ${i} ${request.id}: non-integer coordinate`);
        }
        if (!isOrthogonalPolyline(points)) {
          failures.push(`case ${i} ${request.id}: not orthogonal`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

describe("routeEdges — quantization: the self-loop stub offset is rounded (contract 'Self-loops')", () => {
  // "`stubX = round(x + 0.75w)` … three quarters of a width is fractional
  // whenever the width is not a multiple of 4". Every self-loop fixture above
  // this point uses a width that *is* a multiple of 4, where the offset is
  // already an integer and the rounding is invisible.

  it("rounds the 75%-of-width offset for widths that are not a multiple of 4", () => {
    // The contract's own worked examples: w = 100 -> x + 75, w = 101 ->
    // x + 75.75 -> x + 76, w = 102 -> x + 76.5 -> x + 77 (tie, rounds up),
    // w = 103 -> x + 77.25 -> x + 77.
    const expectedStubX: Record<number, number> = {
      100: 75,
      101: 76,
      102: 77,
      103: 77,
    };

    const failures: string[] = [];
    for (const width of [100, 101, 102, 103]) {
      const rect: RouteNodeRect = { id: "A", x: 0, y: 0, width, height: 50 };
      const request: RouteRequest = {
        id: "loop-A",
        source: "A",
        target: "A",
        sourcePoint: { x: rect.width / 2, y: 50 },
        targetPoint: { x: rect.width / 2, y: 0 },
        sourceSide: "bottom",
        targetSide: "top",
      };
      const points = routeEdges([rect], [request]).get(request.id)!;
      const stubX = expectedStubX[width];

      if (points[0].x !== stubX || points[points.length - 1].x !== stubX) {
        failures.push(
          `w=${width}: expected stubX ${stubX}, got ${points[0].x} / ${points[points.length - 1].x}`,
        );
      }
      if (!allCoordinatesAreIntegers(points)) {
        failures.push(`w=${width}: non-integer coordinate`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("produces the full six-point table for the tie case w = 102", () => {
    const rect: RouteNodeRect = { id: "A", x: 0, y: 0, width: 102, height: 50 };
    const request: RouteRequest = {
      id: "loop-A",
      source: "A",
      target: "A",
      sourcePoint: { x: 51, y: 50 },
      targetPoint: { x: 51, y: 0 },
      sourceSide: "bottom",
      targetSide: "top",
    };

    const points = routeEdges([rect], [request]).get(request.id)!;

    // stubX = round(0 + 76.5) = 77; laneX = 0 + 102 + 24 = 126.
    expect(points).toEqual([
      { x: 77, y: 50 },
      { x: 77, y: 62 },
      { x: 126, y: 62 },
      { x: 126, y: -12 },
      { x: 77, y: -12 },
      { x: 77, y: 0 },
    ]);
  });

  it("normalizes the stub offset's -0, which only a negative x can produce", () => {
    // The contract's own example: x = -1, w = 1 gives round(-1 + 0.75) =
    // round(-0.25) = -0, the one case where rounding the sum and rounding only
    // the 0.75w term differ — in the sign of zero. Both must come back as +0.
    const rect: RouteNodeRect = { id: "A", x: -1, y: 0, width: 1, height: 20 };
    const request: RouteRequest = {
      id: "loop-A",
      source: "A",
      target: "A",
      sourcePoint: { x: -0.5, y: 20 },
      targetPoint: { x: -0.5, y: 0 },
      sourceSide: "bottom",
      targetSide: "top",
    };

    const points = routeEdges([rect], [request]).get(request.id)!;

    expect(points).toEqual([
      { x: 0, y: 20 },
      { x: 0, y: 32 },
      { x: 24, y: 32 },
      { x: 24, y: -12 },
      { x: 0, y: -12 },
      { x: 0, y: 0 },
    ]);
    expect(hasNegativeZeroCoordinate(points)).toBe(false);
    expect(Object.is(points[0].x, 0)).toBe(true);
  });
});

describe("routeEdges — quantization: the self-loop duplicate collapse (contract 'Consecutive duplicate vertices are collapsed')", () => {
  // The collapse "is only ever observable outside" the clearance domain, so
  // this block is the one place a clearance rounding to 0 is exercised. What
  // the contract promises there is exactly three things and no more: integer
  // coordinates, no consecutive duplicate vertices, and — as a consequence —
  // that every consecutive pair shares exactly one coordinate. The point
  // count and the point values are documented as unspecified at zero
  // clearance and are deliberately not asserted. Without the collapse, two
  // identical consecutive points would share *both* coordinates and break
  // orthogonality, which is the failure this catches.

  it("never returns two identical consecutive vertices, at any clearance", () => {
    const rects: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 1, height: 20 },
      { id: "A", x: 0, y: 0, width: 2, height: 20 },
      { id: "A", x: 0, y: 0, width: 3, height: 20 },
      { id: "A", x: -3, y: -3, width: 2.4, height: 20.6 },
      { id: "A", x: 10, y: 10, width: 120, height: 50 },
    ];
    // Every clearance in [-0.5, 0.5) rounds to 0; 24 and 12 are in-domain
    // controls that must behave identically.
    const optionSets = [
      { nodeMargin: 0, selfLoopGap: 0 },
      { nodeMargin: 0.4, selfLoopGap: 0.3 },
      { nodeMargin: -0.4, selfLoopGap: 0.49 },
      { nodeMargin: 0.4, selfLoopGap: 24 },
      { nodeMargin: 12, selfLoopGap: 0.3 },
    ];

    const failures: string[] = [];
    for (const rect of rects) {
      for (const options of optionSets) {
        const request: RouteRequest = {
          id: "loop-A",
          source: "A",
          target: "A",
          sourcePoint: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
          targetPoint: { x: rect.x + rect.width / 2, y: rect.y },
          sourceSide: "bottom",
          targetSide: "top",
        };
        const points = routeEdges([rect], [request], options).get(request.id)!;
        const label = `w=${rect.width} ${JSON.stringify(options)}`;

        if (hasConsecutiveDuplicatePoint(points)) {
          failures.push(`${label}: duplicate in ${JSON.stringify(points)}`);
        }
        if (!isOrthogonalPolyline(points)) {
          failures.push(`${label}: not orthogonal`);
        }
        if (!allCoordinatesAreIntegers(points)) {
          failures.push(`${label}: non-integer coordinate`);
        }
        if (hasNegativeZeroCoordinate(points)) {
          failures.push(`${label}: contains -0`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("has nothing to fold inside the clearance domain: the six-point shape survives intact", () => {
    // "Within the domain there is nothing to fold — with `nodeMargin` and
    // `selfLoopGap` of 1 or more, no two *consecutive* vertices of the six
    // coincide". A collapse implemented too eagerly (folding collinear points
    // rather than identical ones) would shorten this to four.
    const rect: RouteNodeRect = { id: "A", x: 0, y: 0, width: 2, height: 20 };
    const request: RouteRequest = {
      id: "loop-A",
      source: "A",
      target: "A",
      sourcePoint: { x: 1, y: 20 },
      targetPoint: { x: 1, y: 0 },
      sourceSide: "bottom",
      targetSide: "top",
    };

    const points = routeEdges([rect], [request], {
      nodeMargin: 1,
      selfLoopGap: 1,
    }).get(request.id)!;

    // stubX = round(0 + 1.5) = 2; laneX = 0 + 2 + 1 = 3.
    expect(points).toEqual([
      { x: 2, y: 20 },
      { x: 2, y: 21 },
      { x: 3, y: 21 },
      { x: 3, y: -1 },
      { x: 2, y: -1 },
      { x: 2, y: 0 },
    ]);
  });
});

describe("routeEdges — quantization: determinism on fractional input (contract 'Determinism')", () => {
  it("returns byte-identical points for repeated calls and for reordered arrays", () => {
    const next = fractionStream(555);
    const { nodes, requests, options } = fractionalScenario(next, 3);

    const first = routeEdges(nodes, requests, options);
    const second = routeEdges(nodes, requests, options);
    const reordered = routeEdges(
      [...nodes].reverse(),
      [...requests].reverse(),
      options,
    );

    for (const request of requests) {
      expect(second.get(request.id)).toEqual(first.get(request.id));
      expect(reordered.get(request.id)).toEqual(first.get(request.id));
    }
  });

  it("collapses inputs less than half a pixel apart onto the same route", () => {
    // The sharpest statement of what quantization buys: two measurements that
    // differ everywhere, but nowhere by enough to change a rounded value, are
    // the same input as far as the router is concerned. Rect widths stay
    // integral and only the origins are nudged, so each rect's *boundaries*
    // land on the same lattice in both variants — the point of the
    // boundary-quantization rule. Without quantization the two results differ
    // in every coordinate.
    const build = (delta: number) => {
      const nodes: RouteNodeRect[] = [
        { id: "A", x: 10 + delta, y: 20 + delta, width: 120, height: 50 },
        { id: "OBS", x: 40 + delta, y: 130 + delta, width: 120, height: 50 },
        { id: "B", x: -20 + delta, y: 240 + delta, width: 120, height: 50 },
      ];
      const request: RouteRequest = {
        id: "e-A-B",
        source: "A",
        target: "B",
        sourcePoint: { x: 70 + delta, y: 70 + delta },
        targetPoint: { x: 40 + delta, y: 240 + delta },
        sourceSide: "bottom",
        targetSide: "top",
      };
      return { nodes, request };
    };

    const low = build(-0.2);
    const high = build(0.2);

    const lowPoints = routeEdges(low.nodes, [low.request]).get(low.request.id)!;
    const highPoints = routeEdges(high.nodes, [high.request]).get(
      high.request.id,
    )!;

    expect(highPoints).toEqual(lowPoints);
  });

  it("keeps inputs that straddle a lattice boundary distinct (10.4 and 10.6 do not merge)", () => {
    // The contract's own counter-example, and the guard against a quantizer so
    // coarse that it erases real differences: 10.2 and 10.4 become one point,
    // 10.4 and 10.6 must not.
    const nodes: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 40, height: 40 },
      { id: "B", x: 200, y: 0, width: 40, height: 40 },
    ];
    const requestAt = (y: number): RouteRequest => ({
      id: "e-A-B",
      source: "A",
      target: "B",
      sourcePoint: { x: 40, y },
      targetPoint: { x: 200, y: 20 },
      sourceSide: "right",
      targetSide: "left",
    });

    const at102 = routeEdges(nodes, [requestAt(10.2)]).get("e-A-B")!;
    const at104 = routeEdges(nodes, [requestAt(10.4)]).get("e-A-B")!;
    const at106 = routeEdges(nodes, [requestAt(10.6)]).get("e-A-B")!;

    expect(at102[0]).toEqual({ x: 40, y: 10 });
    expect(at104[0]).toEqual({ x: 40, y: 10 });
    expect(at106[0]).toEqual({ x: 40, y: 11 });
    expect(at104).toEqual(at102);
    expect(at106).not.toEqual(at104);
  });
});

describe("routeEdges — performance (`specs/graph-view.md` §4)", () => {
  // The real budget is the 16.7ms animation frame, and it is measured out of
  // band (bare Node, warm, median of N) — see `specs/graph-view.md` §4, which
  // records the figures and says in as many words that this in-suite test is
  // not a check of that budget. A tight wall-clock bound cannot be held
  // reliably inside a parallel vitest run, where this number measures
  // scheduler contention as much as the router itself (observed failing 3/18
  // full-suite runs at 52-59ms against a 50ms bound). This assertion is
  // deliberately loosened to a generous 300ms ceiling: it is a
  // catastrophic-regression guard (e.g. an accidental O(n^3) blowup), not a
  // budget check, and it must not be "fixed" with warm-up loops or best-of-N
  // sampling — a tight bound is not recoverable in this environment.
  it("routes a synthetic 60-node / 80-edge graph without a catastrophic (order-of-magnitude) regression", () => {
    const NODE_COUNT = 60;
    const EDGE_COUNT = 80;
    const COLS = 10;
    const CELL = 120;
    const NODE_WIDTH = 80;
    const NODE_HEIGHT = 40;

    const nodes: RouteNodeRect[] = Array.from(
      { length: NODE_COUNT },
      (_, i) => ({
        id: `n${i}`,
        x: (i % COLS) * CELL,
        y: Math.floor(i / COLS) * CELL,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }),
    );

    const nodeCenter = (i: number): Point => {
      const n = nodes[i];
      return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
    };

    const requests: RouteRequest[] = Array.from(
      { length: EDGE_COUNT },
      (_, i) => {
        const source = i % NODE_COUNT;
        const target = (i * 7 + 1) % NODE_COUNT; // deterministic, non-random spread
        return {
          id: `e${i}`,
          source: `n${source}`,
          target: `n${target}`,
          sourcePoint: nodeCenter(source),
          targetPoint: nodeCenter(target),
          sourceSide: "right",
          targetSide: "left",
        } satisfies RouteRequest;
      },
    );

    const start = performance.now();
    const routes = routeEdges(nodes, requests);
    const elapsed = performance.now() - start;

    expect(routes.size).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(300);
  });
});
