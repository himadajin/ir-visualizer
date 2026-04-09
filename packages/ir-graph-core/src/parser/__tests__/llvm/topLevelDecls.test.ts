import { describe, expect, it } from "vitest";
import { parseLLVMToAST } from "../../llvm";

describe("llvm parser", () => {
  describe("top-level declarations", () => {
    it("when module has global variable, should parse global variable section", () => {
      const input = `
@g = global i32 42

define void @foo() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.globalVariables).toHaveLength(1);
      expect(ast.globalVariables[0].name).toBe("@g");
      expect(ast.globalVariables[0].type).toBe("GlobalVariable");
    });

    it("when module has declaration, should parse declaration section", () => {
      const input = `
declare void @bar()

define void @foo() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.declarations).toHaveLength(1);
      expect(ast.declarations[0].type).toBe("Declaration");
    });

    it("when module has metadata, should parse metadata section", () => {
      const input = `
define void @foo() {
  ret void
}

!0 = !{i32 1}`;
      const ast = parseLLVMToAST(input);

      expect(ast.metadata).toHaveLength(1);
      expect(ast.metadata[0].type).toBe("Metadata");
    });

    it("when module has attribute group, should parse attributes section", () => {
      const input = `
define void @foo() {
  ret void
}

attributes #0 = { nounwind }`;
      const ast = parseLLVMToAST(input);

      expect(ast.attributes).toHaveLength(1);
      expect(ast.attributes[0].type).toBe("AttributeGroup");
    });

    it("when module has target triple, should parse target section", () => {
      const input = `
target triple = "x86_64-unknown-linux-gnu"

define void @foo() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.targets).toHaveLength(1);
      expect(ast.targets[0].type).toBe("Target");
    });

    it("when module has source filename, should parse source filename section", () => {
      const input = `
source_filename = "test.c"

define void @foo() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.sourceFilenames).toHaveLength(1);
      expect(ast.sourceFilenames[0].type).toBe("SourceFilename");
    });
  });
});
