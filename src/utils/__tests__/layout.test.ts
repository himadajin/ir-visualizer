import { describe, it, expect } from "vitest";
import { getLayoutedElements, sizesCoverGraph, toElkSize } from "../layout";
import type { RoutedEdgeData } from "../../components/Graph/RoutedEdge";
import type { GraphData } from "../../types/graph";
import { BACK_EDGE_COLOR } from "../converter";

const BOX = { width: 120, height: 40 };
const sizesOf = (graph: GraphData) =>
  new Map(graph.nodes.map((node) => [node.id, BOX]));

const layout = (
  graph: GraphData,
  options?: Parameters<typeof getLayoutedElements>[2],
) => getLayoutedElements(graph, sizesOf(graph), options);

describe("getLayoutedElements", () => {
  it("should layout a simple graph with positions and no stored edge geometry", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const { nodes, edges } = await layout(graph);

    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);

    // Every node should have a position
    for (const node of nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }

    // The edge is routed, but layout attaches only the structural back-edge
    // flag — no geometry (specs/graph-view.md §3): edge routing is computed
    // at render time from live node rects (src/utils/edgeRouter.ts), not by
    // layout.ts.
    const data = edges[0].data as RoutedEdgeData;
    expect(edges[0].type).toBe("routed");
    expect(data.isBackEdge).toBe(false);
    expect(data).not.toHaveProperty("route");
  });

  it("should respect direction option", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const tdResult = await layout(graph, { direction: "TD" });
    const lrResult = await layout(graph, { direction: "LR" });

    // In TD: A should be above B (lower y)
    const tdA = tdResult.nodes.find((n) => n.id === "A")!;
    const tdB = tdResult.nodes.find((n) => n.id === "B")!;
    expect(tdA.position.y).toBeLessThan(tdB.position.y);

    // In LR: A should be to the left of B (lower x)
    const lrA = lrResult.nodes.find((n) => n.id === "A")!;
    const lrB = lrResult.nodes.find((n) => n.id === "B")!;
    expect(lrA.position.x).toBeLessThan(lrB.position.x);
  });

  it("should flag backward edges as back edges and style them", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "B", target: "A" }, // back edge
      ],
    };

    const { edges } = await layout(graph);

    // In a pure 2-cycle either edge may be the one ELK reverses; exactly one
    // of them must come out flagged, and the flagged one carries the accent.
    expect(edges.map((e) => e.type)).toEqual(["routed", "routed"]);
    const flagged = edges.filter(
      (e) => (e.data as RoutedEdgeData).isBackEdge === true,
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0].style?.stroke).toBe(BACK_EDGE_COLOR);
  });

  it("should flag self-loops as back edges", async () => {
    const graph: GraphData = {
      nodes: [{ id: "A", label: "A", language: "mermaid" }],
      edges: [{ id: "e1", source: "A", target: "A" }],
    };

    const { edges } = await layout(graph);
    expect(edges[0].type).toBe("routed");
    expect((edges[0].data as RoutedEdgeData).isBackEdge).toBe(true);
  });

  it("should handle a graph with no edges", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [],
    };

    const { nodes, edges } = await layout(graph);

    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(0);
  });

  it("should handle complex graph without overlapping nodes", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
        { id: "C", label: "C", language: "mermaid" },
        { id: "D", label: "D", language: "mermaid" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "A", target: "C" },
        { id: "e3", source: "B", target: "D" },
        { id: "e4", source: "C", target: "D" },
      ],
    };

    const { nodes } = await layout(graph);

    // Check that no two nodes have the exact same position
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const samePos =
          nodes[i].position.x === nodes[j].position.x &&
          nodes[i].position.y === nodes[j].position.y;
        expect(samePos).toBe(false);
      }
    }
  });

  it("routes use-def edges to the target's operand port", async () => {
    const text = "%2 = add i32 %1, %0";
    const graph: GraphData = {
      nodes: [
        {
          id: "def1",
          label: "%1 = add i32 %0, 45",
          nodeType: "llvm-useDefInstruction",
          astData: {
            text: "%1 = add i32 %0, 45",
            def: "1",
            uses: ["0"],
            isTerminator: false,
            blockLabel: "entry",
            blockIndex: 0,
          },
        },
        {
          id: "use1",
          label: text,
          nodeType: "llvm-useDefInstruction",
          astData: {
            text,
            def: "2",
            uses: ["1", "0"],
            isTerminator: false,
            blockLabel: "entry",
            blockIndex: 0,
          },
        },
      ],
      edges: [
        {
          id: "e-def1-use1-1",
          source: "def1",
          target: "use1",
          sourceHandle: "def",
          targetHandle: "u-1",
        },
      ],
    };

    const { edges } = await layout(graph);

    // ELK's FIXED_POS operand port determines which handle the edge attaches
    // to; the router (src/utils/edgeRouter.ts) is what routes between the
    // live handle positions, not layout.ts.
    expect(edges[0].targetHandle).toBe("u-1");
    expect(edges[0].sourceHandle).toBe("def");
  });

  it("places from the given sizes, not from an estimate", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const narrow = await getLayoutedElements(
      graph,
      new Map([
        ["A", { width: 80, height: 40 }],
        ["B", { width: 80, height: 40 }],
      ]),
      { direction: "LR" },
    );
    const wide = await getLayoutedElements(
      graph,
      new Map([
        ["A", { width: 400, height: 40 }],
        ["B", { width: 80, height: 40 }],
      ]),
      { direction: "LR" },
    );

    const narrowA = narrow.nodes.find((node) => node.id === "A")!;
    const narrowB = narrow.nodes.find((node) => node.id === "B")!;
    const wideA = wide.nodes.find((node) => node.id === "A")!;
    const wideB = wide.nodes.find((node) => node.id === "B")!;
    expect(wideB.position.x - wideA.position.x).toBeGreaterThan(
      narrowB.position.x - narrowA.position.x,
    );
  });

  it("quantizes sizes onto the router's integer lattice", () => {
    expect(toElkSize({ width: 100.4, height: 40.6 })).toEqual({
      width: 100,
      height: 41,
    });
  });

  it("rejects a size map that does not cover the graph", () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      edges: [],
    };
    expect(sizesCoverGraph(graph, new Map([["A", BOX]]))).toBe(false);
    expect(sizesCoverGraph(graph, sizesOf(graph))).toBe(true);
    expect(
      sizesCoverGraph(
        graph,
        new Map([
          ["A", BOX],
          ["B", { width: 0.4, height: 40 }],
        ]),
      ),
    ).toBe(false);
  });
});
