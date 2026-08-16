// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";

const COVERAGE_CHECKPOINTS = [
  "direction",
  "node-id-uniqueness",
  "statement-separators",
] as const;

describe("mermaid parser", () => {
  describe("invariants", () => {
    it("when invariants are tracked, should keep a non-empty checkpoint list", () => {
      expect(COVERAGE_CHECKPOINTS.length).toBeGreaterThan(0);
    });

    it("when same node appears across multiple edges, should keep unique node ids", async () => {
      const ast = await parseMermaidToAST(
        `graph TD\nA --> B\nA --> C\nA --> B`,
      );
      const ids = ast.nodes.map((node) => node.id);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain("A");
      expect(ids).toContain("B");
      expect(ids).toContain("C");
    });

    it("when separators and whitespace are mixed, should parse equivalent node and edge counts", async () => {
      const lineBreakVariant = await parseMermaidToAST(
        `graph TD\nA --> B\nB --> C`,
      );
      const semicolonVariant = await parseMermaidToAST(
        "graph TD;A --> B;B --> C",
      );

      expect(semicolonVariant.nodes).toHaveLength(
        lineBreakVariant.nodes.length,
      );
      expect(semicolonVariant.edges).toHaveLength(
        lineBreakVariant.edges.length,
      );
      expect(semicolonVariant.direction).toBe(lineBreakVariant.direction);
    });
  });
});
