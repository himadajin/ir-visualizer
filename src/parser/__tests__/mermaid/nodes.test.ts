// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";
import { mermaidNodeDeclarations } from "../helpers/mermaidFixtures";

describe("mermaid parser", () => {
  describe("nodes", () => {
    it("when square-bracket label is used, should parse square node shape", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA[Hello World]`);

      expect(ast.nodes).toHaveLength(1);
      expect(ast.nodes[0].id).toBe("A");
      expect(ast.nodes[0].label).toBe("Hello World");
      expect(ast.nodes[0].shape).toBe("square");
    });

    it("when round-bracket label is used, should parse round node shape", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA(Round Node)`);

      expect(ast.nodes[0].label).toBe("Round Node");
      expect(ast.nodes[0].shape).toBe("round");
    });

    it("when diamond-bracket label is used, should parse diamond node shape", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA{Decision}`);

      expect(ast.nodes[0].label).toBe("Decision");
      expect(ast.nodes[0].shape).toBe("diamond");
    });

    it("when label is omitted, should fallback label to node id", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA --> B`);

      expect(ast.nodes[0].label).toBe("A");
      expect(ast.nodes[1].label).toBe("B");
    });

    it("when labeled nodes are referenced in edge, should preserve edge node labels", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA[Start] --> B[End]`);

      expect(ast.nodes[0].label).toBe("Start");
      expect(ast.nodes[1].label).toBe("End");
    });

    it("when standalone declarations exist, should parse nodes without creating edges", async () => {
      const ast = await parseMermaidToAST(mermaidNodeDeclarations);

      expect(ast.nodes).toHaveLength(2);
      expect(ast.edges).toHaveLength(0);
      expect(ast.nodes[0].label).toBe("Standalone Node");
      expect(ast.nodes[1].label).toBe("Another Node");
    });

    it("when label is double-quoted, should strip the quotes", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA["Quoted label"]`);

      expect(ast.nodes[0].label).toBe("Quoted label");
      expect(ast.nodes[0].shape).toBe("square");
    });

    it("when a stadium shape is used, should carry the upstream shape name", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA([stadium])`);

      expect(ast.nodes[0].shape).toBe("stadium");
      expect(ast.nodes[0].label).toBe("stadium");
    });

    it.each([
      ["A[[helper]]", "subroutine"],
      ["A[(store)]", "cylinder"],
      ["A((start))", "circle"],
      ["A[/input/]", "lean_right"],
      ["A[\\output\\]", "lean_left"],
      ['A@{ shape: diam, label: "Q" }', "diam"],
      ['A@{ shape: diamond, label: "Q" }', "diamond"],
      ['A@{ shape: cyl, label: "S" }', "cyl"],
      ['A@{ shape: fr-rect, label: "P" }', "fr-rect"],
    ] as const)(
      "when source is %s, should carry upstream shape %s",
      async (declaration, shape) => {
        const ast = await parseMermaidToAST(`graph TD\n${declaration}`);

        expect(ast.nodes[0].shape).toBe(shape);
      },
    );
  });
});
