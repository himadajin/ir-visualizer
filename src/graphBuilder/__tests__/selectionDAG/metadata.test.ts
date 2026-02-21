import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../selectionDAGGraphBuilder";
import type { SelectionDAGNode } from "../../../ast/selectionDAGAST";
import { makeParseResult } from "../helpers/selectionDagFixtures";

describe("selectionDAG graphBuilder", () => {
  describe("metadata", () => {
    it("when nodes are converted, should include original astData", () => {
      const dagNode: SelectionDAGNode = {
        nodeId: "t3",
        types: ["i64"],
        opName: "add",
        details: { flags: ["nuw", "nsw"] },
        operands: [
          { kind: "node", nodeId: "t1" },
          { kind: "node", nodeId: "t2" },
        ],
      };

      const result = convertASTToGraph(makeParseResult([dagNode]));
      const astData = result.nodes[0].astData as unknown as SelectionDAGNode;

      expect(astData.nodeId).toBe("t3");
      expect(astData.opName).toBe("add");
      expect(astData.details?.flags).toEqual(["nuw", "nsw"]);
    });
  });
});
