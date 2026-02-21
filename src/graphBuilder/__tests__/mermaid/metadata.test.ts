import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../mermaidGraphBuilder";

describe("mermaid graphBuilder", () => {
  describe("metadata", () => {
    it("when nodes are converted, should include astData from AST node", () => {
      const graph = convertASTToGraph({
        direction: "TD",
        nodes: [{ id: "A", label: "Test", shape: "square" }],
        edges: [],
      });

      expect(graph.nodes[0].astData).toBeDefined();
      expect((graph.nodes[0].astData as { id?: string }).id).toBe("A");
      expect((graph.nodes[0].astData as { shape?: string }).shape).toBe(
        "square",
      );
    });
  });
});
