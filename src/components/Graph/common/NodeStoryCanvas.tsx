import type { ComponentType } from "react";
import { ReactFlow, ReactFlowProvider, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface NodeStoryCanvasProps {
  nodeType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  astData: Record<string, any>;
  component: ComponentType<NodeProps>;
  width?: number;
  height?: number;
}

/**
 * Renders a single graph node component inside a minimal, non-interactive
 * ReactFlow canvas. Node components expect NodeProps (Handles need the
 * ReactFlow store), so they can't be rendered standalone in a story.
 */
export function NodeStoryCanvas({
  nodeType,
  astData,
  component,
  width = 420,
  height = 240,
}: NodeStoryCanvasProps) {
  const nodes = [
    {
      id: "preview",
      type: nodeType,
      position: { x: 0, y: 0 },
      data: { astData },
    },
  ];

  return (
    <div style={{ width, height }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={{ [nodeType]: component }}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          panOnDrag={false}
          zoomOnScroll={false}
          nodesDraggable={false}
          proOptions={{ hideAttribution: true }}
        />
      </ReactFlowProvider>
    </div>
  );
}
