// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";
import { mermaidDiamondGraph } from "../helpers/mermaidFixtures";

describe("mermaid parser", () => {
  describe("statements", () => {
    it("when multiple edge statements are provided, should parse all nodes and edges", async () => {
      const ast = await parseMermaidToAST(
        `graph TD\nA --> B\nB --> C\nC --> A`,
      );

      expect(ast.nodes).toHaveLength(3);
      expect(ast.edges).toHaveLength(3);
    });

    it("when nodes are referenced by multiple edges, should deduplicate nodes", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA --> B\nA --> C`);

      expect(ast.nodes).toHaveLength(3);
      const nodeIds = ast.nodes.map((node) => node.id);
      expect(nodeIds).toContain("A");
      expect(nodeIds).toContain("B");
      expect(nodeIds).toContain("C");
    });

    it("when semicolon-separated statements are used, should parse each statement", async () => {
      const ast = await parseMermaidToAST("graph TD;A --> B;B --> C");

      expect(ast.nodes).toHaveLength(3);
      expect(ast.edges).toHaveLength(2);
    });

    it("when graph has branching pattern, should parse decision node and all edges", async () => {
      const ast = await parseMermaidToAST(mermaidDiamondGraph);

      expect(ast.nodes).toHaveLength(5);
      expect(ast.edges).toHaveLength(5);

      const decisionNode = ast.nodes.find((node) => node.id === "B");
      expect(decisionNode?.shape).toBe("diamond");
      expect(decisionNode?.label).toBe("Decision");
    });

    it("when a chain is used, should expand it into pairwise edges", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA --> B --> C`);

      expect(ast.nodes.map((node) => node.id)).toEqual(["A", "B", "C"]);
      expect(ast.edges).toHaveLength(2);
      expect(ast.edges[0]).toMatchObject({ sourceId: "A", targetId: "B" });
      expect(ast.edges[1]).toMatchObject({ sourceId: "B", targetId: "C" });
    });

    it("when an ampersand list is used, should fan the edge out", async () => {
      const ast = await parseMermaidToAST(`graph TD\nA --> B & C`);

      expect(ast.nodes).toHaveLength(3);
      expect(ast.edges).toHaveLength(2);
      expect(ast.edges.map((edge) => edge.targetId).sort()).toEqual(["B", "C"]);
    });
  });
});
