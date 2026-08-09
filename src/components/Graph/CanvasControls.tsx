import type { ReactNode } from "react";
import { Panel, useReactFlow, type FitViewOptions } from "@xyflow/react";
import { Box, IconButton } from "@mui/material";
import {
  SHELL_CHIP_BACKGROUND,
  SHELL_COLORS,
  SHELL_ELEVATION,
  SHELL_HAIRLINE,
  SHELL_RADIUS,
  focusRingSx,
} from "../AppShell/shellTokens";

export type FitViewPadding = NonNullable<FitViewOptions["padding"]>;

interface CanvasControlsProps {
  /** Padding handed to `fitView`, keeping the graph clear of the panel. */
  fitViewPadding: FitViewPadding;
  /** Re-runs the Dagre layout and re-fits the viewport (owned by GraphViewer). */
  onResetLayout: () => void;
}

const iconSx = {
  width: 16,
  height: 16,
  display: "block",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <IconButton
      aria-label={label}
      title={label}
      onClick={onClick}
      disableRipple
      sx={{
        width: 28,
        height: 28,
        borderRadius: SHELL_RADIUS,
        color: SHELL_COLORS.ink,
        "&:hover": { backgroundColor: SHELL_CHIP_BACKGROUND },
        ...focusRingSx,
      }}
    >
      {children}
    </IconButton>
  );
}

/**
 * The single floating control cluster at the bottom-right
 * (`specs/graph-view.md` §6.4): zoom in, zoom out, fit view, a 1px divider,
 * then reset layout. The divider separates viewport operations from the
 * position-destroying reset.
 *
 * Rendered inside `<ReactFlow>` as a `<Panel>` so it can drive the viewport
 * through `useReactFlow()`.
 */
export function CanvasControls({
  fitViewPadding,
  onResetLayout,
}: CanvasControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="bottom-right">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          padding: "3px",
          backgroundColor: SHELL_COLORS.paper,
          border: `1px solid ${SHELL_COLORS.line}`,
          borderRadius: SHELL_RADIUS,
          boxShadow: SHELL_ELEVATION,
        }}
      >
        <ControlButton label="Zoom in" onClick={() => void zoomIn()}>
          <Box component="svg" viewBox="0 0 16 16" sx={iconSx}>
            <path d="M8 3.5v9M3.5 8h9" />
          </Box>
        </ControlButton>

        <ControlButton label="Zoom out" onClick={() => void zoomOut()}>
          <Box component="svg" viewBox="0 0 16 16" sx={iconSx}>
            <path d="M3.5 8h9" />
          </Box>
        </ControlButton>

        <ControlButton
          label="Fit view"
          onClick={() => void fitView({ padding: fitViewPadding })}
        >
          <Box component="svg" viewBox="0 0 16 16" sx={iconSx}>
            <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
          </Box>
        </ControlButton>

        <Box
          aria-hidden="true"
          sx={{
            width: "1px",
            alignSelf: "stretch",
            marginX: "3px",
            backgroundColor: SHELL_HAIRLINE,
          }}
        />

        <ControlButton label="Reset layout" onClick={onResetLayout}>
          <Box component="svg" viewBox="0 0 16 16" sx={iconSx}>
            <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5" />
          </Box>
        </ControlButton>
      </Box>
    </Panel>
  );
}
