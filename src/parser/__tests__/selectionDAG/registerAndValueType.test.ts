import { describe, expect, it } from "vitest";
import { parseSelectionDAGNode } from "../../selectionDAG";

describe("selectionDAG parser", () => {
  describe("register and value type", () => {
    it("when Register uses virtual register syntax, should parse VirtReg", () => {
      const result = parseSelectionDAGNode(
        "0x7fcbd985abcd: i64 = Register %RAX",
      );

      expect(result.error).toBeUndefined();
      expect(result.node?.details).toEqual({
        flags: [],
        reg: { type: "VirtReg", value: "%RAX" },
      });
    });

    it("when Register uses numbered syntax, should parse Numbered", () => {
      const result = parseSelectionDAGNode(
        "0x7fcbd985abcd: i64 = Register #1024",
      );

      expect(result.error).toBeUndefined();
      expect(result.node?.details).toEqual({
        flags: [],
        reg: { type: "Numbered", value: "#1024" },
      });
    });

    it("when Register uses bare name syntax, should parse Bare", () => {
      const result = parseSelectionDAGNode("0x7fcbd985abcd: i64 = Register R1");

      expect(result.error).toBeUndefined();
      expect(result.node?.details).toEqual({
        flags: [],
        reg: { type: "Bare", value: "R1" },
      });
    });

    it.each([
      ["0x7fcbd985abcd: ch = ValueType :i64", "i64"],
      ["t5: ch = ValueType :f32", "f32"],
      ["t6: ch = ValueType :v4i32", "v4i32"],
    ] as const)(
      "when ValueType is %s, should parse vtDetail as %s",
      (line, expectedVtDetail) => {
        const result = parseSelectionDAGNode(line);

        expect(result.error).toBeUndefined();
        expect(result.node?.opName).toBe("ValueType");
        expect(result.node?.details).toEqual({
          flags: [],
          vtDetail: expectedVtDetail,
        });
      },
    );

    it("when ValueType node has no operands, should keep operands undefined", () => {
      const result = parseSelectionDAGNode(
        "0x7fcbd985abcd: ch = ValueType :i64",
      );

      expect(result.error).toBeUndefined();
      expect(result.node?.operands).toBeUndefined();
    });
  });
});
