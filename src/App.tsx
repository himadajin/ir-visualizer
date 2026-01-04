import React, { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, AppBar, Toolbar, Alert, Snackbar, Select, MenuItem, FormControl, InputLabel, type SelectChangeEvent } from '@mui/material';
import { CodeEditor } from './components/Editor/CodeEditor';
import { GraphViewer } from './components/Graph/GraphViewer';
import { useGraphData } from './hooks/useGraphData';
import { parseMermaid } from './parser/mermaid';
import { parseLLVM } from './parser/llvm';

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

const MIN_WIDTH = 200; // min px

function App() {
  const [mode, setMode] = useState<'mermaid' | 'llvm-ir'>('llvm-ir');
  const [code, setCode] = useState(DEFAULT_LLVM_CODE);
  const { nodes, edges, onNodesChange, onEdgesChange, updateGraph, resetLayout } = useGraphData();
  const [error, setError] = useState<string | null>(null);

  // Resizing state
  const [leftPaneWidth, setLeftPaneWidth] = useState(500);
  const isDragging = React.useRef(false);

  // Resize Handlers
  const handleMouseDown = useCallback((_e: React.MouseEvent) => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // prevent text selection
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.min(Math.max(e.clientX, MIN_WIDTH), window.innerWidth - MIN_WIDTH);
    setLeftPaneWidth(newWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Debounce logic
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        let graph;
        if (mode === 'mermaid') {
          graph = parseMermaid(code);
        } else {
          graph = parseLLVM(code);
        }
        updateGraph(graph);
        setError(null);
      } catch (e: any) {
        // Only show error if it persists, or maybe just log it?
        // Ohm errors can be verbose.
        setError(e.message);
      }
    }, 750);

    return () => clearTimeout(timer);
  }, [code, mode, updateGraph]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    console.log(value);
    if (value !== undefined) {
      setCode(value);
    }
  }, []);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar variant="dense">
          <Typography variant="h6" color="inherit" component="div" sx={{ flexGrow: 1 }}>
            IRVisualizer
          </Typography>
          <FormControl variant="standard" sx={{ m: 1, minWidth: 120 }}>
            <InputLabel sx={{ color: 'white' }}>Mode</InputLabel>
            <Select
              value={mode}
              onChange={(e: SelectChangeEvent) => {
                const newMode = e.target.value as 'mermaid' | 'llvm-ir';
                setMode(newMode);
                setCode(newMode === 'mermaid' ? DEFAULT_CODE : DEFAULT_LLVM_CODE);
              }}
              label="Mode"
              sx={{ color: 'white', '.MuiSvgIcon-root': { color: 'white' } }}
            >
              <MenuItem value="mermaid">Mermaid</MenuItem>
              <MenuItem value="llvm-ir">LLVM-IR</MenuItem>
            </Select>
          </FormControl>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel: Editor */}
        <Paper square sx={{ width: leftPaneWidth, display: 'flex', flexDirection: 'column' }}>
          <CodeEditor
            code={code}
            onChange={handleEditorChange}
            language={mode === 'llvm-ir' ? 'llvm' : 'mermaid'}
          />
        </Paper>

        {/* Resizer */}
        <Box
          sx={{
            width: '5px',
            cursor: 'col-resize',
            backgroundColor: '#ccc',
            ':hover': { backgroundColor: '#999' },
            zIndex: 10,
          }}
          onMouseDown={handleMouseDown}
        />

        {/* Right Panel: Graph */}
        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <GraphViewer
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onResetLayout={resetLayout}
          />
          {error && (
            <Snackbar open={true} autoHideDuration={6000}>
              <Alert severity="error" sx={{ width: '100%' }}>
                {error.substring(0, 100)}...
              </Alert>
            </Snackbar>
          )}
        </Box>
      </Box>
    </Box>
  );
}
export default App;
