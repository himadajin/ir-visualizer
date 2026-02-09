import { describe, it, expect } from "vitest";
import { getLayoutedElements } from "../layout";
import type { GraphData } from "../../types/graph";

describe("getLayoutedElements", () => {
  it("should layout a simple graph with positions", () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const { nodes, edges } = getLayoutedElements(graph);

    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);

    // Every node should have a position
    for (const node of nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }
  });

  it("should respect direction option", () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const tdResult = getLayoutedElements(graph, { direction: "TD" });
    const lrResult = getLayoutedElements(graph, { direction: "LR" });

    // In TD: A should be above B (lower y)
    const tdA = tdResult.nodes.find((n) => n.id === "A")!;
    const tdB = tdResult.nodes.find((n) => n.id === "B")!;
    expect(tdA.position.y).toBeLessThan(tdB.position.y);

    // In LR: A should be to the left of B (lower x)
    const lrA = lrResult.nodes.find((n) => n.id === "A")!;
    const lrB = lrResult.nodes.find((n) => n.id === "B")!;
    expect(lrA.position.x).toBeLessThan(lrB.position.x);
  });

  it("should assign back edge type for backward edges", () => {
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

    const { edges } = getLayoutedElements(graph);

    const forwardEdge = edges.find((e) => e.id === "e1");
    const backEdge = edges.find((e) => e.id === "e2");

    expect(forwardEdge?.type).toBe("customBezier");
    expect(backEdge?.type).toBe("backEdge");
  });

  it("should assign back edge type for self-loops", () => {
    const graph: GraphData = {
      nodes: [{ id: "A", label: "A", language: "mermaid" }],
      edges: [{ id: "e1", source: "A", target: "A" }],
    };

    const { edges } = getLayoutedElements(graph);
    expect(edges[0].type).toBe("backEdge");
  });

  it("should handle a graph with no edges", () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [],
    };

    const { nodes, edges } = getLayoutedElements(graph);

    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(0);
  });

  it("should handle complex graph without overlapping nodes", () => {
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

    const { nodes } = getLayoutedElements(graph);

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
});
