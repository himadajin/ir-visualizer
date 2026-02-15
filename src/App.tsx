import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Paper,
  Alert,
  Snackbar,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  useMediaQuery,
  type SelectChangeEvent,
} from "@mui/material";
import { CodeEditor } from "./components/Editor/CodeEditor";
import { GraphViewer } from "./components/Graph/GraphViewer";
import { useGraphData } from "./hooks/useGraphData";
import { parseMermaid } from "./parser/mermaid";
import { parseLLVM } from "./parser/llvm";
import { parseSelectionDAGToGraphData } from "./parser/selectionDAG";

const DEFAULT_CODE = `graph TD
  A[Is this working?] -->|Yes| B(Great!)
  A -->|No| C[Debug it]
  C --> D{Fixed?}
  D -->|Yes| B
  D -->|No| C
`;

const DEFAULT_LLVM_CODE = `
define i32 @func(i32 %0, i32 %1, i1  %2) {
  br i1 %2, label %4, label %7

4:
  %5 = add i32 %0, 45
  %6 = add i32 %5, %1
  br label %18

7:
  %8 = icmp sgt i32 %1, 0
  br i1 %8, label %12, label %9

9:
  %10 = phi i32 [ %1, %7 ], [ %15, %12 ]
  %11 = sub i32 %10, %0
  br label %18

12:
  %13 = phi i32 [ %16, %12 ], [ 0, %7 ]
  %14 = phi i32 [ %15, %12 ], [ %1, %7 ]
  %15 = sub i32 %14, %13
  %16 = add i32 %13, %0
  %17 = icmp slt i32 %16, %15
  br i1 %17, label %12, label %9

18:
  %19 = phi i32 [ %6, %4 ], [ %11, %9 ]
  ret i32 %19
}
`;

const DEFAULT_SELECTIONDAG_CODE = `
Optimized legalized selection DAG: %bb.0 'test:entry'
SelectionDAG has 22 nodes:
  t0: ch,glue = EntryToken
        t2: i64,ch = CopyFromReg t0, Register:i64 %0
      t10: ch = store<(store (s64) into %ir.a.addr)> t0, t2, FrameIndex:i64<0>, undef:i64
      t4: i64,ch = CopyFromReg t0, Register:i64 %1
    t12: ch = store<(store (s64) into %ir.b.addr)> t10, t4, FrameIndex:i64<1>, undef:i64
    t6: i64,ch = CopyFromReg t0, Register:i64 %2
  t14: ch = store<(store (s64) into %ir.c.addr)> t12, t6, FrameIndex:i64<2>, undef:i64
      t15: i64,ch = load<(dereferenceable load (s64) from %ir.a.addr)> t14, FrameIndex:i64<0>, undef:i64
        t16: i64,ch = load<(dereferenceable load (s64) from %ir.b.addr)> t14, FrameIndex:i64<1>, undef:i64
        t17: i64,ch = load<(dereferenceable load (s64) from %ir.c.addr)> t14, FrameIndex:i64<2>, undef:i64
      t18: i64 = mul t16, t17
    t19: i64 = add t15, t18
  t21: ch,glue = CopyToReg t14, Register:i64 $x10, t19
  t22: ch = RISCVISD::RET_GLUE t21, Register:i64 $x10, t21:1
`;

const MIN_WIDTH = 200; // min px

type ToolbarPaneProps = {
  mode: "mermaid" | "llvm-ir" | "selectionDAG";
  onModeChange: (event: SelectChangeEvent) => void;
  isNarrow: boolean;
  activePane: "editor" | "graph";
  onActivePaneChange: (pane: "editor" | "graph") => void;
};

function ToolbarPane({
  mode,
  onModeChange,
  isNarrow,
  activePane,
  onActivePaneChange,
}: ToolbarPaneProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 1.5,
        py: 0.5,
        borderBottom: "1px solid #e8e8e8",
        backgroundColor: "#fafafa",
        minHeight: 36,
        maxHeight: 36,
      }}
    >
      <Box
        component="span"
        sx={{
          fontSize: "16px",
          color: "#333",
          letterSpacing: "0.02em",
          userSelect: "none",
        }}
      >
        IR Visualizer
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {isNarrow && (
          <ToggleButtonGroup
            value={activePane}
            exclusive
            onChange={(_e, v) => {
              if (v !== null) onActivePaneChange(v);
            }}
            size="small"
            sx={{
              height: 26,
              "& .MuiToggleButton-root": {
                fontSize: "11px",
                px: 1.2,
                py: 0,
                textTransform: "none",
                color: "#666",
                borderColor: "#d0d0d0",
                "&.Mui-selected": {
                  backgroundColor: "#e8e8e8",
                  color: "#222",
                  fontWeight: 600,
                },
              },
            }}
          >
            <ToggleButton value="editor">Code</ToggleButton>
            <ToggleButton value="graph">Graph</ToggleButton>
          </ToggleButtonGroup>
        )}

        <Select
          value={mode}
          onChange={onModeChange}
          size="small"
          variant="outlined"
          sx={{
            fontSize: "12px",
            height: 26,
            color: "#555",
            backgroundColor: "#fff",
            borderRadius: "4px",
            ".MuiOutlinedInput-notchedOutline": {
              borderColor: "#d0d0d0",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "#999",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: "#777",
              borderWidth: "1px",
            },
            ".MuiSvgIcon-root": {
              color: "#999",
              fontSize: "16px",
            },
            ".MuiSelect-select": {
              py: "2px",
              pr: "24px !important",
              pl: "8px",
            },
          }}
        >
          <MenuItem value="llvm-ir" sx={{ fontSize: "12px" }}>
            LLVM-IR
          </MenuItem>
          <MenuItem value="selectionDAG" sx={{ fontSize: "12px" }}>
            SelectionDAG
          </MenuItem>
          <MenuItem value="mermaid" sx={{ fontSize: "12px" }}>
            Mermaid
          </MenuItem>
        </Select>
      </Box>
    </Box>
  );
}

type EditorPaneProps = {
  width: number | string;
  code: string;
  language: "llvm" | "mermaid";
  onChange: (value: string | undefined) => void;
};

function EditorPane({ width, code, language, onChange }: EditorPaneProps) {
  return (
    <Paper
      square
      sx={{
        width,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CodeEditor code={code} onChange={onChange} language={language} />
    </Paper>
  );
}

type GraphPaneProps = {
  nodes: ReturnType<typeof useGraphData>["nodes"];
  edges: ReturnType<typeof useGraphData>["edges"];
  onNodesChange: ReturnType<typeof useGraphData>["onNodesChange"];
  onEdgesChange: ReturnType<typeof useGraphData>["onEdgesChange"];
  onResetLayout: ReturnType<typeof useGraphData>["resetLayout"];
  error: string | null;
};

function GraphPane({
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

const NARROW_BREAKPOINT = 768;

function App() {
  const [mode, setMode] = useState<"mermaid" | "llvm-ir" | "selectionDAG">(
    "llvm-ir",
  );
  const [code, setCode] = useState(DEFAULT_LLVM_CODE);
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    updateGraph,
    updateSelectionDAGGraph,
    resetLayout,
    resetSelectionDAGLayout,
  } = useGraphData();
  const [error, setError] = useState<string | null>(null);

  // Responsive narrow-mode detection
  const isNarrow = useMediaQuery(`(max-width:${NARROW_BREAKPOINT}px)`);
  const [activePane, setActivePane] = useState<"editor" | "graph">("editor");

  // Resizing state
  const [leftPaneWidth, setLeftPaneWidth] = useState(500);
  const isDragging = React.useRef(false);

  // Resize Handlers
  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none"; // prevent text selection
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.min(
      Math.max(e.clientX, MIN_WIDTH),
      window.innerWidth - MIN_WIDTH,
    );
    setLeftPaneWidth(newWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Debounce logic
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        let graph;
        if (mode === "mermaid") {
          graph = parseMermaid(code);
          updateGraph(graph);
        } else if (mode === "selectionDAG") {
          graph = parseSelectionDAGToGraphData(code);
          updateSelectionDAGGraph(graph);
        } else {
          graph = parseLLVM(code);
          updateGraph(graph);
        }
        setError(null);
      } catch (error: unknown) {
        // Only show error if it persists, or maybe just log it?
        // Ohm errors can be verbose.
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError("Unknown error");
        }
      }
    }, 750);

    return () => clearTimeout(timer);
  }, [code, mode, updateGraph, updateSelectionDAGGraph]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    console.log(value);
    if (value !== undefined) {
      setCode(value);
    }
  }, []);

  const handleModeChange = useCallback((event: SelectChangeEvent) => {
    const newMode = event.target.value as
      | "mermaid"
      | "llvm-ir"
      | "selectionDAG";
    setMode(newMode);
    if (newMode === "mermaid") {
      setCode(DEFAULT_CODE);
    } else if (newMode === "selectionDAG") {
      setCode(DEFAULT_SELECTIONDAG_CODE);
    } else {
      setCode(DEFAULT_LLVM_CODE);
    }
  }, []);

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <ToolbarPane
        mode={mode}
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
            language={mode === "mermaid" ? "mermaid" : "llvm"}
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
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Graph Pane: full-width in narrow mode */}
        {(!isNarrow || activePane === "graph") && (
          <GraphPane
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onResetLayout={
              mode === "selectionDAG" ? resetSelectionDAGLayout : resetLayout
            }
            error={error}
          />
        )}
      </Box>
    </Box>
  );
}
export default App;
