import { describe, expect, it } from "vitest";
import { isRouteLocal, quantizeRect, routeEdges } from "../edgeRouter";
import type {
  Point,
  RouteNodeRect,
  RouteRequest,
  RouteSide,
} from "../../types/edgeRouting";

// Independent segment/rectangle oracle; no fallback-shaped results are skipped.
function crosses(a: Point, b: Point, r: RouteNodeRect, margin = 0): boolean {
  const left = r.x - margin;
  const right = r.x + r.width + margin;
  const top = r.y - margin;
  const bottom = r.y + r.height + margin;
  return a.x === b.x
    ? a.x > left &&
        a.x < right &&
        Math.max(a.y, b.y) > top &&
        Math.min(a.y, b.y) < bottom
    : a.y > top &&
        a.y < bottom &&
        Math.max(a.x, b.x) > left &&
        Math.min(a.x, b.x) < right;
}

function expectClear(
  points: Point[],
  nodes: RouteNodeRect[],
  request: RouteRequest,
  margin = 12,
) {
  expect(points.length).toBeGreaterThan(1);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    expect((a.x === b.x) !== (a.y === b.y)).toBe(true);
    expect(Number.isInteger(a.x) && Number.isInteger(a.y)).toBe(true);
    for (const node of nodes
      .filter((node) => node.obstacle !== false)
      .map(quantizeRect)) {
      expect(crosses(a, b, node), `interior: ${node.id} segment ${i}`).toBe(
        false,
      );
      const ownStub =
        (i === 1 && node.id === request.source) ||
        (i === points.length - 1 && node.id === request.target);
      if (!ownStub)
        expect(
          crosses(a, b, node, margin),
          `clearance: ${node.id} segment ${i}`,
        ).toBe(false);
    }
  }
}

const node: RouteNodeRect = { id: "a", x: 0, y: 0, width: 100, height: 50 };
const loop: RouteRequest = {
  id: "loop",
  source: "a",
  target: "a",
  sourcePoint: { x: 50, y: 50 },
  targetPoint: { x: 50, y: 0 },
  sourceSide: "bottom",
  targetSide: "top",
};

function points(nodes: RouteNodeRect[], request = loop, margin = 12, gap = 24) {
  return routeEdges(nodes, [request], {
    nodeMargin: margin,
    selfLoopGap: gap,
  }).get(request.id)!;
}

describe("node avoidance and clearance — issue #92", () => {
  it("honors distinct self-loop ports on every pair of sides while avoiding neighbors", () => {
    const nodes = [
      node,
      { id: "neighbor", x: 135, y: 0, width: 80, height: 50 },
    ];
    const point = (side: RouteSide, fraction: number): Point => {
      switch (side) {
        case "top":
          return { x: 100 * fraction, y: 0 };
        case "bottom":
          return { x: 100 * fraction, y: 50 };
        case "left":
          return { x: 0, y: 50 * fraction };
        case "right":
          return { x: 100, y: 50 * fraction };
      }
    };
    const sides: RouteSide[] = ["top", "right", "bottom", "left"];
    for (const sourceSide of sides)
      for (const targetSide of sides) {
        const request = {
          ...loop,
          sourceSide,
          targetSide,
          sourcePoint: point(sourceSide, 0.2),
          targetPoint: point(targetSide, 0.8),
        };
        const result = points(nodes, request);
        expect(result[0]).toEqual(request.sourcePoint);
        expect(result.at(-1)).toEqual(request.targetPoint);
        expectClear(result, nodes, request);
      }
  });

  it.each([120, 135])(
    "detours a self-loop past a right neighbor at x=%i (interior or margin)",
    (x) => {
      const nodes = [node, { id: "neighbor", x, y: 0, width: 80, height: 50 }];
      const result = points(nodes);
      expect(result).not.toEqual(points([node]));
      expectClear(result, nodes, loop);
      expect(result[0]).toEqual({ x: 50, y: 50 });
      expect(result.at(-1)).toEqual({ x: 50, y: 0 });
      expect(points([...nodes].reverse())).toEqual(result);
    },
  );

  it("keeps the default LLVM CFG self-loop clear of block 4", () => {
    // Chrome, npm run dev, default LLVM-IR CFG, measured 2026-09-23 from
    // rendered node transforms/offset sizes (flow coordinates, before dragging).
    const nodes: RouteNodeRect[] = [
      { id: "header", x: 79, y: 12, width: 258, height: 30 },
      { id: "entry", x: 115, y: 92, width: 186, height: 50 },
      { id: "4", x: 293, y: 332, width: 132, height: 82 },
      { id: "7", x: 81, y: 192, width: 192, height: 66 },
      { id: "9", x: 63, y: 488, width: 246, height: 82 },
      { id: "12", x: 22, y: 308, width: 246, height: 130 },
      { id: "18", x: 106, y: 620, width: 240, height: 66 },
      { id: "exit", x: 177, y: 736, width: 98, height: 30 },
    ];
    const request = {
      ...loop,
      source: "12",
      target: "12",
      sourcePoint: { x: 145, y: 438 },
      targetPoint: { x: 145, y: 308 },
    };
    expectClear(points(nodes, request), nodes, request);
  });

  it("finds a cycle that returns to the initial vertex in the departure direction", () => {
    const nodes = [
      { ...node, obstacle: false },
      { ...node, id: "b", obstacle: false },
      { id: "above", x: -1, y: -2, width: 2, height: 2 },
      { id: "below", x: -1, y: 0, width: 2, height: 2 },
    ];
    const request: RouteRequest = {
      ...loop,
      target: "b",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 0, y: 0 },
      sourceSide: "right",
      targetSide: "left",
    };
    const result = points(nodes, request, 0, 24);
    expectClear(result, nodes, request, 0);
    expect(result[0]).toEqual(result.at(-1));
    expect(result.length).toBeGreaterThan(3);
    expect(
      isRouteLocal(request, result, {
        nodeMargin: 0,
        selfLoopGap: 24,
      }),
    ).toBe(true);
  });

  it("keeps the preferred right-side shape when it is clear", () => {
    expect(points([node])).toEqual([
      { x: 50, y: 50 },
      { x: 50, y: 62 },
      { x: 124, y: 62 },
      { x: 124, y: -12 },
      { x: 50, y: -12 },
      { x: 50, y: 0 },
    ]);
  });

  it("routes a self-loop among dense neighbors without exempting the endpoint node", () => {
    const nodes = [
      node,
      { id: "right", x: 120, y: -25, width: 80, height: 100 },
      { id: "bottom", x: 0, y: 90, width: 200, height: 60 },
      { id: "top", x: 0, y: -100, width: 200, height: 60 },
      { id: "left", x: -100, y: -25, width: 60, height: 100 },
    ];
    expectClear(points(nodes), nodes, loop);
  });

  it.each([0, 1, 12, 30])(
    "keeps clearance %i with selfLoopGap=0, fractional and collapsed rects",
    (margin) => {
      for (const width of [0, 0.3, 2, 100.6]) {
        for (const height of [0, 0.3, 50.6]) {
          const nodes = [{ ...node, x: -0.3, y: 0.3, width, height }];
          const request = {
            ...loop,
            sourcePoint: { x: nodes[0].x + width / 2, y: nodes[0].y + height },
            targetPoint: { x: nodes[0].x + width / 2, y: nodes[0].y },
          };
          expectClear(
            points(nodes, request, margin, 0),
            nodes,
            request,
            margin,
          );
        }
      }
    },
  );

  it("ignores a container frame, but avoids its obstacle children", () => {
    const frame = {
      id: "frame",
      x: -100,
      y: -100,
      width: 500,
      height: 500,
      obstacle: false,
    };
    const child = { id: "child", x: 120, y: 0, width: 80, height: 50 };
    expect(points([node, frame])).toEqual(points([node]));
    expectClear(points([node, frame, child]), [node, frame, child], loop);
    expectClear(
      points([{ ...node, obstacle: false }, child]),
      [{ ...node, obstacle: false }, child],
      loop,
    );
  });

  it("retries outside the local region for a tall neighbor blocking the right lane", () => {
    // The two walls block both local exits from the bottom attachment. Their
    // far lower ends are the only way to reach the top attachment.
    const nodes = [
      node,
      { id: "right", x: 112, y: -1000, width: 30, height: 2000 },
      { id: "left", x: -42, y: 25, width: 30, height: 975 },
      { id: "cap", x: -42, y: -1000, width: 184, height: 30 },
    ];
    const result = points(nodes);
    expectClear(result, nodes, loop);
    expect(isRouteLocal(loop, result)).toBe(false);
  });

  it("retries globally when a wide self-loop node fills the local region", () => {
    const wide = { ...node, width: 2000 };
    const request = {
      ...loop,
      sourcePoint: { x: 1000, y: 50 },
      targetPoint: { x: 1000, y: 0 },
    };
    const result = points([wide], request);
    expectClear(result, [wide], request);
    expect(result[0]).toEqual(request.sourcePoint);
    expect(result.at(-1)).toEqual(request.targetPoint);
    expect(isRouteLocal(request, result)).toBe(false);
  });

  it("keeps positive clearance on ordinary routes with every pair of endpoint sides", () => {
    const nodes = [
      node,
      { ...node, id: "b", x: 300, y: 250 },
      { id: "middle", x: 100, y: 80, width: 120, height: 100 },
    ];
    const sides: RouteSide[] = ["top", "right", "bottom", "left"];
    for (const margin of [12, 24])
      for (const sourceSide of sides)
        for (const targetSide of sides) {
          const anchor = (r: RouteNodeRect, side: RouteSide) => ({
            x:
              side === "left"
                ? r.x
                : side === "right"
                  ? r.x + r.width
                  : r.x + r.width / 2,
            y:
              side === "top"
                ? r.y
                : side === "bottom"
                  ? r.y + r.height
                  : r.y + r.height / 2,
          });
          const request = {
            ...loop,
            target: "b",
            sourceSide,
            targetSide,
            sourcePoint: anchor(node, sourceSide),
            targetPoint: anchor(nodes[1], targetSide),
          };
          expectClear(points(nodes, request, margin), nodes, request, margin);
        }
  });

  it("connects directly when distinct endpoints share one pushed point", () => {
    const nodes = [node, { ...node, id: "b", y: 74 }];
    const request = { ...loop, target: "b", targetPoint: { x: 50, y: 74 } };
    const result = points(nodes, request);
    expectClear(result, nodes, request);
    expect(result).toEqual([
      { x: 50, y: 50 },
      { x: 50, y: 62 },
      { x: 50, y: 74 },
    ]);
  });

  it("does not exempt another node intersecting only the beginning of an endpoint stub", () => {
    const target = { id: "b", x: 200, y: 200, width: 100, height: 50 };
    const request = {
      ...loop,
      id: "edge",
      target: "b",
      targetPoint: { x: 250, y: 200 },
    };
    // Inflated obstacle ends at y=52: the stub midpoint y=56 is clear.
    const obstruction = { id: "thin", x: 49, y: 39, width: 2, height: 1 };
    const result = points([node, target, obstruction], request);
    expect(crosses(result[0], result[1], obstruction, 12)).toBe(true);
    expect(isRouteLocal(request, result)).toBe(false);
  });

  it("finds a non-empty clear cycle for coincident endpoints on non-obstacle frames", () => {
    const nodes = [
      { ...node, obstacle: false },
      { ...node, id: "b", obstacle: false },
      { id: "wall", x: 52, y: 55, width: 20, height: 20 },
    ];
    const request = { ...loop, target: "b", targetPoint: loop.sourcePoint };
    const result = points(nodes, request, 0, 0);
    expectClear(result, nodes, request, 0);
    expect(result[0]).toEqual(result.at(-1));
    expect(result.length).toBeGreaterThan(3);
  });

  it("routes zero-clearance boundary endpoints even with no pre-existing outer grid line", () => {
    const nodes = [node, { ...node, id: "b", x: 200 }];
    for (const sourceSide of [
      "top",
      "right",
      "bottom",
      "left",
    ] as RouteSide[]) {
      for (const targetSide of [
        "top",
        "right",
        "bottom",
        "left",
      ] as RouteSide[]) {
        const anchor = (r: RouteNodeRect, side: RouteSide) => ({
          x:
            side === "left"
              ? r.x
              : side === "right"
                ? r.x + r.width
                : r.x + r.width / 2,
          y:
            side === "top"
              ? r.y
              : side === "bottom"
                ? r.y + r.height
                : r.y + r.height / 2,
        });
        const request = {
          ...loop,
          target: "b",
          sourceSide,
          targetSide,
          sourcePoint: anchor(node, sourceSide),
          targetPoint: anchor(nodes[1], targetSide),
        };
        expectClear(points(nodes, request, 0, 0), nodes, request, 0);
      }
    }
  });

  it("uses a deterministic fallback only when a wall contains the attachments", () => {
    const nodes = [
      node,
      { id: "wall", x: -1000, y: -1000, width: 2000, height: 2000 },
    ];
    const result = points(nodes);
    expect(isRouteLocal(loop, result)).toBe(false);
    expect(points([...nodes].reverse())).toEqual(result);
    expect(result[0]).toEqual({ x: 50, y: 50 });
    expect(result.at(-1)).toEqual({ x: 50, y: 0 });
    for (let i = 1; i < result.length; i++) {
      const a = result[i - 1],
        b = result[i];
      expect((a.x === b.x) !== (a.y === b.y)).toBe(true);
      expect(Number.isInteger(a.x) && Number.isInteger(a.y)).toBe(true);
      if (i > 1) {
        const before = result[i - 2];
        expect(
          (a.x - before.x) * (b.x - a.x) + (a.y - before.y) * (b.y - a.y),
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// A dense unit-grid reachability oracle, independent of the router's sparse
// grid, A* costs, corner simplification, and fallback shape. All generated
// obstacles fit strictly inside this box, so its outer boundary provides every
// possible exterior connection.
function hasUnitGridPath(
  nodes: RouteNodeRect[],
  request: RouteRequest,
  margin: number,
): boolean {
  const sides: RouteSide[] = ["right", "bottom", "left", "top"];
  const steps = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];
  const sourceDir = sides.indexOf(request.sourceSide);
  const targetDir = sides.indexOf(request.targetSide);
  const start = {
    x: request.sourcePoint.x + steps[sourceDir].x * margin,
    y: request.sourcePoint.y + steps[sourceDir].y * margin,
  };
  const end = {
    x: request.targetPoint.x + steps[targetDir].x * margin,
    y: request.targetPoint.y + steps[targetDir].y * margin,
  };
  const obstacles = nodes.filter((r) => r.obstacle !== false);
  if (
    obstacles.some(
      (r) =>
        crosses(request.sourcePoint, start, r, margin) ||
        crosses(end, request.targetPoint, r, margin),
    )
  )
    return false;
  const queue = [{ ...start, dir: sourceDir, moved: false }];
  const visited = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (
      current.x === end.x &&
      current.y === end.y &&
      current.dir !== targetDir &&
      (current.moved ||
        request.sourcePoint.x !== request.targetPoint.x ||
        request.sourcePoint.y !== request.targetPoint.y)
    )
      return true;
    for (let dir = 0; dir < 4; dir++) {
      if ((dir + 2) % 4 === current.dir) continue;
      const next = {
        x: current.x + steps[dir].x,
        y: current.y + steps[dir].y,
        dir,
        moved: true,
      };
      if (next.x < -10 || next.x > 22 || next.y < -10 || next.y > 22) continue;
      const key = `${next.x},${next.y},${dir}`;
      if (
        visited.has(key) ||
        obstacles.some((r) => crosses(current, next, r, margin))
      )
        continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return false;
}

it("agrees with independent unit-grid reachability on adversarial small layouts", () => {
  let seed = 92;
  const random = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  const sides: RouteSide[] = ["top", "right", "bottom", "left"];
  let reachable = 0;
  let impossible = 0;
  for (let fixture = 0; fixture < 96; fixture++) {
    const margin = fixture % 3 === 0 ? 2 : 0;
    const nodes: RouteNodeRect[] = [
      { ...node, obstacle: false },
      { ...node, id: "b", obstacle: false },
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `obstacle${i}`,
        x: random(16) - 3,
        y: random(16) - 3,
        width: 1 + random(5),
        height: 1 + random(5),
      })),
    ];
    const request: RouteRequest = {
      ...loop,
      target: "b",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: fixture % 4 === 0 ? { x: 0, y: 0 } : { x: 8, y: 8 },
      sourceSide: sides[Math.floor(fixture / 4) % 4],
      targetSide: sides[fixture % 4],
    };
    const result = points(nodes, request, margin);
    const exists = hasUnitGridPath(nodes, request, margin);
    expect(
      isRouteLocal(request, result, { nodeMargin: margin }),
      `fixture ${fixture}`,
    ).toBe(exists);
    if (exists) {
      reachable++;
      expectClear(result, nodes, request, margin);
    } else impossible++;
  }
  expect(reachable).toBeGreaterThan(40);
  expect(impossible).toBeGreaterThan(5);
});
