import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../mermaidGraphBuilder";
import type { MermaidAST } from "../../../ast/mermaidAST";

const ast = (override: MermaidAST): MermaidAST => override;

describe("mermaid graphBuilder", () => {
  describe("subgraphs", () => {
    it("when subgraphs exist, should emit graph-group nodes with parentId on children", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TB",
          nodes: [
            { id: "A", label: "A" },
            { id: "B", label: "B" },
            { id: "C", label: "C" },
          ],
          edges: [
            {
              sourceId: "A",
              targetId: "B",
              stroke: "normal",
              arrowhead: "arrow_point",
            },
          ],
          subgraphs: [
            { id: "inner", title: "Inner", nodeIds: ["A", "B"] },
            { id: "outer", title: "Outer", nodeIds: ["inner", "C"] },
          ],
        }),
      );

      const inner = graph.nodes.find((node) => node.id === "inner");
      const outer = graph.nodes.find((node) => node.id === "outer");
      expect(inner?.nodeType).toBe("graph-group");
      expect(inner?.label).toBe("Inner");
      expect(inner?.parentId).toBe("outer");
      expect(outer?.parentId).toBeUndefined();

      expect(graph.nodes.find((node) => node.id === "A")?.parentId).toBe(
        "inner",
      );
      expect(graph.nodes.find((node) => node.id === "C")?.parentId).toBe(
        "outer",
      );
    });

    it("when subgraph title is empty, should label the group with its id", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TB",
          nodes: [{ id: "A", label: "A" }],
          edges: [],
          subgraphs: [{ id: "box", title: "", nodeIds: ["A"] }],
        }),
      );

      expect(graph.nodes.find((node) => node.id === "box")?.label).toBe("box");
    });
  });
});
