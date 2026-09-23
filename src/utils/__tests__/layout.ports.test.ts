import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ElkNode } from "elkjs/lib/elk-api";
import { getLayoutedElements } from "../layout";
import { llvmMode } from "../../irModes/llvmMode";
import { parseLLVM } from "../../parser/llvm";
import type { GraphData } from "../../types/graph";

const { layout } = vi.hoisted(() => ({
  layout: vi.fn(async (graph: ElkNode) => graph),
}));
vi.mock("elkjs/lib/elk.bundled.js", () => ({
  default: class {
    layout = layout;
  },
}));

beforeEach(() => layout.mockClear());

describe("registry ports passed to ELK", () => {
  it("declares fixed CFG source and target ports matching every edge", async () => {
    const { graph } = parseLLVM(`define void @f() {
entry:
  switch i32 %x, label %entry [ i32 0, label %done i32 1, label %done ]
done:
  ret void
}`);
    const sizes = new Map(
      graph.nodes.map((node) => [node.id, { width: 240, height: 80 }]),
    );
    const result = await getLayoutedElements(graph, sizes, llvmMode);
    const elk = layout.mock.calls[0][0];
    const entry = elk.children!.find(
      (node) => node.id === "func:f:block:entry",
    )!;
    expect(entry.layoutOptions).toEqual({ "elk.portConstraints": "FIXED_POS" });
    expect(entry.ports!.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 120, y: 0 },
      { x: 60, y: 80 },
      { x: 120, y: 80 },
      { x: 180, y: 80 },
    ]);
    const done = elk.children!.find((node) => node.id === "func:f:block:done")!;
    expect(done.ports!.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 120, y: 0 },
      { x: 120, y: 80 },
    ]);
    const byNode = new Map(elk.children!.map((node) => [node.id, node]));
    graph.edges.forEach((edge, index) => {
      const source =
        edge.sourceHandle === undefined
          ? edge.source
          : byNode
              .get(edge.source)!
              .ports!.find(
                (port) => JSON.parse(port.id)[1] === edge.sourceHandle,
              )!.id;
      const target =
        edge.targetHandle === undefined
          ? edge.target
          : byNode
              .get(edge.target)!
              .ports!.find(
                (port) => JSON.parse(port.id)[1] === edge.targetHandle,
              )!.id;
      expect(elk.edges![index]).toMatchObject({
        sources: [source],
        targets: [target],
      });
      expect(result.edges[index].sourceHandle).toBe(edge.sourceHandle);
      expect(result.edges[index].targetHandle).toBe(edge.targetHandle);
    });
    expect(
      result.edges.find((edge) => edge.source === edge.target)?.data
        ?.isBackEdge,
    ).toBe(true);
  });

  it("keeps the existing Use-Def operand ports through the registry", async () => {
    const { graph } = await llvmMode.views[1].parse(`define i32 @f(i32 %a) {
  %v = add i32 %a, 1
  ret i32 %v
}`);
    const sizes = new Map(
      graph.nodes.map((node) => [node.id, { width: 400, height: 30 }]),
    );
    await getLayoutedElements(graph, sizes, llvmMode);
    const elk = layout.mock.calls[0][0];
    const ids = elk
      .children!.flatMap((node) => node.ports ?? [])
      .map((port) => JSON.parse(port.id)[1]);
    expect(ids).toEqual(expect.arrayContaining(["u-a", "u-v", "def"]));
    expect(
      elk
        .children!.filter((node) => node.ports)
        .every(
          (node) => node.layoutOptions?.["elk.portConstraints"] === "FIXED_POS",
        ),
    ).toBe(true);
  });

  it("namespaces arbitrary node and port ids without delimiter collisions", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "a", label: "A" },
        { id: "a::b", label: "B" },
      ],
      edges: [
        {
          id: "edge",
          source: "a",
          sourceHandle: "b::c",
          target: "a::b",
          targetHandle: "c",
        },
      ],
    };
    await getLayoutedElements(
      graph,
      new Map(graph.nodes.map((node) => [node.id, { width: 100, height: 40 }])),
      {
        getNodePorts: (node) => [
          { id: node.id === "a" ? "b::c" : "c", x: 50, y: 0 },
        ],
      },
    );
    const elk = layout.mock.calls[0][0];
    expect(elk.children![0].ports![0].id).not.toBe(
      elk.children![1].ports![0].id,
    );
    expect(elk.edges![0]).toMatchObject({
      sources: [elk.children![0].ports![0].id],
      targets: [elk.children![1].ports![0].id],
    });
  });
});
