import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../selectionDAGGraphBuilder";
import type { ParseResult } from "../../../parser/selectionDAG";
import { makeParseResult } from "../helpers/selectionDagFixtures";

describe("selectionDAG graphBuilder", () => {
  describe("nodes", () => {
    it("when a single node has no operands, should create one graph node and no edges", () => {
      const result = convertASTToGraph(
        makeParseResult([
          {
            nodeId: "t0",
            types: ["ch", "glue"],
            opName: "EntryToken",
          },
        ]),
      );

      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
      expect(result.nodes[0].id).toBe("t0");
      expect(result.nodes[0].nodeType).toBe("selectionDAG-node");
      expect(result.nodes[0].language).toBe("llvm");
    });

    it("when parse result includes comments, should ignore comment entries", () => {
      const parseResult: ParseResult = {
        entries: [
          { kind: "comment", comment: "SelectionDAG has 2 nodes:", line: 1 },
          {
            kind: "node",
            node: { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
            line: 2,
          },
        ],
      };

      const result = convertASTToGraph(parseResult);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe("t0");
    });
  });
});
