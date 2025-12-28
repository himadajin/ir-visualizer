import { type Node, type Edge } from '@xyflow/react';
import type { MermaidNode, MermaidEdge } from '../parser/parser';

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 50;

export const calculateNodeDimensions = (node: MermaidNode) => {
    const width = Math.max(NODE_WIDTH, (node.label?.length || 0) * 10 + 20);
    return { width, height: NODE_HEIGHT };
};

export const createReactFlowNode = (node: MermaidNode, position: { x: number, y: number }): Node => {
    const { width, height } = calculateNodeDimensions(node);
    return {
        id: node.id,
        position,
        data: { label: node.label, shape: node.type },
        type: 'default',
        style: { width, height },
    };
};

export const createReactFlowEdge = (edge: MermaidEdge): Edge => {
    return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: false,
        type: 'customBezier',
    };
};
