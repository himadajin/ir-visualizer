import type { GraphNode, GraphEdge } from "../types/graph";
import type { ParseResult } from "../parser/selectionDAG";
import type {
  SelectionDAGNode,
  SelectionDAGOperand,
} from "../ast/selectionDAGAST";

export interface SelectionDAGEdge extends GraphEdge {
  sourceHandle?: string;
  targetHandle?: string;
  isChainOrGlue?: boolean;
}

export interface SelectionDAGGraphData {
  nodes: GraphNode[];
  edges: SelectionDAGEdge[];
  direction?: string;
}

/**
 * Build a compact label string for a SelectionDAG node.
 * Used for dimension calculation in the layout engine.
 */
function buildNodeLabel(node: SelectionDAGNode): string {
  const types = node.types.join(",");
  const detailParts: string[] = [];
  if (node.details?.flags && node.details.flags.length > 0) {
    detailParts.push(node.details.flags.join(" "));
  }
  if (node.details?.detail !== undefined) {
    detailParts.push(`<${node.details.detail}>`);
  }
  if (node.details?.reg) {
    detailParts.push(`${node.details.reg.type}:${node.details.reg.value}`);
  }

  const detailStr = detailParts.length > 0 ? ` ${detailParts.join(" ")}` : "";
  const verboseStr = node.verbose ? ` [${node.verbose}]` : "";

  const operandStrs = (node.operands ?? []).map(formatOperand);
  const operandsStr =
    operandStrs.length > 0 ? ` ${operandStrs.join(", ")}` : "";

  return `${node.nodeId}: ${types} = ${node.opName}${detailStr}${verboseStr}${operandsStr}`;
}

function formatOperand(op: SelectionDAGOperand): string {
  switch (op.kind) {
    case "node": {
      const id =
        op.index !== undefined ? `${op.nodeId}:${op.index}` : op.nodeId;
      return op.wrapped ? `<${id}>` : id;
    }
    case "inline": {
      const types = op.types.length > 0 ? `:${op.types.join(",")}` : "";
      const detail =
        op.details?.detail !== undefined ? `<${op.details.detail}>` : "";
      const reg = op.details?.reg ? ` ${op.details.reg.value}` : "";
      return `${op.opName}${types}${detail}${reg}`;
    }
    case "null":
      return "<null>";
    case "immediate":
      return op.value;
  }
}

export function convertASTToGraph(
  parseResult: ParseResult,
): SelectionDAGGraphData {
  const nodes: GraphNode[] = [];
  const edges: SelectionDAGEdge[] = [];

  // Collect all parsed nodes
  const dagNodes = parseResult.entries
    .filter((e) => e.kind === "node")
    .map((e) => e.node);

  // Build a map of known node IDs for type lookup and edge validation
  const nodeMap = new Map(dagNodes.map((n) => [n.nodeId, n]));

  // Convert each SelectionDAG node to a GraphNode
  dagNodes.forEach((dagNode) => {
    nodes.push({
      id: dagNode.nodeId,
      label: buildNodeLabel(dagNode),
      nodeType: "selectionDAG-node",
      language: "llvm",
      astData: dagNode as unknown as Record<string, unknown>,
    });

    // Generate edges from operands
    if (dagNode.operands) {
      dagNode.operands.forEach((operand, index) => {
        if (operand.kind === "node" && nodeMap.has(operand.nodeId)) {
          const sourceNode = nodeMap.get(operand.nodeId)!;
          const sourceIndex = operand.index ?? 0;
          const sourceType = sourceNode.types[sourceIndex];
          const isChainOrGlue = sourceType === "ch" || sourceType === "glue";

          edges.push({
            id: `e-${operand.nodeId}-${dagNode.nodeId}-op${index}`,
            source: operand.nodeId,
            target: dagNode.nodeId,
            sourceHandle: `${operand.nodeId}-type-${sourceIndex}`,
            targetHandle: `${dagNode.nodeId}-operand-${index}`,
            isChainOrGlue,
          });
        }
      });
    }
  });

  return { nodes, edges, direction: "TD" };
}
