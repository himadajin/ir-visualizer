import { describe, it, expect } from "vitest";
import { routeEdges } from "../edgeRouter";
import type {
  Point,
  RouteNodeRect,
  RouteRequest,
  RouteSide,
} from "../../types/edgeRouting";

// ---------------------------------------------------------------------------
// Local geometry helpers. The router's frozen boundary (plan §3.2) only
// returns points, so intersection/orthogonality checks live here rather than
// depending on any router internals.
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
 * `rect` (touching an edge/corner does not count as crossing the interior —
 * plan §3.1 step 3: "a grid segment is traversable when it does not cross
 * the interior of any inflated rect").
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
 * two mandated D2 stubs (`sourcePoint -> S` and `T -> targetPoint`), which
 * "Endpoints are exact" can force through a node's own rect when a pushed
 * point lands inside it. For a polyline with fewer than 4 points there is
 * no segment other than the first/last, so this is trivially false.
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
 * True when `points` is shaped like the D4 fallback rather than a searched
 * route, without mirroring the whole R15 connector ladder. Only the
 * fallback skeleton (plan §3.1 "No-path fallback") mandates a *second*
 * outward step past `S`, to `P1 = S + n_s·selfLoopGap` — a searched route's
 * third point is whatever the grid search finds next and has no reason to
 * land exactly there. So `points[2] === P1` identifies a fallback: it is
 * the one point every fallback shape is guaranteed to contain and a
 * searched route has no reason to reproduce by coincidence.
 */
function isFallbackShape(
  points: Point[],
  request: RouteRequest,
  nodeMargin = 16,
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
 * axis but in opposite directions (arbitration-B3 R12 — the checkable form
 * of "never a degenerate hook").
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

describe("routeEdges — exact endpoints (plan §3.1 'Endpoints are exact', D2)", () => {
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

describe("routeEdges — obstacle avoidance (plan §3.1 step 3)", () => {
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

describe("routeEdges — determinism (plan §3.1 'Determinism is a hard requirement')", () => {
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

describe("routeEdges — tie-breaking (plan §3.1 'Tie-breaking', D3)", () => {
  // A perfectly mirror-symmetric obstacle scenario: S, the obstacle, and T
  // all share the same x-span (0..40), so the grid's candidate X lines are
  // exactly {left-inflated, 20 (both endpoints' x), right-inflated} and the
  // whole grid is symmetric about x = 20. Any left-detour path around the
  // obstacle therefore has an exact mirror right-detour path of identical
  // length and identical bend count — a genuine, spec-derivable tie.
  //
  // Per D3, ties are broken by comparing the point sequence lexicographically
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

describe("routeEdges — self-loops hug the node's right side (plan §3.1 'Self-loops', D1; arbitration-B R1/R2)", () => {
  it("produces the documented six-point right-side loop shape, derived from the rect and not from sourcePoint/targetPoint", () => {
    const rect: RouteNodeRect = { id: "A", x: 0, y: 0, width: 100, height: 50 };
    const nodeMargin = 16; // default per plan §3.2 EdgeRouterOptions
    const selfLoopGap = 24; // default per plan §3.2 EdgeRouterOptions
    const laneX = rect.x + rect.width + selfLoopGap;

    // R2: self-loops are synthesized from the node rect and are exempt from
    // D2 — sourcePoint/targetPoint are ignored for them. Use React Flow's
    // real default (a centred handle), deliberately *not* the 75%-offset
    // point, so this test actually pins that the loop shape comes from the
    // rect rather than merely echoing back a pre-shaped request.
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

    // arbitration-B R1: the six-point form, exact vertex table.
    const expected: Point[] = [
      { x: rect.x + 0.75 * rect.width, y: rect.y + rect.height },
      { x: rect.x + 0.75 * rect.width, y: rect.y + rect.height + nodeMargin },
      { x: laneX, y: rect.y + rect.height + nodeMargin },
      { x: laneX, y: rect.y - nodeMargin },
      { x: rect.x + 0.75 * rect.width, y: rect.y - nodeMargin },
      { x: rect.x + 0.75 * rect.width, y: rect.y },
    ];
    expect(points).toEqual(expected);

    // R2 in action: the loop does not start/end at the centred handle we
    // supplied — it starts/ends at the 75%-offset points derived from rect.
    expect(points[0]).not.toEqual(request.sourcePoint);
    expect(points[points.length - 1]).not.toEqual(request.targetPoint);

    expect(isOrthogonalPolyline(points)).toBe(true);
  });
});

describe("routeEdges — no-path fallback: the R15/R16 skeleton + connector ladder (plan §3.1 'No-path fallback')", () => {
  // A single huge obstacle node, distinct from source and target, that
  // encloses the entire region every fixture below uses. Because the
  // source/target rect exemption (plan §3.1 step 3) only applies to the
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

  const nodeMargin = 16; // default per plan §3.2
  const g = 24; // selfLoopGap default per plan §3.2 — also the ladder's own gap

  // Every expected polyline below is hand-computed directly from plan §3.1's
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
    // opposite ways" case plan §3.1 calls out as needing 3 segments.
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
    // horizontal-first reverses at P2 (plan §3.1 "Coverage"). Dog-leg +x's
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
    // around it" (plan §3.1). n_s = (0,1) ("bottom").
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

describe("routeEdges — requests naming a node absent from `nodes` (plan §3.1 'Missing nodes', D7)", () => {
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

describe("routeEdges — pushed points survive collinear collapse (plan §3.1 'Endpoints are exact'; arbitration-B2 R9/RF4)", () => {
  // "Collinear interior points are collapsed, but the two pushed points are
  // never collapsed away" (arbitration-B R3b, restated as a real assertion
  // by arbitration-B2 R9/RF4). points[1] must be sourcePoint pushed
  // nodeMargin outward along sourceSide, and the second-to-last point must
  // be targetPoint pushed outward along targetSide, even when those pushed
  // points are collinear with everything around them — the case a naive
  // "collapse all collinear points" pass would break.
  const nodeMargin = 16; // default per plan §3.2

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

describe("routeEdges — own-node clearance is a searched-route property (plan §3.1 'Own-node clearance is a searched-route property', R5/R11)", () => {
  // R11 (reinstated): the no-clipping rule binds *searched* routes only.
  // The D4 fallback is exempt by design — its skeleton mandates a second
  // outward step past S to P1, which can land inside the *other* node's
  // rect when the two nodes are close or overlapping, and its connector
  // ladder does no obstacle avoidance at all (plan §3.1 "No-path
  // fallback"). A fallback-shaped result is identified via
  // `isFallbackShape` (points[2] === P1) and skipped rather than asserted
  // clear; every other (searched) result must stay clear on every segment
  // but the first and the last (the two mandated D2 stubs, which "Endpoints
  // are exact" can force through a node's own rect even for a searched
  // route when a pushed point lands inside it).

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

        // The fallback is exempt (R5/R11) — skip a fallback-shaped result
        // rather than asserting clearance on it.
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
    // These configs are forced into the D4 fallback via WALL (same
    // technique as the "no-path fallback" describe block above), which is
    // exempt from own-node clearance by design — so this checks the
    // invariants the fallback *is* bound by instead: every returned
    // polyline is still orthogonal and still has no immediate reversal.
    // Overlapping rects are exactly the case plan §3.1 "Own-node clearance
    // is a searched-route property" calls out as where a mandated stub can
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

describe("routeEdges — no immediate reversal / never a degenerate hook (arbitration-B3 R12)", () => {
  // "No polyline may contain an immediate reversal: no interior vertex where
  // the segment arriving and the segment leaving run along the same axis in
  // opposite directions." Binding on every returned polyline — searched,
  // self-loop, and fallback alike. The defect this guards against (the old,
  // unamended D4 collapsing onto one line and retracing part of itself) only
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
    // A single huge wall forces every one of these requests into the D4
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
    // push oppositely (the "down 16, up 48, down 16" degenerate hook from
    // the pre-R15 fallback design lived exactly here — sourceSide "bottom"
    // below), plus two generic configs and, since R15/R16 replaced D4 with
    // the skeleton + connector ladder, one config landing on the dog-leg
    // rung and one on the rectangle rung (plan §3.1 "No-path fallback")
    // for direct breadth on the newest part of the construction.
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

describe("routeEdges — performance (plan §2 decision 10; arbitration-B2 R7)", () => {
  // The real design budget is 50ms for a 60-node / 80-edge pass, but that is
  // measured out of band (bare Node, warm, median of N) — see the plan and
  // arbitration-B2 R7. A tight wall-clock bound cannot be held reliably
  // inside a parallel vitest run, where this number measures scheduler
  // contention as much as the router itself (observed failing 3/18 full-
  // suite runs at 52-59ms against a 50ms bound). This assertion is
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
