import { type Node, type Edge, MarkerType } from '@xyflow/react';
import type { GraphNode, GraphEdge } from '../types/graph';
import { getFontMetrics } from './fontUtils';

export const NODE_PADDING = 20;

// Configuration for min and max characters width
const MIN_CHARS_MERMAID = 10;
const MAX_CHARS_MERMAID = 30;
const MIN_CHARS_LLVM = 40;
const MAX_CHARS_LLVM = 80;

// Font configuration - must match CSS
const FONT_FAMILY = 'monospace';
const FONT_SIZE = '14px';
const LINE_HEIGHT = '20px';

export const calculateNodeDimensions = (node: GraphNode) => {
    const metrics = getFontMetrics(FONT_FAMILY, FONT_SIZE, LINE_HEIGHT);
    const maxChars = node.language === 'mermaid' ? MAX_CHARS_MERMAID : MAX_CHARS_LLVM;
    const minChars = node.language === 'mermaid' ? MIN_CHARS_MERMAID : MIN_CHARS_LLVM;

    const lines = node.label?.split('\n') || [''];
    
    // Find the longest line in characters, capped at the max allowed characters
    let maxLineLength = 0;
    let totalLines = 0;

    lines.forEach(line => {
        const lineLength = line.length;
        if (lineLength > maxLineLength) {
            maxLineLength = lineLength;
        }
        
        // Calculate wrapping
        // Math.max(1, ...) ensures even empty lines count as 1 row if they exist in the array
        const wrappedLines = Math.max(1, Math.ceil(lineLength / maxChars));
        totalLines += wrappedLines;
    });

    // The width is the longest line (up to maxChars) * charWidth
    // We limit maxLineLength to maxChars because of the wrapping
    const effectiveMaxChars = Math.min(maxLineLength, maxChars);
    
    // Clamp min width to avoid tiny nodes
    const finalChars = Math.max(effectiveMaxChars, minChars);

    const width = finalChars * metrics.width + NODE_PADDING * 2;
    const height = totalLines * metrics.height + NODE_PADDING * 2;

    return { width, height };
};

export const createReactFlowNode = (node: GraphNode, position: { x: number, y: number }): Node => {
    const { width } = calculateNodeDimensions(node);
    
    // We don't strictly enforce height in style to allow it to grow, 
    // but we use calculations for initial layout.
    return {
        id: node.id,
        position,
        data: {
            label: node.label,
            shape: node.type,
            language: node.language,
            blockLabel: node.blockLabel
        },
        type: 'codeNode', // Use the custom node type
        style: { width: width },
    };
};

export const createReactFlowEdge = (edge: GraphEdge, edgeType: string = 'customBezier'): Edge => {
    return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: false,
        type: edgeType,
        zIndex: 0,
        markerEnd: {
            type: MarkerType.ArrowClosed,
        },
    };
};
