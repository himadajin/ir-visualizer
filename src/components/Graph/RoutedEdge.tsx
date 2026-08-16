import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import { useEdgeRoute } from "../../hooks/useEdgeRoutes";
import { roundedPath } from "./roundedPath";
import EdgeMarkerDefs from "./EdgeMarkerDefs";

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
    <>
      <EdgeMarkerDefs />
      <BaseEdge
        path={roundedPath(points)}
        label={label}
        labelX={labelPoint.x}
        labelY={labelPoint.y}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
      />
    </>
  );
};

export default RoutedEdge;
