import dagre from "dagre";
import { type Node, type Edge } from "@xyflow/react";
import type { GraphData, GraphEdge } from "../types/graph";
import {
  calculateNodeDimensions,
  createReactFlowNode,
  createReactFlowEdge,
  createSelectionDAGReactFlowEdge,
} from "./converter";

/**
 * Decides what an edge should look like. Each IR mode supplies its own —
 * see docs/internal/contracts/ir-mode-registry.md for why LLVM/Mermaid and
 * SelectionDAG genuinely need different edge semantics rather than one
 * universal algorithm.
 */
export interface IREdgeBuilder {
  classifyEdgeType(params: {
    edge: GraphEdge;
    sourcePos?: { x: number; y: number };
    targetPos?: { x: number; y: number };
    previousType?: string;
  }): string;
  buildReactFlowEdge(edge: GraphEdge, edgeType: string): Edge;
}

/** LLVM/Mermaid: control-flow back-edges are detected from node position. */
export const codeGraphEdgeBuilder: IREdgeBuilder = {
  classifyEdgeType({ edge, sourcePos, targetPos }) {
    if (edge.source === edge.target) return "backEdge";
    if (sourcePos && targetPos && sourcePos.y >= targetPos.y) {
      return "backEdge";
    }
    return "customBezier";
  },
  buildReactFlowEdge: createReactFlowEdge,
};

/**
 * SelectionDAG: edges connect specific operand/type Handles rather than
 * generic node boundaries, so position-based back-edge detection doesn't
 * apply. Edge type is stable across incremental updates instead.
 */
export const selectionDAGEdgeBuilder: IREdgeBuilder = {
  classifyEdgeType({ previousType }) {
    return previousType ?? "customBezier";
  },
  buildReactFlowEdge: createSelectionDAGReactFlowEdge,
};

export interface LayoutOptions {
  direction?: string;
  edgeBuilder?: IREdgeBuilder;
  dagreOptions?: Partial<dagre.GraphLabel>;
}

export const getLayoutedElements = (
  graph: GraphData,
  options: LayoutOptions = {},
): { nodes: Node[]; edges: Edge[] } => {
  const { edgeBuilder = codeGraphEdgeBuilder, dagreOptions } = options;

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: options.direction || graph.direction || "TD",
    ...dagreOptions,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Add nodes to dagre
  graph.nodes.forEach((node) => {
    const { width, height } = calculateNodeDimensions(node);
    dagreGraph.setNode(node.id, {
      width,
      height,
      label: node.label,
      shape: node.type,
    });
  });

  // Add edges to dagre
  graph.edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const nodes: Node[] = graph.nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return createReactFlowNode(node, {
      x: nodeWithPosition.x - nodeWithPosition.width / 2,
      y: nodeWithPosition.y - nodeWithPosition.height / 2,
    });
  });

  const edges: Edge[] = graph.edges.map((edge) => {
    const sourcePos = dagreGraph.node(edge.source);
    const targetPos = dagreGraph.node(edge.target);
    const edgeType = edgeBuilder.classifyEdgeType({
      edge,
      sourcePos,
      targetPos,
    });
    return edgeBuilder.buildReactFlowEdge(edge, edgeType);
  });

  return { nodes, edges };
};
