import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import { useEdgeRoute } from "../../hooks/useEdgeRoutes";

/**
 * Data the layout attaches to every routed edge (specs/graph-view.md §4).
 *
 * `isBackEdge` is **structural**: it is decided once from ELK's placement
 * geometry and never re-derived from live rects, so back-edge colors do not
 * flicker while a node is dragged. Only geometry is live, and geometry does
 * not live here — it comes from `useEdgeRoutes`.
 */
export interface RoutedEdgeData extends Record<string, unknown> {
  isBackEdge?: boolean;
}

export type RoutedEdgeType = Edge<RoutedEdgeData, "routed">;

/** Corner radius of routed orthogonal bends, px. */
const BEND_RADIUS = 8;

/**
 * Rounded-corner path through an orthogonal polyline. Consecutive duplicate
 * points are skipped; the radius shrinks to fit short segments.
 */
const roundedPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return "";
  const parts = [`M ${String(points[0].x)} ${String(points[0].y)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (inLen === 0 || outLen === 0) continue;
    const radius = Math.min(BEND_RADIUS, inLen / 2, outLen / 2);
    const inX = corner.x - ((corner.x - prev.x) / inLen) * radius;
    const inY = corner.y - ((corner.y - prev.y) / inLen) * radius;
    const outX = corner.x + ((next.x - corner.x) / outLen) * radius;
    const outY = corner.y + ((next.y - corner.y) / outLen) * radius;
    parts.push(
      `L ${String(inX)} ${String(inY)}`,
      `Q ${String(corner.x)} ${String(corner.y)} ${String(outX)} ${String(outY)}`,
    );
  }
  const last = points[points.length - 1];
  parts.push(`L ${String(last.x)} ${String(last.y)}`);
  return parts.join(" ");
};

/** Midpoint along the polyline (by arc length), for label placement. */
const midpoint = (points: { x: number; y: number }[]) => {
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    lengths.push(len);
    total += len;
  }
  let remaining = total / 2;
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
  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
};

/**
 * The one edge renderer for LLVM/Mermaid edges (specs/graph-view.md §4). It
 * has no geometry of its own: it looks its polyline up by edge id in the map
 * `useEdgeRoutes` publishes — the same source for every edge, including the
 * one being dragged — and draws it with rounded bends. An edge with no entry
 * (an endpoint React Flow has not measured yet) is not drawn this frame;
 * there is deliberately no placeholder shape.
 */
const RoutedEdge = ({
  id,
  label,
  style = {},
  markerStart,
  markerEnd,
}: EdgeProps<RoutedEdgeType>) => {
  const points = useEdgeRoute(id);
  if (points === undefined || points.length < 2) return null;

  const labelPoint = midpoint(points);

  return (
    <BaseEdge
      path={roundedPath(points)}
      label={label}
      labelX={labelPoint.x}
      labelY={labelPoint.y}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={style}
    />
  );
};

export default RoutedEdge;
