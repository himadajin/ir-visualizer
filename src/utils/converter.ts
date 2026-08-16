import { type Node, type Edge, MarkerType } from "@xyflow/react";
import type { GraphNode, GraphEdge } from "../types/graph";

/** Default edge stroke. Graph grammar, not shell chrome. */
export const EDGE_STROKE_COLOR = "#666";

/**
 * Loop accent: back edges (and self-loops) draw in this muted purple so
 * "colored + upward = loop-carried" (specs/graph-view.md §4). Graph grammar,
 * not shell chrome.
 */
export const BACK_EDGE_COLOR = "#8250df";

/** Custom marker ids for circle/cross arrowheads (specs/mermaid.md §5). */
export const EDGE_MARKER_IDS = {
  circle: "ir-edge-circle",
  circleBack: "ir-edge-circle-back",
  cross: "ir-edge-cross",
  crossBack: "ir-edge-cross-back",
} as const;

export const EDGE_MARKER = {
  circle: `url(#${EDGE_MARKER_IDS.circle})`,
  circleBack: `url(#${EDGE_MARKER_IDS.circleBack})`,
  cross: `url(#${EDGE_MARKER_IDS.cross})`,
  crossBack: `url(#${EDGE_MARKER_IDS.crossBack})`,
} as const;

const PHI_DASH = "6 6";
const THICK_STROKE_WIDTH = 2;

type MarkerKind = "arrow" | "circle" | "cross" | "none";

const markerOf = (kind: MarkerKind): Edge["markerEnd"] => {
  switch (kind) {
    case "none":
      return undefined;
    case "circle":
      return EDGE_MARKER.circle;
    case "cross":
      return EDGE_MARKER.cross;
    case "arrow":
      return { type: MarkerType.ArrowClosed, color: EDGE_STROKE_COLOR };
  }
};

const kindOf = (body: string): MarkerKind => {
  if (body === "arrow_open") return "none";
  if (body === "arrow_circle") return "circle";
  if (body === "arrow_cross") return "cross";
  return "arrow";
};

/** Maps a FlowDB arrowhead string onto start/end marker kinds. */
export const mermaidMarkerKinds = (
  arrowhead: string | undefined,
): { start: MarkerKind; end: MarkerKind } => {
  const raw = arrowhead ?? "arrow_point";
  const double = raw.startsWith("double_");
  const kind = kindOf(double ? raw.slice("double_".length) : raw);
  if (double) {
    const both: MarkerKind = kind === "none" ? "arrow" : kind;
    return { start: both, end: both };
  }
  return { start: "none", end: kind };
};

/**
 * Recolor a marker for the back-edge accent without changing its kind
 * (specs/graph-view.md §4). Object markers get a new `color`; circle/cross
 * URLs swap to the purple def; an absent marker stays absent.
 */
export const recolorMarker = (
  marker: Edge["markerEnd"] | Edge["markerStart"],
  color: string,
): Edge["markerEnd"] => {
  if (marker === undefined) return undefined;
  if (color === BACK_EDGE_COLOR) {
    if (marker === EDGE_MARKER.circle) return EDGE_MARKER.circleBack;
    if (marker === EDGE_MARKER.cross) return EDGE_MARKER.crossBack;
  }
  if (typeof marker === "object") return { ...marker, color };
  return marker;
};

/**
 * Maps GraphNode.nodeType (kebab-case) to React Flow nodeTypes key (camelCase).
 * Falls back to "codeNode" when nodeType is not set.
 */
export const nodeTypeToReactFlowType = (nodeType?: string): string => {
  if (!nodeType) return "codeNode";
  // Convert "llvm-basicBlock" → "llvmBasicBlock", "mermaid-node" → "mermaidNode"
  return nodeType.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
};

export const createReactFlowNode = (
  node: GraphNode,
  position: { x: number; y: number },
  options?: {
    hidden?: boolean;
    parentId?: string;
    width?: number;
    height?: number;
  },
): Node => {
  const isGroup = node.nodeType === "graph-group";
  const sized =
    options?.width !== undefined && options?.height !== undefined
      ? { width: options.width, height: options.height }
      : { width: "fit-content", height: "fit-content" };
  return {
    id: node.id,
    position,
    ...(options?.parentId !== undefined
      ? { parentId: options.parentId, extent: "parent" as const }
      : {}),
    data: {
      label: node.label,
      shape: node.type,
      language: node.language,
      blockLabel: node.blockLabel,
      astData: node.astData,
      ...(isGroup ? { obstacle: false } : {}),
    },
    type: nodeTypeToReactFlowType(node.nodeType),
    // fit-content: the node sizes itself; ELK is fed the measured box
    // afterwards (specs/graph-view.md §5). React Flow's default 150×40 must
    // not win. Containers after layout take the ELK box instead. `hidden` is
    // CSS visibility so the measure pass stays in the layout (display:none
    // would not measure).
    style: {
      ...sized,
      ...(options?.hidden === true ? { visibility: "hidden" } : {}),
    },
  };
};

export const createReactFlowEdge = (
  edge: GraphEdge,
  edgeType: string = "routed",
): Edge => {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label,
    animated: false,
    type: edgeType,
    zIndex: 0,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: EDGE_STROKE_COLOR,
    },
    style: {
      stroke: EDGE_STROKE_COLOR,
      ...(edge.dashed ? { strokeDasharray: PHI_DASH } : {}),
    },
  };
};

/**
 * Mermaid flowchart appearance (specs/mermaid.md §5). Geometry still comes
 * from the live router; this factory only sets stroke, markers, and whether
 * the edge is painted.
 */
export const createMermaidReactFlowEdge = (edge: GraphEdge): Edge => {
  if (edge.stroke === "invisible") {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: false,
      type: "routed",
      zIndex: 0,
      hidden: true,
      style: { stroke: EDGE_STROKE_COLOR },
    };
  }

  const { start, end } = mermaidMarkerKinds(edge.arrowhead);
  const markerStart = markerOf(start);
  const markerEnd = markerOf(end);
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: false,
    type: "routed",
    zIndex: 0,
    ...(markerStart !== undefined ? { markerStart } : {}),
    ...(markerEnd !== undefined ? { markerEnd } : {}),
    style: {
      stroke: EDGE_STROKE_COLOR,
      ...(edge.stroke === "dotted" ? { strokeDasharray: PHI_DASH } : {}),
      ...(edge.stroke === "thick" ? { strokeWidth: THICK_STROKE_WIDTH } : {}),
    },
  };
};

export const createSelectionDAGReactFlowEdge = (edge: GraphEdge): Edge => {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label,
    animated: false,
    // React Flow's built-in bezier; the high curvature keeps operand fan-ins
    // visually separated near the node. `pathOptions` is honored by the
    // built-in bezier edge but missing from the `Edge` type, hence the cast.
    type: "default",
    ...({ pathOptions: { curvature: 0.75 } } as Partial<Edge>),
    zIndex: 0,
    markerStart: {
      type: MarkerType.ArrowClosed,
      color: EDGE_STROKE_COLOR,
    },
    style: {
      stroke: EDGE_STROKE_COLOR,
      ...(edge.isChainOrGlue ? { strokeDasharray: "8 8" } : {}),
    },
  };
};
