import type { MouseEvent, WheelEvent } from "react";
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  type SelectChangeEvent,
} from "@mui/material";
import { CodeEditor } from "../Editor/CodeEditor";
import { IR_MODE_LIST, type IRModeKey } from "../../irModes";
import type { IRParseDiagnostic, IRViewDefinition } from "../../irModes/types";
import { NODE_FONT_FAMILY } from "../Graph/common/nodeTextStyle";
import {
  PANEL_MARGIN,
  PANEL_MIN_WIDTH,
  SHELL_COLORS,
  SHELL_ELEVATION,
  SHELL_HAIRLINE,
  SHELL_HOVER_FILL,
  SHELL_MOTION_MS,
  SHELL_RADIUS,
  SHELL_SELECTED_FILL,
  focusRingSx,
} from "./shellTokens";

/** The status footer never grows past roughly eight lines of diagnostics. */
const FOOTER_LINE_HEIGHT = 18;
const FOOTER_MAX_LINES = 8;

/**
 * The footer's left rule carries the worst thing the last parse produced
 * (`specs/graph-view.md` §6.3): an error outranks warnings, and a clean parse
 * gets no rule at all.
 */
const statusRule = (error: string | null, diagnostics: IRParseDiagnostic[]) => {
  if (error) return `2px solid ${SHELL_COLORS.error}`;
  if (diagnostics.length > 0) return `2px solid ${SHELL_COLORS.warn}`;
  return undefined;
};

/**
 * The one orchestrated motion of the shell: the panel ⇄ pill morph. Declared
 * as a CSS animation so `prefers-reduced-motion` can switch it off without any
 * JavaScript media-query plumbing.
 */
const morphSx = {
  "@keyframes shellMorphIn": {
    from: { opacity: 0, transform: "scale(0.98)" },
    to: { opacity: 1, transform: "scale(1)" },
  },
  animation: `shellMorphIn ${SHELL_MOTION_MS}ms ease-out`,
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
} as const;

/**
 * Both surfaces morph out of the corner they are anchored to, so the growth
 * reads as coming from the pill: top-left in wide mode, bottom-left for the
 * edge-anchored narrow-mode sheet.
 */
const morphOrigin = (narrow: boolean) =>
  narrow ? "bottom left" : ("top left" as const);

const surfaceSx = {
  backgroundColor: SHELL_COLORS.paper,
  border: `1px solid ${SHELL_COLORS.line}`,
  borderRadius: SHELL_RADIUS,
  boxShadow: SHELL_ELEVATION,
} as const;

const controlHeight = 26;

/**
 * Plain sans-serif wordmark. The chrome is intentionally quieter than the
 * graph nodes, so no chip, no monospace — just a label sitting on the header
 * baseline next to the controls.
 */
const brandSx = {
  pl: 1,
  fontSize: "13px",
  fontWeight: 500,
  lineHeight: 1,
  color: "#333",
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
  userSelect: "none",
} as const;

const selectSx = {
  height: controlHeight,
  fontSize: "12px",
  color: SHELL_COLORS.inkMuted,
  backgroundColor: SHELL_COLORS.paper,
  borderRadius: SHELL_RADIUS,
  ".MuiOutlinedInput-notchedOutline": { borderColor: SHELL_COLORS.control },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: SHELL_COLORS.controlHover,
  },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: SHELL_COLORS.controlFocus,
    borderWidth: "1px",
  },
  ".MuiSvgIcon-root": { color: SHELL_COLORS.inkMuted, fontSize: "16px" },
  ".MuiSelect-select": { py: "2px", pr: "24px !important", pl: "8px" },
  ".MuiSelect-select:focus-visible": {
    outline: `2px solid ${SHELL_COLORS.inkMuted}`,
    outlineOffset: "1px",
    borderRadius: SHELL_RADIUS,
  },
} as const;

const toggleGroupSx = {
  height: controlHeight,
  "& .MuiToggleButton-root": {
    fontSize: "11px",
    px: 1.2,
    py: 0,
    textTransform: "none",
    color: SHELL_COLORS.inkMuted,
    borderColor: SHELL_COLORS.control,
    borderRadius: SHELL_RADIUS,
    "&:hover": { borderColor: SHELL_COLORS.controlHover },
    "&.Mui-selected": {
      backgroundColor: SHELL_SELECTED_FILL,
      borderColor: SHELL_COLORS.control,
      color: "#222",
      fontWeight: 600,
    },
    ...focusRingSx,
  },
} as const;

const actionButtonSx = {
  height: controlHeight,
  fontSize: "11px",
  textTransform: "none",
  color: SHELL_COLORS.inkMuted,
  borderColor: SHELL_COLORS.control,
  borderRadius: SHELL_RADIUS,
  "&:hover": {
    borderColor: SHELL_COLORS.controlHover,
    backgroundColor: SHELL_HOVER_FILL,
  },
  ...focusRingSx,
} as const;

interface EditorPanelProps {
  /** false collapses the panel to the floating "Code" pill. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Narrow mode (§6.5): bottom sheet instead of top-left card, no resizer. */
  narrow: boolean;
  width: number;
  /** Height of the narrow-mode sheet, in px; ignored in wide mode. */
  sheetHeight: number;
  onResizeHandleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  mode: IRModeKey;
  onModeChange: (event: SelectChangeEvent) => void;
  /** The active mode's views; the toggle renders only when this is set. */
  views?: IRViewDefinition[];
  activeViewKey?: string | null;
  onViewChange?: (viewKey: string) => void;
  code: string;
  language: string;
  onCodeChange: (value: string | undefined) => void;
  onClear: () => void;
  /** Latest parse error, or null after a successful parse. */
  error: string | null;
  /** Recoverable diagnostics of the latest successful parse; empty otherwise. */
  diagnostics: IRParseDiagnostic[];
  nodeCount: number;
  edgeCount: number;
}

/**
 * The floating editor panel (`specs/graph-view.md` §6.2/§6.3): a card at the
 * top-left holding everything that is not the canvas — the wordmark, mode
 * selector, view toggle, Clear, collapse, the Monaco editor, and the parse
 * status footer. In narrow mode (§6.5) the very same contents are anchored to
 * the bottom edge as a sheet instead; only the geometry changes.
 *
 * The chrome is deliberately quiet — neutral grays and the app's sans-serif —
 * so it reads as the tool around the graph rather than as another graph node.
 * The only monospace here is the status footer, which is compiler output.
 */
export function EditorPanel({
  open,
  onOpenChange,
  narrow,
  width,
  sheetHeight,
  onResizeHandleMouseDown,
  mode,
  onModeChange,
  views,
  activeViewKey,
  onViewChange,
  code,
  language,
  onCodeChange,
  onClear,
  error,
  diagnostics,
  nodeCount,
  edgeCount,
}: EditorPanelProps) {
  // Safety net only: the panel is a DOM sibling of the canvas, so React Flow
  // never sees these events in the first place.
  const stopWheel = (event: WheelEvent) => event.stopPropagation();

  if (!open) {
    return (
      <Box
        component="button"
        type="button"
        onClick={() => onOpenChange(true)}
        title="Expand panel"
        sx={{
          position: "fixed",
          // Bottom-left in narrow mode (thumb reach), top-left otherwise.
          top: narrow ? "auto" : PANEL_MARGIN,
          bottom: narrow ? PANEL_MARGIN : "auto",
          left: PANEL_MARGIN,
          zIndex: 5,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          // The pill is the only way back to the editor on a touch screen, so
          // narrow mode pads it out until the hit target clears ~40 px in both
          // directions.
          padding: narrow ? "11px 20px" : "4px 10px",
          minWidth: narrow ? 40 : "auto",
          minHeight: narrow ? 40 : "auto",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: 500,
          lineHeight: 1,
          color: "#333",
          ...surfaceSx,
          ...morphSx,
          transformOrigin: morphOrigin(narrow),
          ...focusRingSx,
        }}
      >
        Code
      </Box>
    );
  }

  return (
    <Box
      component="section"
      aria-label="Editor panel"
      onWheel={stopWheel}
      sx={{
        position: "fixed",
        // Narrow mode: an edge-to-edge sheet on the bottom edge, so the small
        // viewport spends none of its width on margins. Wide mode: the
        // top-left card, inset from every edge.
        top: narrow ? "auto" : PANEL_MARGIN,
        bottom: narrow ? 0 : PANEL_MARGIN,
        left: narrow ? 0 : PANEL_MARGIN,
        right: narrow ? 0 : "auto",
        width: narrow ? "auto" : width,
        height: narrow ? sheetHeight : "auto",
        minWidth: narrow ? 0 : PANEL_MIN_WIDTH,
        maxWidth: narrow ? "none" : `calc(100vw - ${PANEL_MARGIN * 2}px)`,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...surfaceSx,
        // The sheet sits on the viewport edge, so only its top corners can
        // round; the surface border is kept on all four sides.
        borderRadius: narrow
          ? `${SHELL_RADIUS} ${SHELL_RADIUS} 0 0`
          : SHELL_RADIUS,
        ...morphSx,
        transformOrigin: morphOrigin(narrow),
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          borderBottom: `1px solid ${SHELL_HAIRLINE}`,
        }}
      >
        <Box component="span" sx={brandSx}>
          IR Visualizer
        </Box>

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 0.75,
            px: 1,
            py: 0.75,
          }}
        >
          <Select
            value={mode}
            onChange={onModeChange}
            size="small"
            variant="outlined"
            sx={selectSx}
          >
            {IR_MODE_LIST.map((irMode) => (
              <MenuItem
                key={irMode.key}
                value={irMode.key}
                sx={{ fontSize: "12px" }}
              >
                {irMode.label}
              </MenuItem>
            ))}
          </Select>

          {views && (
            <ToggleButtonGroup
              value={activeViewKey}
              exclusive
              onChange={(_event, value: string | null) => {
                if (value !== null) onViewChange?.(value);
              }}
              size="small"
              sx={toggleGroupSx}
            >
              {views.map((view) => (
                <ToggleButton key={view.key} value={view.key}>
                  {view.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}

          <Button
            variant="outlined"
            size="small"
            onClick={onClear}
            disableRipple
            sx={actionButtonSx}
          >
            Clear
          </Button>

          <IconButton
            aria-label="Collapse panel"
            title="Collapse panel"
            onClick={() => onOpenChange(false)}
            disableRipple
            sx={{
              ml: "auto",
              width: controlHeight,
              height: controlHeight,
              borderRadius: SHELL_RADIUS,
              color: SHELL_COLORS.inkMuted,
              "&:hover": { backgroundColor: SHELL_HOVER_FILL },
              ...focusRingSx,
            }}
          >
            <Box
              component="svg"
              viewBox="0 0 16 16"
              sx={{
                width: 16,
                height: 16,
                display: "block",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.5,
                strokeLinecap: "round",
                strokeLinejoin: "round",
              }}
            >
              <path d="M9.5 3.5 5 8l4.5 4.5M13 3.5v9" />
            </Box>
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <CodeEditor code={code} onChange={onCodeChange} language={language} />
      </Box>

      <Box
        data-testid="parse-status"
        role="status"
        aria-live="polite"
        sx={{
          borderTop: `1px solid ${SHELL_HAIRLINE}`,
          // Severity precedence, not a blend: a failed parse never carries
          // diagnostics (spec §1), so the two conditions are exclusive anyway.
          borderLeft: statusRule(error, diagnostics),
          px: 1,
          py: 0.75,
          fontFamily: NODE_FONT_FAMILY,
          fontSize: "12px",
          lineHeight: `${FOOTER_LINE_HEIGHT}px`,
          color: error ? SHELL_COLORS.ink : SHELL_COLORS.inkMuted,
          maxHeight: FOOTER_LINE_HEIGHT * FOOTER_MAX_LINES,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {error ? (
          <>
            <Box component="span" sx={{ color: SHELL_COLORS.error }}>
              error:
            </Box>{" "}
            {error}
          </>
        ) : (
          <>
            <Box component="span" sx={{ color: SHELL_COLORS.ok }}>
              ✓
            </Box>{" "}
            {`parsed · ${nodeCount} nodes · ${edgeCount} edges`}
            {/* One line per diagnostic, in the order the parse returned them;
                none is dropped — a long list scrolls (spec §6.3). */}
            {diagnostics.map((diagnostic, index) => (
              <Box key={index} component="div">
                <Box component="span" sx={{ color: SHELL_COLORS.warn }}>
                  warning:
                </Box>{" "}
                {`line ${String(diagnostic.line)}: ${diagnostic.message}`}
              </Box>
            ))}
          </>
        )}
      </Box>

      {/* Right-edge drag handle (wide mode only, mouse-driven as before). The
          narrow-mode sheet is not resizable at all (§6.5). */}
      {!narrow && (
        <Box
          aria-hidden="true"
          onMouseDown={onResizeHandleMouseDown}
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "5px",
            cursor: "col-resize",
            "&:hover": { backgroundColor: SHELL_HAIRLINE },
          }}
        />
      )}
    </Box>
  );
}
