import React, { useState } from 'react';
import { ReactFlow, Controls, Background, Panel, type Node, type Edge, type OnNodesChange, type OnEdgesChange, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomBezierEdge from './CustomBezierEdge';

import CodeNode from './CodeNode';

const edgeTypes = {
    customBezier: CustomBezierEdge,
};

const nodeTypes = {
    codeNode: CodeNode,
};

interface GraphViewerProps {
    nodes: Node[];
    edges: Edge[];
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
    onResetLayout: () => void;
}

export const GraphViewer: React.FC<GraphViewerProps> = ({
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onResetLayout,
}) => {
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

    const handleResetLayout = () => {
        onResetLayout();
        // Slight delay to allow nodes to update position before fitting view
        setTimeout(() => {
            if (rfInstance) {
                rfInstance.fitView({ duration: 0 });
            }
        }, 50);
    };

    return (
        <div style={{ width: '100%', height: '100%' }}>
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
            >
                <Background />
                <Controls />
                <Panel position="top-right">
                    <button
                        onClick={handleResetLayout}
                        style={{
                            padding: '8px 12px',
                            background: 'white',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        }}
                    >
                        Reset Layout
                    </button>
                </Panel>
            </ReactFlow>
        </div>
    );
};
