import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";

describe("mermaid parser", () => {
  describe("comments", () => {
    it("when a comment line stands between statements, should ignore it", () => {
      const ast = parseMermaidToAST(`graph TD\n%% comment\nA --> B`);

      expect(ast.nodes.map((node) => node.id)).toEqual(["A", "B"]);
      expect(ast.edges).toHaveLength(1);
    });

    it("when a comment follows a statement on the same line, should ignore it", () => {
      const ast = parseMermaidToAST(`graph TD\nA --> B %% comment`);

      expect(ast.nodes.map((node) => node.id)).toEqual(["A", "B"]);
      expect(ast.edges).toHaveLength(1);
    });

    it("when a comment holds text that looks like a statement, should not parse it", () => {
      const ast = parseMermaidToAST(`graph TD\nA --> B\n%% C --> D`);

      expect(ast.nodes.map((node) => node.id)).toEqual(["A", "B"]);
      expect(ast.edges).toHaveLength(1);
    });

    it("when the graph body is only comments, should parse to an empty graph", () => {
      const ast = parseMermaidToAST(`graph TD\n%% first\n%% second`);

      expect(ast.direction).toBe("TD");
      expect(ast.nodes).toEqual([]);
      expect(ast.edges).toEqual([]);
    });

    it("when a comment precedes the header, should throw", () => {
      expect(() =>
        parseMermaidToAST(`%% comment\ngraph TD\nA --> B`),
      ).toThrow();
    });
  });
});
