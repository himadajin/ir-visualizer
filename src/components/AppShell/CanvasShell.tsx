import { Box } from "@mui/material";
import type { Node, Edge, OnNodesChange, OnEdgesChange } from "@xyflow/react";
import { GraphViewer } from "../Graph/GraphViewer";
import { SHELL_COLORS } from "./shellTokens";

interface CanvasShellProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onResetLayout: () => void;
  /** Left space reserved for the floating editor panel when fitting the view. */
  fitViewPaddingLeft: number;
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
  onResetLayout,
  fitViewPaddingLeft,
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
        onResetLayout={onResetLayout}
        fitViewPaddingLeft={fitViewPaddingLeft}
      />
    </Box>
  );
}
