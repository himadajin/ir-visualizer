import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../mermaidGraphBuilder";
import type { MermaidAST, MermaidASTEdge } from "../../../ast/mermaidAST";
import { isContainerNode } from "../../../types/graph";

const ast = (override: MermaidAST): MermaidAST => override;

const edge = (sourceId: string, targetId: string): MermaidASTEdge => ({
  sourceId,
  targetId,
  stroke: "normal",
  arrowhead: "arrow_point",
});

const groupDirection = (
  graph: ReturnType<typeof convertASTToGraph>,
  id: string,
) => {
  const node = graph.nodes.find((item) => item.id === id);
  return node && isContainerNode(node) ? node.astData.direction : undefined;
};

describe("mermaid graphBuilder", () => {
  describe("subgraphs", () => {
    it("when subgraphs exist, should emit graph-group nodes with parentId on children", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TB",
          nodes: [
            { id: "A", label: "A" },
            { id: "B", label: "B" },
            { id: "C", label: "C" },
          ],
          edges: [edge("A", "B")],
          subgraphs: [
            { id: "inner", title: "Inner", nodeIds: ["A", "B"] },
            { id: "outer", title: "Outer", nodeIds: ["inner", "C"] },
          ],
        }),
      );

      const inner = graph.nodes.find((node) => node.id === "inner");
      const outer = graph.nodes.find((node) => node.id === "outer");
      expect(inner?.nodeType).toBe("graph-group");
      expect(inner?.label).toBe("Inner");
      expect(inner?.parentId).toBe("outer");
      expect(outer?.parentId).toBeUndefined();

      expect(graph.nodes.find((node) => node.id === "A")?.parentId).toBe(
        "inner",
      );
      expect(graph.nodes.find((node) => node.id === "C")?.parentId).toBe(
        "outer",
      );
    });

    it("when subgraph title is empty, should label the group with its id", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TB",
          nodes: [{ id: "A", label: "A" }],
          edges: [],
          subgraphs: [{ id: "box", title: "", nodeIds: ["A"] }],
        }),
      );

      expect(graph.nodes.find((node) => node.id === "box")?.label).toBe("box");
    });

    it("when a subgraph declares a direction, should put it on the group", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TB",
          nodes: [
            { id: "A", label: "A" },
            { id: "B", label: "B" },
          ],
          edges: [edge("A", "B")],
          subgraphs: [
            {
              id: "box",
              title: "Box",
              nodeIds: ["A", "B"],
              direction: "LR",
            },
          ],
        }),
      );

      expect(groupDirection(graph, "box")).toBe("LR");
    });

    it("when a subgraph has no direction, should omit it so layout inherits", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "LR",
          nodes: [{ id: "A", label: "A" }],
          edges: [],
          subgraphs: [{ id: "box", title: "Box", nodeIds: ["A"] }],
        }),
      );

      expect(groupDirection(graph, "box")).toBeUndefined();
    });

    it("when a child links to a node outside, should drop the subgraph direction", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TB",
          nodes: [
            { id: "A", label: "A" },
            { id: "B", label: "B" },
            { id: "C", label: "C" },
          ],
          edges: [edge("A", "B"), edge("B", "C")],
          subgraphs: [
            {
              id: "box",
              title: "Box",
              nodeIds: ["A", "B"],
              direction: "LR",
            },
          ],
        }),
      );

      expect(groupDirection(graph, "box")).toBeUndefined();
    });

    it("when an edge targets the subgraph id, should keep the subgraph direction", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TB",
          nodes: [
            { id: "A", label: "A" },
            { id: "B", label: "B" },
            { id: "C", label: "C" },
          ],
          edges: [edge("A", "B"), edge("C", "box")],
          subgraphs: [
            {
              id: "box",
              title: "Box",
              nodeIds: ["A", "B"],
              direction: "LR",
            },
          ],
        }),
      );

      expect(groupDirection(graph, "box")).toBe("LR");
    });

    it("when an edge leaves from the subgraph id, should keep the subgraph direction", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TB",
          nodes: [
            { id: "A", label: "A" },
            { id: "C", label: "C" },
          ],
          edges: [edge("box", "C")],
          subgraphs: [
            {
              id: "box",
              title: "Box",
              nodeIds: ["A"],
              direction: "RL",
            },
          ],
        }),
      );

      expect(groupDirection(graph, "box")).toBe("RL");
    });

    it("when a nested child links outside the inner group only, should drop inner and keep outer", () => {
      const graph = convertASTToGraph(
        ast({
          direction: "TB",
          nodes: [
            { id: "A", label: "A" },
            { id: "B", label: "B" },
            { id: "C", label: "C" },
          ],
          edges: [edge("A", "B"), edge("B", "C")],
          subgraphs: [
            {
              id: "inner",
              title: "Inner",
              nodeIds: ["A", "B"],
              direction: "LR",
            },
            {
              id: "outer",
              title: "Outer",
              nodeIds: ["inner", "C"],
              direction: "BT",
            },
          ],
        }),
      );

      expect(groupDirection(graph, "inner")).toBeUndefined();
      expect(groupDirection(graph, "outer")).toBe("BT");
    });
  });
});
