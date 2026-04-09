import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";
import {
  mermaidFlowchartGraph,
  mermaidMinimalGraph,
} from "../helpers/mermaidFixtures";

describe("mermaid parser", () => {
  describe("header and direction", () => {
    it("when graph header is used, should parse minimal graph", () => {
      const ast = parseMermaidToAST(mermaidMinimalGraph);

      expect(ast.direction).toBe("TD");
      expect(ast.nodes).toHaveLength(2);
      expect(ast.edges).toHaveLength(1);
      expect(ast.nodes[0].id).toBe("A");
      expect(ast.nodes[1].id).toBe("B");
      expect(ast.edges[0].sourceId).toBe("A");
      expect(ast.edges[0].targetId).toBe("B");
      expect(ast.edges[0].edgeType).toBe("arrow");
    });

    it("when direction token changes, should preserve each direction", () => {
      for (const direction of ["TD", "TB", "BT", "LR", "RL"]) {
        const ast = parseMermaidToAST(`graph ${direction}\nA --> B`);
        expect(ast.direction).toBe(direction);
      }
    });

    it("when flowchart keyword is used, should parse like graph keyword", () => {
      const ast = parseMermaidToAST(mermaidFlowchartGraph);

      expect(ast.direction).toBe("LR");
      expect(ast.nodes).toHaveLength(2);
      expect(ast.edges).toHaveLength(1);
    });
  });
});
