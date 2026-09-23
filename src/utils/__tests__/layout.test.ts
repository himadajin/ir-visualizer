import { describe, it, expect, vi } from "vitest";
import {
  getLayoutedElements,
  sizesCoverGraph,
  toElkSize,
  toElkDirection,
  mermaidGraphEdgeBuilder,
} from "../layout";
import type { RoutedEdgeData } from "../../components/Graph/RoutedEdge";
import type { GraphData } from "../../types/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import { llvmMode } from "../../irModes/llvmMode";
import {
  prepareNodePorts,
  arrivalHandleId,
  portX,
  elkPortId,
} from "../nodePorts";
import type { NodePortLayout } from "../../types/nodePorts";
import { codeGraphEdgeBuilder } from "../layout";
import { BACK_EDGE_COLOR, EDGE_MARKER } from "../converter";

const BOX = { width: 120, height: 40 };
const sizesOf = (graph: GraphData) =>
  new Map(graph.nodes.map((node) => [node.id, BOX]));

const layout = (
  graph: GraphData,
  options?: Parameters<typeof getLayoutedElements>[2],
) => getLayoutedElements(graph, sizesOf(graph), options);

describe("getLayoutedElements", () => {
  it("should layout a simple graph with positions and no stored edge geometry", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const { nodes, edges } = await layout(graph);

    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);

    // Every node should have a position
    for (const node of nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }

    // The edge is routed, but layout attaches only the structural back-edge
    // flag — no geometry (specs/graph-view.md §3): edge routing is computed
    // at render time from live node rects (src/utils/edgeRouter.ts), not by
    // layout.ts.
    const data = edges[0].data as RoutedEdgeData;
    expect(edges[0].type).toBe("routed");
    expect(data.isBackEdge).toBe(false);
    expect(data).not.toHaveProperty("route");
  });

  it("should respect direction option", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const tdResult = await layout(graph, { direction: "TD" });
    const lrResult = await layout(graph, { direction: "LR" });

    // In TD: A should be above B (lower y)
    const tdA = tdResult.nodes.find((n) => n.id === "A")!;
    const tdB = tdResult.nodes.find((n) => n.id === "B")!;
    expect(tdA.position.y).toBeLessThan(tdB.position.y);

    // In LR: A should be to the left of B (lower x)
    const lrA = lrResult.nodes.find((n) => n.id === "A")!;
    const lrB = lrResult.nodes.find((n) => n.id === "B")!;
    expect(lrA.position.x).toBeLessThan(lrB.position.x);
  });

  it("maps graph directions onto ELK", () => {
    expect(toElkDirection("TD")).toBe("DOWN");
    expect(toElkDirection("TB")).toBe("DOWN");
    expect(toElkDirection("BT")).toBe("UP");
    expect(toElkDirection("LR")).toBe("RIGHT");
    expect(toElkDirection("RL")).toBe("LEFT");
    expect(toElkDirection(undefined)).toBe("DOWN");
    expect(toElkDirection("nope")).toBe("DOWN");
  });

  it("places BT, RL, and TB roots in the declared orientation", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const bt = await layout(graph, { direction: "BT" });
    expect(bt.nodes.find((n) => n.id === "A")!.position.y).toBeGreaterThan(
      bt.nodes.find((n) => n.id === "B")!.position.y,
    );

    const rl = await layout(graph, { direction: "RL" });
    expect(rl.nodes.find((n) => n.id === "A")!.position.x).toBeGreaterThan(
      rl.nodes.find((n) => n.id === "B")!.position.x,
    );

    const tb = await layout(graph, { direction: "TB" });
    expect(tb.nodes.find((n) => n.id === "A")!.position.y).toBeLessThan(
      tb.nodes.find((n) => n.id === "B")!.position.y,
    );
  });

  it("does not flag a BT forward edge as a back edge", async () => {
    const graph: GraphData = {
      direction: "BT",
      nodes: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      edges: [{ id: "fwd", source: "A", target: "B" }],
    };

    const { nodes, edges } = await layout(graph);
    const a = nodes.find((n) => n.id === "A")!;
    const b = nodes.find((n) => n.id === "B")!;
    expect(a.position.y).toBeGreaterThan(b.position.y);
    expect((edges[0].data as RoutedEdgeData).isBackEdge).toBe(false);
  });

  it("flags the downward edge of a BT cycle as a back edge", async () => {
    const graph: GraphData = {
      direction: "BT",
      nodes: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      edges: [
        { id: "ab", source: "A", target: "B" },
        { id: "ba", source: "B", target: "A" },
      ],
    };

    const { edges } = await layout(graph);
    const flagged = edges.filter(
      (e) => (e.data as RoutedEdgeData).isBackEdge === true,
    );
    expect(flagged).toHaveLength(1);
  });

  it("should flag backward edges as back edges and style them", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "B", target: "A" }, // back edge
      ],
    };

    const { edges } = await layout(graph);

    // In a pure 2-cycle either edge may be the one ELK reverses; exactly one
    // of them must come out flagged, and the flagged one carries the accent.
    expect(edges.map((e) => e.type)).toEqual(["routed", "routed"]);
    const flagged = edges.filter(
      (e) => (e.data as RoutedEdgeData).isBackEdge === true,
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0].style?.stroke).toBe(BACK_EDGE_COLOR);
  });

  it("should flag self-loops as back edges", async () => {
    const graph: GraphData = {
      nodes: [{ id: "A", label: "A", language: "mermaid" }],
      edges: [{ id: "e1", source: "A", target: "A" }],
    };

    const { edges } = await layout(graph);
    expect(edges[0].type).toBe("routed");
    expect((edges[0].data as RoutedEdgeData).isBackEdge).toBe(true);
  });

  it("should handle a graph with no edges", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [],
    };

    const { nodes, edges } = await layout(graph);

    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(0);
  });

  it("should handle complex graph without overlapping nodes", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
        { id: "C", label: "C", language: "mermaid" },
        { id: "D", label: "D", language: "mermaid" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "A", target: "C" },
        { id: "e3", source: "B", target: "D" },
        { id: "e4", source: "C", target: "D" },
      ],
    };

    const { nodes } = await layout(graph);

    // Check that no two nodes have the exact same position
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const samePos =
          nodes[i].position.x === nodes[j].position.x &&
          nodes[i].position.y === nodes[j].position.y;
        expect(samePos).toBe(false);
      }
    }
  });

  it("routes use-def edges to the target's operand port", async () => {
    const text = "%2 = add i32 %1, %0";
    const graph: GraphData = {
      nodes: [
        {
          id: "def1",
          label: "%1 = add i32 %0, 45",
          nodeType: "llvm-useDefInstruction",
          astData: {
            text: "%1 = add i32 %0, 45",
            def: "1",
            uses: ["0"],
            isTerminator: false,
            blockLabel: "entry",
            blockIndex: 0,
          },
        },
        {
          id: "use1",
          label: text,
          nodeType: "llvm-useDefInstruction",
          astData: {
            text,
            def: "2",
            uses: ["1", "0"],
            isTerminator: false,
            blockLabel: "entry",
            blockIndex: 0,
          },
        },
      ],
      edges: [
        {
          id: "e-def1-use1-1",
          source: "def1",
          target: "use1",
          sourceHandle: "def",
          targetHandle: "u-1",
        },
      ],
    };

    const nodePorts = llvmMode.nodePorts;
    const prepared = prepareNodePorts(graph, codeGraphEdgeBuilder, nodePorts);
    const sizes = new Map(
      graph.nodes.map((n) => [
        n.id,
        {
          width: Math.max(
            BOX.width,
            Math.ceil(prepared.layouts.get(n.id)?.minWidth ?? 0),
          ),
          height: BOX.height,
        },
      ]),
    );
    const { edges, nodes } = await getLayoutedElements(graph, sizes, {
      nodePorts,
    });
    expect(edges[0].targetHandle).toBe(arrivalHandleId("e-def1-use1-1"));
    expect(edges[0].sourceHandle).toBe("def");
    const ports = nodes.find((n) => n.id === "use1")!.data
      .portLayout as NodePortLayout;
    expect(ports.ports.find((p) => p.side === "top")!.relative).toBe(false);
  });

  it("places from the given sizes, not from an estimate", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A", language: "mermaid" },
        { id: "B", label: "B", language: "mermaid" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const narrow = await getLayoutedElements(
      graph,
      new Map([
        ["A", { width: 80, height: 40 }],
        ["B", { width: 80, height: 40 }],
      ]),
      { direction: "LR" },
    );
    const wide = await getLayoutedElements(
      graph,
      new Map([
        ["A", { width: 400, height: 40 }],
        ["B", { width: 80, height: 40 }],
      ]),
      { direction: "LR" },
    );

    const narrowA = narrow.nodes.find((node) => node.id === "A")!;
    const narrowB = narrow.nodes.find((node) => node.id === "B")!;
    const wideA = wide.nodes.find((node) => node.id === "A")!;
    const wideB = wide.nodes.find((node) => node.id === "B")!;
    expect(wideB.position.x - wideA.position.x).toBeGreaterThan(
      narrowB.position.x - narrowA.position.x,
    );
  });

  it("quantizes sizes onto the router's integer lattice", () => {
    expect(toElkSize({ width: 100.4, height: 40.6 })).toEqual({
      width: 100,
      height: 41,
    });
  });

  it("rejects a size map that does not cover the graph", () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      edges: [],
    };
    expect(sizesCoverGraph(graph, new Map([["A", BOX]]))).toBe(false);
    expect(sizesCoverGraph(graph, sizesOf(graph))).toBe(true);
    expect(
      sizesCoverGraph(
        graph,
        new Map([
          ["A", BOX],
          ["B", { width: 0.4, height: 40 }],
        ]),
      ),
    ).toBe(false);
  });
});

describe("getLayoutedElements — nested nodes", () => {
  const group = (
    id: string,
    label: string,
    direction?: GraphData["direction"],
  ): GraphData["nodes"][number] => ({
    id,
    label,
    nodeType: "graph-group",
    astData: direction !== undefined ? { direction } : {},
  });

  it("places children inside the parent with parentId and extent", async () => {
    const graph: GraphData = {
      nodes: [
        group("g", "G"),
        { id: "A", label: "A", parentId: "g" },
        { id: "B", label: "B", parentId: "g" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const { nodes } = await layout(graph);
    const g = nodes.find((n) => n.id === "g")!;
    const a = nodes.find((n) => n.id === "A")!;
    const b = nodes.find((n) => n.id === "B")!;

    expect(g.parentId).toBeUndefined();
    expect(a.parentId).toBe("g");
    expect(b.parentId).toBe("g");
    expect(a.extent).toBe("parent");
    expect(b.extent).toBe("parent");
    expect(typeof g.style?.width).toBe("number");
    expect(typeof g.style?.height).toBe("number");
    const width = g.style?.width as number;
    const height = g.style?.height as number;
    expect(a.position.x).toBeGreaterThanOrEqual(0);
    expect(a.position.y).toBeGreaterThanOrEqual(0);
    expect(a.position.x + BOX.width).toBeLessThanOrEqual(width);
    expect(a.position.y + BOX.height).toBeLessThanOrEqual(height);
    expect(b.position.x + BOX.width).toBeLessThanOrEqual(width);
    expect(b.position.y + BOX.height).toBeLessThanOrEqual(height);
  });

  it("nests a container inside a container", async () => {
    const graph: GraphData = {
      nodes: [
        group("outer", "outer"),
        { ...group("inner", "inner"), parentId: "outer" },
        { id: "A", label: "A", parentId: "inner" },
      ],
      edges: [],
    };

    const { nodes } = await layout(graph);
    expect(nodes.find((n) => n.id === "inner")?.parentId).toBe("outer");
    expect(nodes.find((n) => n.id === "A")?.parentId).toBe("inner");
  });

  it("lays out a container's children in that container's direction", async () => {
    const graph: GraphData = {
      direction: "TD",
      nodes: [
        group("g", "G", "LR"),
        { id: "A", label: "A", parentId: "g" },
        { id: "B", label: "B", parentId: "g" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const { nodes } = await layout(graph);
    const a = nodes.find((n) => n.id === "A")!;
    const b = nodes.find((n) => n.id === "B")!;
    expect(a.position.x).toBeLessThan(b.position.x);
  });

  it("inherits parent direction when a container has none", async () => {
    const graph: GraphData = {
      direction: "LR",
      nodes: [
        group("g", "G"),
        { id: "A", label: "A", parentId: "g" },
        { id: "B", label: "B", parentId: "g" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const { nodes } = await layout(graph);
    const a = nodes.find((n) => n.id === "A")!;
    const b = nodes.find((n) => n.id === "B")!;
    expect(a.position.x).toBeLessThan(b.position.x);
  });

  it("applies mixed nested directions independently of root and parent", async () => {
    const graph: GraphData = {
      direction: "TD",
      nodes: [
        group("outer", "outer", "LR"),
        { ...group("inner", "inner", "BT"), parentId: "outer" },
        { id: "A", label: "A", parentId: "inner" },
        { id: "B", label: "B", parentId: "inner" },
        { id: "C", label: "C", parentId: "outer" },
      ],
      edges: [
        { id: "ab", source: "A", target: "B" },
        { id: "inner-c", source: "inner", target: "C" },
      ],
    };

    const { nodes } = await layout(graph);
    const a = nodes.find((n) => n.id === "A")!;
    const b = nodes.find((n) => n.id === "B")!;
    const inner = nodes.find((n) => n.id === "inner")!;
    const c = nodes.find((n) => n.id === "C")!;
    expect(a.position.y).toBeGreaterThan(b.position.y);
    expect(inner.position.x).toBeLessThan(c.position.x);
  });

  it("keeps a container's direction when an edge targets the container id", async () => {
    const graph: GraphData = {
      direction: "TD",
      nodes: [
        group("g", "G", "LR"),
        { id: "A", label: "A", parentId: "g" },
        { id: "B", label: "B", parentId: "g" },
        { id: "C", label: "C" },
      ],
      edges: [
        { id: "ab", source: "A", target: "B" },
        { id: "cg", source: "C", target: "g" },
      ],
    };

    const { nodes } = await layout(graph);
    const a = nodes.find((n) => n.id === "A")!;
    const b = nodes.find((n) => n.id === "B")!;
    expect(a.position.x).toBeLessThan(b.position.x);
  });

  it("keeps an empty container as a sized node", async () => {
    const graph: GraphData = {
      nodes: [group("g", "empty")],
      edges: [],
    };

    const { nodes } = await layout(graph);
    const g = nodes.find((n) => n.id === "g")!;
    expect(g.parentId).toBeUndefined();
    expect(g.style?.width).toBe(BOX.width);
    expect(g.style?.height).toBe(BOX.height);
  });

  it("routes an edge whose target is a container", async () => {
    const graph: GraphData = {
      nodes: [
        group("g", "G"),
        { id: "A", label: "A", parentId: "g" },
        { id: "B", label: "B" },
      ],
      edges: [{ id: "e1", source: "B", target: "g" }],
    };

    const { edges } = await layout(graph);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("B");
    expect(edges[0].target).toBe("g");
    expect(edges[0].type).toBe("routed");
  });

  it("rejects a parentId that names a missing node", async () => {
    const graph: GraphData = {
      nodes: [{ id: "A", label: "A", parentId: "missing" }],
      edges: [],
    };
    await expect(layout(graph)).rejects.toThrow(/parentId missing/);
  });

  it("rejects a parent that is not a container", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "A", label: "A" },
        { id: "B", label: "B", parentId: "A" },
      ],
      edges: [],
    };
    await expect(layout(graph)).rejects.toThrow(/not a container/);
  });

  it("rejects a parentId cycle", async () => {
    const graph: GraphData = {
      nodes: [
        { ...group("g1", "g1"), parentId: "g2" },
        { ...group("g2", "g2"), parentId: "g1" },
      ],
      edges: [],
    };
    await expect(layout(graph)).rejects.toThrow(/cycle/);
  });

  it("recolors a mermaid circle back-edge without replacing the marker kind", async () => {
    const graph: GraphData = {
      nodes: [{ id: "A", label: "A", language: "mermaid" }],
      edges: [
        {
          id: "e1",
          source: "A",
          target: "A",
          stroke: "normal",
          arrowhead: "arrow_circle",
        },
      ],
    };

    const { edges } = await layout(graph, {
      edgeBuilder: mermaidGraphEdgeBuilder,
    });
    expect((edges[0].data as RoutedEdgeData).isBackEdge).toBe(true);
    expect(edges[0].style?.stroke).toBe(BACK_EDGE_COLOR);
    expect(edges[0].markerEnd).toBe(EDGE_MARKER.circleBack);
  });

  it("recolors a mermaid open back-edge without adding an arrow", async () => {
    const graph: GraphData = {
      nodes: [{ id: "A", label: "A", language: "mermaid" }],
      edges: [
        {
          id: "e1",
          source: "A",
          target: "A",
          stroke: "normal",
          arrowhead: "arrow_open",
        },
      ],
    };

    const { edges } = await layout(graph, {
      edgeBuilder: mermaidGraphEdgeBuilder,
    });
    expect((edges[0].data as RoutedEdgeData).isBackEdge).toBe(true);
    expect(edges[0].style?.stroke).toBe(BACK_EDGE_COLOR);
    expect(edges[0].markerEnd).toBeUndefined();
    expect(edges[0].markerStart).toBeUndefined();
  });

  it("recolors both markers on a bidirectional mermaid back-edge", async () => {
    const graph: GraphData = {
      nodes: [{ id: "A", label: "A", language: "mermaid" }],
      edges: [
        {
          id: "e1",
          source: "A",
          target: "A",
          stroke: "normal",
          arrowhead: "double_arrow_point",
        },
      ],
    };

    const { edges } = await layout(graph, {
      edgeBuilder: mermaidGraphEdgeBuilder,
    });
    expect((edges[0].data as RoutedEdgeData).isBackEdge).toBe(true);
    expect(edges[0].markerStart).toEqual({
      type: "arrowclosed",
      color: BACK_EDGE_COLOR,
    });
    expect(edges[0].markerEnd).toEqual({
      type: "arrowclosed",
      color: BACK_EDGE_COLOR,
    });
  });

  it("does not paint an invisible mermaid back-edge", async () => {
    const graph: GraphData = {
      nodes: [{ id: "A", label: "A", language: "mermaid" }],
      edges: [
        {
          id: "e1",
          source: "A",
          target: "A",
          stroke: "invisible",
          arrowhead: "arrow_point",
        },
      ],
    };

    const { edges } = await layout(graph, {
      edgeBuilder: mermaidGraphEdgeBuilder,
    });
    expect((edges[0].data as RoutedEdgeData).isBackEdge).toBe(true);
    expect(edges[0].hidden).toBe(true);
    expect(edges[0].style?.stroke).not.toBe(BACK_EDGE_COLOR);
  });
});

describe("routed port geometry", () => {
  it("keeps ELK ports and rendered arrivals aligned after compound resizing", async () => {
    const graph: GraphData = {
      nodes: [
        { id: "G", label: "group", nodeType: "graph-group", astData: {} },
        { id: "A", label: "wide child", parentId: "G" },
        { id: "X", label: "X" },
        { id: "Y", label: "Y" },
      ],
      edges: [
        { id: "xg", source: "X", target: "G" },
        { id: "yg", source: "Y", target: "G" },
        { id: "ax", source: "A", target: "X" },
      ],
    };
    const spy = vi.spyOn(ELK.prototype, "layout");
    try {
      const sizes = sizesOf(graph);
      sizes.set("A", { width: 500, height: 40 });
      const result = await getLayoutedElements(graph, sizes);
      const output = (await spy.mock.results.at(-1)!.value) as ElkNode;
      const elkNodes = new Map<string, ElkNode>();
      const visit = (node: ElkNode) => {
        elkNodes.set(node.id, node);
        node.children?.forEach(visit);
      };
      visit(output);
      expect(elkNodes.get("G")!.width).toBeGreaterThan(500);
      for (const node of result.nodes) {
        const layout = node.data.portLayout as NodePortLayout | undefined;
        if (layout === undefined) continue;
        const elk = elkNodes.get(node.id)!;
        for (const port of layout.ports) {
          const actual = elk.ports!.find(
            (p) => p.id === elkPortId(node.id, port.id),
          )!;
          expect(actual.x).toBeCloseTo(portX(port, elk.width!), 5);
          expect(actual.y).toBeCloseTo(
            port.side === "top" ? 0 : elk.height!,
            5,
          );
        }
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("preserves upward DAG order even when nodes are supplied in reverse", async () => {
    const graph: GraphData = {
      direction: "BT",
      nodes: ["C", "B", "A"].map((id) => ({ id, label: id })),
      edges: [
        { id: "ab", source: "A", target: "B" },
        { id: "bc", source: "B", target: "C" },
      ],
    };
    const result = await layout(graph);
    const y = new Map(result.nodes.map((n) => [n.id, n.position.y]));
    expect(y.get("A")!).toBeGreaterThan(y.get("B")!);
    expect(y.get("B")!).toBeGreaterThan(y.get("C")!);
  });
});

it("keeps container dimensions stable across repeated Reset Layout passes", async () => {
  const graph: GraphData = {
    nodes: [
      { id: "G", label: "G", nodeType: "graph-group", astData: {} },
      { id: "A", label: "A", parentId: "G" },
      { id: "B", label: "B", parentId: "G" },
      { id: "X", label: "X" },
    ],
    edges: [
      { id: "ab", source: "A", target: "B" },
      { id: "xg", source: "X", target: "G" },
    ],
  };
  const sizes = sizesOf(graph);
  const first = await getLayoutedElements(graph, sizes);
  const group = first.nodes.find((n) => n.id === "G")!;
  sizes.set("G", {
    width: group.style!.width as number,
    height: group.style!.height as number,
  });
  const reset = await getLayoutedElements(graph, sizes);
  expect(reset.nodes.find((n) => n.id === "G")!.style).toEqual(group.style);
  expect(reset.nodes.map((n) => n.position)).toEqual(
    first.nodes.map((n) => n.position),
  );
});
