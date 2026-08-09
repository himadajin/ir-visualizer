import { useCallback, useEffect, useRef } from "react";
import {
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type { IRLayoutBehavior } from "../irModes/types";
import { getLayoutedElements, inheritBackEdgeFlag } from "../utils/layout";
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
  // preserves the previous positions and inherits edges' back-edge flags
  // from them), but it must NOT change identity when they change:
  // `useIRWorkspace`'s debounced parse effect lists `updateGraph` as a
  // dependency, so an unstable identity re-arms that effect after every
  // graph update and re-parses unchanged code every 750 ms forever. That
  // loop also replaces every node object on each pass, which permanently
  // swallows React Flow's queued `fitView()` calls. Mirroring the state into
  // refs keeps the callback stable.
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
  // ELK layout is async (specs/graph-view.md §2): each full layout gets a
  // generation number, and a result that resolves after a newer layout
  // started is discarded rather than overwriting the newer graph.
  const layoutGenerationRef = useRef(0);

  const runLayout = useCallback(
    (graph: GraphData, mode: IRLayoutBehavior, signature: string | null) => {
      const generation = ++layoutGenerationRef.current;
      return getLayoutedElements(graph, {
        edgeBuilder: mode.edgeBuilder,
        layoutOptions: mode.layoutOptions,
      }).then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
        if (generation !== layoutGenerationRef.current) return;
        setNodes(layoutedNodes);
        nodesRef.current = layoutedNodes;
        setEdges(layoutedEdges);
        edgesRef.current = layoutedEdges;
        if (signature !== null) lastSignatureRef.current = signature;
      });
    },
    [setNodes, setEdges],
  );

  const updateGraph = useCallback(
    (graph: GraphData, mode: IRLayoutBehavior) => {
      currentRef.current = { graph, mode };
      const signature = getTopologySignature(graph);

      // Check if topology changed
      const isTopologyEqual = signature === lastSignatureRef.current;

      if (isTopologyEqual) {
        // Content-only update (synchronous): preserve node positions, and
        // let each rebuilt edge inherit the previous edge's back-edge flag
        // by id. Edge geometry is not inherited — it is recomputed from the
        // live node rectangles on every render (useEdgeRoutes).
        const previousNodes = nodesRef.current;
        const previousEdges = edgesRef.current;
        const positionMap = new Map(
          previousNodes.map((n: Node) => [n.id, n.position]),
        );
        const previousEdgeMap = new Map(
          previousEdges.map((e: Edge) => [e.id, e]),
        );

        const newNodes = graph.nodes.map((node: GraphNode) => {
          const existingPos = positionMap.get(node.id) || { x: 0, y: 0 };
          return createReactFlowNode(node, existingPos);
        });
        setNodes(newNodes);
        nodesRef.current = newNodes;

        const newEdges = graph.edges.map((edge: GraphEdge) =>
          inheritBackEdgeFlag(
            mode.edgeBuilder.buildReactFlowEdge(edge),
            previousEdgeMap.get(edge.id),
          ),
        );
        setEdges(newEdges);
        edgesRef.current = newEdges;
      } else {
        // Topology changed or first run: full async re-layout.
        void runLayout(graph, mode, signature);
      }
    },
    [setNodes, setEdges, runLayout],
  );

  const resetLayout = useCallback(async () => {
    const current = currentRef.current;
    if (!current) return;
    await runLayout(current.graph, current.mode, null);
  }, [runLayout]);

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
