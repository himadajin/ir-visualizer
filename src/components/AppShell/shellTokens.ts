/**
 * Design tokens for the canvas-first shell (`specs/graph-view.md` §6.6).
 *
 * The shell chrome — editor panel, collapsed pill, canvas control cluster — is
 * deliberately QUIETER than the graph it frames: neutral grays, the app's
 * system sans-serif, light control borders, a barely-there elevation. The
 * graph nodes own the loud end of the visual range (monospace, dark borders,
 * corner chips), so the chrome must never compete with them; the nodes stay
 * the protagonists and the chrome recedes to the edges of the viewport.
 *
 * These constants are the only place shell colors/geometry are defined.
 */

export const SHELL_COLORS = {
  /** Full-viewport canvas background. */
  ground: "#FAFAFA",
  /** React Flow `<Background />` dot color. */
  groundDots: "#D7DBDF",
  /** Surface of panel / pill / control cluster. */
  paper: "#FFFFFF",
  /** Outer border of the floating surfaces (panel, pill, control cluster). */
  line: "#999",
  /** Resting border of an interactive control (select, button, toggle). */
  control: "#d0d0d0",
  /** Hovered control border. */
  controlHover: "#999",
  /** Focused control border. */
  controlFocus: "#777",
  ink: "#1F2328",
  inkMuted: "#57606A",
  /** Parse success only — never decorative. */
  ok: "#1A7F37",
  /** Parse failure only — never decorative. */
  error: "#CF222E",
  /** Recoverable parse diagnostics only — never decorative. */
  warn: "#9A6700",
} as const;

/** Floating chrome only; graph nodes stay flat. Kept light on purpose. */
export const SHELL_ELEVATION =
  "0 1px 2px rgba(31,35,40,.05), 0 4px 12px rgba(31,35,40,.06)";

export const SHELL_RADIUS = "4px";

/** Hairline used inside a surface (header rule, footer rule, divider). */
export const SHELL_HAIRLINE = "#ddd";

/** Fill for hovered chrome controls and icon buttons. */
export const SHELL_HOVER_FILL = "#f0f0f0";

/** Fill for a selected chrome control (view toggle). */
export const SHELL_SELECTED_FILL = "#e8e8e8";

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

/** Neutral 2px focus ring on every interactive piece of shell chrome. */
export const focusRingSx = {
  "&:focus-visible, &.Mui-focusVisible": {
    outline: `2px solid ${SHELL_COLORS.inkMuted}`,
    outlineOffset: "1px",
  },
} as const;
