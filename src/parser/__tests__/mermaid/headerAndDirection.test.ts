// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";
import {
  mermaidFlowchartGraph,
  mermaidMinimalGraph,
} from "../helpers/mermaidFixtures";

describe("mermaid parser", () => {
  describe("header and direction", () => {
    it("when graph header is used, should parse minimal graph", async () => {
      const ast = await parseMermaidToAST(mermaidMinimalGraph);

      expect(ast.direction).toBe("TB");
      expect(ast.nodes).toHaveLength(2);
      expect(ast.edges).toHaveLength(1);
      expect(ast.nodes[0].id).toBe("A");
      expect(ast.nodes[1].id).toBe("B");
      expect(ast.edges[0].sourceId).toBe("A");
      expect(ast.edges[0].targetId).toBe("B");
      expect(ast.edges[0].arrowhead).toBe("arrow_point");
    });

    it("when direction token is TD, should store TB (FlowDB normalizes TD)", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA --> B`);
      expect(ast.direction).toBe("TB");
    });

    it("when direction token changes, should preserve BT, LR, RL, and TB", async () => {
      for (const direction of ["TB", "BT", "LR", "RL"] as const) {
        const ast = await parseMermaidToAST(`graph ${direction}\nA --> B`);
        expect(ast.direction).toBe(direction);
      }
    });

    it("when flowchart keyword is used, should parse like graph keyword", async () => {
      const ast = await parseMermaidToAST(mermaidFlowchartGraph);

      expect(ast.direction).toBe("LR");
      expect(ast.nodes).toHaveLength(2);
      expect(ast.edges).toHaveLength(1);
    });
  });
});
