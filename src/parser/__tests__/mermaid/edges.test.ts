import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";

describe("mermaid parser", () => {
  describe("edges", () => {
    it("when arrow edge is used, should parse arrow edge type", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA --> B`);

      expect(ast.edges[0].edgeType).toBe("arrow");
      expect(ast.edges[0].label).toBeUndefined();
    });

    it("when line edge is used, should parse line edge type", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA --- B`);

      expect(ast.edges[0].edgeType).toBe("line");
      expect(ast.edges[0].label).toBeUndefined();
    });

    it("when arrow edge has pipe label, should preserve delimiters in label", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA -->|Yes| B`);

      expect(ast.edges[0].edgeType).toBe("arrow");
      expect(ast.edges[0].label).toBe("|Yes|");
    });

    it("when line edge has pipe label, should preserve delimiters in label", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA ---|link text| B`);

      expect(ast.edges[0].edgeType).toBe("line");
      expect(ast.edges[0].label).toBe("|link text|");
    });
  });
});
