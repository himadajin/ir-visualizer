/**
 * Constants shared by the Use-Def node components' CSS
 * (`specs/graph-view.md` §5: change the constant, never a literal).
 */

/** Font size of the block badge chip, in px. */
export const USE_DEF_BADGE_FONT_SIZE = 11;
/**
 * Line height of the block badge chip, in px. With its vertical padding the
 * chip is exactly one NODE_LINE_HEIGHT tall, so the inline badge never
 * stretches its card's single row.
 */
export const USE_DEF_BADGE_LINE_HEIGHT = 14;
/** Vertical padding inside the block badge chip, in px (per side). */
export const USE_DEF_BADGE_PADDING_Y = 1;
/** Horizontal padding inside the block badge chip, in px (per side). */
export const USE_DEF_BADGE_PADDING_X = 6;
/** Corner radius of the block badge chip, in px. */
export const USE_DEF_BADGE_BORDER_RADIUS = 4;
/** Gap between the inline badge and the code line to its right, in px. */
export const USE_DEF_BADGE_GAP = 6;

/** Border color of an instruction card whose line is a terminator. */
export const USE_DEF_TERMINATOR_BORDER_COLOR = "#a88";
/** Border color of a plain (non-terminator) instruction card. */
export const USE_DEF_INSTRUCTION_BORDER_COLOR = "#777";

/**
 * Muted tints for the block badge, indexed by `blockIndex % 8`
 * (specs/llvm-use-def-view.md §4). The badge is what preserves the CFG
 * correspondence in this container-less view, so the colors have to stay
 * distinguishable while keeping dark text readable on a pale background.
 */
export const USE_DEF_BADGE_PALETTE: { bg: string; fg: string }[] = [
  { bg: "#e3ecf7", fg: "#2f5382" },
  { bg: "#e4f1e4", fg: "#2e6b34" },
  { bg: "#f7ecd9", fg: "#8a5a1f" },
  { bg: "#f6e4e4", fg: "#8a3038" },
  { bg: "#ece4f5", fg: "#5b3a86" },
  { bg: "#dff0ef", fg: "#1f6b66" },
  { bg: "#f5e4f0", fg: "#863a6e" },
  { bg: "#e9edf0", fg: "#46596a" },
];

/** Background of an `argument` value pill. */
export const USE_DEF_ARGUMENT_BACKGROUND = "#f2f6fb";
/** Border color of an `argument` value pill. */
export const USE_DEF_ARGUMENT_BORDER_COLOR = "#7a92b5";
/** Background of an `external` value pill. */
export const USE_DEF_EXTERNAL_BACKGROUND = "#fbf7f0";
/** Border color of an `external` value pill. */
export const USE_DEF_EXTERNAL_BORDER_COLOR = "#b5a27a";
/** Corner radius that makes a value node read as a pill. */
export const USE_DEF_VALUE_BORDER_RADIUS = 16;
