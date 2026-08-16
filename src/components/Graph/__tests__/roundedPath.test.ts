import { describe, it, expect } from "vitest";
import { BEND_RADIUS, roundedPath } from "../roundedPath";
import { NODE_MARGIN, NODE_NODE_SPACING } from "../../../utils/spacing";

/**
 * The bend radius is derived from the router's node margin rather than chosen
 * (specs/graph-view.md §4). What that buys is checked here on the shape the
 * router actually emits: a polyline whose first and last segments are exactly
 * `nodeMargin` long, because the contract keeps the pushed endpoint as
 * `points[1]` and as the second-to-last point. Every corner on such a route
 * has to draw at the nominal radius; the shrink-to-fit may only engage where
 * the layout leaves a corridor narrower than `2 × BEND_RADIUS`.
 */

/**
 * The drawn radius of every corner in a path, in order. `roundedPath` emits
 * one `L … Q …` pair per corner, where the `L` lands `radius` px short of the
 * corner and the `Q` control point *is* the corner, so the distance between
 * the two is the radius the corner was drawn at.
 */
const drawnRadii = (path: string): number[] => {
  const radii: number[] = [];
  const pattern = /L ([-\d.]+) ([-\d.]+) Q ([-\d.]+) ([-\d.]+)/g;
  for (const match of path.matchAll(pattern)) {
    const [entryX, entryY, cornerX, cornerY] = match.slice(1, 5).map(Number);
    radii.push(Math.hypot(cornerX - entryX, cornerY - entryY));
  }
  return radii;
};

describe("BEND_RADIUS", () => {
  it("is half the router's node margin", () => {
    expect(BEND_RADIUS).toBe(NODE_MARGIN / 2);
  });

  it("leaves a full-radius bend room in a route's mandatory endpoint stub", () => {
    expect(2 * BEND_RADIUS).toBeLessThanOrEqual(NODE_MARGIN);
  });

  it("leaves a full-radius bend room in the corridor the ELK spacing reserves", () => {
    expect(2 * NODE_MARGIN + 2 * BEND_RADIUS).toBeLessThanOrEqual(
      NODE_NODE_SPACING,
    );
  });
});

describe("roundedPath", () => {
  it("draws every corner of a router-shaped route at the nominal radius", () => {
    // Leaves a node's bottom edge at (0, 100), crosses a 16 px corridor
    // (`NODE_NODE_SPACING` minus both clearance bands), and arrives on a
    // node's top edge at (120, 140). Both end segments are exactly
    // `NODE_MARGIN` long, as the router guarantees.
    const points = [
      { x: 0, y: 100 },
      { x: 0, y: 100 + NODE_MARGIN },
      { x: 60, y: 100 + NODE_MARGIN },
      { x: 60, y: 140 - NODE_MARGIN },
      { x: 120, y: 140 - NODE_MARGIN },
      { x: 120, y: 140 },
    ];

    expect(drawnRadii(roundedPath(points))).toEqual([
      BEND_RADIUS,
      BEND_RADIUS,
      BEND_RADIUS,
      BEND_RADIUS,
    ]);
  });

  it("shrinks to fit only where the corridor is narrower than two radii", () => {
    // A 6 px corridor — narrower than `2 × BEND_RADIUS`, so shrink-to-fit
    // engages. Full layouts promise at least the configured spacing; this
    // is the safety valve for a content-only size change that closed a gap.
    const points = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 6 },
      { x: 80, y: 6 },
    ];

    expect(drawnRadii(roundedPath(points))).toEqual([3, 3]);
  });

  it("skips a corner that repeats its neighbour's position", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 40 },
    ];

    expect(drawnRadii(roundedPath(points))).toEqual([]);
  });
});
