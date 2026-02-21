import { describe, expect, it } from "vitest";
import { parseLLVMToAST } from "../../llvm";
import type {
  LLVMBrInstruction,
  LLVMRetInstruction,
  LLVMSwitchInstruction,
} from "../../../ast/llvmAST";
import {
  llvmWithConditionalBranch,
  llvmWithSwitch,
} from "../helpers/llvmFixtures";

describe("llvm parser", () => {
  describe("terminators", () => {
    it("when branch is unconditional, should parse destination", () => {
      const input = `
define void @foo() {
  br label %next

next:
  ret void
}`;
      const ast = parseLLVMToAST(input);

      const terminator = ast.functions[0].blocks[0]
        .terminator as LLVMBrInstruction;
      expect(terminator.opcode).toBe("br");
      expect(terminator.destination).toBe("next");
    });

    it("when branch is conditional, should parse condition and targets", () => {
      const ast = parseLLVMToAST(llvmWithConditionalBranch);

      const terminator = ast.functions[0].blocks[0]
        .terminator as LLVMBrInstruction;
      expect(terminator.opcode).toBe("br");
      expect(terminator.condition).toBe("cond");
      expect(terminator.trueTarget).toBe("then");
      expect(terminator.falseTarget).toBe("else");
    });

    it("when ret has no value, should parse ret opcode", () => {
      const input = `
define void @foo() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.functions[0].blocks[0].terminator.opcode).toBe("ret");
    });

    it("when ret has value, should parse return value", () => {
      const input = `
define i32 @foo() {
  ret i32 42
}`;
      const ast = parseLLVMToAST(input);

      const terminator = ast.functions[0].blocks[0]
        .terminator as LLVMRetInstruction;
      expect(terminator.opcode).toBe("ret");
      expect(terminator.value).toBe("42");
    });

    it("when switch includes cases, should parse default and case targets", () => {
      const ast = parseLLVMToAST(llvmWithSwitch);

      const terminator = ast.functions[0].blocks[0]
        .terminator as LLVMSwitchInstruction;
      expect(terminator.opcode).toBe("switch");
      expect(terminator.defaultTarget).toBe("default");
      expect(terminator.cases).toHaveLength(2);
      expect(terminator.cases[0].value).toBe("0");
      expect(terminator.cases[0].target).toBe("case0");
      expect(terminator.cases[1].value).toBe("1");
      expect(terminator.cases[1].target).toBe("case1");
    });
  });
});
