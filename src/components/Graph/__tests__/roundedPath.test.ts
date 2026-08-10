import { describe, it, expect } from "vitest";
import { BEND_RADIUS, roundedPath } from "../roundedPath";
import { DEFAULT_NODE_MARGIN } from "../../../utils/edgeRouter";

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
    const [entryX, entryY, cornerX, cornerY] = match.slice(1).map(Number);
    radii.push(Math.hypot(cornerX - entryX, cornerY - entryY));
  }
  return radii;
};

describe("BEND_RADIUS", () => {
  it("is half the router's node margin", () => {
    expect(BEND_RADIUS).toBe(DEFAULT_NODE_MARGIN / 2);
  });

  it("leaves a full-radius bend room in a route's mandatory endpoint stub", () => {
    expect(2 * BEND_RADIUS).toBeLessThanOrEqual(DEFAULT_NODE_MARGIN);
  });

  it("leaves a full-radius bend room in the corridor the ELK spacing reserves", () => {
    // The narrowest node spacing any mode configures (layout.ts's default
    // `elk.spacing.nodeNode`, matched by the Use-Def override). The corridor
    // between two nodes' clearance bands is that minus both margins.
    const narrowestNodeSpacing = 40;
    expect(2 * DEFAULT_NODE_MARGIN + 2 * BEND_RADIUS).toBeLessThanOrEqual(
      narrowestNodeSpacing,
    );
  });
});

describe("roundedPath", () => {
  it("draws every corner of a router-shaped route at the nominal radius", () => {
    // Leaves a node's bottom edge at (0, 100), crosses a 16 px corridor
    // (`elk.spacing.nodeNode` 40 minus both clearance bands), and arrives on a
    // node's top edge at (120, 140). Both end segments are exactly
    // `DEFAULT_NODE_MARGIN` long, as the router guarantees.
    const points = [
      { x: 0, y: 100 },
      { x: 0, y: 112 },
      { x: 60, y: 112 },
      { x: 60, y: 128 },
      { x: 120, y: 128 },
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
    // A 6 px corridor — what ELK leaves when it lays out on an estimated node
    // size smaller than the measured one (#91), not something this radius can
    // avoid.
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
