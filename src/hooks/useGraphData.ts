import { useState, useCallback } from "react";
import {
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type { IRModeDefinition } from "../irModes/types";
import { getLayoutedElements } from "../utils/layout";
import { createReactFlowNode } from "../utils/converter";

// Helper to generate a topology signature
const getTopologySignature = (graph: GraphData) => {
  const nodeIds = graph.nodes
    .map((n) => n.id)
    .sort()
    .join(",");
  const edgeIds = graph.edges
    .map((e) => `${e.source}-${e.target}`)
    .sort()
    .join(",");
  return `${graph.direction}|${nodeIds}|${edgeIds}`;
};

export const useGraphData = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [lastSignature, setLastSignature] = useState<string>("");

  const [current, setCurrent] = useState<{
    graph: GraphData;
    mode: IRModeDefinition;
  } | null>(null);

  const updateGraph = useCallback(
    (graph: GraphData, mode: IRModeDefinition) => {
      setCurrent({ graph, mode });
      const signature = getTopologySignature(graph);

      // Check if topology changed
      const isTopologyEqual = signature === lastSignature;

      if (isTopologyEqual) {
        // Content-only update: preserve node positions and edge types.
        const positionMap = new Map(nodes.map((n: Node) => [n.id, n.position]));
        const edgeTypeMap = new Map(edges.map((e: Edge) => [e.id, e.type]));

        const newNodes = graph.nodes.map((node: GraphNode) => {
          const existingPos = positionMap.get(node.id) || { x: 0, y: 0 };
          return createReactFlowNode(node, existingPos);
        });
        setNodes(newNodes);

        const newEdges = graph.edges.map((edge: GraphEdge) => {
          const edgeType = mode.edgeBuilder.classifyEdgeType({
            edge,
            sourcePos: positionMap.get(edge.source),
            targetPos: positionMap.get(edge.target),
            previousType: edgeTypeMap.get(edge.id),
          });
          return mode.edgeBuilder.buildReactFlowEdge(edge, edgeType);
        });
        setEdges(newEdges);
      } else {
        // Topology changed or first run: re-layout.
        const { nodes: layoutedNodes, edges: layoutedEdges } =
          getLayoutedElements(graph, {
            edgeBuilder: mode.edgeBuilder,
            dagreOptions: mode.dagreOptions,
          });
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setLastSignature(signature);
      }
    },
    [lastSignature, nodes, edges, setNodes, setEdges],
  );

  const resetLayout = useCallback(() => {
    if (!current) return;
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      current.graph,
      {
        edgeBuilder: current.mode.edgeBuilder,
        dagreOptions: current.mode.dagreOptions,
      },
    );
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [current, setNodes, setEdges]);

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setNodes, // expose in case we need manual override
    setEdges,
    updateGraph,
    resetLayout,
  };
};
