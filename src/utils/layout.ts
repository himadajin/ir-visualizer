import dagre from "dagre";
import { type Node, type Edge } from "@xyflow/react";
import type { GraphData } from "../types/graph";
import type { SelectionDAGGraphData } from "../graphBuilder/selectionDAGGraphBuilder";
import {
  calculateNodeDimensions,
  createReactFlowNode,
  createReactFlowEdge,
  createSelectionDAGReactFlowEdge,
} from "./converter";

export const getLayoutedElements = (
  graph: GraphData,
  options: { direction: string } = { direction: "TD" },
): { nodes: Node[]; edges: Edge[] } => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: options.direction || graph.direction || "TD",
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
    const sourceNode = dagreGraph.node(edge.source);
    const targetNode = dagreGraph.node(edge.target);

    // Determine edge type
    let edgeType = "customBezier";

    if (edge.source === edge.target) {
      edgeType = "backEdge";
    } else if (sourceNode && targetNode && sourceNode.y >= targetNode.y) {
      // Back edge if source is below or at same level as target (and not self loop)
      edgeType = "backEdge";
    }

    return createReactFlowEdge(edge, edgeType);
  });

  return { nodes, edges };
};

export const getSelectionDAGLayoutedElements = (
  graph: SelectionDAGGraphData,
  options: { direction: string } = { direction: "TD" },
): { nodes: Node[]; edges: Edge[] } => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: options.direction || graph.direction || "TD",
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
    const sourceNode = dagreGraph.node(edge.source);
    const targetNode = dagreGraph.node(edge.target);

    let edgeType = "customBezier";
    if (edge.source === edge.target) {
      edgeType = "backEdge";
    } else if (sourceNode && targetNode && sourceNode.y >= targetNode.y) {
      edgeType = "backEdge";
    }

    return createSelectionDAGReactFlowEdge(edge, edgeType);
  });

  return { nodes, edges };
};
