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

    it("when a block ends with unreachable, should parse it with no exit edge", () => {
      // §3.4 policy change (step 9): unreachable is a recognized terminator,
      // not a parse error; it is not a return, so no exit node appears.
      const input = `
define void @f() {
  unreachable
}`;
      const module = parseLLVMToAST(input);
      expect(module.functions[0].blocks[0].terminator.opcode).toBe(
        "unreachable",
      );

      const graph = parseLLVM(input);
      expect(
        graph.nodes.find((node) => node.nodeType === "llvm-exit"),
      ).toBeUndefined();
      const blockId = graph.nodes.find(
        (node) => node.nodeType === "llvm-basicBlock",
      )?.id;
      expect(blockId).toBeDefined();
      expect(graph.edges.filter((edge) => edge.source === blockId)).toEqual([]);
    });

    it("when a body line is garbage, should keep it as an opaque instruction", () => {
      const input = `
define void @f() {
  wibble %a, ???
  ret void
}`;
      const module = parseLLVMToAST(input);
      const [instruction] = module.functions[0].blocks[0].instructions;
      expect(instruction).toMatchObject({
        type: "Instruction",
        opcode: "wibble",
        originalText: "wibble %a, ???",
      });
    });

    it("when a switch has no case bracket group, should not throw and keep its label successor", () => {
      // Degraded switch: no `[...]` group, so it parses as an opaque
      // terminator (opcode "switch", successors from the uniform rule).
      // Regression guard: the graphBuilder must dispatch on shape — an
      // opcode-based dispatch would read the missing `cases` field.
      const input = `
define void @f(i32 %v) {
  switch i32 %v, label %d
d:
  ret void
}`;
      const graph = parseLLVM(input);
      const edge = graph.edges.find(
        (e) =>
          e.source.includes("_block_entry") && e.target.includes("_block_d"),
      );
      expect(edge).toBeDefined();
      expect(edge?.label).toBeUndefined();
    });

    it("when a block has no terminator before '}', should name the line in plain words", () => {
      const input = `
define void @f() {
  %a = add i32 1, 2
}`;
      expect(() => parseLLVMToAST(input)).toThrow(
        /Line 4: block 'entry' of function '@f' has no terminator/,
      );
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
