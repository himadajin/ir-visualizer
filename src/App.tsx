import { useCallback, useState } from "react";
import { Box, useMediaQuery, type SelectChangeEvent } from "@mui/material";
import { ToolbarPane } from "./components/AppShell/ToolbarPane";
import { EditorPane } from "./components/AppShell/EditorPane";
import { GraphPane } from "./components/AppShell/GraphPane";
import { useIRWorkspace } from "./hooks/useIRWorkspace";
import { usePaneResize } from "./hooks/usePaneResize";
import type { IRModeKey } from "./irModes";

const MIN_PANE_WIDTH = 200;
const INITIAL_LEFT_PANE_WIDTH = 500;
const NARROW_BREAKPOINT = 768;

function App() {
  const {
    mode,
    modeKey,
    code,
    setCode,
    error,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    resetLayout,
    changeMode,
    clearCode,
  } = useIRWorkspace();

  // Responsive narrow-mode detection
  const isNarrow = useMediaQuery(`(max-width:${NARROW_BREAKPOINT}px)`);
  const [activePane, setActivePane] = useState<"editor" | "graph">("editor");

  const { width: leftPaneWidth, onDragHandleMouseDown } = usePaneResize(
    INITIAL_LEFT_PANE_WIDTH,
    MIN_PANE_WIDTH,
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) setCode(value);
    },
    [setCode],
  );

  const handleModeChange = useCallback(
    (event: SelectChangeEvent) => {
      changeMode(event.target.value as IRModeKey);
    },
    [changeMode],
  );

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <ToolbarPane
        mode={modeKey}
        onModeChange={handleModeChange}
        isNarrow={isNarrow}
        activePane={activePane}
        onActivePaneChange={setActivePane}
      />

      <Box sx={{ flexGrow: 1, display: "flex", overflow: "hidden" }}>
        {/* Editor Pane: full-width in narrow mode, fixed-width in wide mode */}
        {(!isNarrow || activePane === "editor") && (
          <EditorPane
            width={isNarrow ? "100%" : leftPaneWidth}
            code={code}
            onChange={handleEditorChange}
            language={mode.editorLanguage}
            onClear={clearCode}
          />
        )}

        {/* Resizer: hidden in narrow mode */}
        {!isNarrow && (
          <Box
            sx={{
              width: "5px",
              cursor: "col-resize",
              backgroundColor: "#ccc",
              ":hover": { backgroundColor: "#999" },
              zIndex: 10,
            }}
            onMouseDown={onDragHandleMouseDown}
          />
        )}

        {/* Graph Pane: full-width in narrow mode */}
        {(!isNarrow || activePane === "graph") && (
          <GraphPane
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onResetLayout={resetLayout}
            error={error}
          />
        )}
      </Box>
    </Box>
  );
}
export default App;
