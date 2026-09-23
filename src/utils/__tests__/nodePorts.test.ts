import { describe, expect, it } from "vitest";
import {
  prepareNodePorts,
  portX,
  arrivalHandleId,
  elkPortId,
} from "../nodePorts";
import {
  codeGraphEdgeBuilder,
  mermaidGraphEdgeBuilder,
  selectionDAGEdgeBuilder,
} from "../layout";
import { ARRIVAL_GAP } from "../spacing";
import { routeEdges } from "../edgeRouter";
import type { GraphData } from "../../types/graph";
import { llvmMode } from "../../irModes/llvmMode";

const graph: GraphData = {
  nodes: ["A", "B", "T"].map((id) => ({ id, label: id })),
  edges: [
    { id: "b", source: "B", target: "T" },
    { id: "self", source: "T", target: "T" },
    { id: "a2", source: "A", target: "T" },
    { id: "a1", source: "A", target: "T" },
  ],
};

describe("arrival assignment", () => {
  it("separates parallel edges and self-loops in stable source/edge order", () => {
    const before = structuredClone(graph);
    const prepared = prepareNodePorts(graph, codeGraphEdgeBuilder);
    const ports = prepared.layouts
      .get("T")!
      .ports.filter((p) => p.side === "top");
    expect(ports.map((p) => p.id)).toEqual(
      ["a1", "a2", "b", "self"].map(arrivalHandleId),
    );
    expect(new Set(prepared.edges.map((e) => e.targetHandle)).size).toBe(4);
    const reversed = prepareNodePorts(
      { nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() },
      codeGraphEdgeBuilder,
    );
    expect(reversed.layouts.get("T")).toEqual(prepared.layouts.get("T"));
    expect(graph).toEqual(before);
  });

  it("has enough room for every quantized arrival, even with 200 inputs", () => {
    const crowded: GraphData = {
      nodes: graph.nodes,
      edges: Array.from({ length: 200 }, (_, i) => ({
        id: String(i),
        source: "A",
        target: "T",
      })),
    };
    const plan = prepareNodePorts(crowded, codeGraphEdgeBuilder).layouts.get(
      "T",
    )!;
    expect(plan.minWidth).toBe(201 * ARRIVAL_GAP);
    for (const offset of [0, 0.49, 0.51, -0.51]) {
      const xs = plan.ports.map((p) =>
        Math.round(offset + portX(p, plan.minWidth)),
      );
      for (let i = 1; i < xs.length; i++)
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(ARRIVAL_GAP);
    }
  });

  it("keeps Mermaid marker meaning, excludes invisible links, and leaves SelectionDAG alone", () => {
    const variant: GraphData = {
      ...graph,
      edges: graph.edges.map((e, i) => ({
        ...e,
        stroke: i === 0 ? "invisible" : "thick",
        arrowhead: "arrow_open",
      })),
    };
    const prepared = prepareNodePorts(variant, mermaidGraphEdgeBuilder);
    expect(
      prepared.layouts.get("T")!.ports.filter((p) => p.side === "top"),
    ).toHaveLength(3);
    expect(prepared.edges[0].targetHandle).toBeUndefined();
    expect(prepared.edges[0].hidden).toBe(true);
    for (const e of prepared.edges) expect(e.markerEnd).toBeUndefined();
    expect(prepareNodePorts(graph, selectionDAGEdgeBuilder).layouts.size).toBe(
      0,
    );
  });

  it("keeps operand order, separates unresolved positions, and grows past long operands", () => {
    const text = "%r = add i32 %b, %a";
    const phi: GraphData = {
      nodes: [
        {
          id: "T",
          label: text,
          nodeType: "llvm-useDefInstruction",
          astData: {
            text,
            uses: ["missing2", "a", "b", "missing1"],
            def: "r",
            blockLabel: "entry",
            blockIndex: 0,
            isTerminator: false,
          },
        },
        ...["a", "b", "missing1", "missing2"].map((id) => ({ id, label: id })),
      ],
      edges: ["a", "b", "missing1", "missing2"].map((id) => ({
        id,
        source: id,
        target: "T",
        targetHandle: `u-${id}`,
      })),
    };
    const prepared = prepareNodePorts(
      phi,
      codeGraphEdgeBuilder,
      llvmMode.nodePorts,
    );
    const plan = prepared.layouts.get("T")!;
    expect(plan.ports.map((p) => p.id)).toEqual(
      ["b", "a", "missing1", "missing2"].map(arrivalHandleId),
    );
    expect(plan.ports.every((p) => !p.relative)).toBe(true);
    for (let i = 1; i < plan.ports.length; i++)
      expect(plan.ports[i].x - plan.ports[i - 1].x).toBeGreaterThanOrEqual(
        ARRIVAL_GAP,
      );
    expect(plan.minWidth).toBe(plan.ports.at(-1)!.x + ARRIVAL_GAP);
    expect(prepared.edges.map((e) => e.targetHandle)).toEqual(
      phi.edges.map((e) => arrivalHandleId(e.id)),
    );
  });

  it("produces distinct router endpoints after rounding and a separate self-loop arrival", () => {
    const prepared = prepareNodePorts(graph, codeGraphEdgeBuilder);
    const rects = graph.nodes.map((node, i) => ({
      id: node.id,
      x: i * 300 + 0.49,
      y: i === 2 ? 300.51 : 0,
      width: 200,
      height: 40,
    }));
    const requests = prepared.edges.map((edge) => {
      const source = rects.find((r) => r.id === edge.source)!;
      const target = rects.find((r) => r.id === edge.target)!;
      const port = prepared.layouts
        .get(target.id)!
        .ports.find((p) => p.id === edge.targetHandle)!;
      return {
        id: edge.id,
        source: source.id,
        target: target.id,
        sourcePoint: {
          x: source.x + source.width / 2,
          y: source.y + source.height,
        },
        targetPoint: { x: target.x + portX(port, target.width), y: target.y },
        sourceSide: "bottom" as const,
        targetSide: "top" as const,
      };
    });
    const routes = routeEdges(rects, requests);
    expect(
      new Set(
        [...routes.values()].map((points) => JSON.stringify(points.at(-1))),
      ).size,
    ).toBe(graph.edges.length);
    for (const req of requests)
      expect(routes.get(req.id)!.at(-1)).toEqual({
        x: Math.round(req.targetPoint.x),
        y: Math.round(req.targetPoint.y),
      });
  });

  it("encodes delimiter-bearing ids without collisions", () => {
    expect(elkPortId("a::b", "c")).not.toBe(elkPortId("a", "b::c"));
    expect(arrivalHandleId('a"b')).not.toBe(arrivalHandleId("ab"));
  });
});
