/**
 * Module boundary of the orthogonal edge router
 * (`contracts/edge-routing.md`, `specs/graph-view.md` §4).
 * Edge geometry is a pure function of the live node rectangles, so these are
 * plain geometry types: nothing here depends on React Flow or ELK.
 */

export interface Point {
  x: number;
  y: number;
}

export type RouteSide = "top" | "right" | "bottom" | "left";

export interface RouteNodeRect {
  id: string;
  x: number;
  y: number; // absolute top-left
  width: number;
  height: number;
  /** Default true. `false`: an endpoint frame whose interior does not block. */
  obstacle?: boolean;
}

export interface RouteRequest {
  id: string; // React Flow edge id
  source: string;
  target: string;
  sourcePoint: Point; // absolute handle position
  targetPoint: Point;
  sourceSide: RouteSide;
  targetSide: RouteSide;
}

export interface EdgeRouterOptions {
  nodeMargin?: number; // default NODE_MARGIN (src/utils/spacing.ts)
  bendPenalty?: number; // default 30
  selfLoopGap?: number; // default SELF_LOOP_GAP (src/utils/spacing.ts)
}

/**
 * The part of the plane one request is searched in — an axis-aligned box, bounds
 * inclusive (`contracts/edge-routing.md`, "Per-edge regions"). A route found
 * here is a function of the rects reaching this box and of nothing else, which
 * is what lets a caller decide that an edge cannot have changed.
 */
export interface RouteRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
