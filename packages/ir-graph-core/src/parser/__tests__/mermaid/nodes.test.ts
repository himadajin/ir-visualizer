import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";
import { mermaidNodeDeclarations } from "../helpers/mermaidFixtures";

describe("mermaid parser", () => {
  describe("nodes", () => {
    it("when square-bracket label is used, should parse square node shape", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA[Hello World]`);

      expect(ast.nodes).toHaveLength(1);
      expect(ast.nodes[0].id).toBe("A");
      expect(ast.nodes[0].label).toBe("Hello World");
      expect(ast.nodes[0].shape).toBe("square");
    });

    it("when round-bracket label is used, should parse round node shape", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA(Round Node)`);

      expect(ast.nodes[0].label).toBe("Round Node");
      expect(ast.nodes[0].shape).toBe("round");
    });

    it("when curly-bracket label is used, should parse curly node shape", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA{Decision}`);

      expect(ast.nodes[0].label).toBe("Decision");
      expect(ast.nodes[0].shape).toBe("curly");
    });

    it("when label is omitted, should fallback label to node id", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA --> B`);

      expect(ast.nodes[0].label).toBe("A");
      expect(ast.nodes[1].label).toBe("B");
    });

    it("when labeled nodes are referenced in edge, should preserve edge node labels", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA[Start] --> B[End]`);

      expect(ast.nodes[0].label).toBe("Start");
      expect(ast.nodes[1].label).toBe("End");
    });

    it("when standalone declarations exist, should parse nodes without creating edges", () => {
      const ast = parseMermaidToAST(mermaidNodeDeclarations);

      expect(ast.nodes).toHaveLength(2);
      expect(ast.edges).toHaveLength(0);
      expect(ast.nodes[0].label).toBe("Standalone Node");
      expect(ast.nodes[1].label).toBe("Another Node");
    });
  });
});
