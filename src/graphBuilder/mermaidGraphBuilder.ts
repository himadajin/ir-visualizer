import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type { MermaidAST, MermaidASTNode } from "../ast/mermaidAST";

function nodeShapeToGraphType(
  shape: MermaidASTNode["shape"],
): string | undefined {
  return shape; // "square" | "round" | "curly" maps directly
}

export function convertASTToGraph(ast: MermaidAST): GraphData {
  const nodes: GraphNode[] = ast.nodes.map((node) => ({
    id: node.id,
    label: node.label || node.id,
    type: nodeShapeToGraphType(node.shape),
    language: "mermaid",
    nodeType: "mermaid-node",
    astData: node as unknown as Record<string, unknown>,
  }));

  const edges: GraphEdge[] = ast.edges.map((edge, i) => ({
    id: `e${i}-${edge.sourceId}-${edge.targetId}`,
    source: edge.sourceId,
    target: edge.targetId,
    label: edge.label,
  }));

  return {
    direction: ast.direction,
    nodes,
    edges,
  };
}
