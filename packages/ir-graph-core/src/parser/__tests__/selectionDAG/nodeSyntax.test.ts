import { describe, expect, it } from "vitest";
import { parseSelectionDAGNode } from "../../selectionDAG";
import {
  selectionDagFullDump,
  selectionDagMinimalNodeLine,
} from "../helpers/selectionDagFixtures";

describe("selectionDAG parser", () => {
  describe("node syntax", () => {
    it("when a minimal node line is parsed, should return node id, types, and opName", () => {
      const result = parseSelectionDAGNode(selectionDagMinimalNodeLine);

      expect(result.error).toBeUndefined();
      expect(result.node).toBeDefined();
      expect(result.node?.nodeId).toBe("t0");
      expect(result.node?.types).toEqual(["ch", "glue"]);
      expect(result.node?.opName).toBe("EntryToken");
      expect(result.node?.details).toBeUndefined();
      expect(result.node?.operands).toBeUndefined();
    });

    it("when old-format hex node has [ORD=N], should parse verbose field", () => {
      const result = parseSelectionDAGNode(
        "  0x8c43010: ch = EntryToken [ORD=1]",
      );

      expect(result.error).toBeUndefined();
      expect(result.node?.nodeId).toBe("0x8c43010");
      expect(result.node?.opName).toBe("EntryToken");
      expect(result.node?.verbose).toBe("ORD=1");
    });

    it("when old-format [ORD=N] appears after operands, should parse operands and verbose", () => {
      const result = parseSelectionDAGNode(
        "  0x8c43210: i32,ch = CopyFromReg 0x8c43010, 0x8c43110 [ORD=2]",
      );

      expect(result.error).toBeUndefined();
      expect(result.node?.nodeId).toBe("0x8c43210");
      expect(result.node?.opName).toBe("CopyFromReg");
      expect(result.node?.verbose).toBe("ORD=2");
      expect(result.node?.operands).toEqual([
        { kind: "node", nodeId: "0x8c43010" },
        { kind: "node", nodeId: "0x8c43110" },
      ]);
    });

    it("when operand is wrapped in angle brackets, should mark wrapped node operand", () => {
      const result = parseSelectionDAGNode(
        "  0x8c43810: ch = store 0x8c43010, 0x8c43610, 0x8c43710, <0x8c43910> [ORD=5]",
      );

      expect(result.error).toBeUndefined();
      expect(result.node?.operands).toEqual([
        { kind: "node", nodeId: "0x8c43010" },
        { kind: "node", nodeId: "0x8c43610" },
        { kind: "node", nodeId: "0x8c43710" },
        { kind: "node", nodeId: "0x8c43910", wrapped: true },
      ]);
    });

    it("when a full dump fixture is parsed line-by-line, should still parse node-like lines", () => {
      const lines = selectionDagFullDump.split("\n");
      const firstNodeLine = lines.find((line) => line.includes("EntryToken"));

      expect(firstNodeLine).toBeDefined();
      const result = parseSelectionDAGNode(firstNodeLine!);
      expect(result.node?.opName).toBe("EntryToken");
    });
  });
});
