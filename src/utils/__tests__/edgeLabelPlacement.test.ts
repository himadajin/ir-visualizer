import { describe, it, expect } from "vitest";
import {
  LABEL_END_INSET,
  LABEL_GAP,
  placeEdgeLabels,
  type LabelRequest,
  type LabelSize,
} from "../edgeLabelPlacement";
import type { Point } from "../../types/edgeRouting";

/**
 * Label placement (`specs/graph-view.md` §4, "Edge labels never overlap one
 * another"): shortest polyline first, midpoint first, slide along the label's
 * own polyline on a collision, fall back to the midpoint when nothing along it
 * is clear.
 */

const boxOf = (center: Point, size: LabelSize) => ({
  left: center.x - size.width / 2,
  top: center.y - size.height / 2,
  right: center.x + size.width / 2,
  bottom: center.y + size.height / 2,
});

/** Whether two label boxes keep at least `LABEL_GAP` between them. */
const clear = (a: Point, sizeA: LabelSize, b: Point, sizeB: LabelSize) => {
  const boxA = boxOf(a, sizeA);
  const boxB = boxOf(b, sizeB);
  return (
    boxA.right + LABEL_GAP <= boxB.left ||
    boxB.right + LABEL_GAP <= boxA.left ||
    boxA.bottom + LABEL_GAP <= boxB.top ||
    boxB.bottom + LABEL_GAP <= boxA.top
  );
};

/** Arc length from the polyline's start to `point`, which must lie on it. */
const arcLengthTo = (points: readonly Point[], point: Point): number => {
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const toPoint = Math.hypot(point.x - a.x, point.y - a.y);
    const fromPoint = Math.hypot(b.x - point.x, b.y - point.y);
    if (Math.abs(toPoint + fromPoint - len) < 1e-6) return walked + toPoint;
    walked += len;
  }
  throw new Error(
    `(${String(point.x)}, ${String(point.y)}) is off the polyline`,
  );
};

const totalLength = (points: readonly Point[]): number =>
  arcLengthTo(points, points[points.length - 1]);

const SIZE: LabelSize = { width: 30, height: 20 };

/** Where a label goes when it is the only one. */
const alone = (request: LabelRequest): Point => {
  const center = placeEdgeLabels([request]).get(request.id);
  if (center === undefined) throw new Error("no label placed");
  return center;
};

/**
 * Two labels that collide at their midpoints end up clear of each other, each
 * on its own polyline and clear of its ends; the shorter route's label, placed
 * first, keeps its midpoint.
 */
const expectSeparated = (longer: LabelRequest, shorter: LabelRequest): void => {
  expect(totalLength(shorter.points)).toBeLessThan(totalLength(longer.points));
  // Precondition: at their midpoints the two labels collide.
  expect(clear(alone(longer), longer.size, alone(shorter), shorter.size)).toBe(
    false,
  );

  const labels = placeEdgeLabels([longer, shorter]);
  const a = labels.get(longer.id);
  const b = labels.get(shorter.id);
  if (a === undefined || b === undefined) throw new Error("no label placed");

  expect(b).toEqual(alone(shorter));
  expect(clear(a, longer.size, b, shorter.size)).toBe(true);
  // The moved label stays on its own polyline, clear of the ends.
  const distance = arcLengthTo(longer.points, a);
  expect(distance).toBeGreaterThanOrEqual(LABEL_END_INSET);
  expect(distance).toBeLessThanOrEqual(
    totalLength(longer.points) - LABEL_END_INSET,
  );
};

describe("placeEdgeLabels", () => {
  it("places a lone label at its polyline's arc-length midpoint", () => {
    const labels = placeEdgeLabels([
      {
        id: "e",
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
          { x: 200, y: 100 },
        ],
        size: SIZE,
      },
    ]);
    expect(labels.get("e")).toEqual({ x: 50, y: 100 });
  });

  it("separates the colliding pair recorded in #74", () => {
    // The Use-Def view's default example on 733cae9 (Chromium, 1440×900):
    // polylines and painted label boxes in flow coordinates, in edge order.
    expectSeparated(
      {
        id: "edge:func:func:ud:12:2:func:func:ud:9:0:15",
        points: [
          { x: 592, y: 284 },
          { x: 592, y: 296 },
          { x: 592, y: 297 },
          { x: 1514, y: 297 },
          { x: 1514, y: 332 },
          { x: 1514, y: 344 },
        ],
        size: { width: 55.45, height: 19.66 },
      },
      {
        id: "edge:func:func:udarg:1:func:func:ud:12:1:1",
        points: [
          { x: 1423, y: 284 },
          { x: 1423, y: 296 },
          { x: 1423, y: 309 },
          { x: 690, y: 309 },
          { x: 690, y: 332 },
          { x: 690, y: 344 },
        ],
        size: { width: 44.05, height: 19.66 },
      },
    );
  });

  it("places a short route's label before a long route's can land across it", () => {
    // The same example mid-drag of `%15 = sub`: the long route's midpoint lies
    // on its horizontal run, right across the short `%11` edge, which has no
    // other clear position. Edge order would place the long one first.
    expectSeparated(
      {
        id: "edge:func:func:ud:12:2:func:func:ud:9:0:15",
        points: [
          { x: 1107, y: 456 },
          { x: 1107, y: 468 },
          { x: 1107, y: 492 },
          { x: 1538, y: 492 },
          { x: 1538, y: 308 },
          { x: 1514, y: 308 },
          { x: 1514, y: 332 },
          { x: 1514, y: 344 },
        ],
        size: { width: 55.45, height: 19.66 },
      },
      {
        id: "edge:func:func:ud:9:1:func:func:ud:18:0:11",
        points: [
          { x: 1461, y: 464 },
          { x: 1461, y: 476 },
          { x: 1461, y: 512 },
          { x: 1461, y: 524 },
        ],
        size: { width: 49.49, height: 19.66 },
      },
    );
  });

  it("takes the clear position nearest the midpoint", () => {
    const first: LabelRequest = {
      id: "first",
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      size: SIZE,
    };
    const second: LabelRequest = { ...first, id: "second" };
    const labels = placeEdgeLabels([first, second]);
    // The midpoint (100, 0) is taken; the nearest candidate that clears a
    // 30 px-wide box by the gap is 32 px away, reached after the midpoint.
    expect(labels.get("first")).toEqual({ x: 100, y: 0 });
    expect(labels.get("second")).toEqual({ x: 132, y: 0 });
  });

  it("falls back to the midpoint when nothing along the polyline is clear", () => {
    const short: LabelRequest = {
      id: "a",
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      size: SIZE,
    };
    const labels = placeEdgeLabels([short, { ...short, id: "b" }]);
    expect(labels.get("a")).toEqual({ x: 20, y: 0 });
    expect(labels.get("b")).toEqual({ x: 20, y: 0 });
  });

  it("keeps a slid label at least the end inset away from either end", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ];
    // A wide label already sits across the whole polyline except its ends.
    const blocker: LabelRequest = {
      id: "blocker",
      points: [
        { x: -100, y: 50 },
        { x: 100, y: 50 },
      ],
      size: { width: 40, height: 100 - 2 * LABEL_END_INSET - 2 * LABEL_GAP },
    };
    const labels = placeEdgeLabels([
      blocker,
      { id: "e", points, size: { width: 10, height: 10 } },
    ]);
    // Clearing the blocker would need a center within 12 px of an end.
    expect(labels.get("e")).toEqual({ x: 0, y: 50 });
  });
});
