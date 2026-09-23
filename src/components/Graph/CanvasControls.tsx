import type { ReactNode } from "react";
import { Panel, useReactFlow, type FitViewOptions } from "@xyflow/react";
import { ActionIcon, Divider, Group, Paper } from "@mantine/core";
import {
  IconMaximize,
  IconMinus,
  IconPlus,
  IconRefresh,
} from "@tabler/icons-react";

export type FitViewPadding = NonNullable<FitViewOptions["padding"]>;

interface CanvasControlsProps {
  /** Padding handed to `fitView`, keeping the graph clear of the panel. */
  fitViewPadding: FitViewPadding;
  /**
   * Space (px) the editor panel occupies along the viewport's bottom edge —
   * the narrow-mode sheet's height, otherwise 0. The cluster is lifted by it so
   * the sheet never covers it (`specs/graph-view.md` §6.4).
   */
  bottomInset: number;
  /** Re-runs the ELK layout and re-fits the viewport (owned by GraphViewer). */
  onResetLayout: () => void;
}

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
    <ActionIcon
      variant="subtle"
      color="gray"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </ActionIcon>
  );
}

/**
 * The single floating control cluster at the bottom-right
 * (`specs/graph-view.md` §6.4): zoom in, zoom out, fit view, a 1px divider,
 * then reset layout. The divider separates viewport operations from the
 * position-destroying reset. It rides above the shell's bottom inset, so the
 * narrow-mode sheet cannot cover it.
 *
 * Rendered inside `<ReactFlow>` as a `<Panel>` so it can drive the viewport
 * through `useReactFlow()`.
 */
export function CanvasControls({
  fitViewPadding,
  bottomInset,
  onResetLayout,
}: CanvasControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    // `bottom` rather than a margin: React Flow's own panel margin then still
    // applies on top of the inset, so the cluster keeps its usual gap from
    // whatever edge it rests against. Repositioning is instant on purpose — it
    // happens under the panel ⇄ pill morph, the shell's only animation (§6.6).
    <Panel position="bottom-right" style={{ bottom: bottomInset }}>
      <Paper withBorder p={4}>
        <Group gap={4} wrap="nowrap">
          <ControlButton label="Zoom in" onClick={() => void zoomIn()}>
            <IconPlus size={16} />
          </ControlButton>

          <ControlButton label="Zoom out" onClick={() => void zoomOut()}>
            <IconMinus size={16} />
          </ControlButton>

          <ControlButton
            label="Fit view"
            onClick={() => void fitView({ padding: fitViewPadding })}
          >
            <IconMaximize size={16} />
          </ControlButton>

          <Divider orientation="vertical" />

          <ControlButton label="Reset layout" onClick={onResetLayout}>
            <IconRefresh size={16} />
          </ControlButton>
        </Group>
      </Paper>
    </Panel>
  );
}
