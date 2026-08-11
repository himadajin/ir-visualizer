import { describe, it, expect } from "vitest";
import { routePass, passStateOf } from "../useEdgeRoutes";
import {
  routeEdges,
  quantizeRect,
  quantizeRequest,
} from "../../utils/edgeRouter";
import type {
  Point,
  RouteNodeRect,
  RouteRequest,
} from "../../types/edgeRouting";

/**
 * `routePass` narrows a pass to the edges whose route can have changed and
 * reuses the rest (`specs/graph-view.md` §4, and the Locality guarantee of
 * `contracts/edge-routing.md`). The narrowing is only legitimate if it is
 * **unobservable**, so every test here asserts the same thing: the narrowed
 * pass equals the full pass, map entry for map entry.
 *
 * The failure this guards against is the one the drag-time split used to have —
 * an edge left drawn against a rect the moved node had already vacated, which
 * then jumped when the drag stopped. That defect would show up here as a
 * mismatch, not as a visual report.
 */

const keyOf = (routes: ReadonlyMap<string, Point[]>): string =>
  [...routes.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(
      ([id, points]) =>
        `${id}=${points.map((p) => `${String(p.x)},${String(p.y)}`).join(" ")}`,
    )
    .join(";");

/** A layered graph: rows of nodes, every edge joining one row to the next. */
function layeredGraph(
  rows: number,
  perRow: number,
): { rects: RouteNodeRect[]; requests: RouteRequest[] } {
  const rects: RouteNodeRect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < perRow; column++) {
      rects.push({
        id: `n${String(row)}-${String(column)}`,
        x: column * 240,
        y: row * 150,
        width: 160,
        height: 60,
      });
    }
  }
  const rectById = new Map(rects.map((rect) => [rect.id, rect]));
  const requests: RouteRequest[] = [];
  for (let row = 0; row + 1 < rows; row++) {
    for (let column = 0; column < perRow; column++) {
      for (const shift of [0, 1]) {
        const source = rectById.get(`n${String(row)}-${String(column)}`);
        const target = rectById.get(
          `n${String(row + 1)}-${String((column + shift) % perRow)}`,
        );
        if (source === undefined || target === undefined) continue;
        requests.push({
          id: `e${String(row)}-${String(column)}-${String(shift)}`,
          source: source.id,
          target: target.id,
          sourcePoint: {
            x: source.x + source.width / 2,
            y: source.y + source.height,
          },
          targetPoint: { x: target.x + target.width / 2, y: target.y },
          sourceSide: "bottom",
          targetSide: "top",
        });
      }
    }
  }
  return { rects, requests };
}

/** Moves one rect, carrying the endpoints anchored on it (what a drag does). */
function moveNode(
  rects: RouteNodeRect[],
  requests: RouteRequest[],
  id: string,
  dx: number,
  dy: number,
): { rects: RouteNodeRect[]; requests: RouteRequest[] } {
  return {
    rects: rects.map((rect) =>
      rect.id === id ? { ...rect, x: rect.x + dx, y: rect.y + dy } : rect,
    ),
    requests: requests.map((request) => ({
      ...request,
      sourcePoint:
        request.source === id
          ? { x: request.sourcePoint.x + dx, y: request.sourcePoint.y + dy }
          : request.sourcePoint,
      targetPoint:
        request.target === id
          ? { x: request.targetPoint.x + dx, y: request.targetPoint.y + dy }
          : request.targetPoint,
    })),
  };
}

const fullPass = (rects: RouteNodeRect[], requests: RouteRequest[]) =>
  routeEdges(rects.map(quantizeRect), requests.map(quantizeRequest));

const narrowedPass = (
  previousRects: RouteNodeRect[],
  previousRequests: RouteRequest[],
  rects: RouteNodeRect[],
  requests: RouteRequest[],
) => {
  const beforeRects = previousRects.map(quantizeRect);
  const beforeRequests = previousRequests.map(quantizeRequest);
  const previous = passStateOf(
    beforeRects,
    beforeRequests,
    routeEdges(beforeRects, beforeRequests),
  );
  return routePass(
    previous,
    rects.map(quantizeRect),
    requests.map(quantizeRequest),
  );
};

describe("routePass — a narrowed pass equals a full pass", () => {
  it("matches after a node is dragged, at every step of the drag", () => {
    const { rects, requests } = layeredGraph(4, 4);
    const dragged = "n1-1";

    // A drag is a sequence of small moves, each narrowed against the last —
    // which is where a stale entry would accumulate rather than show up once.
    let currentRects = rects;
    let currentRequests = requests;
    for (let step = 1; step <= 12; step++) {
      const moved = moveNode(currentRects, currentRequests, dragged, 7, 5);
      expect(
        keyOf(
          narrowedPass(
            currentRects,
            currentRequests,
            moved.rects,
            moved.requests,
          ),
        ),
      ).toBe(keyOf(fullPass(moved.rects, moved.requests)));
      currentRects = moved.rects;
      currentRequests = moved.requests;
    }
  });

  it("matches for moves of every size, including ones that cross other nodes", () => {
    const { rects, requests } = layeredGraph(4, 4);
    for (const [dx, dy] of [
      [0, 1],
      [3, 0],
      [40, 0],
      [0, 90],
      [-120, 60],
      [240, 150], // lands exactly on a neighbour's cell
      [600, 450], // far outside every previous region
      [-600, -450],
    ]) {
      const moved = moveNode(rects, requests, "n1-2", dx, dy);
      expect(
        keyOf(narrowedPass(rects, requests, moved.rects, moved.requests)),
      ).toBe(keyOf(fullPass(moved.rects, moved.requests)));
    }
  });

  it("matches when a node is resized, added or removed", () => {
    const { rects, requests } = layeredGraph(3, 3);

    const resized = rects.map((rect) =>
      rect.id === "n1-1" ? { ...rect, width: 400, height: 140 } : rect,
    );
    expect(keyOf(narrowedPass(rects, requests, resized, requests))).toBe(
      keyOf(fullPass(resized, requests)),
    );

    const added = [
      ...rects,
      { id: "extra", x: 180, y: 120, width: 200, height: 60 },
    ];
    expect(keyOf(narrowedPass(rects, requests, added, requests))).toBe(
      keyOf(fullPass(added, requests)),
    );

    // Removing a rect must drop its edges' entries, not leave them standing.
    const removed = rects.filter((rect) => rect.id !== "n1-1");
    expect(keyOf(narrowedPass(rects, requests, removed, requests))).toBe(
      keyOf(fullPass(removed, requests)),
    );
  });

  it("matches when edges themselves come and go", () => {
    const { rects, requests } = layeredGraph(3, 3);
    const fewer = requests.slice(0, requests.length - 3);
    expect(keyOf(narrowedPass(rects, requests, rects, fewer))).toBe(
      keyOf(fullPass(rects, fewer)),
    );
    expect(keyOf(narrowedPass(rects, fewer, rects, requests))).toBe(
      keyOf(fullPass(rects, requests)),
    );
  });

  it("matches on a graph dense enough to force whole-graph retries", () => {
    // A wall taller than any region: the edges crossing it are routed on the
    // contract's second rung, for which Locality is *not* claimed. They must be
    // re-routed unconditionally, which is the case this fixture exists to hit.
    const { rects, requests } = layeredGraph(3, 3);
    const walled = [
      ...rects,
      { id: "wall", x: 300, y: -2000, width: 40, height: 4000 },
    ];
    for (const [dx, dy] of [
      [11, 0],
      [0, 37],
      [-300, 0],
    ]) {
      const moved = moveNode(walled, requests, "n0-0", dx, dy);
      expect(
        keyOf(narrowedPass(walled, requests, moved.rects, moved.requests)),
      ).toBe(keyOf(fullPass(moved.rects, moved.requests)));
    }
  });

  it("matches when a node stops obstructing an edge by moving away", () => {
    // The space a node *vacates* matters as much as the space it takes: this
    // edge detours around OBS, and once OBS leaves, the detour must go with it.
    // A narrowing that only looks at where things moved *to* keeps the stale
    // detour — the exact shape of the defect the old drag-time split had.
    const rects: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 100, height: 40 },
      { id: "B", x: 0, y: 400, width: 100, height: 40 },
      { id: "OBS", x: 0, y: 180, width: 100, height: 40 },
    ];
    const requests: RouteRequest[] = [
      {
        id: "A-B",
        source: "A",
        target: "B",
        sourcePoint: { x: 50, y: 40 },
        targetPoint: { x: 50, y: 400 },
        sourceSide: "bottom",
        targetSide: "top",
      },
    ];
    const detoured = fullPass(rects, requests).get("A-B");
    expect(detoured === undefined ? 0 : detoured.length).toBeGreaterThan(2);

    for (const [dx, dy] of [
      [900, 0],
      [0, 900],
      [-900, -900],
    ]) {
      const moved = moveNode(rects, requests, "OBS", dx, dy);
      expect(
        keyOf(narrowedPass(rects, requests, moved.rects, moved.requests)),
      ).toBe(keyOf(fullPass(moved.rects, moved.requests)));
    }
  });

  it("matches when a far node reshapes a route that was found on the whole graph", () => {
    // A wall wider than any region forces this edge onto the contract's second
    // rung, where the route runs far outside its own region and Locality does
    // not hold. Moving a node that is nowhere near the region — but squarely on
    // that long way round — must therefore still re-route it.
    const rects: RouteNodeRect[] = [
      { id: "A", x: 0, y: 0, width: 100, height: 40 },
      { id: "B", x: 0, y: 600, width: 100, height: 40 },
      // Open only at its right end, so the way round is a known corridor.
      { id: "WALL", x: -3000, y: 280, width: 4000, height: 40 },
      // Just clear of that corridor to begin with; the moves below close it.
      { id: "FAR", x: 1100, y: 200, width: 200, height: 200 },
    ];
    const requests: RouteRequest[] = [
      {
        id: "A-B",
        source: "A",
        target: "B",
        sourcePoint: { x: 50, y: 40 },
        targetPoint: { x: 50, y: 600 },
        sourceSide: "bottom",
        targetSide: "top",
      },
    ];
    const region = { minX: 50 - 192, maxX: 50 + 192 };
    const points = fullPass(rects, requests).get("A-B");
    expect(points).toBeDefined();
    // Precondition of the fixture: the route really does leave its region.
    expect(points?.some((p) => p.x < region.minX || p.x > region.maxX)).toBe(
      true,
    );

    for (const [dx, dy] of [
      [-100, 0], // steps into the corridor
      [-160, 0],
      [-100, 40],
    ]) {
      const moved = moveNode(rects, requests, "FAR", dx, dy);
      const after = fullPass(moved.rects, moved.requests);
      // Precondition: this move really does reshape the route. Without it the
      // assertion below would hold for a narrowing that reused everything.
      expect(keyOf(after)).not.toBe(keyOf(fullPass(rects, requests)));
      expect(
        keyOf(narrowedPass(rects, requests, moved.rects, moved.requests)),
      ).toBe(keyOf(after));
    }
  });

  it("matches when a handle moves while its node's rect stays put", () => {
    // A per-operand port can shift (the Use-Def view) while the card keeps its
    // measured size: the request changed, no rect did. Nothing in the rect diff
    // sees this, so the request's own record has to be compared.
    const { rects, requests } = layeredGraph(3, 3);
    const shifted = requests.map((request, index) =>
      index === 0
        ? {
            ...request,
            sourcePoint: {
              x: request.sourcePoint.x - 60,
              y: request.sourcePoint.y,
            },
          }
        : request,
    );
    const after = fullPass(rects, shifted);
    expect(keyOf(after)).not.toBe(keyOf(fullPass(rects, requests)));
    expect(keyOf(narrowedPass(rects, requests, rects, shifted))).toBe(
      keyOf(after),
    );
  });

  it("routes everything when there is no previous pass", () => {
    const { rects, requests } = layeredGraph(3, 3);
    expect(keyOf(routePass(null, rects, requests))).toBe(
      keyOf(routeEdges(rects, requests)),
    );
  });
});
