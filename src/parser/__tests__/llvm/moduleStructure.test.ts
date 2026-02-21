import { describe, expect, it } from "vitest";
import { parseLLVMToAST } from "../../llvm";
import {
  llvmComplexModule,
  llvmMinimalRet,
  llvmParamsFunction,
  llvmWithEntryAndRet,
} from "../helpers/llvmFixtures";

describe("llvm parser", () => {
  describe("module structure", () => {
    it("when function has a single ret terminator, should parse one function and one block", () => {
      const ast = parseLLVMToAST(llvmMinimalRet);

      expect(ast.type).toBe("Module");
      expect(ast.functions).toHaveLength(1);
      expect(ast.functions[0].name).toBe("@main");
      expect(ast.functions[0].blocks).toHaveLength(1);
      expect(ast.functions[0].blocks[0].terminator.opcode).toBe("ret");
    });

    it("when function defines parameters, should parse each parameter in order", () => {
      const ast = parseLLVMToAST(llvmParamsFunction);

      expect(ast.functions[0].params).toHaveLength(2);
      expect(ast.functions[0].params[0].name).toBe("%a");
      expect(ast.functions[0].params[1].name).toBe("%b");
    });

    it("when function has a labeled entry block, should keep label and id", () => {
      const ast = parseLLVMToAST(llvmWithEntryAndRet);

      expect(ast.functions[0].blocks[0].id).toBe("entry");
      expect(ast.functions[0].blocks[0].label).toBe("entry");
    });

    it("when function has multiple basic blocks, should parse block order correctly", () => {
      const input = `
define void @foo() {
entry:
  br label %loop

loop:
  br label %exit

exit:
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.functions[0].blocks).toHaveLength(3);
      expect(ast.functions[0].blocks[0].id).toBe("entry");
      expect(ast.functions[0].blocks[1].id).toBe("loop");
      expect(ast.functions[0].blocks[2].id).toBe("exit");
    });

    it("when module includes multiple functions, should preserve function order", () => {
      const input = `
define void @foo() {
  ret void
}

define void @bar() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.functions).toHaveLength(2);
      expect(ast.functions[0].name).toBe("@foo");
      expect(ast.functions[1].name).toBe("@bar");
    });

    it("when module includes mixed top-level declarations, should parse all sections", () => {
      const ast = parseLLVMToAST(llvmComplexModule);

      expect(ast.functions).toHaveLength(1);
      expect(ast.sourceFilenames).toHaveLength(1);
      expect(ast.targets).toHaveLength(1);
      expect(ast.globalVariables).toHaveLength(1);
      expect(ast.declarations).toHaveLength(1);
      expect(ast.attributes).toHaveLength(1);
      expect(ast.metadata).toHaveLength(1);
    });
  });
});
