import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type { IRLayoutBehavior } from "../irModes/types";
import {
  getLayoutedElements,
  inheritBackEdgeFlag,
  sizesCoverGraph,
  type NodeSizeMap,
} from "../utils/layout";
import { createReactFlowNode } from "../utils/converter";

export type { NodeSize, NodeSizeMap } from "../utils/layout";

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
  const parents = graph.nodes
    .map((n) => `${n.id}:${n.parentId ?? ""}`)
    .sort()
    .join(",");
  return `${graph.direction}|${nodeIds}|${edgeIds}|${parents}`;
};

export const useGraphData = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layoutPending, setLayoutPending] = useState(false);

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
    signature: string;
  } | null>(null);
  const layoutPendingRef = useRef(false);
  // ELK layout is async (specs/graph-view.md §2): each full layout gets a
  // generation number, and a result that resolves after a newer layout
  // started is discarded rather than overwriting the newer graph.
  const layoutGenerationRef = useRef(0);

  const applyLayout = useCallback(
    (sizes: NodeSizeMap) => {
      const current = currentRef.current;
      if (!current || !sizesCoverGraph(current.graph, sizes)) {
        return Promise.resolve();
      }
      const generation = ++layoutGenerationRef.current;
      const { graph, mode, signature } = current;
      const storeSignature = layoutPendingRef.current;
      return getLayoutedElements(graph, sizes, {
        edgeBuilder: mode.edgeBuilder,
        layoutOptions: mode.layoutOptions,
      }).then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
        if (generation !== layoutGenerationRef.current) return;
        setNodes(layoutedNodes);
        nodesRef.current = layoutedNodes;
        setEdges(layoutedEdges);
        edgesRef.current = layoutedEdges;
        layoutPendingRef.current = false;
        setLayoutPending(false);
        if (storeSignature) lastSignatureRef.current = signature;
      });
    },
    [setNodes, setEdges],
  );

  const updateGraph = useCallback(
    (graph: GraphData, mode: IRLayoutBehavior) => {
      const signature = getTopologySignature(graph);
      currentRef.current = { graph, mode, signature };

      const isTopologyEqual = signature === lastSignatureRef.current;

      if (isTopologyEqual) {
        // Content-only update (synchronous): preserve node positions, and
        // let each rebuilt edge inherit the previous edge's back-edge flag
        // by id. Edge geometry is not inherited — it is recomputed from the
        // live node rectangles on every render (useEdgeRoutes).
        const previousNodes = nodesRef.current;
        const previousEdges = edgesRef.current;
        const previousNodeMap = new Map(
          previousNodes.map((n: Node) => [n.id, n]),
        );
        const previousEdgeMap = new Map(
          previousEdges.map((e: Edge) => [e.id, e]),
        );

        const newNodes = graph.nodes.map((node: GraphNode) => {
          const previous = previousNodeMap.get(node.id);
          const existingPos = previous?.position ?? { x: 0, y: 0 };
          const prevWidth = previous?.style?.width;
          const prevHeight = previous?.style?.height;
          return createReactFlowNode(node, existingPos, {
            parentId: node.parentId,
            ...(typeof prevWidth === "number" && typeof prevHeight === "number"
              ? { width: prevWidth, height: prevHeight }
              : {}),
          });
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
        // Topology changed or first run: mount hidden nodes so React Flow
        // can measure them. No edges until applyLayout commits placement
        // (specs/graph-view.md §5).
        layoutGenerationRef.current += 1;
        layoutPendingRef.current = true;
        setLayoutPending(true);
        const measuring = graph.nodes.map((node: GraphNode) =>
          createReactFlowNode(node, { x: 0, y: 0 }, { hidden: true }),
        );
        setNodes(measuring);
        nodesRef.current = measuring;
        setEdges([]);
        edgesRef.current = [];
      }
    },
    [setNodes, setEdges],
  );

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setNodes, // expose in case we need manual override
    setEdges,
    updateGraph,
    applyLayout,
    layoutPending,
  };
};
