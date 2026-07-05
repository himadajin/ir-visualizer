/**
 * Single source of truth for the monospace text style shared by every graph
 * node renderer (NodeShell-based LLVM/Mermaid nodes and SelectionDAGNode),
 * and by converter.ts's dimension calculations, which must measure text using
 * the same font the nodes actually render with.
 */
export const NODE_FONT_FAMILY = "monospace";
export const NODE_FONT_SIZE = "14px";
export const NODE_LINE_HEIGHT = "20px";
