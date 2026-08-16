import { describe, it, expect } from "vitest";
import { MarkerType } from "@xyflow/react";
import {
  createReactFlowNode,
  createReactFlowEdge,
  createSelectionDAGReactFlowEdge,
  nodeTypeToReactFlowType,
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

  it("lets the node size itself rather than forcing an estimated width", () => {
    const rfNode = createReactFlowNode(
      { id: "x", label: "Hello", language: "mermaid" },
      { x: 0, y: 0 },
    );
    expect(rfNode.style?.width).toBe("fit-content");
    expect(rfNode.style?.height).toBe("fit-content");
  });

  it("hides a measuring node without taking it out of layout", () => {
    const rfNode = createReactFlowNode(
      { id: "x", label: "Hello" },
      { x: 0, y: 0 },
      { hidden: true },
    );
    expect(rfNode.style?.visibility).toBe("hidden");
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
