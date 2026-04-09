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

    it("when old LLVM load has wrapped operand and trailing attrs, should parse wrapped index and detail", () => {
      const result = parseSelectionDAGNode(
        "0x7fcbd985abcd: i64,ch = load 0x7fcbd9850001, 0x7fcbd9850002, 0x7fcbd9850003 <0x7fcbd9850004:0> <sext i16> alignment=2",
      );

      expect(result.error).toBeUndefined();
      expect(result.node).toBeDefined();
      expect(result.node?.nodeId).toBe("0x7fcbd985abcd");
      expect(result.node?.types).toEqual(["i64", "ch"]);
      expect(result.node?.opName).toBe("load");
      expect(result.node?.details).toEqual({
        flags: [],
        detail: "sext i16 alignment=2",
      });
      expect(result.node?.operands).toEqual([
        { kind: "node", nodeId: "0x7fcbd9850001" },
        { kind: "node", nodeId: "0x7fcbd9850002" },
        { kind: "node", nodeId: "0x7fcbd9850003" },
        { kind: "node", nodeId: "0x7fcbd9850004", index: 0, wrapped: true },
      ]);
    });

    it("when TargetGlobalAddress has immediate operand, should parse inline detail and immediate operand", () => {
      const result = parseSelectionDAGNode(
        "0x7fcbd985abcd: i32 = TargetGlobalAddress <void (...)* @function> 0",
      );

      expect(result.error).toBeUndefined();
      expect(result.node).toBeDefined();
      expect(result.node?.opName).toBe("TargetGlobalAddress");
      expect(result.node?.details).toEqual({
        flags: [],
        detail: "void (...)* @function",
      });
      expect(result.node?.operands).toEqual([
        { kind: "immediate", value: "0" },
      ]);
    });

    it("when ArgFlags detail is empty, should parse both spaced and compact angle forms", () => {
      const spaced = parseSelectionDAGNode("0x7fcbd985abcd: ch = ArgFlags < >");

      expect(spaced.error).toBeUndefined();
      expect(spaced.node).toBeDefined();
      expect(spaced.node?.opName).toBe("ArgFlags");
      expect(spaced.node?.details).toEqual({
        flags: [],
        detail: "",
      });

      const compact = parseSelectionDAGNode("0x7fcbd985abcd: ch = ArgFlags <>");

      expect(compact.error).toBeUndefined();
      expect(compact.node).toBeDefined();
      expect(compact.node?.opName).toBe("ArgFlags");
      expect(compact.node?.details).toEqual({
        flags: [],
        detail: "",
      });
    });
  });
});
