import { Box } from "@mui/material";
import type { Node, Edge, OnNodesChange, OnEdgesChange } from "@xyflow/react";
import { GraphViewer } from "../Graph/GraphViewer";
import { SHELL_COLORS, type ShellFitViewInset } from "./shellTokens";
import type { NodeSizeMap } from "../../utils/layout";

interface CanvasShellProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onApplyLayout: (sizes: NodeSizeMap) => void | Promise<void>;
  layoutPending: boolean;
  /** Space reserved for the floating editor panel when fitting the view. */
  fitViewInset: ShellFitViewInset;
}

/**
 * The app's ground layer (`specs/graph-view.md` §6.1): the graph canvas fills
 * the whole viewport and every other surface floats above it as a DOM sibling
 * (never a React Flow `<Panel>`), so canvas gestures cannot leak into them.
 */
export function CanvasShell({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onApplyLayout,
  layoutPending,
  fitViewInset,
}: CanvasShellProps) {
  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        backgroundColor: SHELL_COLORS.ground,
      }}
    >
      <GraphViewer
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onApplyLayout={onApplyLayout}
        layoutPending={layoutPending}
        fitViewInset={fitViewInset}
      />
    </Box>
  );
}
