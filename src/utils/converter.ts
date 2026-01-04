import { type Node, type Edge, MarkerType } from '@xyflow/react';
import type { GraphNode, GraphEdge } from '../types/graph';

export const NODE_PADDING = 20;
export const LINE_HEIGHT = 20;
const MIN_CHARS_MERMAID = 10;
const MAX_CHARS_MERMAID = 30;
const MIN_CHARS_LLVM = 30;
const MAX_CHARS_LLVM = 60;

// Font used for measurement - approx match for 'monospace' default
const FONT = "16px monospace";

let canvas: HTMLCanvasElement | null = null;

const getTextWidth = (text: string): number => {
    // Fallback for non-browser environments (e.g. CLI tests)
    if (typeof document === 'undefined') {
        return text.length * 8; // approx 8px per char
    }

    if (!canvas) {
        canvas = document.createElement('canvas');
    }
    const context = canvas.getContext('2d');
    if (context) {
        context.font = FONT;
        return context.measureText(text).width;
    }
    return 0;
};

// Character width approximation for min/max bounds calculation
// We measure a representative character like 'M' or 'a' 
// actually since it is monospace, any char should work, but let's take average of 'a'.
let _charWidth: number | null = null;
const getCharWidth = () => {
    if (_charWidth) return _charWidth;
    _charWidth = getTextWidth('a');
    return _charWidth || 8; // Fallback 8 if measurement fails (0)
}

export const calculateNodeDimensions = (node: GraphNode) => {
    const minChars = node.language === 'mermaid' ? MIN_CHARS_MERMAID : MIN_CHARS_LLVM;
    const maxChars = node.language === 'mermaid' ? MAX_CHARS_MERMAID : MAX_CHARS_LLVM;

    const minWidth = minChars * getCharWidth();
    const maxWidth = maxChars * getCharWidth();

    const lines = node.label?.split('\n') || [''];
    
    // Measure max line width in pixels
    let maxLinePixelWidth = 0;
    lines.forEach(line => {
        const w = getTextWidth(line);
        if (w > maxLinePixelWidth) maxLinePixelWidth = w;
    });

    // Clamp effective width between min and max
    // Note: We clamp the CONTENT width, then add padding
    const targetContentWidth = Math.max(minWidth, Math.min(maxLinePixelWidth, maxWidth));
    const width = targetContentWidth + NODE_PADDING * 2;

    let totalLines = 0;
    lines.forEach(line => {
        // Calculate wrapped lines by measuring
        const lineWidth = getTextWidth(line);
        // If line fits, it's 1 line. If not, it wraps.
        // Approximate wrapping lines: width / targetContentWidth
        // This is not perfect for 'word-break: break-all' but close enough for layout
        const wraps = Math.max(1, Math.ceil(lineWidth / targetContentWidth));
        totalLines += wraps;
    });

    // Add a small buffer to height for safety
    const height = totalLines * LINE_HEIGHT + NODE_PADDING * 2;
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
