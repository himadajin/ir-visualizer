import { type Node, type Edge, MarkerType } from "@xyflow/react";
import type { GraphNode, GraphEdge } from "../types/graph";
import type { SelectionDAGNode as SelectionDAGNodeAST } from "../ast/selectionDAGAST";
import { buildSelectionDAGDetailsLabel } from "../ast/selectionDAGAST";
import { estimateSelectionDAGRowWidths } from "../components/Graph/SelectionDAG/selectionDAGLayoutUtils";
import { getFontMetrics } from "./fontUtils";

export const NODE_PADDING = 20;

// Configuration for min and max characters width
const MIN_CHARS_MERMAID = 10;
const MAX_CHARS_MERMAID = 30;
const MIN_CHARS_LLVM = 40;
const MAX_CHARS_LLVM = 80;
const MIN_CHARS_SELECTION_DAG = 12;
const MAX_CHARS_SELECTION_DAG = 50;

const SELECTION_DAG_PADDING_X = 10;
const SELECTION_DAG_PADDING_Y = 8;
const SELECTION_DAG_ROW_GAP = 6;
const SELECTION_DAG_FRAGMENT_PADDING_X = 8;
const SELECTION_DAG_TYPES_GAP = 4;

/**
 * Maps GraphNode.nodeType (kebab-case) to React Flow nodeTypes key (camelCase).
 * Falls back to "codeNode" when nodeType is not set.
 */
const nodeTypeToReactFlowType = (nodeType?: string): string => {
  if (!nodeType) return "codeNode";
  // Convert "llvm-basicBlock" → "llvmBasicBlock", "mermaid-node" → "mermaidNode"
  return nodeType.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
};

// Font configuration - must match CSS
const FONT_FAMILY = "monospace";
const FONT_SIZE = "14px";
const LINE_HEIGHT = "20px";
const HEADER_OFFSET = 24;

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

const isSelectionDAGNode = (
  node: GraphNode,
): node is GraphNode & {
  astData: SelectionDAGNodeAST;
} => {
  if (node.nodeType !== "selectionDAG-node") return false;
  const astData = node.astData as Partial<SelectionDAGNodeAST> | undefined;
  return Boolean(astData?.nodeId && astData?.opName && astData?.types);
};

const calculateSelectionDAGDimensions = (node: GraphNode) => {
  const metrics = getFontMetrics(FONT_FAMILY, FONT_SIZE, LINE_HEIGHT);
  if (!isSelectionDAGNode(node)) {
    return calculateCodeNodeDimensions(node, metrics);
  }

  const ast = node.astData;
  const rowWidths = estimateSelectionDAGRowWidths(ast, metrics.width, {
    fragmentPaddingX: SELECTION_DAG_FRAGMENT_PADDING_X,
    rowGap: SELECTION_DAG_ROW_GAP,
    typesGap: SELECTION_DAG_TYPES_GAP,
  });
  const width = Math.max(...rowWidths) + SELECTION_DAG_PADDING_X * 2;

  // Calculate actual number of rows rendered
  const operands = ast.operands ?? [];
  const detailsLabel = buildSelectionDAGDetailsLabel(ast);

  let rows = 2; // OpName and ID:Types are always present
  if (operands.length > 0) rows++;
  if (detailsLabel) rows++;

  const height =
    rows * metrics.height +
    (rows - 1) * SELECTION_DAG_ROW_GAP +
    SELECTION_DAG_PADDING_Y * 2;

  return { width, height };
};

const calculateCodeNodeDimensions = (
  node: GraphNode,
  metricsParam?: {
    width: number;
    height: number;
  },
) => {
  const metrics =
    metricsParam ?? getFontMetrics(FONT_FAMILY, FONT_SIZE, LINE_HEIGHT);
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
    },
  };
};

export interface SelectionDAGReactFlowEdge {
  sourceHandle?: string;
  targetHandle?: string;
}

export const createSelectionDAGReactFlowEdge = (
  edge: GraphEdge & SelectionDAGReactFlowEdge,
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
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
  };
};
