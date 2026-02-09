import { describe, it, expect } from "vitest";
import { convertASTToGraph } from "../mermaidGraphBuilder";
import type { MermaidAST } from "../../ast/mermaidAST";

describe("Mermaid convertASTToGraph", () => {
  it("should convert a simple AST to GraphData", () => {
    const ast: MermaidAST = {
      direction: "TD",
      nodes: [
        { id: "A", label: "Node A" },
        { id: "B", label: "Node B" },
      ],
      edges: [{ sourceId: "A", targetId: "B", edgeType: "arrow" }],
    };

    const graph = convertASTToGraph(ast);

    expect(graph.direction).toBe("TD");
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);

    // Check node properties
    expect(graph.nodes[0].id).toBe("A");
    expect(graph.nodes[0].label).toBe("Node A");
    expect(graph.nodes[0].language).toBe("mermaid");
    expect(graph.nodes[0].nodeType).toBe("mermaid-node");

    expect(graph.nodes[1].id).toBe("B");
    expect(graph.nodes[1].label).toBe("Node B");

    // Check edge properties
    expect(graph.edges[0].source).toBe("A");
    expect(graph.edges[0].target).toBe("B");
    expect(graph.edges[0].id).toBe("e0-A-B");
  });

  it("should use node id as label when label is empty", () => {
    const ast: MermaidAST = {
      direction: "LR",
      nodes: [{ id: "X", label: "" }],
      edges: [],
    };

    const graph = convertASTToGraph(ast);
    expect(graph.nodes[0].label).toBe("X");
  });

  it("should map node shapes to graph types", () => {
    const ast: MermaidAST = {
      direction: "TD",
      nodes: [
        { id: "A", label: "A", shape: "square" },
        { id: "B", label: "B", shape: "round" },
        { id: "C", label: "C", shape: "curly" },
        { id: "D", label: "D" }, // no shape
      ],
      edges: [],
    };

    const graph = convertASTToGraph(ast);

    expect(graph.nodes[0].type).toBe("square");
    expect(graph.nodes[1].type).toBe("round");
    expect(graph.nodes[2].type).toBe("curly");
    expect(graph.nodes[3].type).toBeUndefined();
  });

  it("should generate unique edge IDs", () => {
    const ast: MermaidAST = {
      direction: "TD",
      nodes: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
        { id: "C", label: "C" },
      ],
      edges: [
        { sourceId: "A", targetId: "B" },
        { sourceId: "B", targetId: "C" },
        { sourceId: "A", targetId: "C" },
      ],
    };

    const graph = convertASTToGraph(ast);
    const edgeIds = graph.edges.map((e) => e.id);
    const uniqueIds = new Set(edgeIds);
    expect(uniqueIds.size).toBe(edgeIds.length);
  });

  it("should preserve edge labels", () => {
    const ast: MermaidAST = {
      direction: "TD",
      nodes: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      edges: [
        { sourceId: "A", targetId: "B", label: "Yes", edgeType: "arrow" },
      ],
    };

    const graph = convertASTToGraph(ast);
    expect(graph.edges[0].label).toBe("Yes");
  });

  it("should handle empty AST", () => {
    const ast: MermaidAST = {
      direction: "TD",
      nodes: [],
      edges: [],
    };

    const graph = convertASTToGraph(ast);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it("should include astData on nodes", () => {
    const ast: MermaidAST = {
      direction: "TD",
      nodes: [{ id: "A", label: "Test", shape: "square" }],
      edges: [],
    };

    const graph = convertASTToGraph(ast);
    expect(graph.nodes[0].astData).toBeDefined();
    expect(graph.nodes[0].astData?.id).toBe("A");
  });
});
