import { describe, it, expect } from "vitest";
import { parseLLVMToAST } from "../llvm";
import type {
  LLVMBrInstruction,
  LLVMRetInstruction,
  LLVMSwitchInstruction,
} from "../../ast/llvmAST";

describe("parseLLVMToAST", () => {
  describe("minimal function", () => {
    it("should parse a function with a single ret instruction", () => {
      const input = `
define void @main() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.type).toBe("Module");
      expect(ast.functions).toHaveLength(1);
      expect(ast.functions[0].name).toBe("@main");
      expect(ast.functions[0].blocks).toHaveLength(1);

      const block = ast.functions[0].blocks[0];
      expect(block.terminator.opcode).toBe("ret");
    });

    it("should parse function parameters", () => {
      const input = `
define i32 @add(i32 %a, i32 %b) {
  ret i32 %a
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.functions[0].params).toHaveLength(2);
      expect(ast.functions[0].params[0].name).toBe("%a");
      expect(ast.functions[0].params[1].name).toBe("%b");
    });
  });

  describe("basic blocks", () => {
    it("should parse multiple basic blocks", () => {
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

    it("should parse entry block label", () => {
      const input = `
define void @foo() {
entry:
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.functions[0].blocks[0].label).toBe("entry");
    });
  });

  describe("branch instructions", () => {
    it("should parse unconditional branch", () => {
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

    it("should parse conditional branch", () => {
      const input = `
define void @foo(i1 %cond) {
entry:
  br i1 %cond, label %then, label %else

then:
  ret void

else:
  ret void
}`;
      const ast = parseLLVMToAST(input);

      const terminator = ast.functions[0].blocks[0]
        .terminator as LLVMBrInstruction;
      expect(terminator.opcode).toBe("br");
      expect(terminator.condition).toBe("cond");
      expect(terminator.trueTarget).toBe("then");
      expect(terminator.falseTarget).toBe("else");
    });
  });

  describe("ret instructions", () => {
    it("should parse ret void", () => {
      const input = `
define void @foo() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      const terminator = ast.functions[0].blocks[0].terminator;
      expect(terminator.opcode).toBe("ret");
    });

    it("should parse ret with value", () => {
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
  });

  describe("switch instruction", () => {
    it("should parse switch with cases", () => {
      const input = `
define void @foo(i32 %val) {
entry:
  switch i32 %val, label %default [
    i32 0, label %case0
    i32 1, label %case1
  ]

case0:
  ret void

case1:
  ret void

default:
  ret void
}`;
      const ast = parseLLVMToAST(input);

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

  describe("instructions", () => {
    it("should parse assign instruction", () => {
      const input = `
define i32 @foo(i32 %a, i32 %b) {
  %result = add i32 %a, %b
  ret i32 %result
}`;
      const ast = parseLLVMToAST(input);

      const block = ast.functions[0].blocks[0];
      // instructions includes all items + terminator
      // first item is the add instruction
      const addInstr = block.instructions[0];
      expect(addInstr.type).toBe("Instruction");
      if (addInstr.type === "Instruction") {
        expect(addInstr.opcode).toBe("add");
        expect(addInstr.originalText).toContain("add");
      }
    });

    it("should parse store instruction", () => {
      const input = `
define void @foo(i32 %val) {
  store i32 %val, i32* %ptr
  ret void
}`;
      const ast = parseLLVMToAST(input);

      const block = ast.functions[0].blocks[0];
      const storeInstr = block.instructions[0];
      expect(storeInstr.type).toBe("Instruction");
      if (storeInstr.type === "Instruction") {
        expect(storeInstr.opcode).toBe("store");
      }
    });

    it("should parse call instruction in a multi-block function", () => {
      const input = `
define void @foo() {
entry:
  call void @bar()

next:
  ret void
}`;
      const ast = parseLLVMToAST(input);

      // The function should parse successfully
      expect(ast.functions).toHaveLength(1);
      const blocks = ast.functions[0].blocks;
      expect(blocks.length).toBeGreaterThanOrEqual(1);

      // At least one block should contain a call-related instruction
      const allInstructions = blocks.flatMap((b) => b.instructions);
      const hasCall = allInstructions.some(
        (i) => i.type === "Instruction" && i.originalText.includes("call"),
      );
      expect(hasCall).toBe(true);
    });

    it("should parse call with result in a multi-block function", () => {
      const input = `
define i32 @foo() {
entry:
  %result = call i32 @bar()

next:
  ret i32 %result
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.functions).toHaveLength(1);
      const blocks = ast.functions[0].blocks;
      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("global variables", () => {
    it("should parse global variable", () => {
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
  });

  describe("declarations", () => {
    it("should parse function declarations", () => {
      const input = `
declare void @bar()

define void @foo() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.declarations).toHaveLength(1);
      expect(ast.declarations[0].type).toBe("Declaration");
    });
  });

  describe("metadata", () => {
    it("should parse metadata definitions", () => {
      const input = `
define void @foo() {
  ret void
}

!0 = !{i32 1}`;
      const ast = parseLLVMToAST(input);

      expect(ast.metadata).toHaveLength(1);
      expect(ast.metadata[0].type).toBe("Metadata");
    });
  });

  describe("attributes", () => {
    it("should parse attribute groups", () => {
      const input = `
define void @foo() {
  ret void
}

attributes #0 = { nounwind }`;
      const ast = parseLLVMToAST(input);

      expect(ast.attributes).toHaveLength(1);
      expect(ast.attributes[0].type).toBe("AttributeGroup");
    });
  });

  describe("target definitions", () => {
    it("should parse target triple", () => {
      const input = `
target triple = "x86_64-unknown-linux-gnu"

define void @foo() {
  ret void
}`;
      const ast = parseLLVMToAST(input);

      expect(ast.targets).toHaveLength(1);
      expect(ast.targets[0].type).toBe("Target");
    });
  });

  describe("source filename", () => {
    it("should parse source_filename", () => {
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

  describe("error handling", () => {
    it("should throw on invalid input", () => {
      expect(() => parseLLVMToAST("this is not valid LLVM IR")).toThrow();
    });
  });

  describe("multiple functions", () => {
    it("should parse multiple functions", () => {
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
  });

  describe("complex module", () => {
    it("should parse a module with multiple top-level declarations", () => {
      const input = `
source_filename = "test.c"
target triple = "x86_64-unknown-linux-gnu"

@g = global i32 0

declare void @printf()

define i32 @main() {
entry:
  %x = add i32 1, 2
  ret i32 %x
}

attributes #0 = { nounwind }

!0 = !{i32 1}`;
      const ast = parseLLVMToAST(input);

      expect(ast.sourceFilenames.length).toBeGreaterThanOrEqual(1);
      expect(ast.targets.length).toBeGreaterThanOrEqual(1);
      expect(ast.globalVariables.length).toBeGreaterThanOrEqual(1);
      expect(ast.declarations.length).toBeGreaterThanOrEqual(1);
      expect(ast.functions).toHaveLength(1);
      expect(ast.attributes.length).toBeGreaterThanOrEqual(1);
      expect(ast.metadata.length).toBeGreaterThanOrEqual(1);
    });
  });
});
