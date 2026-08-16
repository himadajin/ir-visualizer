import {
  GRAPH_GROUP_NODE_TYPE,
  isGraphDirection,
  type GraphData,
  type GraphDirection,
  type GraphGroupData,
  type GraphNode,
  type GraphEdge,
} from "../types/graph";
import type {
  MermaidAST,
  MermaidASTEdge,
  MermaidASTNode,
} from "../ast/mermaidAST";

function nodeShapeToGraphType(
  shape: MermaidASTNode["shape"],
): string | undefined {
  return shape;
}

function childrenOfSubgraphs(
  parentOf: Map<string, string>,
): Map<string, string[]> {
  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of parentOf) {
    const siblings = childrenOf.get(parent);
    if (siblings === undefined) childrenOf.set(parent, [child]);
    else siblings.push(child);
  }
  return childrenOf;
}

function descendantsOf(
  sgId: string,
  childrenOf: Map<string, string[]>,
): Set<string> {
  const inside = new Set<string>();
  const walk = (id: string): void => {
    for (const child of childrenOf.get(id) ?? []) {
      if (inside.has(child)) continue;
      inside.add(child);
      walk(child);
    }
  };
  walk(sgId);
  return inside;
}

/**
 * Mermaid ignores a subgraph's declared direction when a child is linked
 * directly to a node outside it. An edge whose endpoint is the subgraph id
 * itself does not trigger that fallback (`specs/mermaid.md` §4).
 */
function hasExternalChildEdge(
  sgId: string,
  inside: Set<string>,
  edges: MermaidASTEdge[],
): boolean {
  return edges.some((edge) => {
    if (edge.sourceId === sgId || edge.targetId === sgId) return false;
    return inside.has(edge.sourceId) !== inside.has(edge.targetId);
  });
}

function groupAstData(
  sgId: string,
  declared: string | undefined,
  childrenOf: Map<string, string[]>,
  edges: MermaidASTEdge[],
): GraphGroupData {
  if (!isGraphDirection(declared)) return {};
  const inside = descendantsOf(sgId, childrenOf);
  if (hasExternalChildEdge(sgId, inside, edges)) return {};
  return { direction: declared };
}

function rootDirection(value: string): GraphDirection {
  return isGraphDirection(value) ? value : "TB";
}

export function convertASTToGraph(ast: MermaidAST): GraphData {
  const subgraphIds = new Set(ast.subgraphs.map((sg) => sg.id));
  const parentOf = new Map<string, string>();
  for (const sg of ast.subgraphs) {
    for (const childId of sg.nodeIds) {
      parentOf.set(childId, sg.id);
    }
  }
  const childrenOf = childrenOfSubgraphs(parentOf);

  const groups: GraphNode[] = ast.subgraphs.map((sg) => {
    const parentId = parentOf.get(sg.id);
    return {
      id: sg.id,
      label: sg.title.trim() ? sg.title : sg.id,
      language: "mermaid",
      nodeType: GRAPH_GROUP_NODE_TYPE,
      astData: groupAstData(sg.id, sg.direction, childrenOf, ast.edges),
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
    direction: rootDirection(ast.direction),
    nodes: [...groups, ...nodes],
    edges,
  };
}
