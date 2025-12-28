import React, { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, AppBar, Toolbar, Alert, Snackbar } from '@mui/material';
import { CodeEditor } from './components/Editor/CodeEditor';
import { GraphViewer } from './components/Graph/GraphViewer';
import { useGraphData } from './hooks/useGraphData';
import { parseMermaid } from './parser/parser';

const DEFAULT_CODE = `graph TD
  A[Is this working?] -->|Yes| B(Great!)
  A -->|No| C[Debug it]
  C --> D{Fixed?}
  D -->|Yes| B
  D -->|No| C
`;

const MIN_WIDTH = 200; // min px

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
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
        const graph = parseMermaid(code);
        updateGraph(graph);
        setError(null);
      } catch (e: any) {
        // Only show error if it persists, or maybe just log it?
        // Ohm errors can be verbose.
        setError(e.message);
      }
    }, 750);

    return () => clearTimeout(timer);
  }, [code, updateGraph]);

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
          <Typography variant="h6" color="inherit" component="div">
            Mermaid to React Flow
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel: Editor */}
        <Paper square sx={{ width: leftPaneWidth, display: 'flex', flexDirection: 'column' }}>
          <CodeEditor code={code} onChange={handleEditorChange} />
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
