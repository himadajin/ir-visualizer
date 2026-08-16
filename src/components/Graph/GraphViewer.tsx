import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import RoutedEdge from "./RoutedEdge";

import CodeNode from "./CodeNode";
import GraphGroupNode from "./GraphGroupNode";
import { EdgeRoutesProvider } from "../../hooks/useEdgeRoutes";
import { CanvasControls, type FitViewPadding } from "./CanvasControls";
import { IR_MODE_LIST } from "../../irModes";
import {
  SHELL_COLORS,
  buildFitViewPadding,
  type ShellFitViewInset,
} from "../AppShell/shellTokens";
import type { NodeSize, NodeSizeMap } from "../../utils/layout";

const edgeTypes = {
  routed: RoutedEdge,
};

/**
 * Collect measured boxes from React Flow's store. `null` until every node
 * has a positive measured size (specs/graph-view.md §5).
 */
const collectMeasuredSizes = (
  nodeLookup: ReadonlyMap<
    string,
    { id: string; measured: { width?: number; height?: number } }
  >,
  nodeIds: readonly string[],
): NodeSizeMap | null => {
  const sizes = new Map<string, NodeSize>();
  for (const id of nodeIds) {
    const internal = nodeLookup.get(id);
    const width = internal?.measured.width;
    const height = internal?.measured.height;
    if (
      width === undefined ||
      height === undefined ||
      width < 1 ||
      height < 1
    ) {
      return null;
    }
    sizes.set(id, { width, height });
  }
  return sizes;
};

/**
 * Layout is a measure-then-place pass (specs/graph-view.md §5), so the first
 * `nodesInitialized` fires on the hidden measure mount, not on a placed graph.
 * This fits once, when that measured layout has been committed.
 */
const InitialFit = ({
  padding,
  layoutPending,
}: {
  padding: FitViewPadding;
  layoutPending: boolean;
}) => {
  const nodesInitialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const hasFitted = useRef(false);
  useEffect(() => {
    if (!hasFitted.current && nodesInitialized && !layoutPending) {
      hasFitted.current = true;
      void fitView({ padding, duration: 0 });
    }
  }, [nodesInitialized, layoutPending, fitView, padding]);
  return null;
};

/**
 * When a measure pass is pending, wait until every mounted node has a size
 * and hand that map to `applyLayout`. Subscribes to the store because
 * `useNodesInitialized` can still be true from the previous graph when the
 * new measuring nodes mount.
 */
const MeasureAndLayout = ({
  layoutPending,
  nodeIds,
  onApplyLayout,
}: {
  layoutPending: boolean;
  nodeIds: readonly string[];
  onApplyLayout: (sizes: NodeSizeMap) => void | Promise<void>;
}) => {
  const store = useStoreApi();
  const sentKeyRef = useRef<string | null>(null);
  const nodeIdKey = nodeIds.join("\0");

  useEffect(() => {
    if (!layoutPending) {
      sentKeyRef.current = null;
      return;
    }

    const tryApply = () => {
      if (nodeIds.length === 0) {
        if (sentKeyRef.current === "") return;
        sentKeyRef.current = "";
        void onApplyLayout(new Map());
        return;
      }
      const sizes = collectMeasuredSizes(store.getState().nodeLookup, nodeIds);
      if (sizes === null) return;
      const key = [...sizes.entries()]
        .map(
          ([id, size]) => `${id}:${String(size.width)}x${String(size.height)}`,
        )
        .join("|");
      if (sentKeyRef.current === key) return;
      sentKeyRef.current = key;
      void onApplyLayout(sizes);
    };

    tryApply();
    return store.subscribe(tryApply);
  }, [layoutPending, nodeIdKey, nodeIds, onApplyLayout, store]);

  return null;
};

// codeNode is the mode-agnostic fallback (used when a GraphNode has no
// nodeType); graphGroup is the generic container. Every other renderer
// comes from the IR mode registry, so this component never needs to know
// about a specific IR.
const nodeTypes = IR_MODE_LIST.reduce(
  (acc, mode) => ({ ...acc, ...mode.nodeTypes }),
  { codeNode: CodeNode, graphGroup: GraphGroupNode },
);

interface GraphViewerProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  /**
   * Run ELK against the given measured sizes and commit positions
   * (`specs/graph-view.md` §5). Used both when the measure pass completes
   * and by Reset Layout.
   */
  onApplyLayout: (sizes: NodeSizeMap) => Promise<void> | void;
  /** True while hidden origin nodes are mounted for measurement. */
  layoutPending: boolean;
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
  onApplyLayout,
  layoutPending,
  fitViewInset,
}) => {
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const store = useStoreApi();
  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);

  const fitViewPadding: FitViewPadding = useMemo(
    () => buildFitViewPadding(fitViewInset),
    [fitViewInset],
  );

  const handleResetLayout = () => {
    const sizes = collectMeasuredSizes(
      store.getState().nodeLookup,
      nodes.map((node) => node.id),
    );
    if (sizes === null) return;
    void Promise.resolve(onApplyLayout(sizes)).then(() => {
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
      {/* The routing pass (specs/graph-view.md §4) must wrap `<ReactFlow>`:
          React Flow renders its own children *beside* the edge renderer, so a
          provider mounted inside it would never reach a `RoutedEdge`. It reads
          the store from the app-level `ReactFlowProvider` in `main.tsx` — the
          same store this `<ReactFlow>` populates. */}
      <EdgeRoutesProvider>
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
          <InitialFit padding={fitViewPadding} layoutPending={layoutPending} />
          <MeasureAndLayout
            layoutPending={layoutPending}
            nodeIds={nodeIds}
            onApplyLayout={onApplyLayout}
          />
          <Background color={SHELL_COLORS.groundDots} />
          <CanvasControls
            fitViewPadding={fitViewPadding}
            bottomInset={fitViewInset.bottom}
            onResetLayout={handleResetLayout}
          />
        </ReactFlow>
      </EdgeRoutesProvider>
    </div>
  );
};
