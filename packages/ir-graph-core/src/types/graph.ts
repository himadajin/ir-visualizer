export interface GraphNode {
  id: string;
  label: string;
  type?: string;
  language?: string; // For syntax highlighting
  blockLabel?: string; // Extracted BasicBlock label
  nodeType?: string; // Maps to React Flow node type (e.g. "llvm-basicBlock", "mermaid-node")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  astData?: Record<string, any>; // Raw AST data passed to specialized node components
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  direction?: string;
}
