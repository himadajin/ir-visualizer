import { describe, it, expect } from "vitest";
import { getLayoutedElements } from "../layout";
import type { RoutedEdgeData } from "../../components/Graph/RoutedEdge";
import type { GraphData } from "../../types/graph";
import { BACK_EDGE_COLOR } from "../converter";

describe("getLayoutedElements", () => {
  it("should layout a simple graph with positions and routes", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const { nodes, edges } = await getLayoutedElements(graph);

    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);

    // Every node should have a position
    for (const node of nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }

    // The edge is routed and carries its ELK route and endpoint positions.
    const data = edges[0].data as RoutedEdgeData;
    expect(edges[0].type).toBe("routed");
    expect(data.isBackEdge).toBe(false);
    expect(data.route).toBeDefined();
    expect(data.route!.points.length).toBeGreaterThanOrEqual(2);
    const a = nodes.find((n) => n.id === "A")!;
    const b = nodes.find((n) => n.id === "B")!;
    expect(data.route!.sourcePos).toEqual(a.position);
    expect(data.route!.targetPos).toEqual(b.position);
  });

  it("should respect direction option", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const tdResult = await getLayoutedElements(graph, { direction: "TD" });
    const lrResult = await getLayoutedElements(graph, { direction: "LR" });

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

    const { edges } = await getLayoutedElements(graph);

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

    const { edges } = await getLayoutedElements(graph);
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

    const { nodes, edges } = await getLayoutedElements(graph);

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

    const { nodes } = await getLayoutedElements(graph);

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

    const { nodes, edges } = await getLayoutedElements(graph);

    // The routed endpoint lands inside the target node's horizontal span at
    // its top edge (the operand port), not at the node's center-less default.
    const data = edges[0].data as RoutedEdgeData;
    const target = nodes.find((n) => n.id === "use1")!;
    const end = data.route!.points[data.route!.points.length - 1];
    const width = (target.style as { width: number }).width;
    expect(end.x).toBeGreaterThanOrEqual(target.position.x);
    expect(end.x).toBeLessThanOrEqual(target.position.x + width);
    expect(edges[0].targetHandle).toBe("u-1");
    expect(edges[0].sourceHandle).toBe("def");
  });
});
