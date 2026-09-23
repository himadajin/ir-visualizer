import { describe, expect, it } from "vitest";
import {
  routeEdges,
  quantizeRequest,
  quantizeRect,
  routeEdgesWithReuse,
} from "../edgeRouter";
import type {
  Point,
  RouteNodeRect,
  RouteRequest,
} from "../../types/edgeRouting";
import cfg from "./fixtures/default-cfg-routing.json";

// Independent oracle: compare every segment pair, including fixed stubs.
function parallelGaps(a: Point[], b: Point[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < a.length; i++)
    for (let j = 1; j < b.length; j++) {
      const p = a[i - 1],
        q = a[i],
        r = b[j - 1],
        s = b[j];
      const horizontal = p.y === q.y;
      if (horizontal !== (r.y === s.y)) continue;
      const axis = horizontal ? "x" : "y";
      const across = horizontal ? "y" : "x";
      const overlap =
        Math.min(Math.max(p[axis], q[axis]), Math.max(r[axis], s[axis])) -
        Math.max(Math.min(p[axis], q[axis]), Math.min(r[axis], s[axis]));
      if (overlap > 0) gaps.push(Math.abs(p[across] - r[across]));
    }
  return gaps;
}

function expectSeparated(
  requests: RouteRequest[],
  routes: Map<string, Point[]>,
) {
  expect(routes.size).toBe(requests.length);
  for (let i = 0; i < requests.length; i++)
    for (let j = i + 1; j < requests.length; j++) {
      const a = requests[i],
        b = requests[j];
      if (a.bundleId !== undefined && a.bundleId === b.bundleId) continue;
      for (const gap of parallelGaps(routes.get(a.id)!, routes.get(b.id)!))
        expect(gap, `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(12);
    }
}

function expectClear(
  nodes: RouteNodeRect[],
  requests: RouteRequest[],
  routes: Map<string, Point[]>,
) {
  for (const request of requests.map(quantizeRequest)) {
    const points = routes.get(request.id)!;
    expect(points[0]).toEqual(request.sourcePoint);
    expect(points.at(-1)).toEqual(request.targetPoint);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      expect((a.x === b.x) !== (a.y === b.y)).toBe(true);
      expect([a.x, a.y, b.x, b.y].every(Number.isInteger)).toBe(true);
      for (const r of nodes.map(quantizeRect)) {
        if (r.obstacle === false) continue;
        const stub =
          (i === 1 && r.id === request.source) ||
          (i === points.length - 1 && r.id === request.target);
        const margin = stub ? 0 : 12;
        const intersects =
          a.x === b.x
            ? a.x > r.x - margin &&
              a.x < r.x + r.width + margin &&
              Math.max(a.y, b.y) > r.y - margin &&
              Math.min(a.y, b.y) < r.y + r.height + margin
            : a.y > r.y - margin &&
              a.y < r.y + r.height + margin &&
              Math.max(a.x, b.x) > r.x - margin &&
              Math.min(a.x, b.x) < r.x + r.width + margin;
        expect(intersects, `${request.id} crosses ${r.id}`).toBe(false);
      }
    }
  }
}

const nodes: RouteNodeRect[] = [
  { id: "a", x: 0, y: 0, width: 120, height: 40 },
  { id: "b", x: 200, y: 180, width: 120, height: 40 },
];
const request = (id: string, x: number, bundleId?: string): RouteRequest => ({
  id,
  source: "a",
  target: "b",
  sourcePoint: { x, y: 40 },
  targetPoint: { x: 200 + x, y: 180 },
  sourceSide: "bottom",
  targetSide: "top",
  ...(bundleId !== undefined ? { bundleId } : {}),
});

describe("non-bundle separation — #86", () => {
  it("keeps the measured default LLVM CFG clear and separated, including the three reported edges", () => {
    // Chrome, npm run dev, default CFG, 2026-09-23. Rects from node transforms
    // and offset sizes; attachments from the visible SVG path endpoints.
    const requests = cfg.requests as RouteRequest[];
    const routes = routeEdges(cfg.nodes, requests);
    expectSeparated(requests, routes);
    expectClear(cfg.nodes, requests, routes);
    const reversed = routeEdges(
      [...cfg.nodes].reverse(),
      [...requests].reverse(),
    );
    expect([...reversed]).toEqual([...routes]);
  });

  it("allocates separate parallel lanes without weakening node clearance", () => {
    const requests = [
      request("a", 24),
      request("b", 48),
      request("c", 72),
      request("d", 96),
    ];
    const routes = routeEdges(nodes, requests);
    expectSeparated(requests, routes);
    expectClear(nodes, requests, routes);
    expect([...routeEdges(nodes, [...requests].reverse())]).toEqual([
      ...routes,
    ]);
  });

  it("permits the same defined bundle's trunk, including the empty-string id", () => {
    const requests = [
      request("a", 24, ""),
      { ...request("b", 24, ""), targetPoint: { x: 296, y: 180 } },
      request("c", 72),
    ];
    const routes = routeEdges(nodes, requests);
    expect(parallelGaps(routes.get("a")!, routes.get("b")!)).toContain(0);
    expectSeparated(requests, routes);
    expectClear(nodes, requests, routes);
  });

  it("allows an unrelated perpendicular crossing", () => {
    const frames = ["a", "b", "c", "d"].map((id) => ({
      id,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      obstacle: false,
    }));
    const requests: RouteRequest[] = [
      {
        id: "horizontal",
        source: "a",
        target: "b",
        sourcePoint: { x: 0, y: 100 },
        targetPoint: { x: 200, y: 100 },
        sourceSide: "right",
        targetSide: "left",
      },
      {
        id: "vertical",
        source: "c",
        target: "d",
        sourcePoint: { x: 100, y: 0 },
        targetPoint: { x: 100, y: 200 },
        sourceSide: "bottom",
        targetSide: "top",
      },
    ];
    const routes = routeEdges(frames, requests);
    expectSeparated(requests, routes);
    expect(routes.get("horizontal")!.every((p) => p.y === 100)).toBe(true);
    expect(routes.get("vertical")!.every((p) => p.x === 100)).toBe(true);
  });

  it("keeps impossible coincident fixed arrivals visible without pretending they are separated", () => {
    const requests = [
      request("a", 24),
      {
        ...request("z", 72),
        targetPoint: { x: 224, y: 180 },
        bundleId: "different",
      },
    ];
    // Distinct arrivals are necessary: this case intentionally fixes both to
    // the same arrival and proves separation impossible along their final 12 px.
    const routes = routeEdges(nodes, requests);
    expect(routes.size).toBe(2);
    expect(parallelGaps(routes.get("a")!, routes.get("z")!)).toContain(0);
    for (const r of requests)
      expect(routes.get(r.id)!.at(-1)).toEqual(r.targetPoint);
  });
  it("separates seeded free-space routes with distinct attachments on every side", () => {
    const frames = ["a", "b"].map((id) => ({
      id,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      obstacle: false,
    }));
    let seed = 86;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const sides = ["top", "right", "bottom", "left"] as const;
    for (let scenario = 0; scenario < 25; scenario++) {
      const requests: RouteRequest[] = Array.from({ length: 8 }, (_, i) => ({
        id: String(i),
        source: "a",
        target: "b",
        sourcePoint: { x: 48 * i, y: Math.floor(random() * 8) * 48 },
        targetPoint: { x: 48 * i + 24, y: Math.floor(random() * 8) * 48 + 24 },
        sourceSide: sides[Math.floor(random() * 4)],
        targetSide: sides[Math.floor(random() * 4)],
      }));
      expectSeparated(requests, routeEdges(frames, requests));
    }
  });

  it("reconsiders an earlier lane when a narrow corridor can fit both edges", () => {
    const frames: RouteNodeRect[] = [
      { id: "a", x: 0, y: 0, width: 0, height: 0, obstacle: false },
      { id: "b", x: 0, y: 0, width: 0, height: 0, obstacle: false },
      { id: "left", x: -80, y: -84, width: 28, height: 288 },
      { id: "right", x: 64, y: -84, width: 40, height: 288 },
      { id: "top", x: -80, y: -84, width: 184, height: 22 },
      { id: "bottom", x: -80, y: 182, width: 184, height: 22 },
      { id: "neck-left", x: -80, y: 12, width: 68, height: 76 },
      { id: "neck-right", x: 24, y: 12, width: 80, height: 76 },
    ];
    const requests: RouteRequest[] = [
      {
        id: "a",
        source: "a",
        target: "b",
        sourcePoint: { x: 6, y: -36 },
        targetPoint: { x: 6, y: 136 },
        sourceSide: "bottom",
        targetSide: "top",
      },
      {
        id: "b",
        source: "a",
        target: "b",
        sourcePoint: { x: -24, y: -36 },
        targetPoint: { x: -24, y: 136 },
        sourceSide: "bottom",
        targetSide: "top",
      },
    ];
    // With inflated obstacles, a feasible assignment uses x=12 for a and x=0
    // for b in the neck. Choosing a's shortest path x=6 first blocks both lanes.
    const routes = routeEdges(frames, requests);
    expectSeparated(requests, routes);
    expectClear(frames, requests, routes);
    expect([
      ...routeEdges([...frames].reverse(), [...requests].reverse()),
    ]).toEqual([...routes]);
    const reused = routeEdgesWithReuse(frames, requests, {
      rects: new Map(frames.map((r) => [r.id, r])),
      requests: new Map(requests.map((r) => [r.id, r])),
      routes,
    });
    expect([...reused]).toEqual([...routes]);
    // The allocation's failed attempts are dependencies too. Do not reuse a
    // repaired result merely because its final shape fits its local region.
    expect(reused.get("a")).not.toBe(routes.get("a"));
    const centered = [
      requests[0],
      {
        ...requests[1],
        sourcePoint: { x: 6, y: -12 },
        targetPoint: { x: 6, y: 112 },
      },
    ];
    const centeredRoutes = routeEdges(frames, centered);
    expectSeparated(centered, centeredRoutes);
    expectClear(frames, centered, centeredRoutes);
  });
});
