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
  nodeMargin?: number; // default 12
  bendPenalty?: number; // default 30
  selfLoopGap?: number; // default 24
}
