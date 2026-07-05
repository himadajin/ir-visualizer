import { Box, Alert, Snackbar } from "@mui/material";
import type { Node, Edge, OnNodesChange, OnEdgesChange } from "@xyflow/react";
import { GraphViewer } from "../Graph/GraphViewer";

interface GraphPaneProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onResetLayout: () => void;
  error: string | null;
}

export function GraphPane({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onResetLayout,
  error,
}: GraphPaneProps) {
  return (
    <Box sx={{ flexGrow: 1, position: "relative" }}>
      <GraphViewer
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onResetLayout={onResetLayout}
      />
      {error && (
        <Snackbar open={true} autoHideDuration={6000}>
          <Alert severity="error" sx={{ width: "100%" }}>
            {error.substring(0, 100)}...
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
}
