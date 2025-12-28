import dagre from 'dagre';
import { type Node, type Edge } from '@xyflow/react';
import type { GraphData } from '../types/graph';
import { calculateNodeDimensions, createReactFlowNode, createReactFlowEdge } from './converter';

export const getLayoutedElements = (
    graph: GraphData,
    options: { direction: string } = { direction: 'TD' }
): { nodes: Node[]; edges: Edge[] } => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setGraph({ rankdir: options.direction || graph.direction || 'TD' });
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Add nodes to dagre
    graph.nodes.forEach((node) => {
        const { width, height } = calculateNodeDimensions(node);
        dagreGraph.setNode(node.id, { width, height, label: node.label, shape: node.type });
    });

    // Add edges to dagre
    graph.edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const nodes: Node[] = graph.nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return createReactFlowNode(node, {
            x: nodeWithPosition.x - nodeWithPosition.width / 2,
            y: nodeWithPosition.y - nodeWithPosition.height / 2,
        });
    });

    const edges: Edge[] = graph.edges.map(createReactFlowEdge);

    return { nodes, edges };
};
