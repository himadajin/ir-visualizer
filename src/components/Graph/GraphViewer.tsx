import React, { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import CustomBezierEdge from "./CustomBezierEdge";
import BackEdge from "./BackEdge";

import CodeNode from "./CodeNode";
import { CanvasControls, type FitViewPadding } from "./CanvasControls";
import { IR_MODE_LIST } from "../../irModes";
import { SHELL_COLORS, buildFitViewPadding } from "../AppShell/shellTokens";

const edgeTypes = {
  customBezier: CustomBezierEdge,
  backEdge: BackEdge,
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
  onResetLayout: () => void;
  /**
   * Horizontal space (px) the floating editor panel takes up on the left —
   * its width plus its viewport margin, or 0 while it is collapsed. Every fit
   * (initial, the Fit view button, the re-fit after Reset Layout) keeps the
   * graph clear of it. See `specs/graph-view.md` §6.4.
   */
  fitViewPaddingLeft: number;
}

export const GraphViewer: React.FC<GraphViewerProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onResetLayout,
  fitViewPaddingLeft,
}) => {
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const fitViewPadding: FitViewPadding = useMemo(
    () => buildFitViewPadding(fitViewPaddingLeft),
    [fitViewPaddingLeft],
  );

  const fitViewOptions = useMemo(
    () => ({ padding: fitViewPadding }),
    [fitViewPadding],
  );

  const handleResetLayout = () => {
    onResetLayout();
    // Slight delay to allow nodes to update position before fitting view
    setTimeout(() => {
      if (rfInstance) {
        void rfInstance.fitView({ padding: fitViewPadding, duration: 0 });
      }
    }, 50);
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
        fitView
        fitViewOptions={fitViewOptions}
      >
        <Background color={SHELL_COLORS.groundDots} />
        <CanvasControls
          fitViewPadding={fitViewPadding}
          onResetLayout={handleResetLayout}
        />
      </ReactFlow>
    </div>
  );
};
