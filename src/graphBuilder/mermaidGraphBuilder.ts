import {
  GRAPH_GROUP_NODE_TYPE,
  type GraphData,
  type GraphNode,
  type GraphEdge,
} from "../types/graph";
import type { MermaidAST, MermaidASTNode } from "../ast/mermaidAST";

function nodeShapeToGraphType(
  shape: MermaidASTNode["shape"],
): string | undefined {
  return shape;
}

export function convertASTToGraph(ast: MermaidAST): GraphData {
  const subgraphIds = new Set(ast.subgraphs.map((sg) => sg.id));
  const parentOf = new Map<string, string>();
  for (const sg of ast.subgraphs) {
    for (const childId of sg.nodeIds) {
      parentOf.set(childId, sg.id);
    }
  }

  const groups: GraphNode[] = ast.subgraphs.map((sg) => {
    const parentId = parentOf.get(sg.id);
    return {
      id: sg.id,
      label: sg.title.trim() ? sg.title : sg.id,
      language: "mermaid",
      nodeType: GRAPH_GROUP_NODE_TYPE,
      astData: {},
      ...(parentId ? { parentId } : {}),
    };
  });

  const nodes: GraphNode[] = ast.nodes
    .filter((node) => !subgraphIds.has(node.id))
    .map((node) => {
      const parentId = parentOf.get(node.id);
      return {
        id: node.id,
        label: node.label || node.id,
        type: nodeShapeToGraphType(node.shape),
        language: "mermaid",
        nodeType: "mermaid-node",
        astData: node,
        ...(parentId ? { parentId } : {}),
      };
    });

  const edges: GraphEdge[] = ast.edges.map((edge, i) => ({
    id: `e${i}-${edge.sourceId}-${edge.targetId}`,
    source: edge.sourceId,
    target: edge.targetId,
    label: edge.label,
    stroke: edge.stroke,
    arrowhead: edge.arrowhead,
  }));

  return {
    direction: ast.direction,
    nodes: [...groups, ...nodes],
    edges,
  };
}
