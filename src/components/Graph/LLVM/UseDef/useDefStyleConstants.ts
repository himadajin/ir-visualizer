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

/**
 * Block badge hues, indexed by `blockIndex % 8` (specs/llvm-use-def-view.md
 * §4). The badge is what preserves the CFG correspondence in this
 * container-less view, so neighbouring hues have to stay distinguishable.
 * Rendered as the hue's shade-2 fill under `ink` text
 * (specs/graph-view.md §7); `red` is never used, so no badge reads as an
 * error.
 */
export const USE_DEF_BADGE_HUES = [
  "blue",
  "green",
  "orange",
  "violet",
  "teal",
  "pink",
  "yellow",
  "gray",
] as const;

/** Corner radius that makes a value node read as a pill. */
export const USE_DEF_VALUE_BORDER_RADIUS = 16;
