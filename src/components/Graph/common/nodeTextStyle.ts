/**
 * Single source of truth for the graph-node frame shared by every node
 * renderer (NodeShell-based LLVM/Mermaid/Use-Def nodes and SelectionDAGNode)
 * and by converter.ts's dimension calculations, which must measure the same
 * box the nodes actually render (specs/graph-view.md §5). Change the
 * constant, never a literal, or layout spacing silently drifts from
 * rendering. The density and header-band design are specified in
 * specs/graph-view.md §5 and §6.6.
 */
export const NODE_FONT_FAMILY = "monospace";
export const NODE_FONT_SIZE = "12px";
export const NODE_LINE_HEIGHT = "16px";

/** Horizontal content padding of a NodeShell node, px per side. */
export const NODE_PADDING_X = 8;
/** Vertical content padding of a NodeShell node, px per side. */
export const NODE_PADDING_Y = 6;
/** Border width of a NodeShell node, px per side. */
export const NODE_BORDER_WIDTH = 1;
/** Default corner radius, px. Pill-shaped nodes override it. */
export const NODE_BORDER_RADIUS = 2;

/**
 * Total height of the full-width block-label header band, px, border-box
 * (its bottom hairline is inside this height).
 */
export const NODE_HEADER_HEIGHT = 20;
/** Header band label font size, px. */
export const NODE_HEADER_FONT_SIZE = 11;
/** Header band fill. */
export const NODE_HEADER_BACKGROUND = "#f6f8fa";
/** Header band label color. */
export const NODE_HEADER_TEXT_COLOR = "#57606a";
/** Hairline under the header band. */
export const NODE_HEADER_BORDER_COLOR = "#e0e3e7";
