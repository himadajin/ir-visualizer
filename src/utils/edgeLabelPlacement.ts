import type { Point } from "../types/edgeRouting";
import { NODE_MARGIN } from "./spacing";

/**
 * Edge label placement (`specs/graph-view.md` §4, "Edge labels never overlap
 * one another").
 *
 * A pure step over **finished** polylines: it never feeds back into the
 * router, which keeps labels out of its obstacle set
 * (`contracts/edge-routing.md`). Labels are placed one at a time, shortest
 * polyline first — the label with the fewest positions to choose from claims
 * its place before a long route's label can land across it — and input order
 * among equal lengths. Each takes the position nearest its arc-length
 * midpoint, along its own polyline, whose box keeps `LABEL_GAP` from every
 * label already placed. When no such position exists it falls back to the
 * midpoint.
 */

/** A label's painted box, background padding included, px. */
export interface LabelSize {
  width: number;
  height: number;
}

export interface LabelRequest {
  id: string; // React Flow edge id
  points: readonly Point[];
  size: LabelSize;
}

/** Label centers keyed by React Flow edge id. */
export type EdgeLabelMap = ReadonlyMap<string, Point>;

/** Minimum clearance between two placed label boxes, px. */
export const LABEL_GAP = 2;

/** Arc-length distance between successive candidate positions, px. */
export const LABEL_SLIDE_STEP = 4;

/**
 * Minimum arc length between a label center and either end of its polyline,
 * px — the route's end segments are exactly `nodeMargin` long, so a label never
 * sits on its end nodes' attachment segments.
 */
export const LABEL_END_INSET = NODE_MARGIN;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const boxAt = (center: Point, size: LabelSize): Box => ({
  left: center.x - size.width / 2,
  top: center.y - size.height / 2,
  right: center.x + size.width / 2,
  bottom: center.y + size.height / 2,
});

const tooClose = (a: Box, b: Box): boolean =>
  a.left < b.right + LABEL_GAP &&
  b.left < a.right + LABEL_GAP &&
  a.top < b.bottom + LABEL_GAP &&
  b.top < a.bottom + LABEL_GAP;

const segmentLengths = (points: readonly Point[]): number[] => {
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    lengths.push(
      Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y),
    );
  }
  return lengths;
};

/** The point at arc length `distance` along the polyline. */
const pointAt = (
  points: readonly Point[],
  lengths: readonly number[],
  distance: number,
): Point => {
  let remaining = distance;
  for (let i = 1; i < points.length; i++) {
    const len = lengths[i - 1];
    if (remaining <= len && len > 0) {
      const t = remaining / len;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
    remaining -= len;
  }
  return points[points.length - 1];
};

/**
 * Arc-length distances to try, nearest the midpoint first, alternating after
 * and before it, and never closer than `LABEL_END_INSET` to either end. A
 * polyline too short for the inset still offers its midpoint.
 */
function* candidateDistances(total: number): Generator<number> {
  const mid = total / 2;
  const reach = Math.max(0, mid - LABEL_END_INSET);
  yield mid;
  for (
    let offset = LABEL_SLIDE_STEP;
    offset <= reach;
    offset += LABEL_SLIDE_STEP
  ) {
    yield mid + offset;
    yield mid - offset;
  }
}

export const placeEdgeLabels = (
  labels: readonly LabelRequest[],
): Map<string, Point> => {
  const measured = labels
    .filter(({ points }) => points.length > 0)
    .map((label) => {
      const lengths = segmentLengths(label.points);
      const total = lengths.reduce((sum, len) => sum + len, 0);
      return { ...label, lengths, total };
    })
    // `sort` is stable, so equal lengths keep input order.
    .sort((a, b) => a.total - b.total);

  const placed: Box[] = [];
  const centers = new Map<string, Point>();
  for (const { id, points, size, lengths, total } of measured) {
    const midpoint = pointAt(points, lengths, total / 2);
    let center = midpoint;
    for (const distance of candidateDistances(total)) {
      const candidate = pointAt(points, lengths, distance);
      const box = boxAt(candidate, size);
      if (placed.every((other) => !tooClose(box, other))) {
        center = candidate;
        break;
      }
    }
    placed.push(boxAt(center, size));
    centers.set(id, center);
  }
  return centers;
};
