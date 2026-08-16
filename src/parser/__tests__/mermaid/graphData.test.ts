// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../../graphBuilder/mermaidGraphBuilder";
import { parseMermaid, parseMermaidToAST } from "../../mermaid";
import {
  mermaidDiamondGraph,
  mermaidMinimalGraph,
} from "../helpers/mermaidFixtures";

describe("mermaid parser", () => {
  describe("graph data", () => {
    it("when parseMermaid is used, should match convertASTToGraph(parseMermaidToAST(input))", async () => {
      const direct = await parseMermaid(mermaidDiamondGraph);
      const viaAst = convertASTToGraph(
        await parseMermaidToAST(mermaidDiamondGraph),
      );

      expect(direct).toEqual(viaAst);
    });

    it("when minimal graph is parsed, should keep direction and map nodes and edges", async () => {
      const graph = await parseMermaid(mermaidMinimalGraph);

      expect(graph.direction).toBe("TB");
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      expect(graph.nodes[0].nodeType).toBe("mermaid-node");
      expect(graph.nodes[0].language).toBe("mermaid");
    });
  });
});
