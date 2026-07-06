/**
 * Use-def foundation tests — the step-11 `defs`/`uses` extraction on every
 * instruction and terminator, plus the type-alias table plumbing
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §4, §5.9).
 * Everything goes through `buildModule` so the alias-table wiring and the
 * per-node attachment are exercised, not just the extraction function.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildModule } from "../module";
import { corpusEntries } from "../../__tests__/llvm/corpus/manifest";
import type { LLVMInstruction, LLVMTerminator } from "../../../ast/llvmAST";

const corpusDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../__tests__/llvm/corpus",
);

/**
 * Parse `line` as the first instruction of a one-block function; optional
 * top-level lines (e.g. a type alias) go before the define. Dangling
 * `label %x` targets only produce diagnostics, never a throw, so no dummy
 * blocks are needed.
 */
function parseInstr(line: string, topLevel = ""): LLVMInstruction {
  const module = buildModule(
    `${topLevel}\ndefine void @f() {\nentry:\n  ${line}\n  ret void\n}\n`,
  );
  return module.functions[0].blocks[0].instructions[0] as LLVMInstruction;
}

/** Parse `line` as the terminator of a one-block function. */
function parseTerm(line: string): LLVMTerminator {
  const module = buildModule(`define void @f() {\nentry:\n  ${line}\n}\n`);
  return module.functions[0].blocks[0].terminator;
}

describe("llvm use-def extraction", () => {
  describe("defs (assignment result exactly)", () => {
    it("when a line assigns a result, defs should be exactly that local", () => {
      const instr = parseInstr("%x = add i32 %a, %b");
      expect(instr.defs).toEqual(["x"]);
      expect(instr.uses).toEqual(["a", "b"]);
    });

    it("when a line assigns nothing, defs should be empty", () => {
      const instr = parseInstr("store i32 %v, ptr %p");
      expect(instr.defs).toEqual([]);
    });

    it("when an invoke has a result, defs should carry it and uses the args", () => {
      const module = buildModule(`define i32 @f(i32 %a) {
entry:
  %r = invoke i32 @g(i32 %a) to label %ok unwind label %err
ok:
  ret i32 %r
err:
  %lp = landingpad { ptr, i32 } cleanup
  resume { ptr, i32 } %lp
}`);
      const invoke = module.functions[0].blocks[0].terminator;
      expect(invoke.defs).toEqual(["r"]);
      // %a is a use; @g, %ok, %err are not.
      expect(invoke.uses).toEqual(["a"]);
    });

    it("when a callbr has a result, defs should carry it (result terminators beyond invoke)", () => {
      const term = parseTerm(
        '%x = callbr i32 asm "", "=r,!i"() to label %normal [label %other]',
      );
      expect(term.defs).toEqual(["x"]);
      expect(term.uses).toEqual([]);
    });

    it("when a global is assigned or read, it should never appear in defs nor uses", () => {
      const load = parseInstr("%x = load i32, ptr @g");
      expect(load.defs).toEqual(["x"]);
      expect(load.uses).toEqual([]);
      const store = parseInstr("store i32 1, ptr @g");
      expect(store.defs).toEqual([]);
      expect(store.uses).toEqual([]);
    });
  });

  describe("labels are not uses", () => {
    it("when a br is conditional, uses should be the condition only", () => {
      const term = parseTerm("br i1 %c, label %a, label %b");
      expect(term.uses).toEqual(["c"]);
      expect(term.defs).toEqual([]);
    });

    it("when a br is unconditional, uses should be empty", () => {
      const term = parseTerm("br label %a");
      expect(term.uses).toEqual([]);
    });

    it("when a switch has cases, uses should be the scrutinee only", () => {
      const term = parseTerm(`switch i32 %v, label %d [
    i32 0, label %a
    i32 1, label %b
  ]`);
      expect(term.uses).toEqual(["v"]);
    });
  });

  describe("phi lines", () => {
    it("should use incoming values but not incoming-block refs", () => {
      const module = buildModule(`define i32 @f(i32 %v) {
entry:
  br label %loop
loop:
  %p = phi i32 [ %v, %entry ], [ %inc, %loop ]
  %inc = add i32 %p, 1
  br label %loop
}`);
      const phi = module.functions[0].blocks[1]
        .instructions[0] as LLVMInstruction;
      expect(phi.defs).toEqual(["p"]);
      expect(phi.uses).toEqual(["v", "inc"]); // %entry, %loop excluded
    });
  });

  describe("type-alias table", () => {
    it("when %struct.T is a declared alias, it should not be a use", () => {
      const instr = parseInstr(
        "%p = getelementptr %struct.T, ptr %base, i32 0, i32 1",
        "%struct.T = type { i32, i32 }",
      );
      expect(instr.uses).toEqual(["base"]);
    });

    it("when no alias declares %struct.T, it should stay a use (the table is what excludes it)", () => {
      const instr = parseInstr(
        "%p = getelementptr %struct.T, ptr %base, i32 0, i32 1",
      );
      expect(instr.uses).toEqual(["struct.T", "base"]);
    });

    it("when the alias is printed after the function, it should still be excluded", () => {
      const module = buildModule(`define void @f(ptr %base) {
entry:
  %p = getelementptr %struct.T, ptr %base, i32 0, i32 1
  ret void
}
%struct.T = type { i32, i32 }`);
      const instr = module.functions[0].blocks[0]
        .instructions[0] as LLVMInstruction;
      expect(instr.uses).toEqual(["base"]);
    });
  });

  describe("string contents", () => {
    it("when a string contains %-text, it should never become a use", () => {
      const instr = parseInstr('store [4 x i8] c"%d\\0A\\00", ptr %p');
      expect(instr.uses).toEqual(["p"]);
    });
  });

  describe("calls", () => {
    it("should use every local argument", () => {
      const instr = parseInstr("%r = call i32 @add(i32 %a, i32 %b)");
      expect(instr.defs).toEqual(["r"]);
      expect(instr.uses).toEqual(["a", "b"]);
    });

    it("when the callee is a local function pointer, it should be a use too", () => {
      const instr = parseInstr("%r = call i32 %fp(i32 %a)");
      expect(instr.uses).toEqual(["fp", "a"]);
    });
  });

  describe("store pointer decision", () => {
    it("should include the written pointer — the address is READ to perform the store", () => {
      const instr = parseInstr("store i32 %v, ptr %p");
      expect(instr.uses).toEqual(["v", "p"]);
    });
  });

  describe("ret", () => {
    it("when ret carries a local value, it should be a use", () => {
      const module = buildModule(`define i32 @f(i32 %r) {
entry:
  ret i32 %r
}`);
      const term = module.functions[0].blocks[0].terminator;
      expect(term.uses).toEqual(["r"]);
      expect(term.defs).toEqual([]);
    });

    it("when ret is void, uses should be empty", () => {
      const term = parseTerm("ret void");
      expect(term.uses).toEqual([]);
    });
  });

  describe("dedup and self-reference", () => {
    it("should deduplicate uses, preserving first-occurrence order", () => {
      const instr = parseInstr("%s = call i32 @h(i32 %b, i32 %a, i32 %b)");
      expect(instr.uses).toEqual(["b", "a"]);
    });

    it("should never list the line's own def as a use", () => {
      // Not valid SSA, but extraction is total on any line.
      const instr = parseInstr("%x = wibble i32 %x, i32 %y");
      expect(instr.uses).toEqual(["y"]);
    });
  });

  describe("attachment coverage", () => {
    it("should attach defs and uses to every instruction and terminator with a source line", () => {
      const module = buildModule(`define i32 @f(i32 %n) {
entry:
  %c = icmp sgt i32 %n, 0
  br i1 %c, label %a, label %b
a:
  %x = add i32 %n, 1
  ret i32 %x
b:
  ret i32 0
}`);
      for (const block of module.functions[0].blocks) {
        for (const item of [...block.instructions, block.terminator]) {
          if (item.type !== "Instruction") continue;
          expect(item.defs).toBeDefined();
          expect(item.uses).toBeDefined();
        }
      }
    });

    it("should leave the synthetic empty terminator without defs/uses (no source line)", () => {
      const module = buildModule(`define void @f() {
entry:
  %x = add i32 1, 2
a:
  ret void
}`);
      const synthetic = module.functions[0].blocks[0].terminator;
      expect(synthetic.opcode).toBe("");
      expect(synthetic.defs).toBeUndefined();
      expect(synthetic.uses).toBeUndefined();
    });
  });

  describe("corpus-wide properties", () => {
    it.each(corpusEntries.map((entry) => [entry.file]))(
      "%s: every def/use is a sigil-free local consistent with the node",
      (file) => {
        const ast = buildModule(readFileSync(join(corpusDir, file), "utf8"));
        for (const func of ast.functions) {
          for (const block of func.blocks) {
            for (const item of [...block.instructions, block.terminator]) {
              if (item.type !== "Instruction") continue;
              if (item.originalText === "") continue; // synthetic terminator
              expect(item.defs).toBeDefined();
              expect(item.uses).toBeDefined();
              const defs = item.defs ?? [];
              const uses = item.uses ?? [];
              // Local names only, sigil-free, never empty strings.
              for (const name of [...defs, ...uses]) {
                expect(name).not.toMatch(/^[%@!]/);
                expect(name.length).toBeGreaterThan(0);
              }
              // defs ⊆ results: 0 or 1 entry, equal to the node's own
              // result/dest field whenever the node carries one.
              expect(defs.length).toBeLessThanOrEqual(1);
              const result =
                "result" in item && item.result !== undefined
                  ? item.result
                  : "dest" in item && item.dest !== undefined
                    ? item.dest
                    : undefined;
              if (result !== undefined) expect(defs).toEqual([result]);
              // uses are deduplicated and never contain the def.
              expect(new Set(uses).size).toBe(uses.length);
              if (defs.length === 1) expect(uses).not.toContain(defs[0]);
            }
          }
        }
      },
    );
  });
});
