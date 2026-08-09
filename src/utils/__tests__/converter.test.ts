import { describe, it, expect } from "vitest";
import { MarkerType } from "@xyflow/react";
import {
  createReactFlowNode,
  createReactFlowEdge,
  createSelectionDAGReactFlowEdge,
  calculateNodeDimensions,
  nodeTypeToReactFlowType,
} from "../converter";
import type { GraphNode, GraphEdge } from "../../types/graph";
import {
  NODE_BORDER_WIDTH,
  NODE_HEADER_HEIGHT,
  NODE_PADDING_X,
  NODE_PADDING_Y,
} from "../../components/Graph/common/nodeTextStyle";
import { USE_DEF_BADGE_GAP } from "../../components/Graph/LLVM/UseDef/useDefStyleConstants";
import { estimateBadgeWidth } from "../../components/Graph/LLVM/UseDef/useDefPorts";

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
    expect(rfEdge.markerStart).toEqual({
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
    expect(rfEdge.style).toEqual({ stroke: "#666", strokeDasharray: "8 8" });
    expect(rfEdge.markerStart).toEqual({
      type: MarkerType.ArrowClosed,
      color: "#666",
    });
  });
});

describe("calculateNodeDimensions", () => {
  // In Node.js test environment, fontUtils falls back to width 8 and the
  // requested line height (16px).
  const FALLBACK_CHAR_WIDTH = 8;
  const FALLBACK_LINE_HEIGHT = 16;
  // The rendered NodeShell frame (specs/graph-view.md §5).
  const FRAME_X = (NODE_PADDING_X + NODE_BORDER_WIDTH) * 2;
  const FRAME_Y = (NODE_PADDING_Y + NODE_BORDER_WIDTH) * 2;

  it("should calculate dimensions for a simple mermaid node", () => {
    const node: GraphNode = {
      id: "A",
      label: "Hello",
      language: "mermaid",
    };

    const dims = calculateNodeDimensions(node);

    // "Hello" = 5 chars, but MIN_CHARS_MERMAID = 10, so effectiveChars = 10
    expect(dims.width).toBe(10 * FALLBACK_CHAR_WIDTH + FRAME_X);
    expect(dims.height).toBe(1 * FALLBACK_LINE_HEIGHT + FRAME_Y);
  });

  it("should calculate dimensions for a multi-line LLVM node", () => {
    const node: GraphNode = {
      id: "B",
      label: "line one\nline two\nline three",
      language: "llvm",
    };

    const dims = calculateNodeDimensions(node);

    // MAX_CHARS_LLVM = 80, MIN_CHARS_LLVM = 16
    // longest line = "line three" = 10 chars < MIN_CHARS_LLVM = 16
    expect(dims.width).toBe(16 * FALLBACK_CHAR_WIDTH + FRAME_X);
    expect(dims.height).toBe(3 * FALLBACK_LINE_HEIGHT + FRAME_Y);
  });

  it("should add the header band when blockLabel is present", () => {
    const node: GraphNode = {
      id: "C",
      label: "some code",
      language: "llvm",
      blockLabel: "entry",
    };

    const dims = calculateNodeDimensions(node);

    expect(dims.height).toBe(
      1 * FALLBACK_LINE_HEIGHT + FRAME_Y + NODE_HEADER_HEIGHT,
    );
  });

  it("should add the header band when blockLabel is null (entry block)", () => {
    const node: GraphNode = {
      id: "C",
      label: "some code",
      language: "llvm",
      blockLabel: null as unknown as string,
    };

    const dims = calculateNodeDimensions(node);

    // blockLabel is null (not undefined) => header band added
    expect(dims.height).toBe(
      1 * FALLBACK_LINE_HEIGHT + FRAME_Y + NODE_HEADER_HEIGHT,
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

    // effectiveMaxChars = min(100, 80) = 80; wrappedLines = ceil(100/80) = 2
    expect(dims.width).toBe(80 * FALLBACK_CHAR_WIDTH + FRAME_X);
    expect(dims.height).toBe(2 * FALLBACK_LINE_HEIGHT + FRAME_Y);
  });

  it("should widen a use-def instruction card by its inline badge", () => {
    const label = "%1 = add i32 %0, 1";
    const instruction: GraphNode = {
      id: "f_main_ud_entry_i0",
      label,
      nodeType: "llvm-useDefInstruction",
      astData: {
        text: label,
        def: "1",
        uses: ["0"],
        isTerminator: false,
        blockLabel: "entry",
        blockIndex: 0,
      },
    };
    const value: GraphNode = {
      id: "f_main_udarg_a",
      label,
      nodeType: "llvm-useDefValue",
      astData: { name: "a", kind: "argument", paramType: "i32" },
    };

    const instructionDims = calculateNodeDimensions(instruction);
    const valueDims = calculateNodeDimensions(value);

    // Same text, single row each: same height; the instruction card is
    // wider by the inline badge plus its gap.
    expect(instructionDims.height).toBe(valueDims.height);
    expect(instructionDims.width).toBeCloseTo(
      valueDims.width + estimateBadgeWidth("entry") + USE_DEF_BADGE_GAP,
    );
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
    const astData = {
      type: "BasicBlock" as const,
      id: "entry",
      label: "entry",
      instructions: [],
      terminator: {
        type: "Instruction" as const,
        opcode: "ret" as const,
        originalText: "ret void",
      },
    };
    const graphNode: GraphNode = {
      id: "test-node",
      label: "Test Label",
      type: "square",
      language: "llvm",
      nodeType: "llvm-basicBlock",
      blockLabel: "entry",
      astData,
    };

    const rfNode = createReactFlowNode(graphNode, { x: 100, y: 200 });

    expect(rfNode.id).toBe("test-node");
    expect(rfNode.position).toEqual({ x: 100, y: 200 });
    expect(rfNode.data.label).toBe("Test Label");
    expect(rfNode.data.shape).toBe("square");
    expect(rfNode.data.language).toBe("llvm");
    expect(rfNode.data.blockLabel).toBe("entry");
    expect(rfNode.data.astData).toEqual(astData);
    // nodeType should be converted: "llvm-basicBlock" -> "llvmBasicBlock"
    expect(rfNode.type).toBe("llvmBasicBlock");
  });

  it("should convert kebab-case nodeType to camelCase", () => {
    expect(nodeTypeToReactFlowType("llvm-basicBlock")).toBe("llvmBasicBlock");
    expect(nodeTypeToReactFlowType("mermaid-node")).toBe("mermaidNode");
    expect(nodeTypeToReactFlowType("llvm-functionHeader")).toBe(
      "llvmFunctionHeader",
    );
    expect(nodeTypeToReactFlowType("llvm-exit")).toBe("llvmExit");
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
    expect(rfEdge.type).toBe("routed");
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

  it("should create a dashed edge when dashed is set", () => {
    const graphEdge: GraphEdge = {
      id: "e3",
      source: "A",
      target: "B",
      dashed: true,
    };

    const rfEdge = createReactFlowEdge(graphEdge);
    expect(rfEdge.style).toEqual({ stroke: "#666", strokeDasharray: "6 6" });
  });

  it("should not set strokeDasharray when dashed is not set", () => {
    const graphEdge: GraphEdge = {
      id: "e4",
      source: "A",
      target: "B",
    };

    const rfEdge = createReactFlowEdge(graphEdge);
    expect(rfEdge.style).not.toHaveProperty("strokeDasharray");
  });
});
