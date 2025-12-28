import { useState, useCallback } from 'react';
import { type Node, type Edge, useNodesState, useEdgesState } from '@xyflow/react';
import type { MermaidGraph } from '../parser/parser';
import { getLayoutedElements } from '../utils/layout';
import { createReactFlowNode, createReactFlowEdge } from '../utils/converter';

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

    const [currentGraph, setCurrentGraph] = useState<MermaidGraph | null>(null);

    const updateGraph = useCallback((graph: MermaidGraph) => {
        setCurrentGraph(graph);
        const signature = getTopologySignature(graph);

        // Check if topology changed
        const isTopologyEqual = signature === lastSignature;

        if (isTopologyEqual) {
            // Content-only update: preserve positions
            setNodes((currentNodes) => {
                // Map current positions
                const positionMap = new Map(currentNodes.map(n => [n.id, n.position]));

                return graph.nodes.map(node => {
                    const existingPos = positionMap.get(node.id) || { x: 0, y: 0 };
                    return createReactFlowNode(node, existingPos);
                });
            });

            setEdges(graph.edges.map(createReactFlowEdge));

        } else {
            // Topology changed or first run: Re-layout
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(graph);
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            setLastSignature(signature);
        }
    }, [lastSignature, setNodes, setEdges]);

    const resetLayout = useCallback(() => {
        if (!currentGraph) return;
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(currentGraph);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    }, [currentGraph, setNodes, setEdges]);

    return {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        setNodes, // expose in case we need manual override
        setEdges,
        updateGraph,
        resetLayout
    };
};

