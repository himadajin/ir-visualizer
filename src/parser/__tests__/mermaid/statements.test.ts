import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";
import { mermaidDiamondGraph } from "../helpers/mermaidFixtures";

describe("mermaid parser", () => {
  describe("statements", () => {
    it("when multiple edge statements are provided, should parse all nodes and edges", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA --> B\nB --> C\nC --> A`);

      expect(ast.nodes).toHaveLength(3);
      expect(ast.edges).toHaveLength(3);
    });

    it("when nodes are referenced by multiple edges, should deduplicate nodes", () => {
      const ast = parseMermaidToAST(`\ngraph TD\nA --> B\nA --> C`);

      expect(ast.nodes).toHaveLength(3);
      const nodeIds = ast.nodes.map((node) => node.id);
      expect(nodeIds).toContain("A");
      expect(nodeIds).toContain("B");
      expect(nodeIds).toContain("C");
    });

    it("when semicolon-separated statements are used, should parse each statement", () => {
      const ast = parseMermaidToAST("graph TD;A --> B;B --> C");

      expect(ast.nodes).toHaveLength(3);
      expect(ast.edges).toHaveLength(2);
    });

    it("when graph has branching pattern, should parse decision node and all edges", () => {
      const ast = parseMermaidToAST(mermaidDiamondGraph);

      expect(ast.nodes).toHaveLength(5);
      expect(ast.edges).toHaveLength(5);

      const decisionNode = ast.nodes.find((node) => node.id === "B");
      expect(decisionNode?.shape).toBe("curly");
      expect(decisionNode?.label).toBe("Decision");
    });
  });
});
