import { useState, useCallback } from "react";
import {
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { GraphData } from "../types/graph";
import { getLayoutedElements } from "../utils/layout";
import { createReactFlowNode, createReactFlowEdge } from "../utils/converter";

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

  const [currentGraph, setCurrentGraph] = useState<GraphData | null>(null);

  const updateGraph = useCallback(
    (graph: GraphData) => {
      setCurrentGraph(graph);
      const signature = getTopologySignature(graph);

      // Check if topology changed
      const isTopologyEqual = signature === lastSignature;

      if (isTopologyEqual) {
        // Content-only update: preserve positions
        // Content-only update: preserve positions
        // Calculate new nodes first to have positions available
        const positionMap = new Map(nodes.map((n) => [n.id, n.position]));

        const newNodes = graph.nodes.map((node) => {
          const existingPos = positionMap.get(node.id) || { x: 0, y: 0 };
          return createReactFlowNode(node, existingPos);
        });

        setNodes(newNodes);

        // Calculate edges using positions from newNodes (or positionMap which is the same for existing)
        const newEdges = graph.edges.map((edge) => {
          const sourcePos = positionMap.get(edge.source);
          const targetPos = positionMap.get(edge.target);

          let edgeType = "customBezier";

          if (edge.source === edge.target) {
            edgeType = "backEdge";
          } else if (sourcePos && targetPos && sourcePos.y >= targetPos.y) {
            // Check against layout direction. Assuming 'TD' (y increases downwards)
            // If source is below (greater y) or equal to target, it's a back edge
            edgeType = "backEdge";
          }
          return createReactFlowEdge(edge, edgeType);
        });

        setEdges(newEdges);
      } else {
        // Topology changed or first run: Re-layout
        const { nodes: layoutedNodes, edges: layoutedEdges } =
          getLayoutedElements(graph);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setLastSignature(signature);
      }
    },
    [lastSignature, nodes, setNodes, setEdges],
  );

  const resetLayout = useCallback(() => {
    if (!currentGraph) return;
    const { nodes: layoutedNodes, edges: layoutedEdges } =
      getLayoutedElements(currentGraph);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [currentGraph, setNodes, setEdges]);

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
