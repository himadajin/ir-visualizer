// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useGraphData } from "../useGraphData";
import { llvmMode, selectionDAGMode } from "../../irModes";
import type { RoutedEdgeData } from "../../components/Graph/RoutedEdge";
import type { GraphData } from "../../types/graph";
import type { IRLayoutBehavior } from "../../irModes/types";
import type { NodeSizeMap } from "../../utils/layout";

function twoNodeGraph(labelA = "A", labelB = "B"): GraphData {
  return {
    direction: "TD",
    nodes: [
      { id: "n1", label: labelA },
      { id: "n2", label: labelB },
    ],
    edges: [{ id: "n1-n2", source: "n1", target: "n2" }],
  };
}

function threeNodeGraph(): GraphData {
  return {
    direction: "TD",
    nodes: [
      { id: "n1", label: "A" },
      { id: "n2", label: "B" },
      { id: "n3", label: "C" },
    ],
    edges: [
      { id: "n1-n2", source: "n1", target: "n2" },
      { id: "n2-n3", source: "n2", target: "n3" },
    ],
  };
}

function selectionDAGGraph(): GraphData {
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

const BOX = { width: 120, height: 40 };
const sizesOf = (graph: GraphData): NodeSizeMap =>
  new Map(graph.nodes.map((node) => [node.id, BOX]));

/**
 * Layout is async (specs/graph-view.md §2): wait for it to land. The elkjs
 * bundle is dynamically imported on first use (`layout.ts`), which under CPU
 * load can take longer than `waitFor`'s default 1000 ms timeout even though
 * the surrounding test's own timeout (vitest's default 5000 ms) would have
 * tolerated it — so this raises `waitFor`'s ceiling to match.
 */
async function waitForNodeCount(
  result: { current: ReturnType<typeof useGraphData> },
  count: number,
) {
  await waitFor(
    () => {
      expect(result.current.nodes).toHaveLength(count);
    },
    { timeout: 4500 },
  );
}

async function layoutGraph(
  result: { current: ReturnType<typeof useGraphData> },
  graph: GraphData,
  mode: IRLayoutBehavior,
) {
  act(() => {
    result.current.updateGraph(graph, mode);
  });
  await waitForNodeCount(result, graph.nodes.length);
  await act(async () => {
    await result.current.applyLayout(sizesOf(graph));
  });
}

describe("useGraphData", () => {
  it("mounts hidden nodes with no edges until measured sizes are applied", async () => {
    const { result } = renderHook(() => useGraphData());
    const graph = twoNodeGraph();

    act(() => {
      result.current.updateGraph(graph, llvmMode);
    });
    await waitForNodeCount(result, 2);

    expect(result.current.layoutPending).toBe(true);
    expect(result.current.edges).toHaveLength(0);
    expect(
      result.current.nodes.every((node) => node.style?.visibility === "hidden"),
    ).toBe(true);

    await act(async () => {
      await result.current.applyLayout(sizesOf(graph));
    });

    expect(result.current.layoutPending).toBe(false);
    expect(result.current.edges).toHaveLength(1);
    expect(
      result.current.nodes.every((node) => node.style?.visibility !== "hidden"),
    ).toBe(true);
  });

  it("lays out nodes and edges once measured sizes are applied", async () => {
    const { result } = renderHook(() => useGraphData());
    await layoutGraph(result, twoNodeGraph(), llvmMode);

    expect(result.current.edges).toHaveLength(1);
    const positions = result.current.nodes.map((n) => n.position);
    expect(positions.some((p) => p.x !== 0 || p.y !== 0)).toBe(true);
  });

  it("ignores applyLayout when the size map does not cover the graph", async () => {
    const { result } = renderHook(() => useGraphData());
    const graph = twoNodeGraph();

    act(() => {
      result.current.updateGraph(graph, llvmMode);
    });
    await waitForNodeCount(result, 2);

    await act(async () => {
      await result.current.applyLayout(new Map([["n1", BOX]]));
    });

    expect(result.current.layoutPending).toBe(true);
    expect(result.current.edges).toHaveLength(0);
  });

  it("preserves node positions and edges' back-edge flags on a content-only update (same topology)", async () => {
    const { result } = renderHook(() => useGraphData());

    await layoutGraph(result, twoNodeGraph(), llvmMode);
    const positionsAfterFirst = result.current.nodes.map((n) => n.position);
    const backEdgeAfterFirst = (result.current.edges[0].data as RoutedEdgeData)
      .isBackEdge;
    expect(backEdgeAfterFirst).toBe(false);

    act(() => {
      // Same node/edge ids -> same topology signature, only labels differ.
      result.current.updateGraph(
        twoNodeGraph("A changed", "B changed"),
        llvmMode,
      );
    });

    const positionsAfterSecond = result.current.nodes.map((n) => n.position);
    expect(positionsAfterSecond).toEqual(positionsAfterFirst);
    expect(result.current.nodes.map((n) => n.data.label)).toEqual([
      "A changed",
      "B changed",
    ]);
    // The rebuilt edge inherits the back-edge flag (specs/graph-view.md §2).
    expect((result.current.edges[0].data as RoutedEdgeData).isBackEdge).toEqual(
      backEdgeAfterFirst,
    );
  });

  it("re-runs layout when the topology changes", async () => {
    const { result } = renderHook(() => useGraphData());

    await layoutGraph(result, twoNodeGraph(), llvmMode);
    await layoutGraph(result, threeNodeGraph(), llvmMode);

    expect(result.current.edges).toHaveLength(2);
  });

  it("applies the last of two overlapping layouts (generation guard)", async () => {
    const { result } = renderHook(() => useGraphData());

    // Two topology-changing updates without waiting: the second must win
    // even if the first resolves later (specs/graph-view.md §2).
    act(() => {
      result.current.updateGraph(twoNodeGraph(), llvmMode);
      result.current.updateGraph(threeNodeGraph(), llvmMode);
    });
    await waitForNodeCount(result, 3);
    await act(async () => {
      await result.current.applyLayout(sizesOf(threeNodeGraph()));
    });

    expect(result.current.edges).toHaveLength(2);
    // The discarded first layout must not land afterwards.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.nodes).toHaveLength(3);
  });

  it("flags same-source/target edges as back edges", async () => {
    const { result } = renderHook(() => useGraphData());
    const graph: GraphData = {
      direction: "TD",
      nodes: [{ id: "n1", label: "A" }],
      edges: [{ id: "self", source: "n1", target: "n1" }],
    };

    await layoutGraph(result, graph, llvmMode);

    expect(result.current.edges[0].type).toBe("routed");
    expect((result.current.edges[0].data as RoutedEdgeData).isBackEdge).toBe(
      true,
    );
  });

  it("applyLayout re-applies layout to the last graph passed to updateGraph", async () => {
    const { result } = renderHook(() => useGraphData());

    await layoutGraph(result, twoNodeGraph(), llvmMode);
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

    await act(async () => {
      await result.current.applyLayout(sizesOf(twoNodeGraph()));
    });

    expect(
      result.current.nodes.some(
        (n) => n.position.x !== 999 || n.position.y !== 999,
      ),
    ).toBe(true);
  });

  it("applyLayout is a no-op when no graph has been set yet", async () => {
    const { result } = renderHook(() => useGraphData());

    await act(async () => {
      await result.current.applyLayout(new Map());
    });

    expect(result.current.nodes).toHaveLength(0);
    expect(result.current.edges).toHaveLength(0);
  });

  it("keeps updateGraph/applyLayout identities stable across graph updates", async () => {
    const { result } = renderHook(() => useGraphData());
    const firstUpdateGraph = result.current.updateGraph;
    const firstApplyLayout = result.current.applyLayout;

    await layoutGraph(result, twoNodeGraph(), llvmMode);
    await layoutGraph(result, threeNodeGraph(), llvmMode);
    act(() => {
      result.current.setNodes(
        result.current.nodes.map((n) => ({ ...n, position: { x: 7, y: 7 } })),
      );
    });

    // Unstable identities re-arm useIRWorkspace's debounced parse effect, which
    // re-parses unchanged code forever (specs/graph-view.md §1–§2).
    expect(result.current.updateGraph).toBe(firstUpdateGraph);
    expect(result.current.applyLayout).toBe(firstApplyLayout);
  });

  it("lays out SelectionDAG nodes via the SelectionDAG mode", async () => {
    const { result } = renderHook(() => useGraphData());

    await layoutGraph(result, selectionDAGGraph(), selectionDAGMode);

    expect(result.current.edges).toHaveLength(1);
  });

  it("preserves positions and edge types on a SelectionDAG content-only update", async () => {
    const { result } = renderHook(() => useGraphData());

    await layoutGraph(result, selectionDAGGraph(), selectionDAGMode);
    const positionsAfterFirst = result.current.nodes.map((n) => n.position);
    const edgeTypesAfterFirst = result.current.edges.map((e) => e.type);

    act(() => {
      result.current.updateGraph(selectionDAGGraph(), selectionDAGMode);
    });

    expect(result.current.nodes.map((n) => n.position)).toEqual(
      positionsAfterFirst,
    );
    expect(result.current.edges.map((e) => e.type)).toEqual(
      edgeTypesAfterFirst,
    );
  });

  it("applyLayout re-applies the SelectionDAG layout", async () => {
    const { result } = renderHook(() => useGraphData());

    await layoutGraph(result, selectionDAGGraph(), selectionDAGMode);
    act(() => {
      result.current.setNodes(
        result.current.nodes.map((n) => ({
          ...n,
          position: { x: 42, y: 42 },
        })),
      );
    });

    await act(async () => {
      await result.current.applyLayout(sizesOf(selectionDAGGraph()));
    });

    expect(
      result.current.nodes.some(
        (n) => n.position.x !== 42 || n.position.y !== 42,
      ),
    ).toBe(true);
  });

  it("does not set parentId while measuring a nested graph", async () => {
    const { result } = renderHook(() => useGraphData());
    const graph: GraphData = {
      direction: "TD",
      nodes: [
        { id: "g", label: "G", nodeType: "graph-group", astData: {} },
        { id: "n1", label: "A", parentId: "g" },
      ],
      edges: [],
    };

    act(() => {
      result.current.updateGraph(graph, llvmMode);
    });
    await waitForNodeCount(result, 2);

    expect(result.current.layoutPending).toBe(true);
    expect(
      result.current.nodes.every((node) => node.parentId === undefined),
    ).toBe(true);

    await act(async () => {
      await result.current.applyLayout(sizesOf(graph));
    });

    expect(result.current.nodes.find((n) => n.id === "n1")?.parentId).toBe("g");
  });

  it("re-runs layout when parent membership changes", async () => {
    const { result } = renderHook(() => useGraphData());
    const nested: GraphData = {
      direction: "TD",
      nodes: [
        { id: "g", label: "G", nodeType: "graph-group", astData: {} },
        { id: "n1", label: "A", parentId: "g" },
        { id: "n2", label: "B" },
      ],
      edges: [],
    };
    await layoutGraph(result, nested, llvmMode);
    expect(result.current.nodes.find((n) => n.id === "n1")?.parentId).toBe("g");

    const flat: GraphData = {
      direction: "TD",
      nodes: [
        { id: "g", label: "G", nodeType: "graph-group", astData: {} },
        { id: "n1", label: "A" },
        { id: "n2", label: "B" },
      ],
      edges: [],
    };
    act(() => {
      result.current.updateGraph(flat, llvmMode);
    });
    await waitForNodeCount(result, 3);
    expect(result.current.layoutPending).toBe(true);
    expect(result.current.edges).toHaveLength(0);
  });

  it("preserves parentId on a content-only update", async () => {
    const { result } = renderHook(() => useGraphData());
    const graph = (label: string): GraphData => ({
      direction: "TD",
      nodes: [
        { id: "g", label: "G", nodeType: "graph-group", astData: {} },
        { id: "n1", label, parentId: "g" },
      ],
      edges: [],
    });
    await layoutGraph(result, graph("A"), llvmMode);
    const parentAfterFirst = result.current.nodes.find(
      (n) => n.id === "n1",
    )?.parentId;

    act(() => {
      result.current.updateGraph(graph("A changed"), llvmMode);
    });

    expect(result.current.layoutPending).toBe(false);
    expect(result.current.nodes.find((n) => n.id === "n1")?.parentId).toBe(
      parentAfterFirst,
    );
    expect(result.current.nodes.find((n) => n.id === "n1")?.data.label).toBe(
      "A changed",
    );
  });

  it("re-runs layout when a container's direction changes", async () => {
    const { result } = renderHook(() => useGraphData());
    const withDir = (direction?: "LR" | "TD"): GraphData => ({
      direction: "TD",
      nodes: [
        {
          id: "g",
          label: "G",
          nodeType: "graph-group",
          astData: direction !== undefined ? { direction } : {},
        },
        { id: "n1", label: "A", parentId: "g" },
        { id: "n2", label: "B", parentId: "g" },
      ],
      edges: [{ id: "n1-n2", source: "n1", target: "n2" }],
    });
    await layoutGraph(result, withDir("TD"), llvmMode);

    act(() => {
      result.current.updateGraph(withDir("LR"), llvmMode);
    });
    await waitForNodeCount(result, 3);
    expect(result.current.layoutPending).toBe(true);
    expect(result.current.edges).toHaveLength(0);
  });
});
