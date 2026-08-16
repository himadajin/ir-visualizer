import { type Node, type Edge, MarkerType } from "@xyflow/react";
import type { GraphNode, GraphEdge } from "../types/graph";

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
  options?: { hidden?: boolean },
): Node => {
  return {
    id: node.id,
    position,
    data: {
      label: node.label,
      shape: node.type,
      language: node.language,
      blockLabel: node.blockLabel,
      astData: node.astData,
    },
    type: nodeTypeToReactFlowType(node.nodeType),
    // fit-content: the node sizes itself; ELK is fed the measured box
    // afterwards (specs/graph-view.md §5). React Flow's default 150×40 must
    // not win. `hidden` is CSS visibility so the measure pass stays in the
    // layout (display:none would not measure).
    style: {
      width: "fit-content",
      height: "fit-content",
      ...(options?.hidden === true ? { visibility: "hidden" } : {}),
    },
  };
};

/**
 * Loop accent: back edges (and self-loops) draw in this muted purple so
 * "colored + upward = loop-carried" (specs/graph-view.md §4). Graph grammar,
 * not shell chrome.
 */
export const BACK_EDGE_COLOR = "#8250df";

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
      color: "#666",
    },
    style: {
      stroke: "#666",
      ...(edge.dashed ? { strokeDasharray: "6 6" } : {}),
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
      color: "#666",
    },
    style: {
      stroke: "#666",
      ...(edge.isChainOrGlue ? { strokeDasharray: "8 8" } : {}),
    },
  };
};
