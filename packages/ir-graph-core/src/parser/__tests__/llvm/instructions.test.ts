import { describe, expect, it } from "vitest";
import { parseLLVMToAST } from "../../llvm";

describe("llvm parser", () => {
  describe("instructions", () => {
    it("when block has assignment instruction, should parse opcode and original text", () => {
      const input = `
define i32 @foo(i32 %a, i32 %b) {
  %result = add i32 %a, %b
  ret i32 %result
}`;
      const ast = parseLLVMToAST(input);

      const addInstruction = ast.functions[0].blocks[0].instructions[0];
      expect(addInstruction.type).toBe("Instruction");
      if (addInstruction.type === "Instruction") {
        expect(addInstruction.opcode).toBe("add");
        expect(addInstruction.originalText).toContain("add");
      }
    });

    it("when block has store instruction, should parse store opcode", () => {
      const input = `
define void @foo(i32 %val) {
  store i32 %val, i32* %ptr
  ret void
}`;
      const ast = parseLLVMToAST(input);

      const storeInstruction = ast.functions[0].blocks[0].instructions[0];
      expect(storeInstruction.type).toBe("Instruction");
      if (storeInstruction.type === "Instruction") {
        expect(storeInstruction.opcode).toBe("store");
      }
    });

    it("when call exists in multi-block function, should keep call instruction text", () => {
      const input = `
define void @foo() {
entry:
  call void @bar()

next:
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.functions).toHaveLength(1);
      const allInstructions = ast.functions[0].blocks.flatMap(
        (block) => block.instructions,
      );
      const hasCallInstruction = allInstructions.some(
        (instruction) =>
          instruction.type === "Instruction" &&
          instruction.originalText.includes("call"),
      );

      expect(hasCallInstruction).toBe(true);
    });

    it("when call has destination register, should parse function without structural loss", () => {
      const input = `
define i32 @foo() {
entry:
  %result = call i32 @bar()

next:
  ret i32 %result
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.functions).toHaveLength(1);
      expect(ast.functions[0].blocks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
