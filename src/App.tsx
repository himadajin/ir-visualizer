import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Paper,
  Typography,
  AppBar,
  Toolbar,
  Alert,
  Snackbar,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
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

const DEFAULT_LLVM_CODE = `define i32 @func(i32 %0, i32 %1, i1  %2) {
  br i1 %2, label %4, label %7

4:                                                ; preds = %3
  %5 = add i32 %0, 45
  %6 = add i32 %5, %1
  br label %18

7:                                                ; preds = %3
  %8 = icmp sgt i32 %1, 0
  br i1 %8, label %12, label %9

9:                                                ; preds = %12, %7
  %10 = phi i32 [ %1, %7 ], [ %15, %12 ]
  %11 = sub i32 %10, %0
  br label %18

12:                                               ; preds = %7, %12
  %13 = phi i32 [ %16, %12 ], [ 0, %7 ]
  %14 = phi i32 [ %15, %12 ], [ %1, %7 ]
  %15 = sub i32 %14, %13
  %16 = add i32 %13, %0
  %17 = icmp slt i32 %16, %15
  br i1 %17, label %12, label %9

18:                                               ; preds = %9, %4
  %19 = phi i32 [ %6, %4 ], [ %11, %9 ]
  ret i32 %19
}`;

const DEFAULT_SELECTIONDAG_CODE = `Optimized legalized selection DAG: %bb.0 'test:entry'
SelectionDAG has 12 nodes:
  t0: ch,glue = EntryToken
  t2: i64,ch = CopyFromReg t0, Register:i64 %0
  t4: i64,ch = CopyFromReg t0, Register:i64 %1
  t6: i64 = add t2, t4
  t10: ch = store<(store (s64) into %ir.a.addr)> t0, t2, FrameIndex:i64<0>, <null>
  t12: ch = store<(store (s64) into %ir.b.addr)> t10, t4, FrameIndex:i64<1>, <null>
  t22: ch = RISCVISD::RET_GLUE t12, Register:i64 $x10, t12:1
`;

const MIN_WIDTH = 200; // min px

type ToolbarPaneProps = {
  mode: "mermaid" | "llvm-ir" | "selectionDAG";
  onModeChange: (event: SelectChangeEvent) => void;
};

function ToolbarPane({ mode, onModeChange }: ToolbarPaneProps) {
  return (
    <AppBar position="static">
      <Toolbar variant="dense">
        <Typography
          variant="h6"
          color="inherit"
          component="div"
          sx={{ flexGrow: 1 }}
        >
          IRVisualizer
        </Typography>
        <FormControl variant="standard" sx={{ m: 1, minWidth: 120 }}>
          <InputLabel sx={{ color: "white" }}>Mode</InputLabel>
          <Select
            value={mode}
            onChange={onModeChange}
            label="Mode"
            sx={{ color: "white", ".MuiSvgIcon-root": { color: "white" } }}
          >
            <MenuItem value="mermaid">Mermaid</MenuItem>
            <MenuItem value="llvm-ir">LLVM-IR</MenuItem>
            <MenuItem value="selectionDAG">SelectionDAG</MenuItem>
          </Select>
        </FormControl>
      </Toolbar>
    </AppBar>
  );
}

type EditorPaneProps = {
  width: number;
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
      <ToolbarPane mode={mode} onModeChange={handleModeChange} />

      <Box sx={{ flexGrow: 1, display: "flex", overflow: "hidden" }}>
        {/* Left Panel: Editor */}
        <EditorPane
          width={leftPaneWidth}
          code={code}
          onChange={handleEditorChange}
          language={mode === "mermaid" ? "mermaid" : "llvm"}
        />

        {/* Resizer */}
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

        {/* Right Panel: Graph */}
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
      </Box>
    </Box>
  );
}
export default App;
