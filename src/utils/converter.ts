import { type Node, type Edge, MarkerType } from "@xyflow/react";
import type { GraphNode, GraphEdge } from "../types/graph";
import { estimateSelectionDAGRowWidths } from "../components/Graph/SelectionDAG/selectionDAGLayoutUtils";
import {
  SELECTION_DAG_BORDER_WIDTH,
  SELECTION_DAG_CELL_PADDING,
  SELECTION_DAG_ITEM_PADDING,
} from "../components/Graph/SelectionDAG/selectionDAGStyleConstants";
import {
  NODE_FONT_FAMILY,
  NODE_FONT_SIZE,
  NODE_LINE_HEIGHT,
} from "../components/Graph/common/nodeTextStyle";
import { CODE_FRAGMENT_PADDING_Y } from "../components/Graph/common/CodeFragment";
import { getFontMetrics } from "./fontUtils";

export const NODE_PADDING = 20;

// Configuration for min and max characters width
const MIN_CHARS_MERMAID = 10;
const MAX_CHARS_MERMAID = 30;
const MIN_CHARS_LLVM = 40;
const MAX_CHARS_LLVM = 80;
const MIN_CHARS_SELECTION_DAG = 12;
const MAX_CHARS_SELECTION_DAG = 50;

const HEADER_OFFSET = 24;

/**
 * Maps GraphNode.nodeType (kebab-case) to React Flow nodeTypes key (camelCase).
 * Falls back to "codeNode" when nodeType is not set.
 */
export const nodeTypeToReactFlowType = (nodeType?: string): string => {
  if (!nodeType) return "codeNode";
  // Convert "llvm-basicBlock" → "llvmBasicBlock", "mermaid-node" → "mermaidNode"
  return nodeType.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
};

type NodeSizingConfig = {
  minChars: number;
  maxChars: number;
};

const getSizingConfig = (node: GraphNode): NodeSizingConfig => {
  if (node.nodeType === "selectionDAG-node") {
    return {
      minChars: MIN_CHARS_SELECTION_DAG,
      maxChars: MAX_CHARS_SELECTION_DAG,
    };
  }

  if (node.language === "mermaid") {
    return { minChars: MIN_CHARS_MERMAID, maxChars: MAX_CHARS_MERMAID };
  }

  return { minChars: MIN_CHARS_LLVM, maxChars: MAX_CHARS_LLVM };
};

const getLabelLines = (label?: string): string[] => label?.split("\n") || [""];

const measureWrappedLines = (lines: string[], maxChars: number) => {
  let maxLineLength = 0;
  let totalLines = 0;

  lines.forEach((line) => {
    const lineLength = line.length;
    if (lineLength > maxLineLength) {
      maxLineLength = lineLength;
    }

    const wrappedLines = Math.max(1, Math.ceil(lineLength / maxChars));
    totalLines += wrappedLines;
  });

  return { maxLineLength, totalLines };
};

const calculateSelectionDAGDimensions = (
  node: GraphNode & { nodeType: "selectionDAG-node" },
) => {
  const metrics = getFontMetrics(
    NODE_FONT_FAMILY,
    NODE_FONT_SIZE,
    NODE_LINE_HEIGHT,
  );
  const ast = node.astData;
  const rowWidths = estimateSelectionDAGRowWidths(ast, metrics.width);
  const width = Math.max(...rowWidths);

  // Calculate actual height based on CSS structure in SelectionDAGNode.tsx
  const operands = ast.operands ?? [];
  const hasOperands = operands.length > 0;

  // Each CodeFragment has vertical padding on both sides.
  const codeFragmentHeight = metrics.height + CODE_FRAGMENT_PADDING_Y * 2;

  // Row 1 (Operands): Cell Padding + Item Padding + CF Height + Item Padding + Cell Padding
  const operandsRowHeight = hasOperands
    ? codeFragmentHeight +
      (SELECTION_DAG_CELL_PADDING + SELECTION_DAG_ITEM_PADDING) * 2
    : 0;

  // Row 2 (Main Content): Cell Padding + CF Height + Cell Padding
  const mainContentRowHeight =
    codeFragmentHeight + SELECTION_DAG_CELL_PADDING * 2;

  // Row 3 (Types): Cell Padding + Item Padding + CF Height + Item Padding + Cell Padding
  // Types are always present in SelectionDAG nodes
  const typesRowHeight =
    codeFragmentHeight +
    (SELECTION_DAG_CELL_PADDING + SELECTION_DAG_ITEM_PADDING) * 2;

  const totalHeight =
    SELECTION_DAG_BORDER_WIDTH * 2 +
    (hasOperands ? operandsRowHeight + SELECTION_DAG_BORDER_WIDTH : 0) +
    mainContentRowHeight +
    SELECTION_DAG_BORDER_WIDTH +
    typesRowHeight;

  return { width, height: totalHeight };
};

const calculateCodeNodeDimensions = (
  node: GraphNode,
  metricsParam?: {
    width: number;
    height: number;
  },
) => {
  const metrics =
    metricsParam ??
    getFontMetrics(NODE_FONT_FAMILY, NODE_FONT_SIZE, NODE_LINE_HEIGHT);
  const { minChars, maxChars } = getSizingConfig(node);
  const lines = getLabelLines(node.label);
  const { maxLineLength, totalLines } = measureWrappedLines(lines, maxChars);

  const effectiveMaxChars = Math.min(maxLineLength, maxChars);
  const finalChars = Math.max(effectiveMaxChars, minChars);

  const width = finalChars * metrics.width + NODE_PADDING * 2;
  const hasLabel = node.blockLabel !== undefined;
  const height =
    totalLines * metrics.height +
    NODE_PADDING * 2 +
    (hasLabel ? HEADER_OFFSET : 0);

  return { width, height };
};

export const calculateNodeDimensions = (node: GraphNode) => {
  if (node.nodeType === "selectionDAG-node") {
    return calculateSelectionDAGDimensions(node);
  }

  return calculateCodeNodeDimensions(node);
};

export const createReactFlowNode = (
  node: GraphNode,
  position: { x: number; y: number },
): Node => {
  const { width } = calculateNodeDimensions(node);

  // We don't strictly enforce height in style to allow it to grow,
  // but we use calculations for initial layout.
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
    style: { width: width },
  };
};

export const createReactFlowEdge = (
  edge: GraphEdge,
  edgeType: string = "customBezier",
): Edge => {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: false,
    type: edgeType,
    zIndex: 0,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#666",
    },
    style: { stroke: "#666" },
  };
};

export const createSelectionDAGReactFlowEdge = (
  edge: GraphEdge,
  edgeType: string = "customBezier",
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
