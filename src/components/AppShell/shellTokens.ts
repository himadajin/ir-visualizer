/**
 * Design tokens for the canvas-first shell (`specs/graph-view.md` §6.6).
 *
 * Every floating surface — editor panel, collapsed pill, canvas control
 * cluster — reuses the graph nodes' visual grammar (`Graph/common/NodeShell`):
 * white surface, 1px #777 border, 4px radius, monospace type, corner chips.
 * The shell must not introduce a second visual language, so these constants
 * are the only place shell colors/geometry are defined.
 */
import { NODE_FONT_FAMILY } from "../Graph/common/nodeTextStyle";

export const SHELL_COLORS = {
  /** Full-viewport canvas background. */
  ground: "#FAFAFA",
  /** React Flow `<Background />` dot color. */
  groundDots: "#D7DBDF",
  /** Surface of panel / pill / control cluster (identical to graph nodes). */
  paper: "#FFFFFF",
  /** Border color for all floating chrome (identical to NodeShell). */
  line: "#777",
  ink: "#1F2328",
  inkMuted: "#57606A",
  /** Parse success only — never decorative. */
  ok: "#1A7F37",
  /** Parse failure only — never decorative. */
  error: "#CF222E",
  /** Focus rings and selected states only. */
  accent: "#8250DF",
} as const;

/** Floating chrome only; graph nodes stay flat. */
export const SHELL_ELEVATION =
  "0 1px 2px rgba(31,35,40,.08), 0 8px 24px rgba(31,35,40,.08)";

export const SHELL_RADIUS = "4px";

/** Hairline used inside a surface (NodeShell's chip borders use the same). */
export const SHELL_HAIRLINE = "#ddd";

/** NodeShell's chip background. */
export const SHELL_CHIP_BACKGROUND = "#f0f0f0";

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

/**
 * NodeShell's corner-chip geometry, reproduced for shell chrome. NodeShell
 * itself cannot be reused here because it renders React Flow `Handle`s.
 * Placed in normal flow (not absolutely positioned) so it can sit as the first
 * item of a flex header row while still hugging the surface's top-left corner.
 */
export const cornerChipSx = {
  alignSelf: "flex-start",
  padding: "2px 6px",
  backgroundColor: SHELL_CHIP_BACKGROUND,
  borderTopLeftRadius: SHELL_RADIUS,
  borderBottomRightRadius: SHELL_RADIUS,
  borderRight: `1px solid ${SHELL_HAIRLINE}`,
  borderBottom: `1px solid ${SHELL_HAIRLINE}`,
  fontFamily: NODE_FONT_FAMILY,
  fontSize: "12px",
  fontWeight: "bold",
  lineHeight: "16px",
  color: SHELL_COLORS.inkMuted,
  whiteSpace: "nowrap",
  userSelect: "none",
} as const;

/** 2px accent focus ring on every interactive piece of shell chrome. */
export const focusRingSx = {
  "&:focus-visible, &.Mui-focusVisible": {
    outline: `2px solid ${SHELL_COLORS.accent}`,
    outlineOffset: "1px",
  },
} as const;
