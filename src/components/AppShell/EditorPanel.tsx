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
import type { IRViewDefinition } from "../../irModes/types";
import { NODE_FONT_FAMILY } from "../Graph/common/nodeTextStyle";
import {
  PANEL_MARGIN,
  PANEL_MIN_WIDTH,
  SHELL_COLORS,
  SHELL_ELEVATION,
  SHELL_HAIRLINE,
  SHELL_MOTION_MS,
  SHELL_RADIUS,
  cornerChipSx,
  focusRingSx,
} from "./shellTokens";

/** The status footer never grows past roughly eight lines of diagnostics. */
const FOOTER_LINE_HEIGHT = 18;
const FOOTER_MAX_LINES = 8;

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
  transformOrigin: "top left",
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
} as const;

const surfaceSx = {
  backgroundColor: SHELL_COLORS.paper,
  border: `1px solid ${SHELL_COLORS.line}`,
  borderRadius: SHELL_RADIUS,
  boxShadow: SHELL_ELEVATION,
} as const;

const controlHeight = 26;

const selectSx = {
  height: controlHeight,
  fontFamily: NODE_FONT_FAMILY,
  fontSize: "12px",
  color: SHELL_COLORS.ink,
  backgroundColor: SHELL_COLORS.paper,
  borderRadius: SHELL_RADIUS,
  ".MuiOutlinedInput-notchedOutline": { borderColor: SHELL_COLORS.line },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: SHELL_COLORS.ink },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: SHELL_COLORS.accent,
    borderWidth: "1px",
  },
  ".MuiSvgIcon-root": { color: SHELL_COLORS.inkMuted, fontSize: "16px" },
  ".MuiSelect-select": { py: "2px", pr: "24px !important", pl: "8px" },
  ".MuiSelect-select:focus-visible": {
    outline: `2px solid ${SHELL_COLORS.accent}`,
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
    borderColor: SHELL_COLORS.line,
    borderRadius: SHELL_RADIUS,
    "&.Mui-selected": {
      backgroundColor: SHELL_COLORS.paper,
      borderColor: SHELL_COLORS.accent,
      color: SHELL_COLORS.accent,
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
  borderColor: SHELL_COLORS.line,
  borderRadius: SHELL_RADIUS,
  "&:hover": { borderColor: SHELL_COLORS.ink, backgroundColor: "#f0f0f0" },
  ...focusRingSx,
} as const;

interface EditorPanelProps {
  /** false collapses the panel to the floating `code` pill. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
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
  nodeCount: number;
  edgeCount: number;
}

/**
 * The floating editor panel (`specs/graph-view.md` §6.2/§6.3): a card at the
 * top-left holding everything that is not the canvas — brand corner chip, mode
 * selector, view toggle, Clear, collapse, the Monaco editor, and the parse
 * status footer.
 *
 * Conceptually the panel is itself a graph node: it reuses NodeShell's border,
 * radius, and corner-chip grammar. NodeShell is deliberately not imported —
 * it renders React Flow `Handle`s, which belong to the canvas, not the shell.
 */
export function EditorPanel({
  open,
  onOpenChange,
  width,
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
          top: PANEL_MARGIN,
          left: PANEL_MARGIN,
          zIndex: 5,
          display: "inline-flex",
          padding: "0 8px 4px 0",
          cursor: "pointer",
          ...surfaceSx,
          ...morphSx,
          ...focusRingSx,
        }}
      >
        <Box component="span" sx={cornerChipSx}>
          code
        </Box>
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
        top: PANEL_MARGIN,
        left: PANEL_MARGIN,
        bottom: PANEL_MARGIN,
        width,
        minWidth: PANEL_MIN_WIDTH,
        maxWidth: `calc(100vw - ${PANEL_MARGIN * 2}px)`,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...surfaceSx,
        ...morphSx,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          borderBottom: `1px solid ${SHELL_HAIRLINE}`,
        }}
      >
        <Box component="span" sx={cornerChipSx}>
          ir-visualizer
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
                sx={{ fontFamily: NODE_FONT_FAMILY, fontSize: "12px" }}
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
              "&:hover": { backgroundColor: "#f0f0f0" },
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
          borderLeft: error ? `2px solid ${SHELL_COLORS.error}` : undefined,
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
          </>
        )}
      </Box>

      {/* Right-edge drag handle (wide mode only, mouse-driven as before). */}
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
    </Box>
  );
}
