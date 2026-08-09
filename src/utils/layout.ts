import type {
  ELK,
  ElkExtendedEdge,
  ElkNode,
  ElkPort,
  LayoutOptions as ElkLayoutOptions,
} from "elkjs/lib/elk-api";
import { type Node, type Edge, MarkerType } from "@xyflow/react";
import type { GraphData, GraphEdge } from "../types/graph";
import type { RoutedEdgeData } from "../components/Graph/RoutedEdge";
import { getUseDefPorts } from "../components/Graph/LLVM/UseDef/useDefPorts";
import {
  calculateNodeDimensions,
  createReactFlowNode,
  createReactFlowEdge,
  createSelectionDAGReactFlowEdge,
  BACK_EDGE_COLOR,
} from "./converter";

/**
 * How a mode turns a GraphEdge into a React Flow edge — see
 * docs/internal/contracts/ir-mode-registry.md. Whether an edge is a back
 * edge is no longer classified up front: the ELK layout derives it from the
 * final geometry and attaches it to `edge.data`.
 */
export interface IREdgeBuilder {
  buildReactFlowEdge(edge: GraphEdge): Edge;
}

/** LLVM/Mermaid: ELK-routed edges (specs/graph-view.md §4). */
export const codeGraphEdgeBuilder: IREdgeBuilder = {
  buildReactFlowEdge: (edge) => createReactFlowEdge(edge, "routed"),
};

/**
 * SelectionDAG: edges connect specific operand/type Handles rather than
 * generic node boundaries, so they keep the handle-anchored bezier look
 * (React Flow's built-in "default" edge) instead of routed paths.
 */
export const selectionDAGEdgeBuilder: IREdgeBuilder = {
  buildReactFlowEdge: (edge) => createSelectionDAGReactFlowEdge(edge),
};

export interface LayoutOptions {
  direction?: string;
  edgeBuilder?: IREdgeBuilder;
  /** Per-mode ELK option overrides (contracts/ir-mode-registry.md). */
  layoutOptions?: Record<string, string>;
}

/**
 * The elkjs bundle is ~1.4 MB, so it stays out of the initial chunk and
 * loads with the first layout. Graphs are small; main-thread layout is fine.
 */
let elkInstance: Promise<ELK> | null = null;
const getElk = (): Promise<ELK> => {
  elkInstance ??= import("elkjs/lib/elk.bundled.js").then(
    ({ default: ElkConstructor }) => new ElkConstructor(),
  );
  return elkInstance;
};

const DEFAULT_ELK_OPTIONS: ElkLayoutOptions = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "50",
  "elk.spacing.nodeNode": "40",
  "elk.spacing.edgeNode": "16",
  "elk.spacing.edgeEdge": "12",
  "elk.layered.spacing.edgeNodeBetweenLayers": "16",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
};

/** ELK port ids are global, so node-local handle ids get namespaced. */
const elkPortId = (nodeId: string, handleId: string) =>
  `${nodeId}::${handleId}`;

const buildElkNode = (graph: GraphData, nodeIndex: number): ElkNode => {
  const node = graph.nodes[nodeIndex];
  const { width, height } = calculateNodeDimensions(node);
  const elkNode: ElkNode = { id: node.id, width, height };

  if (node.nodeType === "llvm-useDefInstruction") {
    const ports: ElkPort[] = getUseDefPorts(node.astData).map((port) => ({
      id: elkPortId(node.id, port.id),
      x: Math.min(Math.max(port.x ?? width / 2, 0), width),
      y: port.side === "top" ? 0 : height,
      width: 0,
      height: 0,
    }));
    if (ports.length > 0) {
      elkNode.ports = ports;
      elkNode.layoutOptions = { "elk.portConstraints": "FIXED_POS" };
    }
  }
  return elkNode;
};

const buildElkEdge = (
  edge: GraphEdge,
  index: number,
  portIds: Set<string>,
): ElkExtendedEdge => {
  const sourcePort =
    edge.sourceHandle !== undefined
      ? elkPortId(edge.source, edge.sourceHandle)
      : undefined;
  const targetPort =
    edge.targetHandle !== undefined
      ? elkPortId(edge.target, edge.targetHandle)
      : undefined;
  return {
    // GraphEdge ids are not guaranteed unique across builders; ELK ids are
    // positional and the result is zipped back by index.
    id: `e${String(index)}`,
    sources: [
      sourcePort !== undefined && portIds.has(sourcePort)
        ? sourcePort
        : edge.source,
    ],
    targets: [
      targetPort !== undefined && portIds.has(targetPort)
        ? targetPort
        : edge.target,
    ],
  };
};

/** Sets a routed edge's data and applies the back-edge accent styling. */
const applyRoutedData = (rfEdge: Edge, data: RoutedEdgeData): Edge => {
  rfEdge.data = data;
  if (data.isBackEdge === true) {
    rfEdge.style = { ...rfEdge.style, stroke: BACK_EDGE_COLOR };
    rfEdge.markerEnd = {
      type: MarkerType.ArrowClosed,
      color: BACK_EDGE_COLOR,
    };
  }
  return rfEdge;
};

/**
 * Content-only updates (specs/graph-view.md §2) rebuild edges without
 * re-running ELK: the rebuilt edge inherits the previous edge's back-edge
 * flag by id. Edge geometry is never inherited — it is recomputed from the
 * live node rectangles on every render (useEdgeRoutes).
 */
export const inheritBackEdgeFlag = (
  rfEdge: Edge,
  previous: Edge | undefined,
): Edge => {
  if (rfEdge.type !== "routed" || previous?.data === undefined) return rfEdge;
  const prevData = previous.data as RoutedEdgeData;
  return applyRoutedData(rfEdge, {
    ...(rfEdge.data as RoutedEdgeData | undefined),
    isBackEdge: prevData.isBackEdge,
  });
};

export const getLayoutedElements = async (
  graph: GraphData,
  options: LayoutOptions = {},
): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  const { edgeBuilder = codeGraphEdgeBuilder } = options;
  const direction = options.direction || graph.direction || "TD";

  const elkChildren = graph.nodes.map((_, i) => buildElkNode(graph, i));
  const portIds = new Set(
    elkChildren.flatMap((child) => (child.ports ?? []).map((p) => p.id)),
  );

  const elk = await getElk();
  const layouted = await elk.layout({
    id: "root",
    layoutOptions: {
      ...DEFAULT_ELK_OPTIONS,
      "elk.direction": direction === "LR" ? "RIGHT" : "DOWN",
      ...options.layoutOptions,
    },
    children: elkChildren,
    edges: graph.edges.map((edge, i) => buildElkEdge(edge, i, portIds)),
  });

  const layoutById = new Map(
    (layouted.children ?? []).map((child) => [child.id, child]),
  );

  const nodes: Node[] = graph.nodes.map((node) => {
    const layout = layoutById.get(node.id);
    return createReactFlowNode(node, { x: layout?.x ?? 0, y: layout?.y ?? 0 });
  });

  const edges: Edge[] = graph.edges.map((edge) => {
    const rfEdge = edgeBuilder.buildReactFlowEdge(edge);
    if (rfEdge.type !== "routed") return rfEdge;

    const source = layoutById.get(edge.source);
    const target = layoutById.get(edge.target);
    // Back edge: a self-loop, or the target sits entirely above the source
    // in the final geometry (specs/graph-view.md §4).
    const isBackEdge =
      edge.source === edge.target ||
      (source?.y !== undefined &&
        target?.y !== undefined &&
        target.y + (target.height ?? 0) <= source.y);

    return applyRoutedData(rfEdge, {
      ...(rfEdge.data as RoutedEdgeData | undefined),
      isBackEdge,
    });
  });

  return { nodes, edges };
};
