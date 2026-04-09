import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../mermaidGraphBuilder";

describe("mermaid graphBuilder", () => {
  describe("edges", () => {
    it("when edges are converted, should map source and target correctly", () => {
      const graph = convertASTToGraph({
        direction: "TD",
        nodes: [
          { id: "A", label: "A" },
          { id: "B", label: "B" },
        ],
        edges: [{ sourceId: "A", targetId: "B" }],
      });

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].source).toBe("A");
      expect(graph.edges[0].target).toBe("B");
    });

    it("when edge labels exist, should preserve labels", () => {
      const graph = convertASTToGraph({
        direction: "TD",
        nodes: [
          { id: "A", label: "A" },
          { id: "B", label: "B" },
        ],
        edges: [
          { sourceId: "A", targetId: "B", label: "Yes", edgeType: "arrow" },
        ],
      });

      expect(graph.edges[0].label).toBe("Yes");
    });
  });
});
