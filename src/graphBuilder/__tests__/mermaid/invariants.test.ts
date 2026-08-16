import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../mermaidGraphBuilder";
import { expectUniqueIds } from "../helpers/assertGraph";
import type { MermaidAST } from "../../../ast/mermaidAST";

const COVERAGE_CHECKPOINTS = [
  "direction",
  "empty-input",
  "edge-id-uniqueness",
] as const;

const ast = (
  override: Partial<MermaidAST> &
    Pick<MermaidAST, "direction" | "nodes" | "edges">,
): MermaidAST => ({
  subgraphs: [],
  ...override,
});

describe("mermaid graphBuilder", () => {
  describe("invariants", () => {
    it("when invariants are tracked, should keep a non-empty checkpoint list", () => {
      expect(COVERAGE_CHECKPOINTS.length).toBeGreaterThan(0);
    });

    it("when AST has no nodes and edges, should return empty graph", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TD",
          nodes: [],
          edges: [],
        }),
      );

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });

    it("when AST direction is set, should preserve direction", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "LR",
          nodes: [{ id: "A", label: "A" }],
          edges: [],
        }),
      );

      expect(graph.direction).toBe("LR");
    });

    it("when multiple edges share endpoints, should still generate unique edge IDs", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TD",
          nodes: [
            { id: "A", label: "A" },
            { id: "B", label: "B" },
          ],
          edges: [
            {
              sourceId: "A",
              targetId: "B",
              stroke: "normal",
              arrowhead: "arrow_point",
            },
            {
              sourceId: "A",
              targetId: "B",
              stroke: "normal",
              arrowhead: "arrow_point",
            },
            {
              sourceId: "A",
              targetId: "B",
              stroke: "normal",
              arrowhead: "arrow_point",
            },
          ],
        }),
      );

      expectUniqueIds(graph.edges);
      expect(graph.edges.map((edge) => edge.id)).toEqual([
        "e0-A-B",
        "e1-A-B",
        "e2-A-B",
      ]);
    });
  });
});
