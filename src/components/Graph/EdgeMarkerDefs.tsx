import {
  BACK_EDGE_COLOR,
  EDGE_MARKER_IDS,
  EDGE_STROKE_COLOR,
} from "../../utils/converter";

const markerBox = {
  markerWidth: 10,
  markerHeight: 10,
  refX: 8,
  refY: 5,
  orient: "auto" as const,
  markerUnits: "userSpaceOnUse" as const,
};

/**
 * Circle and cross arrowheads for Mermaid flowchart edges
 * (`specs/mermaid.md` §5). Rendered inside `RoutedEdge` so the defs live in
 * the same SVG as the paths that reference them. Duplicate ids across edges
 * are identical, so they are safe.
 */
const EdgeMarkerDefs = () => (
  <defs>
    <marker id={EDGE_MARKER_IDS.circle} {...markerBox}>
      <circle cx={4} cy={5} r={3} fill={EDGE_STROKE_COLOR} />
    </marker>
    <marker id={EDGE_MARKER_IDS.circleBack} {...markerBox}>
      <circle cx={4} cy={5} r={3} fill={BACK_EDGE_COLOR} />
    </marker>
    <marker id={EDGE_MARKER_IDS.cross} {...markerBox}>
      <path
        d="M1.5 2 L6.5 8 M6.5 2 L1.5 8"
        fill="none"
        stroke={EDGE_STROKE_COLOR}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </marker>
    <marker id={EDGE_MARKER_IDS.crossBack} {...markerBox}>
      <path
        d="M1.5 2 L6.5 8 M6.5 2 L1.5 8"
        fill="none"
        stroke={BACK_EDGE_COLOR}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </marker>
  </defs>
);

export default EdgeMarkerDefs;
