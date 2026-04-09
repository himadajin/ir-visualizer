import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../mermaidGraphBuilder";
import { expectUniqueIds } from "../helpers/assertGraph";

const COVERAGE_CHECKPOINTS = [
  "direction",
  "empty-input",
  "edge-id-uniqueness",
] as const;

describe("mermaid graphBuilder", () => {
  describe("invariants", () => {
    it("when invariants are tracked, should keep a non-empty checkpoint list", () => {
      expect(COVERAGE_CHECKPOINTS.length).toBeGreaterThan(0);
    });

    it("when AST has no nodes and edges, should return empty graph", () => {
      const graph = convertASTToGraph({
        direction: "TD",
        nodes: [],
        edges: [],
      });

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });

    it("when AST direction is set, should preserve direction", () => {
      const graph = convertASTToGraph({
        direction: "LR",
        nodes: [{ id: "A", label: "A" }],
        edges: [],
      });

      expect(graph.direction).toBe("LR");
    });

    it("when multiple edges share endpoints, should still generate unique edge IDs", () => {
      const graph = convertASTToGraph({
        direction: "TD",
        nodes: [
          { id: "A", label: "A" },
          { id: "B", label: "B" },
        ],
        edges: [
          { sourceId: "A", targetId: "B" },
          { sourceId: "A", targetId: "B" },
          { sourceId: "A", targetId: "B" },
        ],
      });

      expectUniqueIds(graph.edges);
      expect(graph.edges.map((edge) => edge.id)).toEqual([
        "e0-A-B",
        "e1-A-B",
        "e2-A-B",
      ]);
    });
  });
});
