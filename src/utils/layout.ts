import dagre from 'dagre';
import { type Node, type Edge } from '@xyflow/react';
import type { MermaidGraph } from '../parser/parser';

const nodeWidth = 150;
const nodeHeight = 50;

export const getLayoutedElements = (
    graph: MermaidGraph,
    options: { direction: string } = { direction: 'TD' }
): { nodes: Node[]; edges: Edge[] } => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setGraph({ rankdir: options.direction || graph.direction || 'TD' });
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Add nodes to dagre
    graph.nodes.forEach((node) => {
        // Estimate width based on label length
        const width = Math.max(nodeWidth, (node.label?.length || 0) * 10 + 20);
        dagreGraph.setNode(node.id, { width, height: nodeHeight, label: node.label, shape: node.type });
    });

    // Add edges to dagre
    graph.edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const nodes: Node[] = graph.nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            id: node.id,
            position: {
                x: nodeWithPosition.x - nodeWithPosition.width / 2,
                y: nodeWithPosition.y - nodeWithPosition.height / 2,
            },
            data: { label: node.label, shape: node.type }, // Pass shape to custom node if needed
            type: 'default', // Using default node for now, can be custom
            style: { width: nodeWithPosition.width, height: nodeHeight },
        };
    });

    const edges: Edge[] = graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: false,
        type: 'smoothstep',
    }));

    return { nodes, edges };
};
