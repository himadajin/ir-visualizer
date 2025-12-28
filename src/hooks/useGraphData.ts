import { useState, useCallback } from 'react';
import { type Node, type Edge, useNodesState, useEdgesState } from '@xyflow/react';
import type { MermaidGraph } from '../parser/parser';
import { getLayoutedElements } from '../utils/layout';

// Helper to generate a topology signature
const getTopologySignature = (graph: MermaidGraph) => {
    const nodeIds = graph.nodes.map(n => n.id).sort().join(',');
    const edgeIds = graph.edges.map(e => `${e.source}-${e.target}`).sort().join(',');
    return `${graph.direction}|${nodeIds}|${edgeIds}`;
};

export const useGraphData = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [lastSignature, setLastSignature] = useState<string>('');

    const updateGraph = useCallback((graph: MermaidGraph) => {
        const signature = getTopologySignature(graph);

        // Check if topology changed
        const isTopologyEqual = signature === lastSignature;

        if (isTopologyEqual) {
            // Content-only update: preserve positions
            setNodes((currentNodes) => {
                // Map current positions
                const positionMap = new Map(currentNodes.map(n => [n.id, n.position]));

                // Create new nodes but use old positions
                // We re-calculate width based on new label to ensure it fits, 
                // but we don't move it. 
                // Note: layout.ts uses simple estimation. We duplicate that logic simplify here or reuse it?
                // Ideally we reuse getLayoutedElements but just take the data.
                // However, getLayoutedElements does layout. 
                // Let's just map manually for now.

                return graph.nodes.map(node => {
                    const existingPos = positionMap.get(node.id) || { x: 0, y: 0 };
                    const width = Math.max(150, (node.label?.length || 0) * 10 + 20);
                    return {
                        id: node.id,
                        position: existingPos,
                        data: { label: node.label, shape: node.type },
                        type: 'default',
                        style: { width, height: 50 },
                    };
                });
            });

            setEdges(graph.edges.map(edge => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                label: edge.label,
                animated: false,
                type: 'smoothstep',
            })));

        } else {
            // Topology changed or first run: Re-layout
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(graph);
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            setLastSignature(signature);
        }
    }, [lastSignature, setNodes, setEdges]); // lastSignature in deps ensures we compare against current state

    return {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        setNodes, // expose in case we need manual override
        setEdges,
        updateGraph
    };
};
