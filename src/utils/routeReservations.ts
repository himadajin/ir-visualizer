import type { Point, RouteRegion, RouteRequest } from "../types/edgeRouting";
import { EDGE_LANE_GAP } from "./spacing";

/** A directional exclusion band: perpendicular crossings remain legal. */
export interface ReservedSegment {
  horizontal: boolean;
  line: number;
  low: number;
  high: number;
}

export const segmentsOf = (points: readonly Point[]): ReservedSegment[] =>
  points.slice(1).flatMap((b, i) => {
    const a = points[i];
    if (a.x === b.x && a.y === b.y) return [];
    const horizontal = a.y === b.y;
    return [
      {
        horizontal,
        line: horizontal ? a.y : a.x,
        low: Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y),
        high: Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y),
      },
    ];
  });

export const sameBundle = (a: RouteRequest, b: RouteRequest): boolean =>
  a.bundleId !== undefined && a.bundleId === b.bundleId;

export const reservationReaches = (
  s: ReservedSegment,
  r: RouteRegion,
): boolean =>
  s.horizontal
    ? s.low <= r.maxX &&
      s.high >= r.minX &&
      s.line + EDGE_LANE_GAP >= r.minY &&
      s.line - EDGE_LANE_GAP <= r.maxY
    : s.low <= r.maxY &&
      s.high >= r.minY &&
      s.line + EDGE_LANE_GAP >= r.minX &&
      s.line - EDGE_LANE_GAP <= r.maxX;

export const conflictsWith = (
  a: Point,
  b: Point,
  reservations: readonly ReservedSegment[],
): boolean => {
  if (a.x === b.x && a.y === b.y) return false;
  const horizontal = a.y === b.y;
  const line = horizontal ? a.y : a.x;
  const low = Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y);
  const high = Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y);
  return reservations.some(
    (s) =>
      s.horizontal === horizontal &&
      Math.abs(s.line - line) < EDGE_LANE_GAP &&
      s.low < high &&
      s.high > low,
  );
};

/** Include every band boundary: the grid represents all directional free space. */
export const reservationGrid = (segments: readonly ReservedSegment[]) => {
  const xs: number[] = [],
    ys: number[] = [];
  for (const s of segments) {
    const along = s.horizontal ? xs : ys;
    const across = s.horizontal ? ys : xs;
    along.push(s.low, s.high);
    across.push(s.line - EDGE_LANE_GAP, s.line + EDGE_LANE_GAP);
  }
  return { xs, ys };
};

/** Geometry, not reservation ownership, determines whether a search changed. */
export const reservationSignature = (
  segments: readonly ReservedSegment[],
): string =>
  [
    ...new Set(
      segments.map(
        (s) => `${s.horizontal ? "h" : "v"}:${s.line}:${s.low}:${s.high}`,
      ),
    ),
  ]
    .sort()
    .join(";");
