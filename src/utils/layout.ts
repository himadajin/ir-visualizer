import type {
  ELK,
  ElkExtendedEdge,
  ElkNode,
  ElkPort,
  LayoutOptions as ElkLayoutOptions,
} from "elkjs/lib/elk-api";
import { type Node, type Edge } from "@xyflow/react";
import type { GraphData, GraphEdge, GraphNode } from "../types/graph";
import { isContainerNode } from "../types/graph";
import type { RoutedEdgeData } from "../components/Graph/RoutedEdge";
import { getUseDefPorts } from "../components/Graph/LLVM/UseDef/useDefPorts";
import {
  createReactFlowNode,
  createReactFlowEdge,
  createMermaidReactFlowEdge,
  createSelectionDAGReactFlowEdge,
  BACK_EDGE_COLOR,
  recolorMarker,
} from "./converter";
import { quantizeRect } from "./edgeRouter";
import {
  EDGE_EDGE_SPACING,
  EDGE_NODE_SPACING,
  NODE_NODE_BETWEEN_LAYERS,
  NODE_NODE_SPACING,
  CONTAINER_PADDING,
} from "./spacing";

/**
 * How a mode turns a GraphEdge into a React Flow edge — see
 * docs/internal/contracts/ir-mode-registry.md. Whether an edge is a back
 * edge is no longer classified up front: the ELK layout derives it from the
 * final geometry and attaches it to `edge.data`.
 */
export interface IREdgeBuilder {
  buildReactFlowEdge(edge: GraphEdge): Edge;
}

/** LLVM: ELK-routed edges (specs/graph-view.md §4). */
export const codeGraphEdgeBuilder: IREdgeBuilder = {
  buildReactFlowEdge: (edge) => createReactFlowEdge(edge, "routed"),
};

/**
 * Mermaid: the same routed geometry as LLVM, with flowchart stroke/arrowhead
 * mapped onto style and markers (specs/mermaid.md §5).
 */
export const mermaidGraphEdgeBuilder: IREdgeBuilder = {
  buildReactFlowEdge: (edge) => createMermaidReactFlowEdge(edge),
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

/** Measured (or test-supplied) box for one node, flow px. */
export interface NodeSize {
  width: number;
  height: number;
}

export type NodeSizeMap = ReadonlyMap<string, NodeSize>;

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
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.layered.spacing.nodeNodeBetweenLayers": String(NODE_NODE_BETWEEN_LAYERS),
  "elk.spacing.nodeNode": String(NODE_NODE_SPACING),
  "elk.spacing.edgeNode": String(EDGE_NODE_SPACING),
  "elk.spacing.edgeEdge": String(EDGE_EDGE_SPACING),
  "elk.layered.spacing.edgeNodeBetweenLayers": String(EDGE_NODE_SPACING),
  "elk.layered.spacing.edgeEdgeBetweenLayers": String(EDGE_EDGE_SPACING),
};

/**
 * Integer box ELK will pack, using the router's origin-rect quantization
 * (`contracts/edge-routing.md`). A missing or sub-pixel size is rejected by
 * `sizesCoverGraph` before this is called.
 */
export const toElkSize = (size: NodeSize): NodeSize => {
  const quantized = quantizeRect({
    id: "_",
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
  });
  return { width: quantized.width, height: quantized.height };
};

/** Every graph node has a quantized size of at least 1×1 px. */
export const sizesCoverGraph = (
  graph: GraphData,
  sizes: NodeSizeMap,
): boolean => {
  for (const node of graph.nodes) {
    const size = sizes.get(node.id);
    if (size === undefined) return false;
    const elkSize = toElkSize(size);
    if (elkSize.width < 1 || elkSize.height < 1) return false;
  }
  return true;
};

/** ELK port ids are global, so node-local handle ids get namespaced. */
const elkPortId = (nodeId: string, handleId: string) =>
  `${nodeId}::${handleId}`;

interface Hierarchy {
  childrenOf: Map<string, GraphNode[]>;
  roots: GraphNode[];
}

/** Parent exists, is a container, and `parentId` does not cycle. */
const assertHierarchy = (graph: GraphData): Hierarchy => {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const childrenOf = new Map<string, GraphNode[]>();
  const roots: GraphNode[] = [];

  for (const node of graph.nodes) {
    if (node.parentId === undefined) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parentId);
    if (parent === undefined) {
      throw new Error(
        `getLayoutedElements: parentId ${node.parentId} is missing for node ${node.id}`,
      );
    }
    if (!isContainerNode(parent)) {
      throw new Error(
        `getLayoutedElements: parent ${parent.id} of ${node.id} is not a container`,
      );
    }
    const siblings = childrenOf.get(parent.id);
    if (siblings === undefined) childrenOf.set(parent.id, [node]);
    else siblings.push(node);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`getLayoutedElements: parentId cycle at node ${id}`);
    }
    visiting.add(id);
    const parentId = byId.get(id)?.parentId;
    if (parentId !== undefined) walk(parentId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of graph.nodes) walk(node.id);

  return { childrenOf, roots };
};

const collectPortIds = (elkNode: ElkNode, into: Set<string>): void => {
  for (const port of elkNode.ports ?? []) into.add(port.id);
  for (const child of elkNode.children ?? []) collectPortIds(child, into);
};

const buildElkNode = (
  node: GraphNode,
  sizes: NodeSizeMap,
  childrenOf: Map<string, GraphNode[]>,
): ElkNode => {
  const size = sizes.get(node.id);
  if (size === undefined) {
    throw new Error(`getLayoutedElements: missing size for node ${node.id}`);
  }
  const { width, height } = toElkSize(size);
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

  const children = childrenOf.get(node.id) ?? [];
  if (children.length > 0) {
    elkNode.children = children.map((child) =>
      buildElkNode(child, sizes, childrenOf),
    );
    elkNode.layoutOptions = {
      ...elkNode.layoutOptions,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.nodeSize.constraints": "MINIMUM_SIZE",
      "elk.padding": `[top=${String(height)},left=${String(CONTAINER_PADDING)},bottom=${String(CONTAINER_PADDING)},right=${String(CONTAINER_PADDING)}]`,
    };
  }
  return elkNode;
};

interface PlacedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

const flattenElk = (
  elkNode: ElkNode,
  parentId: string | undefined,
  into: Map<string, PlacedBox>,
): void => {
  for (const child of elkNode.children ?? []) {
    into.set(child.id, {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? 0,
      height: child.height ?? 0,
      parentId,
    });
    flattenElk(child, child.id, into);
  }
};

const absoluteBox = (
  id: string,
  layoutById: Map<string, PlacedBox>,
): { x: number; y: number; width: number; height: number } => {
  const self = layoutById.get(id);
  let x = 0;
  let y = 0;
  let current: string | undefined = id;
  while (current !== undefined) {
    const box = layoutById.get(current);
    if (box === undefined) break;
    x += box.x;
    y += box.y;
    current = box.parentId;
  }
  return { x, y, width: self?.width ?? 0, height: self?.height ?? 0 };
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
  if (data.isBackEdge === true && rfEdge.hidden !== true) {
    rfEdge.style = { ...rfEdge.style, stroke: BACK_EDGE_COLOR };
    rfEdge.markerEnd = recolorMarker(rfEdge.markerEnd, BACK_EDGE_COLOR);
    rfEdge.markerStart = recolorMarker(rfEdge.markerStart, BACK_EDGE_COLOR);
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

/**
 * Place `graph` with ELK against `sizes` (specs/graph-view.md §3). Pure in
 * the sizes: it does not estimate and does not read the DOM. Callers that
 * measured must pass `sizesCoverGraph(graph, sizes)` first.
 */
export const getLayoutedElements = async (
  graph: GraphData,
  sizes: NodeSizeMap,
  options: LayoutOptions = {},
): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  const { edgeBuilder = codeGraphEdgeBuilder } = options;
  const direction = options.direction || graph.direction || "TD";
  const hierarchy = assertHierarchy(graph);

  const elkChildren = hierarchy.roots.map((node) =>
    buildElkNode(node, sizes, hierarchy.childrenOf),
  );
  const portIds = new Set<string>();
  for (const child of elkChildren) collectPortIds(child, portIds);

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

  const layoutById = new Map<string, PlacedBox>();
  flattenElk(layouted, undefined, layoutById);

  const nodes: Node[] = graph.nodes.map((node) => {
    const layout = layoutById.get(node.id);
    const isGroup = isContainerNode(node);
    return createReactFlowNode(
      node,
      { x: layout?.x ?? 0, y: layout?.y ?? 0 },
      {
        parentId: node.parentId,
        ...(isGroup && layout !== undefined
          ? { width: layout.width, height: layout.height }
          : {}),
      },
    );
  });

  const edges: Edge[] = graph.edges.map((edge) => {
    const rfEdge = edgeBuilder.buildReactFlowEdge(edge);
    if (rfEdge.type !== "routed") return rfEdge;

    const source = absoluteBox(edge.source, layoutById);
    const target = absoluteBox(edge.target, layoutById);
    // Back edge: a self-loop, or the target sits entirely above the source
    // in absolute flow coordinates (specs/graph-view.md §4).
    const isBackEdge =
      edge.source === edge.target || target.y + target.height <= source.y;

    return applyRoutedData(rfEdge, {
      ...(rfEdge.data as RoutedEdgeData | undefined),
      isBackEdge,
    });
  });

  return { nodes, edges };
};
