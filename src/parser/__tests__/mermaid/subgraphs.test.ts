// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMermaid, parseMermaidToAST } from "../../mermaid";

describe("mermaid parser", () => {
  describe("subgraphs", () => {
    it("when a subgraph wraps nodes, should put those nodes on the AST subgraph", async () => {
      const ast = await parseMermaidToAST(`graph TD
subgraph inner [Inner]
  A --> B
end
C --> A`);

      expect(ast.subgraphs).toHaveLength(1);
      expect(ast.subgraphs[0].id).toBe("inner");
      expect(ast.subgraphs[0].title).toBe("Inner");
      expect(ast.subgraphs[0].nodeIds.sort()).toEqual(["A", "B"]);
    });

    it("when subgraphs nest, should keep the inner group as a child of the outer", async () => {
      const ast = await parseMermaidToAST(`graph TD
subgraph outer [Outer]
  subgraph inner [Inner]
    A --> B
  end
  C --> A
end`);

      const outer = ast.subgraphs.find((sg) => sg.id === "outer");
      const inner = ast.subgraphs.find((sg) => sg.id === "inner");
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
      expect(outer?.nodeIds).toContain("inner");
      expect(outer?.nodeIds).not.toContain("A");
      expect(inner?.nodeIds.sort()).toEqual(["A", "B"]);
    });

    it("when converting to GraphData, should emit graph-group nodes and parentId", async () => {
      const graph = await parseMermaid(`graph TD
subgraph inner [Inner]
  A --> B
end
C --> A`);

      const group = graph.nodes.find((node) => node.nodeType === "graph-group");
      expect(group?.id).toBe("inner");
      expect(group?.label).toBe("Inner");

      const a = graph.nodes.find((node) => node.id === "A");
      const b = graph.nodes.find((node) => node.id === "B");
      const c = graph.nodes.find((node) => node.id === "C");
      expect(a?.parentId).toBe("inner");
      expect(b?.parentId).toBe("inner");
      expect(c?.parentId).toBeUndefined();
    });

    it("when an edge targets a subgraph id, should keep the group as the endpoint", async () => {
      const graph = await parseMermaid(`graph TD
subgraph box [Box]
  A
end
B --> box`);

      expect(graph.nodes.filter((n) => n.id === "box")).toHaveLength(1);
      expect(graph.nodes.find((n) => n.id === "box")?.nodeType).toBe(
        "graph-group",
      );
      expect(
        graph.edges.some((e) => e.source === "B" && e.target === "box"),
      ).toBe(true);
    });

    it("when a subgraph declares a direction, should store it on the AST", async () => {
      const ast = await parseMermaidToAST(`graph TD
subgraph box [Box]
  direction LR
  A --> B
end`);

      expect(ast.subgraphs).toHaveLength(1);
      expect(ast.subgraphs[0].direction).toBe("LR");
    });

    it("when a subgraph has no direction statement, should omit direction", async () => {
      const ast = await parseMermaidToAST(`graph TD
subgraph box [Box]
  A --> B
end`);

      expect(ast.subgraphs[0].direction).toBeUndefined();
    });
  });
});
