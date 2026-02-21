import { describe, expect, it } from "vitest";
import { parseSelectionDAGNode } from "../../selectionDAG";
import { selectionDagMachineOpLine } from "../helpers/selectionDagFixtures";

describe("selectionDAG parser", () => {
  describe("operands and details", () => {
    it("when machine op has operands and source index, should parse mixed operand kinds", () => {
      const result = parseSelectionDAGNode(selectionDagMachineOpLine);

      expect(result.error).toBeUndefined();
      expect(result.node?.opName).toBe("RISCVISD::RET_GLUE");
      expect(result.node?.operands).toEqual([
        { kind: "node", nodeId: "t21" },
        {
          kind: "inline",
          opName: "Register",
          types: ["i64"],
          details: {
            flags: [],
            reg: { type: "PhysReg", value: "$x10" },
          },
        },
        { kind: "node", nodeId: "t21", index: 1 },
      ]);
    });

    it("when node includes detail, verbose, and inline detail operand, should parse all fields", () => {
      const result = parseSelectionDAGNode(
        "t10: ch = store<(store (s64) into %ir.a.addr)> [ORD=5] t0, t2, FrameIndex:i64<0>, <null>",
      );

      expect(result.error).toBeUndefined();
      expect(result.node?.details).toEqual({
        flags: [],
        detail: "(store (s64) into %ir.a.addr)",
      });
      expect(result.node?.verbose).toBe("ORD=5");
      expect(result.node?.operands?.[2]).toEqual({
        kind: "inline",
        opName: "FrameIndex",
        types: ["i64"],
        details: { flags: [], detail: "0" },
      });
      expect(result.node?.operands?.[3]).toEqual({ kind: "null" });
    });

    it("when node includes flag list, should parse flags into details", () => {
      const result = parseSelectionDAGNode("t3: i64 = add nuw nsw t1, t2");

      expect(result.error).toBeUndefined();
      expect(result.node?.details).toEqual({ flags: ["nuw", "nsw"] });
      expect(result.node?.operands).toEqual([
        { kind: "node", nodeId: "t1" },
        { kind: "node", nodeId: "t2" },
      ]);
    });
  });
});
