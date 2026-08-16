import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../mermaidGraphBuilder";
import type { MermaidAST, MermaidASTNode } from "../../../ast/mermaidAST";

const emptyAst = (
  override: Partial<MermaidAST> &
    Pick<MermaidAST, "direction" | "nodes" | "edges">,
): MermaidAST => ({
  subgraphs: [],
  ...override,
});

describe("mermaid graphBuilder", () => {
  describe("nodes", () => {
    it("when nodes are converted, should map base node properties", () => {
      const graph = convertASTToGraph(
        emptyAst({
          direction: "TD",
          nodes: [
            { id: "A", label: "Node A" },
            { id: "B", label: "Node B" },
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

      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0].id).toBe("A");
      expect(graph.nodes[0].label).toBe("Node A");
      expect(graph.nodes[0].language).toBe("mermaid");
      expect(graph.nodes[0].nodeType).toBe("mermaid-node");
    });

    it("when node label is empty, should fallback to node id", () => {
      const graph = convertASTToGraph(
        emptyAst({
          direction: "LR",
          nodes: [{ id: "X", label: "" }],
          edges: [],
        }),
      );

      expect(graph.nodes[0].label).toBe("X");
    });

    it.each([
      ["square", "square"],
      ["round", "round"],
      ["diamond", "diamond"],
      [undefined, undefined],
    ] as const)(
      "when shape is %s, should set graph node type to %s",
      (shape, expected) => {
        const node: MermaidASTNode = {
          id: "N",
          label: "N",
          shape,
        };
        const graph = convertASTToGraph(
          emptyAst({
            direction: "TD",
            nodes: [node],
            edges: [],
          }),
        );

        expect(graph.nodes[0].type).toBe(expected);
      },
    );
  });
});
