import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../mermaidGraphBuilder";
import type { MermaidAST } from "../../../ast/mermaidAST";

const ast = (
  override: Partial<MermaidAST> &
    Pick<MermaidAST, "direction" | "nodes" | "edges">,
): MermaidAST => ({
  subgraphs: [],
  ...override,
});

describe("mermaid graphBuilder", () => {
  describe("edges", () => {
    it("when edges are converted, should map source and target correctly", () => {
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
          ],
        }),
      );

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].source).toBe("A");
      expect(graph.edges[0].target).toBe("B");
    });

    it("when edge labels exist, should preserve labels", () => {
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
              label: "Yes",
              stroke: "normal",
              arrowhead: "arrow_point",
            },
          ],
        }),
      );

      expect(graph.edges[0].label).toBe("Yes");
    });
  });
});
