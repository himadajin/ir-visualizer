import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../../graphBuilder/mermaidGraphBuilder";
import { parseMermaid, parseMermaidToAST } from "../../mermaid";
import {
  mermaidDiamondGraph,
  mermaidMinimalGraph,
} from "../helpers/mermaidFixtures";

describe("mermaid parser", () => {
  describe("graph data", () => {
    it("when parseMermaid is used, should match convertASTToGraph(parseMermaidToAST(input))", () => {
      const direct = parseMermaid(mermaidDiamondGraph);
      const viaAst = convertASTToGraph(parseMermaidToAST(mermaidDiamondGraph));

      expect(direct).toEqual(viaAst);
    });

    it("when minimal graph is parsed, should keep direction and map nodes and edges", () => {
      const graph = parseMermaid(mermaidMinimalGraph);

      expect(graph.direction).toBe("TD");
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      expect(graph.nodes[0].nodeType).toBe("mermaid-node");
      expect(graph.nodes[0].language).toBe("mermaid");
    });
  });
});
