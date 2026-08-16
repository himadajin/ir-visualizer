// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";

describe("mermaid parser", () => {
  describe("comments", () => {
    it("when a comment line stands between statements, should ignore it", async () => {
      const ast = await parseMermaidToAST(`graph TD\n%% comment\nA --> B`);

      expect(ast.nodes.map((node) => node.id)).toEqual(["A", "B"]);
      expect(ast.edges).toHaveLength(1);
    });

    it("when a comment holds text that looks like a statement, should not parse it", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA --> B\n%% C --> D`);

      expect(ast.nodes.map((node) => node.id)).toEqual(["A", "B"]);
      expect(ast.edges).toHaveLength(1);
    });

    it("when the graph body is only comments, should parse to an empty graph", async () => {
      const ast = await parseMermaidToAST(`graph TD\n%% first\n%% second`);

      expect(ast.direction).toBe("TB");
      expect(ast.nodes).toEqual([]);
      expect(ast.edges).toEqual([]);
    });

    it("when a comment precedes the header, should still parse", async () => {
      const ast = await parseMermaidToAST(`%% comment\ngraph TD\nA --> B`);

      expect(ast.nodes.map((node) => node.id)).toEqual(["A", "B"]);
      expect(ast.edges).toHaveLength(1);
    });
  });
});
