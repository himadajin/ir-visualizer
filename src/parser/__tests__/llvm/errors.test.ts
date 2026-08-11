import { describe, expect, it } from "vitest";
import { parseLLVM, parseLLVMToAST, parseLLVMUseDef } from "../../llvm";

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

      const { graph } = parseLLVM(input);
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
      const { graph } = parseLLVM(input);
      const edge = graph.edges.find(
        (e) =>
          e.source.includes(":block:entry") && e.target.includes(":block:d"),
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

    it("when a recovery happened, should return the diagnostics beside the graph", () => {
      // The graph-producing entry point carries §3.4's recoverable diagnostics
      // through to its caller (contracts/ir-mode-registry.md, "Recoverable
      // diagnostics"); the mode passes the result to the status footer as-is.
      const input = `
define void @f() {
  br label %missing
}`;
      const { graph, diagnostics } = parseLLVM(input);

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics?.[0].line).toBe(3);
      expect(diagnostics?.[0].message).toMatch(
        /terminator targets label '%missing'/,
      );
    });

    it("when a label is written twice, should keep both blocks in the graph", () => {
      // Block ids are unique within a function (§3.3), so the second `a:`
      // gets its own node instead of colliding with the first and being
      // dropped by React Flow with nothing shown to the user.
      const input = `
define i32 @f() {
entry:
  br label %a
a:
  br label %b
a:
  br label %b
b:
  ret i32 0
}`;
      const { graph, diagnostics } = parseLLVM(input);

      const blockIds = graph.nodes
        .filter((node) => node.nodeType === "llvm-basicBlock")
        .map((node) => node.id);
      expect(blockIds).toHaveLength(4);
      expect(new Set(blockIds).size).toBe(4);
      expect(blockIds).toContain("func:f:block:a");
      expect(blockIds).toContain("func:f:block:implicit_0");

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics?.[0].line).toBe(7);
      expect(diagnostics?.[0].message).toMatch(/block label 'a:' is already/);
    });

    it("when the parse is clean, should return no diagnostics", () => {
      const input = `
define void @f() {
  ret void
}`;
      expect(parseLLVM(input).diagnostics).toBeUndefined();
      expect(parseLLVMUseDef(input).diagnostics).toBeUndefined();
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
