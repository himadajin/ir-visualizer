import { describe, it, expect } from "vitest";
import { MarkerType } from "@xyflow/react";
import {
  createReactFlowNode,
  createReactFlowEdge,
  createMermaidReactFlowEdge,
  createSelectionDAGReactFlowEdge,
  nodeTypeToReactFlowType,
  mermaidMarkerKinds,
  recolorMarker,
  BACK_EDGE_COLOR,
  EDGE_MARKER,
  EDGE_STROKE_COLOR,
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
    expect(nodeTypeToReactFlowType("graph-group")).toBe("graphGroup");
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

  it("maps graph-group to graphGroup and marks it as a non-obstacle", () => {
    const rfNode = createReactFlowNode(
      { id: "g", label: "G", nodeType: "graph-group", astData: {} },
      { x: 0, y: 0 },
    );
    expect(rfNode.type).toBe("graphGroup");
    expect(rfNode.data.obstacle).toBe(false);
  });

  it("sets parentId and extent when a parent is supplied", () => {
    const rfNode = createReactFlowNode(
      { id: "a", label: "A", parentId: "g" },
      { x: 8, y: 12 },
      { parentId: "g" },
    );
    expect(rfNode.parentId).toBe("g");
    expect(rfNode.extent).toBe("parent");
    expect(rfNode.position).toEqual({ x: 8, y: 12 });
  });

  it("uses an explicit size for a laid-out container", () => {
    const rfNode = createReactFlowNode(
      { id: "g", label: "G", nodeType: "graph-group", astData: {} },
      { x: 0, y: 0 },
      { width: 200, height: 150 },
    );
    expect(rfNode.style?.width).toBe(200);
    expect(rfNode.style?.height).toBe(150);
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

describe("mermaidMarkerKinds", () => {
  it("maps the closed FlowDB set and falls unknown names back to arrow", () => {
    expect(mermaidMarkerKinds("arrow_point")).toEqual({
      start: "none",
      end: "arrow",
    });
    expect(mermaidMarkerKinds("arrow_open")).toEqual({
      start: "none",
      end: "none",
    });
    expect(mermaidMarkerKinds("arrow_circle")).toEqual({
      start: "none",
      end: "circle",
    });
    expect(mermaidMarkerKinds("arrow_cross")).toEqual({
      start: "none",
      end: "cross",
    });
    expect(mermaidMarkerKinds("double_arrow_point")).toEqual({
      start: "arrow",
      end: "arrow",
    });
    expect(mermaidMarkerKinds("double_arrow_circle")).toEqual({
      start: "circle",
      end: "circle",
    });
    expect(mermaidMarkerKinds("double_arrow_cross")).toEqual({
      start: "cross",
      end: "cross",
    });
    expect(mermaidMarkerKinds(undefined)).toEqual({
      start: "none",
      end: "arrow",
    });
    expect(mermaidMarkerKinds("stadium")).toEqual({
      start: "none",
      end: "arrow",
    });
  });
});

describe("recolorMarker", () => {
  it("recolors an object marker without changing its type", () => {
    expect(
      recolorMarker(
        { type: MarkerType.ArrowClosed, color: EDGE_STROKE_COLOR },
        BACK_EDGE_COLOR,
      ),
    ).toEqual({ type: MarkerType.ArrowClosed, color: BACK_EDGE_COLOR });
  });

  it("swaps circle and cross urls to the back-edge defs", () => {
    expect(recolorMarker(EDGE_MARKER.circle, BACK_EDGE_COLOR)).toBe(
      EDGE_MARKER.circleBack,
    );
    expect(recolorMarker(EDGE_MARKER.cross, BACK_EDGE_COLOR)).toBe(
      EDGE_MARKER.crossBack,
    );
  });

  it("leaves an absent marker absent", () => {
    expect(recolorMarker(undefined, BACK_EDGE_COLOR)).toBeUndefined();
  });
});

describe("createMermaidReactFlowEdge", () => {
  const base: GraphEdge = { id: "e1", source: "A", target: "B" };

  it("should draw a closed arrow for the default point arrowhead", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "normal",
      arrowhead: "arrow_point",
    });
    expect(rfEdge.hidden).toBeUndefined();
    expect(rfEdge.style).toEqual({ stroke: EDGE_STROKE_COLOR });
    expect(rfEdge.markerStart).toBeUndefined();
    expect(rfEdge.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: EDGE_STROKE_COLOR,
    });
  });

  it("should omit markers for an open line", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "normal",
      arrowhead: "arrow_open",
    });
    expect(rfEdge.markerStart).toBeUndefined();
    expect(rfEdge.markerEnd).toBeUndefined();
  });

  it("should dash a dotted stroke with the same pattern as LLVM phi", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "dotted",
      arrowhead: "arrow_point",
    });
    expect(rfEdge.style).toEqual({
      stroke: EDGE_STROKE_COLOR,
      strokeDasharray: "6 6",
    });
  });

  it("should thicken a thick stroke", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "thick",
      arrowhead: "arrow_point",
    });
    expect(rfEdge.style).toEqual({
      stroke: EDGE_STROKE_COLOR,
      strokeWidth: 2,
    });
  });

  it("should not paint an invisible edge", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "invisible",
      arrowhead: "arrow_point",
    });
    expect(rfEdge.hidden).toBe(true);
    expect(rfEdge.markerEnd).toBeUndefined();
  });

  it("should place a circle marker for arrow_circle", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "normal",
      arrowhead: "arrow_circle",
    });
    expect(rfEdge.markerEnd).toBe(EDGE_MARKER.circle);
    expect(rfEdge.markerStart).toBeUndefined();
  });

  it("should place a cross marker for arrow_cross", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "normal",
      arrowhead: "arrow_cross",
    });
    expect(rfEdge.markerEnd).toBe(EDGE_MARKER.cross);
  });

  it("should place arrows at both ends for a bidirectional point", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "normal",
      arrowhead: "double_arrow_point",
    });
    expect(rfEdge.markerStart).toEqual({
      type: MarkerType.ArrowClosed,
      color: EDGE_STROKE_COLOR,
    });
    expect(rfEdge.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: EDGE_STROKE_COLOR,
    });
  });

  it("should compose dotted stroke with a circle marker", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "dotted",
      arrowhead: "arrow_circle",
    });
    expect(rfEdge.style).toEqual({
      stroke: EDGE_STROKE_COLOR,
      strokeDasharray: "6 6",
    });
    expect(rfEdge.markerEnd).toBe(EDGE_MARKER.circle);
  });

  it("should fall an unknown arrowhead back to a closed arrow", () => {
    const rfEdge = createMermaidReactFlowEdge({
      ...base,
      stroke: "normal",
      arrowhead: "not-a-real-type",
    });
    expect(rfEdge.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: EDGE_STROKE_COLOR,
    });
  });
});
