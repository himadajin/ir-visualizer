import { describe, expect, it } from "vitest";
import { parseLLVM, parseLLVMToAST } from "../../llvm";

describe("llvm parser", () => {
  describe("errors", () => {
    it("when input is invalid, should throw in parseLLVMToAST", () => {
      expect(() => parseLLVMToAST("this is not valid LLVM IR")).toThrow();
    });

    it("when input is invalid, should throw in parseLLVM", () => {
      expect(() => parseLLVM("this is not valid LLVM IR")).toThrow();
    });

    it("when block ends with an unsupported terminator, should throw", () => {
      // Only br/ret/switch are structurally parsed terminators.
      const input = `
define void @f() {
  unreachable
}`;
      expect(() => parseLLVMToAST(input)).toThrow();
    });

    it("when input contains semicolon comments, should parse them as whitespace", () => {
      const input = `
; a leading comment
define void @f() { ; trailing comment
  ret void
}`;
      const module = parseLLVMToAST(input);
      expect(module.functions).toHaveLength(1);
    });
  });
});
