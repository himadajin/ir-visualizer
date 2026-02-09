import { describe, it, expect } from "vitest";
import { parseMermaidToAST } from "../mermaid";

describe("parseMermaidToAST", () => {
  describe("basic graph parsing", () => {
    it("should parse a minimal graph with two nodes and one edge", () => {
      const input = `
graph TD
A --> B`;
      const ast = parseMermaidToAST(input);

      expect(ast.direction).toBe("TD");
      expect(ast.nodes).toHaveLength(2);
      expect(ast.edges).toHaveLength(1);

      expect(ast.nodes[0].id).toBe("A");
      expect(ast.nodes[1].id).toBe("B");
      expect(ast.edges[0].sourceId).toBe("A");
      expect(ast.edges[0].targetId).toBe("B");
      expect(ast.edges[0].edgeType).toBe("arrow");
    });

    it("should parse direction correctly", () => {
      for (const dir of ["TD", "TB", "BT", "LR", "RL"]) {
        const input = `graph ${dir}\nA --> B`;
        const ast = parseMermaidToAST(input);
        expect(ast.direction).toBe(dir);
      }
    });

    it("should parse flowchart keyword as well as graph", () => {
      const input = `
flowchart LR
A --> B`;
      const ast = parseMermaidToAST(input);
      expect(ast.direction).toBe("LR");
      expect(ast.nodes).toHaveLength(2);
    });
  });

  describe("node labels and shapes", () => {
    it("should parse square bracket labels", () => {
      const input = `
graph TD
A[Hello World]`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes).toHaveLength(1);
      expect(ast.nodes[0].id).toBe("A");
      expect(ast.nodes[0].label).toBe("Hello World");
      expect(ast.nodes[0].shape).toBe("square");
    });

    it("should parse round bracket labels", () => {
      const input = `
graph TD
A(Round Node)`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes[0].label).toBe("Round Node");
      expect(ast.nodes[0].shape).toBe("round");
    });

    it("should parse curly bracket labels", () => {
      const input = `
graph TD
A{Decision}`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes[0].label).toBe("Decision");
      expect(ast.nodes[0].shape).toBe("curly");
    });

    it("should use node ID as label when no label is specified", () => {
      const input = `
graph TD
A --> B`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes[0].label).toBe("A");
      expect(ast.nodes[1].label).toBe("B");
    });

    it("should preserve labels from edge nodes", () => {
      const input = `
graph TD
A[Start] --> B[End]`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes[0].label).toBe("Start");
      expect(ast.nodes[1].label).toBe("End");
    });
  });

  describe("edge types and labels", () => {
    it("should parse arrow edges (-->)", () => {
      const input = `
graph TD
A --> B`;
      const ast = parseMermaidToAST(input);

      expect(ast.edges[0].edgeType).toBe("arrow");
      expect(ast.edges[0].label).toBeUndefined();
    });

    it("should parse line edges (---)", () => {
      const input = `
graph TD
A --- B`;
      const ast = parseMermaidToAST(input);

      expect(ast.edges[0].edgeType).toBe("line");
      expect(ast.edges[0].label).toBeUndefined();
    });

    it("should parse arrow edges with pipe labels (-->|text|)", () => {
      const input = `
graph TD
A -->|Yes| B`;
      const ast = parseMermaidToAST(input);

      expect(ast.edges[0].edgeType).toBe("arrow");
      // The parser preserves pipe delimiters in the label
      expect(ast.edges[0].label).toBe("|Yes|");
    });

    it("should parse line edges with pipe labels (---|text|)", () => {
      const input = `
graph TD
A ---|link text| B`;
      const ast = parseMermaidToAST(input);

      expect(ast.edges[0].edgeType).toBe("line");
      // The parser preserves pipe delimiters in the label
      expect(ast.edges[0].label).toBe("|link text|");
    });
  });

  describe("multiple statements", () => {
    it("should parse multiple edges", () => {
      const input = `
graph TD
A --> B
B --> C
C --> A`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes).toHaveLength(3);
      expect(ast.edges).toHaveLength(3);
    });

    it("should deduplicate nodes referenced in multiple edges", () => {
      const input = `
graph TD
A --> B
A --> C`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes).toHaveLength(3);
      const nodeIds = ast.nodes.map((n) => n.id);
      expect(nodeIds).toContain("A");
      expect(nodeIds).toContain("B");
      expect(nodeIds).toContain("C");
    });

    it("should handle semicolon-separated statements", () => {
      const input = `graph TD;A --> B;B --> C`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes).toHaveLength(3);
      expect(ast.edges).toHaveLength(2);
    });
  });

  describe("node declaration without edges", () => {
    it("should parse standalone node declarations", () => {
      const input = `
graph TD
A[Standalone Node]
B[Another Node]`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes).toHaveLength(2);
      expect(ast.edges).toHaveLength(0);
      expect(ast.nodes[0].label).toBe("Standalone Node");
      expect(ast.nodes[1].label).toBe("Another Node");
    });
  });

  describe("error handling", () => {
    it("should throw on invalid input", () => {
      expect(() => parseMermaidToAST("")).toThrow();
    });

    it("should throw on input without header", () => {
      expect(() => parseMermaidToAST("A --> B")).toThrow();
    });
  });

  describe("complex graphs", () => {
    it("should parse a diamond pattern", () => {
      const input = `
graph TD
A[Start] --> B{Decision}
B -->|Yes| C[OK]
B -->|No| D[Not OK]
C --> E[End]
D --> E`;
      const ast = parseMermaidToAST(input);

      expect(ast.nodes).toHaveLength(5);
      expect(ast.edges).toHaveLength(5);

      const bNode = ast.nodes.find((n) => n.id === "B");
      expect(bNode?.shape).toBe("curly");
      expect(bNode?.label).toBe("Decision");
    });
  });
});
