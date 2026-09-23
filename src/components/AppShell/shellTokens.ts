/**
 * The numbers the canvas-first shell's layout computes with
 * (`specs/graph-view.md` §6). Its look comes from the Mantine theme
 * (`src/theme.ts`, §6.6), not from here.
 */

/** Inset of the floating editor panel from the viewport edges, in px. */
export const PANEL_MARGIN = 16;
export const PANEL_INITIAL_WIDTH = 420;
export const PANEL_MIN_WIDTH = 280;
/** Upper bound for the panel width: 60 vw. */
export const PANEL_MAX_WIDTH_RATIO = 0.6;

/**
 * Narrow mode (`specs/graph-view.md` §6.5): at or below this viewport width the
 * panel becomes a bottom sheet and the resizer is gone.
 */
export const SHELL_NARROW_MEDIA_QUERY = "(max-width:768px)";
/** Share of the viewport height the narrow-mode bottom sheet covers. */
export const PANEL_SHEET_HEIGHT_RATIO = 0.55;

/** The single orchestrated motion: the panel ⇄ pill collapse/expand morph. */
export const SHELL_MOTION_MS = 180;

/**
 * Breathing room kept on every side of a fitted graph. React Flow's object
 * padding form defaults unspecified sides to 0, so all four are always given.
 */
export const FIT_VIEW_BASE_PADDING = 24;

/**
 * Space (px) the open editor panel takes away from the canvas. The panel is
 * anchored to one viewport edge at a time: the left one in wide mode, the
 * bottom one in narrow mode, so at most one of these is ever non-zero. Both are
 * 0 while the panel is collapsed.
 */
export interface ShellFitViewInset {
  left: number;
  bottom: number;
}

export const EMPTY_FIT_VIEW_INSET: ShellFitViewInset = { left: 0, bottom: 0 };

/**
 * Padding for `fitView` that keeps the graph clear of the floating panel
 * (`specs/graph-view.md` §6.4/§6.5). The inset side is the panel's own size
 * plus its margin; every other side falls back to the base breathing room.
 */
export function buildFitViewPadding(inset: ShellFitViewInset) {
  return {
    top: `${FIT_VIEW_BASE_PADDING}px`,
    right: `${FIT_VIEW_BASE_PADDING}px`,
    bottom: `${Math.max(inset.bottom, FIT_VIEW_BASE_PADDING)}px`,
    left: `${Math.max(inset.left, FIT_VIEW_BASE_PADDING)}px`,
  } as const;
}
