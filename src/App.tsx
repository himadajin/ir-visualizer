import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery, type SelectChangeEvent } from "@mui/material";
import { useReactFlow } from "@xyflow/react";
import { CanvasShell } from "./components/AppShell/CanvasShell";
import { EditorPanel } from "./components/AppShell/EditorPanel";
import {
  EMPTY_FIT_VIEW_INSET,
  PANEL_INITIAL_WIDTH,
  PANEL_MARGIN,
  PANEL_MAX_WIDTH_RATIO,
  PANEL_MIN_WIDTH,
  PANEL_SHEET_HEIGHT_RATIO,
  SHELL_MOTION_MS,
  SHELL_NARROW_MEDIA_QUERY,
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

/**
 * Viewport height in px. The narrow-mode sheet is sized in px rather than in
 * `vh` so that the sheet and the `fitView` bottom padding are derived from one
 * and the same number.
 */
function useViewportHeight() {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}

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

  // One `panelOpen` flag drives both layouts; only the panel's geometry and the
  // side of the canvas it eats differ (specs/graph-view.md §6.5).
  const narrow = useMediaQuery(SHELL_NARROW_MEDIA_QUERY);
  const viewportHeight = useViewportHeight();
  const sheetHeight = Math.round(viewportHeight * PANEL_SHEET_HEIGHT_RATIO);

  const { width: panelWidth, onDragHandleMouseDown } = usePaneResize(
    PANEL_INITIAL_WIDTH,
    PANEL_MIN_WIDTH,
    panelResizeOptions,
  );

  // Space the open panel takes away from the canvas: the left side in wide
  // mode, the bottom edge in narrow mode, nothing while it is collapsed.
  const fitViewInset = useMemo(() => {
    if (!panelOpen) return EMPTY_FIT_VIEW_INSET;
    return narrow
      ? { left: 0, bottom: sheetHeight }
      : { left: panelWidth + PANEL_MARGIN, bottom: 0 };
  }, [panelOpen, narrow, sheetHeight, panelWidth]);

  // The collapse/expand morph is paired with an animated recenter, the shell's
  // only other motion. Panel *resizing* deliberately does not recenter — that
  // would make the graph jump around throughout the drag — so the padding is
  // read from a ref instead of being an effect dependency.
  const { fitView } = useReactFlow();
  const fitViewInsetRef = useRef(fitViewInset);
  useEffect(() => {
    fitViewInsetRef.current = fitViewInset;
  }, [fitViewInset]);
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
      padding: buildFitViewPadding(fitViewInsetRef.current),
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
        fitViewInset={fitViewInset}
      />

      {/* DOM sibling of the canvas, never a React Flow <Panel>: canvas
          pan/zoom gestures must not reach the panel (spec §6.2). */}
      <EditorPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        narrow={narrow}
        width={panelWidth}
        sheetHeight={sheetHeight}
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
