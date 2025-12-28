import React from 'react';
import { ReactFlow, Controls, Background, type Node, type Edge, type OnNodesChange, type OnEdgesChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomBezierEdge from './CustomBezierEdge';

const edgeTypes = {
    customBezier: CustomBezierEdge,
};

interface GraphViewerProps {
    nodes: Node[];
    edges: Edge[];
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
}

export const GraphViewer: React.FC<GraphViewerProps> = ({ nodes, edges, onNodesChange, onEdgesChange }) => {
    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                edgeTypes={edgeTypes}
                nodesDraggable={true}
                panActivationKeyCode={null}
                fitView
            >
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
};
