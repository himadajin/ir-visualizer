import { describe, it, expect } from "vitest";
import { MarkerType } from "@xyflow/react";
import {
  createReactFlowNode,
  createReactFlowEdge,
  createSelectionDAGReactFlowEdge,
  calculateNodeDimensions,
  NODE_PADDING,
} from "../converter";
import type { GraphNode, GraphEdge } from "../../types/graph";

describe("createSelectionDAGReactFlowEdge", () => {
  it("should create a normal edge when isChainOrGlue is false", () => {
    const edge = {
      id: "e1",
      source: "n1",
      target: "n2",
      isChainOrGlue: false,
    };
    const rfEdge = createSelectionDAGReactFlowEdge(edge);
    expect(rfEdge.style).toEqual({ stroke: "#666" });
    expect(rfEdge.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: "#666",
    });
  });

  it("should create a dashed edge when isChainOrGlue is true", () => {
    const edge = {
      id: "e1",
      source: "n1",
      target: "n2",
      isChainOrGlue: true,
    };
    const rfEdge = createSelectionDAGReactFlowEdge(edge);
    expect(rfEdge.style).toEqual({ stroke: "#666", strokeDasharray: "5 5" });
    expect(rfEdge.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: "#666",
    });
  });
});

describe("calculateNodeDimensions", () => {
  // In Node.js test environment, fontUtils falls back to { width: 8, height: 20 }
  const FALLBACK_CHAR_WIDTH = 8;
  const FALLBACK_LINE_HEIGHT = 20;

  it("should calculate dimensions for a simple mermaid node", () => {
    const node: GraphNode = {
      id: "A",
      label: "Hello",
      language: "mermaid",
    };

    const dims = calculateNodeDimensions(node);

    // "Hello" = 5 chars, but MIN_CHARS_MERMAID = 10, so effectiveChars = 10
    // width = 10 * 8 + 20 * 2 = 80 + 40 = 120
    // height = 1 * 20 + 20 * 2 = 60 (no blockLabel => no header offset)
    expect(dims.width).toBe(10 * FALLBACK_CHAR_WIDTH + NODE_PADDING * 2);
    expect(dims.height).toBe(1 * FALLBACK_LINE_HEIGHT + NODE_PADDING * 2);
  });

  it("should calculate dimensions for a multi-line LLVM node", () => {
    const node: GraphNode = {
      id: "B",
      label: "line one\nline two\nline three",
      language: "llvm",
    };

    const dims = calculateNodeDimensions(node);

    // MAX_CHARS_LLVM = 80, MIN_CHARS_LLVM = 40
    // longest line = "line three" = 10 chars < MIN_CHARS_LLVM = 40
    // width = 40 * 8 + 40 = 360
    // 3 lines, each < 80 chars => 3 wrapped lines
    // height = 3 * 20 + 40 = 100 (no blockLabel)
    expect(dims.width).toBe(40 * FALLBACK_CHAR_WIDTH + NODE_PADDING * 2);
    expect(dims.height).toBe(3 * FALLBACK_LINE_HEIGHT + NODE_PADDING * 2);
  });

  it("should add header offset when blockLabel is present", () => {
    const node: GraphNode = {
      id: "C",
      label: "some code",
      language: "llvm",
      blockLabel: "entry",
    };

    const dims = calculateNodeDimensions(node);

    // blockLabel is present => add HEADER_OFFSET (24)
    const HEADER_OFFSET = 24;
    expect(dims.height).toBe(
      1 * FALLBACK_LINE_HEIGHT + NODE_PADDING * 2 + HEADER_OFFSET,
    );
  });

  it("should add header offset when blockLabel is null (entry block)", () => {
    const node: GraphNode = {
      id: "C",
      label: "some code",
      language: "llvm",
      blockLabel: null as unknown as string,
    };

    const dims = calculateNodeDimensions(node);

    // blockLabel is null (not undefined) => header offset added
    const HEADER_OFFSET = 24;
    expect(dims.height).toBe(
      1 * FALLBACK_LINE_HEIGHT + NODE_PADDING * 2 + HEADER_OFFSET,
    );
  });

  it("should handle wrapping for long lines", () => {
    const longLine = "x".repeat(100); // 100 chars, MAX_CHARS_LLVM=80
    const node: GraphNode = {
      id: "D",
      label: longLine,
      language: "llvm",
    };

    const dims = calculateNodeDimensions(node);

    // effectiveMaxChars = min(100, 80) = 80
    // width = 80 * 8 + 40 = 680
    // wrappedLines = ceil(100/80) = 2
    // height = 2 * 20 + 40 = 80
    expect(dims.width).toBe(80 * FALLBACK_CHAR_WIDTH + NODE_PADDING * 2);
    expect(dims.height).toBe(2 * FALLBACK_LINE_HEIGHT + NODE_PADDING * 2);
  });

  it("should handle empty label", () => {
    const node: GraphNode = {
      id: "E",
      label: "",
      language: "mermaid",
    };

    const dims = calculateNodeDimensions(node);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });
});

describe("createReactFlowNode", () => {
  it("should create a ReactFlow node from GraphNode", () => {
    const graphNode: GraphNode = {
      id: "test-node",
      label: "Test Label",
      type: "square",
      language: "llvm",
      nodeType: "llvm-basicBlock",
      blockLabel: "entry",
      astData: { foo: "bar" },
    };

    const rfNode = createReactFlowNode(graphNode, { x: 100, y: 200 });

    expect(rfNode.id).toBe("test-node");
    expect(rfNode.position).toEqual({ x: 100, y: 200 });
    expect(rfNode.data.label).toBe("Test Label");
    expect(rfNode.data.shape).toBe("square");
    expect(rfNode.data.language).toBe("llvm");
    expect(rfNode.data.blockLabel).toBe("entry");
    expect(rfNode.data.astData).toEqual({ foo: "bar" });
    // nodeType should be converted: "llvm-basicBlock" -> "llvmBasicBlock"
    expect(rfNode.type).toBe("llvmBasicBlock");
  });

  it("should convert kebab-case nodeType to camelCase", () => {
    const tests = [
      { nodeType: "llvm-basicBlock", expected: "llvmBasicBlock" },
      { nodeType: "mermaid-node", expected: "mermaidNode" },
      { nodeType: "llvm-functionHeader", expected: "llvmFunctionHeader" },
      { nodeType: "llvm-exit", expected: "llvmExit" },
    ];

    for (const { nodeType, expected } of tests) {
      const rfNode = createReactFlowNode(
        { id: "x", label: "x", nodeType },
        { x: 0, y: 0 },
      );
      expect(rfNode.type).toBe(expected);
    }
  });

  it("should default to codeNode when nodeType is not set", () => {
    const rfNode = createReactFlowNode({ id: "x", label: "x" }, { x: 0, y: 0 });
    expect(rfNode.type).toBe("codeNode");
  });

  it("should set width in style", () => {
    const rfNode = createReactFlowNode(
      { id: "x", label: "Hello", language: "mermaid" },
      { x: 0, y: 0 },
    );
    expect(rfNode.style?.width).toBeGreaterThan(0);
  });
});

describe("createReactFlowEdge", () => {
  it("should create a ReactFlow edge from GraphEdge", () => {
    const graphEdge: GraphEdge = {
      id: "e-A-B",
      source: "A",
      target: "B",
      label: "true",
    };

    const rfEdge = createReactFlowEdge(graphEdge);

    expect(rfEdge.id).toBe("e-A-B");
    expect(rfEdge.source).toBe("A");
    expect(rfEdge.target).toBe("B");
    expect(rfEdge.label).toBe("true");
    expect(rfEdge.type).toBe("customBezier");
    expect(rfEdge.animated).toBe(false);
    expect(rfEdge.style).toEqual({ stroke: "#666" });
    expect(rfEdge.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: "#666",
    });
  });

  it("should use custom edge type when provided", () => {
    const graphEdge: GraphEdge = {
      id: "e1",
      source: "A",
      target: "B",
    };

    const rfEdge = createReactFlowEdge(graphEdge, "backEdge");
    expect(rfEdge.type).toBe("backEdge");
  });

  it("should handle edge without label", () => {
    const graphEdge: GraphEdge = {
      id: "e2",
      source: "X",
      target: "Y",
    };

    const rfEdge = createReactFlowEdge(graphEdge);
    expect(rfEdge.label).toBeUndefined();
  });
});
