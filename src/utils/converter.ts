import { type Node, type Edge } from '@xyflow/react';
import type { MermaidNode, MermaidEdge } from '../parser/parser';

export const NODE_WIDTH = 300;
export const NODE_PADDING = 20;
export const LINE_HEIGHT = 20;

export const calculateNodeDimensions = (node: MermaidNode) => {
    const lineCount = (node.label?.split('\n').length || 1);
    const height = lineCount * LINE_HEIGHT + NODE_PADDING * 2;
    return { width: NODE_WIDTH, height };
};

export const createReactFlowNode = (node: MermaidNode, position: { x: number, y: number }): Node => {
    // We don't strictly enforce height in style to allow it to grow, 
    // but we use calculations for initial layout.
    return {
        id: node.id,
        position,
        data: { label: node.label, shape: node.type },
        type: 'codeNode', // Use the custom node type
        style: { width: NODE_WIDTH },
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
