import React, { useMemo, useState, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createHighlighter, type Highlighter } from "shiki";

import type { NodeDef } from "./types";
import { styles } from "./types";

// ─── Shiki highlighter (singleton) ───────────────────────────────────────

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light"],
      langs: ["json"],
    });
  }
  return highlighterPromise;
};

// ─── JsonPane ────────────────────────────────────────────────────────────

interface JsonPaneProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

function JsonPane({ data }: JsonPaneProps) {
  const json = useMemo(() => JSON.stringify(data, null, 2), [data]);
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    getHighlighter()
      .then((highlighter) => {
        setHtml(
          highlighter.codeToHtml(json, { lang: "json", theme: "github-light" }),
        );
      })
      .catch(() => setHtml(""));
  }, [json]);

  return (
    <div style={styles.jsonPane}>
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre style={styles.jsonPre}>{json}</pre>
      )}
    </div>
  );
}

// ─── GraphPane ───────────────────────────────────────────────────────────

interface GraphPaneProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeTypes: Record<string, React.ComponentType<any>>;
}

function GraphPane({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  nodeTypes,
}: GraphPaneProps) {
  return (
    <div style={styles.graphPane}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
        />
      </ReactFlowProvider>
    </div>
  );
}

// ─── NodePreview ─────────────────────────────────────────────────────────

interface NodePreviewProps extends NodeDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeTypes: Record<string, React.ComponentType<any>>;
}

export function NodePreview({
  title,
  nodeType,
  astData,
  nodeTypes,
}: NodePreviewProps) {
  const initialNodes: Node[] = useMemo(
    () => [
      {
        id: "preview-node",
        type: nodeType,
        position: { x: 0, y: 0 },
        data: { astData },
      },
    ],
    [nodeType, astData],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState<Edge>([]);

  return (
    <div style={styles.previewContainer}>
      <h3 style={styles.previewTitle}>{title}</h3>
      <div style={styles.previewBody}>
        <JsonPane data={astData} />
        <GraphPane
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
        />
      </div>
    </div>
  );
}
