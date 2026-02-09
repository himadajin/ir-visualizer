import { describe, it, expect } from "vitest";
import { parseMermaid } from "../parser/mermaid";
import { parseLLVM } from "../parser/llvm";

describe("Integration: parseMermaid (parser + graph builder)", () => {
  it("should produce GraphData from Mermaid text", () => {
    const input = `
graph TD
A[Start] --> B[Process]
B --> C[End]`;

    const graph = parseMermaid(input);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.direction).toBe("TD");

    // Nodes should have expected properties
    const startNode = graph.nodes.find((n) => n.id === "A");
    expect(startNode).toBeDefined();
    expect(startNode?.label).toBe("Start");
    expect(startNode?.language).toBe("mermaid");
    expect(startNode?.nodeType).toBe("mermaid-node");

    // Edges should reference correct nodes
    expect(graph.edges[0].source).toBe("A");
    expect(graph.edges[0].target).toBe("B");
    expect(graph.edges[1].source).toBe("B");
    expect(graph.edges[1].target).toBe("C");
  });

  it("should handle edge labels end-to-end", () => {
    const input = `
graph LR
A -->|Yes| B
A -->|No| C`;

    const graph = parseMermaid(input);

    expect(graph.edges).toHaveLength(2);
    // The parser preserves pipe delimiters in edge labels
    expect(graph.edges[0].label).toBe("|Yes|");
    expect(graph.edges[1].label).toBe("|No|");
  });
});

describe("Integration: parseLLVM (parser + graph builder)", () => {
  it("should produce GraphData from LLVM IR text", () => {
    const input = `
define i32 @main() {
entry:
  %x = add i32 1, 2
  ret i32 %x
}`;

    const graph = parseLLVM(input);

    // Should have header + basic block + exit
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.edges.length).toBeGreaterThanOrEqual(2);

    const header = graph.nodes.find(
      (n) => n.nodeType === "llvm-functionHeader",
    );
    expect(header).toBeDefined();
    expect(header?.label).toContain("main");

    const block = graph.nodes.find((n) => n.nodeType === "llvm-basicBlock");
    expect(block).toBeDefined();

    const exit = graph.nodes.find((n) => n.nodeType === "llvm-exit");
    expect(exit).toBeDefined();
  });

  it("should handle conditional branches end-to-end", () => {
    const input = `
define void @foo(i1 %cond) {
entry:
  br i1 %cond, label %then, label %else

then:
  ret void

else:
  ret void
}`;

    const graph = parseLLVM(input);

    // Should have: header, entry block, then block, else block, exit node
    const basicBlocks = graph.nodes.filter(
      (n) => n.nodeType === "llvm-basicBlock",
    );
    expect(basicBlocks).toHaveLength(3);

    // Check that true/false edges exist from entry
    const trueEdge = graph.edges.find((e) => e.label === "true");
    const falseEdge = graph.edges.find((e) => e.label === "false");
    expect(trueEdge).toBeDefined();
    expect(falseEdge).toBeDefined();
  });

  it("should handle a full module with globals and declarations", () => {
    const input = `
@g = global i32 0

declare void @bar()

define void @foo() {
  ret void
}`;

    const graph = parseLLVM(input);

    const globalNode = graph.nodes.find(
      (n) => n.nodeType === "llvm-globalVariable",
    );
    expect(globalNode).toBeDefined();

    const declNode = graph.nodes.find((n) => n.nodeType === "llvm-declaration");
    expect(declNode).toBeDefined();
  });
});
