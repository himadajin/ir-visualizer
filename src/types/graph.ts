
export interface GraphNode {
    id: string;
    label: string;
    type?: string;
    language?: string; // For syntax highlighting
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
