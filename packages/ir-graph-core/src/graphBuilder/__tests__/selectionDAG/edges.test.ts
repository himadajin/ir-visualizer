import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../selectionDAGGraphBuilder";
import { makeParseResult } from "../helpers/selectionDagFixtures";

describe("selectionDAG graphBuilder", () => {
  describe("edges", () => {
    it("when node operands reference known nodes, should generate edges with target handles", () => {
      const result = convertASTToGraph(
        makeParseResult([
          { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
          {
            nodeId: "t1",
            types: ["i64", "ch"],
            opName: "CopyFromReg",
            operands: [
              { kind: "node", nodeId: "t0" },
              { kind: "inline", opName: "Register", types: ["i64"] },
            ],
          },
        ]),
      );

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe("t0");
      expect(result.edges[0].target).toBe("t1");
      expect(result.edges[0].targetHandle).toBe("t1-operand-0");
    });

    it("when node has multiple node operands, should keep operand index in targetHandle", () => {
      const result = convertASTToGraph(
        makeParseResult([
          { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
          { nodeId: "t1", types: ["i64"], opName: "Constant" },
          {
            nodeId: "t2",
            types: ["i64"],
            opName: "add",
            operands: [
              { kind: "node", nodeId: "t0" },
              { kind: "node", nodeId: "t1" },
            ],
          },
        ]),
      );

      expect(result.edges).toHaveLength(2);
      expect(result.edges[0].targetHandle).toBe("t2-operand-0");
      expect(result.edges[1].targetHandle).toBe("t2-operand-1");
    });

    it("when source result type is ch or glue, should flag edge as chain or glue", () => {
      const result = convertASTToGraph(
        makeParseResult([
          { nodeId: "t0", types: ["ch", "glue", "i32"], opName: "EntryToken" },
          {
            nodeId: "t1",
            types: ["i32"],
            opName: "Store",
            operands: [
              { kind: "node", nodeId: "t0", index: 0 },
              { kind: "node", nodeId: "t0", index: 1 },
              { kind: "node", nodeId: "t0", index: 2 },
            ],
          },
        ]),
      );

      expect(result.edges).toHaveLength(3);
      expect(result.edges[0].isChainOrGlue).toBe(true);
      expect(result.edges[1].isChainOrGlue).toBe(true);
      expect(result.edges[2].isChainOrGlue).toBe(false);
    });

    it("when operand is inline, null, or unknown node, should skip that edge", () => {
      const result = convertASTToGraph(
        makeParseResult([
          { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
          {
            nodeId: "t1",
            types: ["ch"],
            opName: "store",
            operands: [
              { kind: "inline", opName: "Register", types: ["i64"] },
              { kind: "null" },
              { kind: "node", nodeId: "t99" },
              { kind: "node", nodeId: "t0" },
            ],
          },
        ]),
      );

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe("t0");
      expect(result.edges[0].target).toBe("t1");
      expect(result.edges[0].targetHandle).toBe("t1-operand-3");
    });

    it("when operand includes source index, should reflect source index in sourceHandle", () => {
      const result = convertASTToGraph(
        makeParseResult([
          { nodeId: "t0", types: ["ch", "glue"], opName: "EntryToken" },
          {
            nodeId: "t1",
            types: ["ch"],
            opName: "RET_GLUE",
            operands: [{ kind: "node", nodeId: "t0", index: 1 }],
          },
        ]),
      );

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe("t0");
      expect(result.edges[0].target).toBe("t1");
      expect(result.edges[0].sourceHandle).toBe("t0-type-1");
      expect(result.edges[0].targetHandle).toBe("t1-operand-0");
      expect(result.edges[0].isChainOrGlue).toBe(true);
    });
  });
});
