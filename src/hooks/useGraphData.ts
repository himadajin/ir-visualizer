import { useCallback, useEffect, useRef } from "react";
import {
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type { IRLayoutBehavior } from "../irModes/types";
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

  // `updateGraph` needs the *latest* nodes/edges (a content-only update
  // preserves the previous positions and re-classifies edges from them), but it
  // must NOT change identity when they change: `useIRWorkspace`'s debounced
  // parse effect lists `updateGraph` as a dependency, so an unstable identity
  // re-arms that effect after every graph update and re-parses unchanged code
  // every 750 ms forever. That loop also replaces every node object on each
  // pass, which permanently swallows React Flow's queued `fitView()` calls.
  // Mirroring the state into refs keeps the callback stable.
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Neither of these is ever rendered, so they are refs rather than state —
  // updating them must not re-render, and must not invalidate the callbacks.
  const lastSignatureRef = useRef<string>("");
  const currentRef = useRef<{
    graph: GraphData;
    mode: IRLayoutBehavior;
  } | null>(null);

  const updateGraph = useCallback(
    (graph: GraphData, mode: IRLayoutBehavior) => {
      currentRef.current = { graph, mode };
      const signature = getTopologySignature(graph);

      // Check if topology changed
      const isTopologyEqual = signature === lastSignatureRef.current;

      if (isTopologyEqual) {
        // Content-only update: preserve node positions and edge types.
        const previousNodes = nodesRef.current;
        const previousEdges = edgesRef.current;
        const positionMap = new Map(
          previousNodes.map((n: Node) => [n.id, n.position]),
        );
        const edgeTypeMap = new Map(
          previousEdges.map((e: Edge) => [e.id, e.type]),
        );

        const newNodes = graph.nodes.map((node: GraphNode) => {
          const existingPos = positionMap.get(node.id) || { x: 0, y: 0 };
          return createReactFlowNode(node, existingPos);
        });
        setNodes(newNodes);
        nodesRef.current = newNodes;

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
        edgesRef.current = newEdges;
      } else {
        // Topology changed or first run: re-layout.
        const { nodes: layoutedNodes, edges: layoutedEdges } =
          getLayoutedElements(graph, {
            edgeBuilder: mode.edgeBuilder,
            dagreOptions: mode.dagreOptions,
          });
        setNodes(layoutedNodes);
        nodesRef.current = layoutedNodes;
        setEdges(layoutedEdges);
        edgesRef.current = layoutedEdges;
        lastSignatureRef.current = signature;
      }
    },
    [setNodes, setEdges],
  );

  const resetLayout = useCallback(() => {
    const current = currentRef.current;
    if (!current) return;
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      current.graph,
      {
        edgeBuilder: current.mode.edgeBuilder,
        dagreOptions: current.mode.dagreOptions,
      },
    );
    setNodes(layoutedNodes);
    nodesRef.current = layoutedNodes;
    setEdges(layoutedEdges);
    edgesRef.current = layoutedEdges;
  }, [setNodes, setEdges]);

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
