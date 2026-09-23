/**
 * Single source of truth for the graph-node frame's lengths and font, shared
 * by every node renderer (NodeShell-based LLVM/Mermaid/Use-Def nodes, the
 * container frame, and SelectionDAGNode). Change the constant, never a
 * literal. Paint lives in NodeShell.module.css (specs/graph-view.md §5, §7).
 * Wrap bounds are CSS `ch` clamps on the content, not pixel guesses handed to
 * ELK.
 */

/** `font-mono` (specs/graph-view.md §6.6), resolved from the theme's CSS. */
export const NODE_FONT_FAMILY = "var(--app-font-mono)";
export const NODE_FONT_SIZE = "12px";
export const NODE_LINE_HEIGHT = "16px";

/** Horizontal content padding of a NodeShell node, px per side. */
export const NODE_PADDING_X = 8;
/** Vertical content padding of a NodeShell node, px per side. */
export const NODE_PADDING_Y = 6;
/** Border width of a NodeShell node, px per side. */
export const NODE_BORDER_WIDTH = 1;
/** Default corner radius, px: Mantine's `sm`. Pill-shaped nodes override it. */
export const NODE_BORDER_RADIUS = 4;
/** Corner radius for pill / terminal nodes, px (`specs/mermaid.md` §5). */
export const NODE_BORDER_RADIUS_PILL = 20;

/**
 * Total height of the full-width block-label header band, px, border-box
 * (its bottom hairline is inside this height).
 */
export const NODE_HEADER_HEIGHT = 20;
/** Header band label font size, px. */
export const NODE_HEADER_FONT_SIZE = 11;

/** CSS wrap bounds, in `ch` (specs/graph-view.md §5). */
export const NODE_WRAP_MIN_CHARS_LLVM = 16;
export const NODE_WRAP_MAX_CHARS_LLVM = 80;
export const NODE_WRAP_MIN_CHARS_MERMAID = 10;
export const NODE_WRAP_MAX_CHARS_MERMAID = 30;
export const NODE_WRAP_MIN_CHARS_USE_DEF = 8;
export const NODE_WRAP_MAX_CHARS_USE_DEF = 80;
