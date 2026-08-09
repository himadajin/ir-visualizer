import { useCallback, useEffect, useRef, useState } from "react";
import { type SelectChangeEvent } from "@mui/material";
import { useReactFlow } from "@xyflow/react";
import { CanvasShell } from "./components/AppShell/CanvasShell";
import { EditorPanel } from "./components/AppShell/EditorPanel";
import {
  PANEL_INITIAL_WIDTH,
  PANEL_MARGIN,
  PANEL_MAX_WIDTH_RATIO,
  PANEL_MIN_WIDTH,
  SHELL_MOTION_MS,
  buildFitViewPadding,
} from "./components/AppShell/shellTokens";
import { useIRWorkspace } from "./hooks/useIRWorkspace";
import { usePaneResize } from "./hooks/usePaneResize";
import type { IRModeKey } from "./irModes";

/** 60 vw cap on the editor panel (specs/graph-view.md §6.2). */
const panelMaxWidth = (viewportWidth: number) =>
  viewportWidth * PANEL_MAX_WIDTH_RATIO;

const panelResizeOptions = {
  leftOffset: PANEL_MARGIN,
  maxWidth: panelMaxWidth,
};

function App() {
  const {
    mode,
    modeKey,
    views,
    activeViewKey,
    code,
    setCode,
    error,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    resetLayout,
    changeMode,
    changeView,
    clearCode,
  } = useIRWorkspace();

  const [panelOpen, setPanelOpen] = useState(true);

  const { width: panelWidth, onDragHandleMouseDown } = usePaneResize(
    PANEL_INITIAL_WIDTH,
    PANEL_MIN_WIDTH,
    panelResizeOptions,
  );

  // Space the panel occupies on the left; 0 while it is collapsed.
  const fitViewPaddingLeft = panelOpen ? panelWidth + PANEL_MARGIN : 0;

  // The collapse/expand morph is paired with an animated recenter, the shell's
  // only other motion. Panel *resizing* deliberately does not recenter — that
  // would make the graph jump around throughout the drag — so the padding is
  // read from a ref instead of being an effect dependency.
  const { fitView } = useReactFlow();
  const fitViewPaddingLeftRef = useRef(fitViewPaddingLeft);
  useEffect(() => {
    fitViewPaddingLeftRef.current = fitViewPaddingLeft;
  }, [fitViewPaddingLeft]);
  // Compared against the previous value rather than a "first render" flag so
  // that React's development double-invocation cannot fire a spurious fit
  // before the first graph exists.
  const previousPanelOpen = useRef(panelOpen);
  useEffect(() => {
    if (previousPanelOpen.current === panelOpen) return;
    previousPanelOpen.current = panelOpen;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    void fitView({
      padding: buildFitViewPadding(fitViewPaddingLeftRef.current),
      duration: reduceMotion ? 0 : SHELL_MOTION_MS,
    });
  }, [panelOpen, fitView]);

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
    <>
      <CanvasShell
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onResetLayout={resetLayout}
        fitViewPaddingLeft={fitViewPaddingLeft}
      />

      {/* DOM sibling of the canvas, never a React Flow <Panel>: canvas
          pan/zoom gestures must not reach the panel (spec §6.2). */}
      <EditorPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        width={panelWidth}
        onResizeHandleMouseDown={onDragHandleMouseDown}
        mode={modeKey}
        onModeChange={handleModeChange}
        views={views}
        activeViewKey={activeViewKey}
        onViewChange={changeView}
        code={code}
        language={mode.editorLanguage}
        onCodeChange={handleEditorChange}
        onClear={clearCode}
        error={error}
        nodeCount={nodes.length}
        edgeCount={edges.length}
      />
    </>
  );
}
export default App;
