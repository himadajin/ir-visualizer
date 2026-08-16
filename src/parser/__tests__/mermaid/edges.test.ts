// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";

describe("mermaid parser", () => {
  describe("edges", () => {
    it("when arrow edge is used, should parse arrow_point with normal stroke", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA --> B`);

      expect(ast.edges[0].arrowhead).toBe("arrow_point");
      expect(ast.edges[0].stroke).toBe("normal");
      expect(ast.edges[0].label).toBeUndefined();
    });

    it("when open line edge is used, should parse arrow_open", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA --- B`);

      expect(ast.edges[0].arrowhead).toBe("arrow_open");
      expect(ast.edges[0].stroke).toBe("normal");
      expect(ast.edges[0].label).toBeUndefined();
    });

    it("when arrow edge has pipe label, should store the label without delimiters", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA -->|Yes| B`);

      expect(ast.edges[0].arrowhead).toBe("arrow_point");
      expect(ast.edges[0].label).toBe("Yes");
    });

    it("when open edge has pipe label, should store the label without delimiters", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA ---|link text| B`);

      expect(ast.edges[0].arrowhead).toBe("arrow_open");
      expect(ast.edges[0].label).toBe("link text");
    });

    it("when dotted and thick strokes are used, should record them on the AST", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA -.-> B\nA ==> C`);

      expect(ast.edges[0].stroke).toBe("dotted");
      expect(ast.edges[1].stroke).toBe("thick");
    });

    it("when an invisible link is used, should record invisible stroke", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA ~~~ B`);

      expect(ast.edges[0].stroke).toBe("invisible");
    });
  });
});
