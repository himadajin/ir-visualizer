import type {
  FlowEdge,
  FlowSubGraph,
  FlowVertex,
} from "mermaid/dist/diagrams/flowchart/types.js";
import type {
  MermaidAST,
  MermaidASTEdge,
  MermaidASTNode,
  MermaidASTSubgraph,
  MermaidEdgeStroke,
} from "../../ast/mermaidAST";

export type FlowDbSnapshot = {
  getDirection: () => string | undefined;
  getVertices: () => Map<string, FlowVertex>;
  getEdges: () => FlowEdge[];
  getSubGraphs: () => FlowSubGraph[];
};

function strokeOf(edge: FlowEdge): MermaidEdgeStroke {
  const stroke = edge.stroke;
  if (
    stroke === "thick" ||
    stroke === "dotted" ||
    stroke === "invisible" ||
    stroke === "normal"
  ) {
    return stroke;
  }
  return "normal";
}

function labelOf(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  return trimmed ? trimmed : undefined;
}

export function flowDbToAST(db: FlowDbSnapshot): MermaidAST {
  const subgraphs: MermaidASTSubgraph[] = db.getSubGraphs().map((sg) => ({
    id: sg.id,
    title: sg.title,
    nodeIds: [...sg.nodes],
    direction: sg.dir,
  }));
  const subgraphIds = new Set(subgraphs.map((sg) => sg.id));

  const nodes: MermaidASTNode[] = [];
  for (const vertex of db.getVertices().values()) {
    if (subgraphIds.has(vertex.id)) continue;
    nodes.push({
      id: vertex.id,
      label: vertex.text?.trim() ? vertex.text : vertex.id,
      shape: vertex.type,
    });
  }

  const edges: MermaidASTEdge[] = db.getEdges().map((edge) => ({
    sourceId: edge.start,
    targetId: edge.end,
    label: labelOf(edge.text),
    stroke: strokeOf(edge),
    arrowhead: edge.type ?? "arrow_open",
  }));

  return {
    direction: db.getDirection()?.trim() || "TB",
    nodes,
    edges,
    subgraphs,
  };
}
