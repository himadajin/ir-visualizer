export interface MermaidAST {
  direction: string;
  nodes: MermaidASTNode[];
  edges: MermaidASTEdge[];
}

export interface MermaidASTNode {
  id: string;
  label: string;
  shape?: "square" | "round" | "curly";
}

export interface MermaidASTEdge {
  sourceId: string;
  targetId: string;
  label?: string;
  edgeType?: "arrow" | "line";
}
