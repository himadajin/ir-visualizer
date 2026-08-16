export interface MermaidAST {
  direction: string;
  nodes: MermaidASTNode[];
  edges: MermaidASTEdge[];
  subgraphs: MermaidASTSubgraph[];
}

export interface MermaidASTNode {
  id: string;
  label: string;
  /** Upstream mermaid shape name (`square`, `diamond`, `stadium`, …). */
  shape?: string;
}

export type MermaidEdgeStroke = "normal" | "thick" | "dotted" | "invisible";

export interface MermaidASTEdge {
  sourceId: string;
  targetId: string;
  label?: string;
  stroke: MermaidEdgeStroke;
  /** FlowDB edge `type`: `arrow_point`, `arrow_open`, `double_arrow_point`, … */
  arrowhead: string;
}

export interface MermaidASTSubgraph {
  id: string;
  title: string;
  nodeIds: string[];
  direction?: string;
}
