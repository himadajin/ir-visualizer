// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGraphData } from "../useGraphData";
import type { GraphData } from "../../types/graph";
import type { SelectionDAGGraphData } from "../../graphBuilder/selectionDAGGraphBuilder";

function twoNodeGraph(labelA = "A", labelB = "B"): GraphData {
  return {
    direction: "TD",
    nodes: [
      { id: "n1", label: labelA, nodeType: "codeNode" },
      { id: "n2", label: labelB, nodeType: "codeNode" },
    ],
    edges: [{ id: "n1-n2", source: "n1", target: "n2" }],
  };
}

function threeNodeGraph(): GraphData {
  return {
    direction: "TD",
    nodes: [
      { id: "n1", label: "A", nodeType: "codeNode" },
      { id: "n2", label: "B", nodeType: "codeNode" },
      { id: "n3", label: "C", nodeType: "codeNode" },
    ],
    edges: [
      { id: "n1-n2", source: "n1", target: "n2" },
      { id: "n2-n3", source: "n2", target: "n3" },
    ],
  };
}

function selectionDAGGraph(): SelectionDAGGraphData {
  return {
    direction: "TD",
    nodes: [
      {
        id: "t0",
        label: "EntryToken",
        nodeType: "selectionDAG-node",
        astData: { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
      },
      {
        id: "t1",
        label: "CopyFromReg",
        nodeType: "selectionDAG-node",
        astData: {
          nodeId: "t1",
          types: ["i32", "ch"],
          opName: "CopyFromReg",
          operands: [{ kind: "node", nodeId: "t0" }],
        },
      },
    ],
    edges: [{ id: "t0-t1", source: "t0", target: "t1" }],
  };
}

describe("useGraphData", () => {
  it("lays out nodes and edges on the first updateGraph call", () => {
    const { result } = renderHook(() => useGraphData());

    act(() => {
      result.current.updateGraph(twoNodeGraph());
    });

    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.edges).toHaveLength(1);
    // Dagre should have assigned real (non-origin) positions.
    const positions = result.current.nodes.map((n) => n.position);
    expect(positions.some((p) => p.x !== 0 || p.y !== 0)).toBe(true);
  });

  it("preserves node positions on a content-only update (same topology)", () => {
    const { result } = renderHook(() => useGraphData());

    act(() => {
      result.current.updateGraph(twoNodeGraph());
    });
    const positionsAfterFirst = result.current.nodes.map((n) => n.position);

    act(() => {
      // Same node/edge ids -> same topology signature, only labels differ.
      result.current.updateGraph(twoNodeGraph("A changed", "B changed"));
    });

    const positionsAfterSecond = result.current.nodes.map((n) => n.position);
    expect(positionsAfterSecond).toEqual(positionsAfterFirst);
    expect(result.current.nodes.map((n) => n.data.label)).toEqual([
      "A changed",
      "B changed",
    ]);
  });

  it("re-runs layout when the topology changes", () => {
    const { result } = renderHook(() => useGraphData());

    act(() => {
      result.current.updateGraph(twoNodeGraph());
    });

    act(() => {
      result.current.updateGraph(threeNodeGraph());
    });

    expect(result.current.nodes).toHaveLength(3);
    expect(result.current.edges).toHaveLength(2);
  });

  it("marks same-source/target edges as backEdge", () => {
    const { result } = renderHook(() => useGraphData());

    act(() => {
      result.current.updateGraph({
        direction: "TD",
        nodes: [{ id: "n1", label: "A", nodeType: "codeNode" }],
        edges: [{ id: "self", source: "n1", target: "n1" }],
      });
    });

    expect(result.current.edges[0].type).toBe("backEdge");
  });

  it("resetLayout re-applies layout to the last graph passed to updateGraph", () => {
    const { result } = renderHook(() => useGraphData());

    act(() => {
      result.current.updateGraph(twoNodeGraph());
    });
    act(() => {
      result.current.setNodes(
        result.current.nodes.map((n) => ({
          ...n,
          position: { x: 999, y: 999 },
        })),
      );
    });
    expect(
      result.current.nodes.every(
        (n) => n.position.x === 999 && n.position.y === 999,
      ),
    ).toBe(true);

    act(() => {
      result.current.resetLayout();
    });

    expect(
      result.current.nodes.some(
        (n) => n.position.x !== 999 || n.position.y !== 999,
      ),
    ).toBe(true);
  });

  it("resetLayout is a no-op when no graph has been set yet", () => {
    const { result } = renderHook(() => useGraphData());

    act(() => {
      result.current.resetLayout();
    });

    expect(result.current.nodes).toHaveLength(0);
    expect(result.current.edges).toHaveLength(0);
  });

  it("updateSelectionDAGGraph lays out SelectionDAG nodes", () => {
    const { result } = renderHook(() => useGraphData());

    act(() => {
      result.current.updateSelectionDAGGraph(selectionDAGGraph());
    });

    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.edges).toHaveLength(1);
  });

  it("updateSelectionDAGGraph preserves positions and edge types on content-only update", () => {
    const { result } = renderHook(() => useGraphData());

    act(() => {
      result.current.updateSelectionDAGGraph(selectionDAGGraph());
    });
    const positionsAfterFirst = result.current.nodes.map((n) => n.position);
    const edgeTypesAfterFirst = result.current.edges.map((e) => e.type);

    act(() => {
      result.current.updateSelectionDAGGraph(selectionDAGGraph());
    });

    expect(result.current.nodes.map((n) => n.position)).toEqual(
      positionsAfterFirst,
    );
    expect(result.current.edges.map((e) => e.type)).toEqual(
      edgeTypesAfterFirst,
    );
  });

  it("resetSelectionDAGLayout re-applies the SelectionDAG layout", () => {
    const { result } = renderHook(() => useGraphData());

    act(() => {
      result.current.updateSelectionDAGGraph(selectionDAGGraph());
    });
    act(() => {
      result.current.setNodes(
        result.current.nodes.map((n) => ({
          ...n,
          position: { x: 42, y: 42 },
        })),
      );
    });

    act(() => {
      result.current.resetSelectionDAGLayout();
    });

    expect(
      result.current.nodes.some(
        (n) => n.position.x !== 42 || n.position.y !== 42,
      ),
    ).toBe(true);
  });
});
