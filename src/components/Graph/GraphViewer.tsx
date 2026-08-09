import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import RoutedEdge from "./RoutedEdge";

import CodeNode from "./CodeNode";
import { CanvasControls, type FitViewPadding } from "./CanvasControls";
import { IR_MODE_LIST } from "../../irModes";
import {
  SHELL_COLORS,
  buildFitViewPadding,
  type ShellFitViewInset,
} from "../AppShell/shellTokens";

const edgeTypes = {
  routed: RoutedEdge,
};

/**
 * Layout is async (specs/graph-view.md §2), so the first render has zero
 * nodes and React Flow's `fitView` prop would fire on nothing. This fits
 * once, when the first layout's nodes have been measured (§6.4).
 */
const InitialFit = ({ padding }: { padding: FitViewPadding }) => {
  const nodesInitialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const hasFitted = useRef(false);
  useEffect(() => {
    if (!hasFitted.current && nodesInitialized) {
      hasFitted.current = true;
      void fitView({ padding, duration: 0 });
    }
  }, [nodesInitialized, fitView, padding]);
  return null;
};

// codeNode is the mode-agnostic fallback (used when a GraphNode has no
// nodeType); every other renderer comes from the IR mode registry, so this
// component never needs to know about a specific IR.
const nodeTypes = IR_MODE_LIST.reduce(
  (acc, mode) => ({ ...acc, ...mode.nodeTypes }),
  { codeNode: CodeNode },
);

interface GraphViewerProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  /** Re-runs the (async) layout; resolves when positions have been applied. */
  onResetLayout: () => Promise<void> | void;
  /**
   * Space (px) the floating editor panel takes up along the viewport edge it
   * is anchored to — its width plus its margin on the left in wide mode, its
   * height at the bottom in narrow mode, and nothing while it is collapsed.
   * Every fit (initial, the Fit view button, the re-fit after Reset Layout)
   * keeps the graph clear of it. See `specs/graph-view.md` §6.4/§6.5.
   */
  fitViewInset: ShellFitViewInset;
}

export const GraphViewer: React.FC<GraphViewerProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onResetLayout,
  fitViewInset,
}) => {
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const fitViewPadding: FitViewPadding = useMemo(
    () => buildFitViewPadding(fitViewInset),
    [fitViewInset],
  );

  const handleResetLayout = () => {
    void Promise.resolve(onResetLayout()).then(() => {
      // Slight delay to allow nodes to update position before fitting view
      setTimeout(() => {
        if (rfInstance) {
          void rfInstance.fitView({ padding: fitViewPadding, duration: 0 });
        }
      }, 50);
    });
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: SHELL_COLORS.ground,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={setRfInstance}
        edgeTypes={edgeTypes}
        nodeTypes={nodeTypes}
        nodesDraggable={true}
        panActivationKeyCode={null}
        // React Flow's default minZoom (0.5) clamps fitView before large
        // graphs — or the narrow-mode visible strip — can fit; 0.1 lets every
        // fit actually contain the graph (specs/graph-view.md §6.1).
        minZoom={0.1}
      >
        <InitialFit padding={fitViewPadding} />
        <Background color={SHELL_COLORS.groundDots} />
        <CanvasControls
          fitViewPadding={fitViewPadding}
          bottomInset={fitViewInset.bottom}
          onResetLayout={handleResetLayout}
        />
      </ReactFlow>
    </div>
  );
};
