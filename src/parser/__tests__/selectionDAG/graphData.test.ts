import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../../graphBuilder/selectionDAGGraphBuilder";
import {
  parseSelectionDAG,
  parseSelectionDAGToGraphData,
} from "../../selectionDAG";
import { selectionDagFullDump } from "../helpers/selectionDagFixtures";

describe("selectionDAG parser", () => {
  describe("graph data", () => {
    it("when parseSelectionDAGToGraphData is used, should match convertASTToGraph(parseSelectionDAG(input))", () => {
      const direct = parseSelectionDAGToGraphData(selectionDagFullDump);
      const viaAst = convertASTToGraph(parseSelectionDAG(selectionDagFullDump));

      expect(direct).toEqual(viaAst);
    });

    it("when dump has valid node links, should build TD graph with nodes and edges", () => {
      const graph = parseSelectionDAGToGraphData(selectionDagFullDump);

      expect(graph.direction).toBe("TD");
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.nodes[0].nodeType).toBe("selectionDAG-node");
      expect(graph.nodes[0].language).toBe("llvm");
    });
  });
});
