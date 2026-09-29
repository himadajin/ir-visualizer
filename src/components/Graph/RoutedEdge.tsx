import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import { useEdgeLabelPoint, useEdgeRoute } from "../../hooks/useEdgeRoutes";
import {
  EDGE_LABEL_BG_PADDING,
  EDGE_LABEL_STYLE,
} from "../../utils/edgeLabelText";
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
  bundleId?: string;
  isBackEdge?: boolean;
}

export type RoutedEdgeType = Edge<RoutedEdgeData, "routed">;

/**
 * The one edge renderer for LLVM/Mermaid edges (specs/graph-view.md §4). It
 * has no geometry of its own: it looks its polyline up by edge id in the map
 * `useEdgeRoutes` publishes — the same source for every edge, including the
 * one being dragged — and draws it with rounded bends. Its label goes where
 * the same pass's label placement put it, drawn in the one label style that
 * placement measured. An edge with no entry
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
  const labelPoint = useEdgeLabelPoint(id);
  if (points === undefined || points.length < 2) return null;

  return (
    <>
      <EdgeMarkerDefs />
      <BaseEdge
        path={roundedPath(points)}
        label={label}
        labelX={labelPoint?.x}
        labelY={labelPoint?.y}
        labelStyle={EDGE_LABEL_STYLE}
        labelBgPadding={EDGE_LABEL_BG_PADDING}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
      />
    </>
  );
};

export default RoutedEdge;
