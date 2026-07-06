/**
 * Assembler tests for module.ts — the step-8 two-state machine, §3.3
 * implicit block numbering, and the §3.4 error policy
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md).
 */
import { describe, expect, it } from "vitest";
import { buildModule } from "../module";
import type { LLVMGenericInstruction } from "../../../ast/llvmAST";

describe("llvm module assembler", () => {
  describe("error policy (§3.4)", () => {
    it("when top-level line is garbage, should throw naming line and problem", () => {
      expect(() => buildModule("this is not valid LLVM IR")).toThrow(
        /Line 1: unrecognized top-level line 'this is not valid LLVM IR'/,
      );
    });

    it("when a body line is garbage, should keep it as an opaque instruction", () => {
      const module = buildModule(`define void @f() {
  wibble %a, ???
  ret void
}`);
      const instruction = module.functions[0].blocks[0]
        .instructions[0] as LLVMGenericInstruction;
      expect(instruction.opcode).toBe("wibble");
      expect(module.functions[0].blocks).toHaveLength(1);
      expect(module.diagnostics).toBeUndefined();
    });

    it("when a '[' never closes, should escalate the reader diagnostic to a throw", () => {
      const input = `define void @f() {
  switch i32 0, label %d [
    i32 1, label %a
}`;
      expect(() => buildModule(input)).toThrow(
        /Line 2: unbalanced '\[' — the bracket group starting on this line never closes\./,
      );
    });

    it("when a block has no terminator before '}', should throw", () => {
      const input = `define void @f() {
entry:
  %x = add i32 1, 2
}`;
      expect(() => buildModule(input)).toThrow(
        /Line 4: block 'entry' of function '@f' has no terminator before '}'/,
      );
    });

    it("when '}' appears without a define, should throw", () => {
      expect(() => buildModule("}")).toThrow(
        /Line 1: found '}' without a matching 'define'/,
      );
    });

    it("when a function is unclosed at EOF, should throw naming the define line", () => {
      const input = `define void @f() {
  ret void`;
      expect(() => buildModule(input)).toThrow(
        /Line 1: function '@f' is never closed — missing '}'/,
      );
    });

    it("when a define line does not end with '{', should throw", () => {
      expect(() => buildModule("define void @f()")).toThrow(
        /Line 1: this 'define' line does not end with '\{'/,
      );
    });

    it("when a function body is empty, should throw", () => {
      const input = `define void @f() {
}`;
      expect(() => buildModule(input)).toThrow(
        /Line 2: function '@f' has an empty body/,
      );
    });

    it("when a label follows an unterminated block, should recover with a diagnostic instead of absorbing the label", () => {
      // Pinned decision (module.ts header): §3.4 lists only "no terminator
      // before '}'" as structural; the pre-rewrite suites accept this shape.
      const module = buildModule(`define void @f() {
entry:
  call void @bar()

next:
  ret void
}`);
      const [entry, next] = module.functions[0].blocks;
      expect(module.functions[0].blocks).toHaveLength(2);
      expect(entry.id).toBe("entry");
      expect(entry.terminator.opcode).toBe(""); // synthetic, edge-free
      expect(next.id).toBe("next");
      expect(module.diagnostics).toHaveLength(1);
      expect(module.diagnostics?.[0].line).toBe(5);
      expect(module.diagnostics?.[0].message).toMatch(
        /label 'next:' starts a new block, but the previous block 'entry' has no terminator/,
      );
    });
  });

  describe("implicit block numbering (§3.3)", () => {
    it("when unlabeled entry has no numeric label uses, should keep id 'entry'", () => {
      const module = buildModule(`define i32 @main() {
  %1 = alloca i32
  %2 = add i32 1, 2
  ret i32 %2
}`);
      const block = module.functions[0].blocks[0];
      expect(block.id).toBe("entry");
      expect(block.label).toBeNull();
      expect(module.functions[0].entry).toBe(block);
    });

    it("when the body uses numeric labels, unlabeled entry should take the counter value", () => {
      const module = buildModule(`define i32 @main() {
  %1 = alloca i32
  %2 = icmp sgt i32 1, 0
  br i1 %2, label %3, label %4

3:
  ret i32 0

4:
  ret i32 1
}`);
      expect(module.functions[0].blocks.map((b) => b.id)).toEqual([
        "0",
        "3",
        "4",
      ]);
      expect(module.diagnostics).toBeUndefined();
    });

    it("when params are printed unnamed values (%0...), entry counter should continue after them", () => {
      // The DEFAULT_CODE shape (src/irModes/llvmMode.ts): params %0 %1 %2,
      // unlabeled entry, numeric branch targets — the entry becomes %3.
      const module = buildModule(`define i32 @func(i32 %0, i32 %1, i1 %2) {
  br i1 %2, label %4, label %7

4:
  br label %7

7:
  ret i32 0
}`);
      expect(module.functions[0].blocks.map((b) => b.id)).toEqual([
        "3",
        "4",
        "7",
      ]);
      expect(module.diagnostics).toBeUndefined();
    });

    it("when params are unnamed, each should consume one counter slot", () => {
      const module = buildModule(`define void @f(i32, i32) {
  br label %3

  ret void
}`);
      // Two unnamed params occupy %0/%1; the unlabeled entry is %2; the
      // implicit block after the terminator takes the next value, %3.
      expect(module.functions[0].blocks.map((b) => b.id)).toEqual(["2", "3"]);
      expect(module.diagnostics).toBeUndefined();
    });

    it("when a '; <label>:N' hint precedes an implicit block, hint should win and resync the counter", () => {
      const module = buildModule(`define i32 @loop(i32 %n) {
  br label %1

; <label>:1
  %2 = phi i32 [ 0, %0 ], [ %3, %1 ]
  %3 = add i32 %2, 1
  %4 = icmp slt i32 %3, %n
  br i1 %4, label %1, label %5

; <label>:5
  ret i32 %3
}`);
      expect(module.functions[0].blocks.map((b) => b.id)).toEqual([
        "0",
        "1",
        "5",
      ]);
      expect(module.diagnostics).toBeUndefined();
    });

    it("when only phi incoming refs use numeric labels, entry should still take the counter", () => {
      const module = buildModule(`define void @f(i1 %c) {
  br i1 %c, label %a, label %a

a:
  %p = phi i32 [ 0, %0 ], [ 1, %0 ]
  ret void
}`);
      expect(module.functions[0].blocks.map((b) => b.id)).toEqual(["0", "a"]);
    });

    it("when entry is unlabeled but named 'entry', it should still consume a counter slot", () => {
      const module = buildModule(`define void @f() {
  ret void

  ret void
}`);
      // No numeric label uses: entry keeps "entry" but occupies %0, so the
      // hint-less implicit block after it is %1 (printer numbering).
      expect(module.functions[0].blocks.map((b) => b.id)).toEqual([
        "entry",
        "1",
      ]);
    });

    it("when an implicit id collides with an existing block, should fall back to implicit_<k> with a diagnostic", () => {
      const module = buildModule(`define void @f() {
a:
  br label %a

; <label>:5
  ret void

; <label>:5
  ret void
}`);
      expect(module.functions[0].blocks.map((b) => b.id)).toEqual([
        "a",
        "5",
        "implicit_0",
      ]);
      expect(module.diagnostics).toHaveLength(1);
      expect(module.diagnostics?.[0].message).toMatch(
        /implicit block id '5' is already taken/,
      );
    });

    it("when a terminator targets a label no block claims, should record a diagnostic, not throw", () => {
      const module = buildModule(`define void @f() {
  br label %nowhere
}`);
      expect(module.functions[0].blocks.map((b) => b.id)).toEqual(["entry"]);
      expect(module.diagnostics).toHaveLength(1);
      expect(module.diagnostics?.[0].line).toBe(2);
      expect(module.diagnostics?.[0].message).toMatch(
        /terminator targets label '%nowhere', but no block in function '@f' has that id/,
      );
    });

    it("when a switch targets a missing block, every dangling case should be reported", () => {
      const module = buildModule(`define void @f(i32 %v) {
  switch i32 %v, label %d [
    i32 0, label %gone
  ]

d:
  ret void
}`);
      expect(module.diagnostics).toHaveLength(1);
      expect(module.diagnostics?.[0].message).toMatch(/'%gone'/);
    });
  });

  describe("define line parsing", () => {
    it("when params are named, unnamed, function pointers, and varargs, should parse each", () => {
      const module = buildModule(
        `define void @f(i32 %a, void (i32)* %fp, i32, ...) {
  ret void
}`,
      );
      expect(module.functions[0].params).toEqual([
        { type: "i32", name: "%a" },
        { type: "void (i32)*", name: "%fp" },
        { type: "i32", name: null },
        { type: "...", name: null },
      ]);
    });

    it("when define carries header and attrs, definition should be the single-spaced legacy string", () => {
      const module = buildModule(
        `define  dso_local i32  @add(i32 %a,  i32 %b)  #0 {
  ret i32 %a
}`,
      );
      expect(module.functions[0].definition).toBe(
        "define dso_local i32 @add (i32 %a, i32 %b) #0",
      );
      expect(module.functions[0].name).toBe("@add");
    });

    it("when attrs contain parens (personality), params should come from the first group", () => {
      const module = buildModule(
        `define void @f() personality i8* bitcast (i32 (...)* @p to i8*) {
  ret void
}`,
      );
      expect(module.functions[0].params).toEqual([]);
      expect(module.functions[0].definition).toBe(
        "define void @f () personality i8* bitcast (i32 (...)* @p to i8*)",
      );
    });
  });

  describe("top-level entries (legacy shapes)", () => {
    it("when module has each top-level kind, should reproduce the legacy field conventions", () => {
      const module = buildModule(`source_filename = "test.c"
target triple = "x86_64-unknown-linux-gnu"
@g = global i32 42
declare i32 @printf(i8*, ...)
define void @f() {
  ret void
}
attributes #0 = { nounwind }
!0 = !{i32 1}
!llvm.module.flags = !{!0}`);

      expect(module.sourceFilenames[0]).toMatchObject({
        name: '"test.c"',
      });
      expect(module.targets[0]).toEqual({
        type: "Target",
        key: "target",
        value: 'target triple = "x86_64-unknown-linux-gnu"',
      });
      expect(module.globalVariables[0]).toMatchObject({
        name: "@g",
        value: "global i32 42",
      });
      expect(module.declarations[0]).toEqual({
        type: "Declaration",
        name: "declaration",
        definition: "declare i32 @printf(i8*, ...)",
      });
      expect(module.attributes[0]).toMatchObject({
        id: "#0",
        value: "{ nounwind }",
      });
      expect(module.metadata.map((m) => m.id)).toEqual([
        "!0",
        "!llvm.module.flags",
      ]);
      expect(module.metadata[1].value).toBe("!{!0}");
    });

    it("when module has typeAlias/comdat/moduleAsm/uselistorder, should drop them without diagnostics", () => {
      const module = buildModule(`%T = type { i32 }
$sym = comdat any
module asm ".globl bump"
uselistorder ptr @g, { 1, 0 }
define void @f() {
  ret void
}`);
      expect(module.functions).toHaveLength(1);
      expect(module.globalVariables).toHaveLength(0);
      expect(module.metadata).toHaveLength(0);
      expect(module.diagnostics).toBeUndefined();
    });
  });
});
