import { describe, expect, it } from "vitest";
import type {
  LLVMAtomicRMWInstruction,
  LLVMCallInstruction,
  LLVMCmpxchgInstruction,
  LLVMGenericInstruction,
  LLVMOperand,
  LLVMStoreInstruction,
} from "../../../ast/llvmAST";
import { parseDebugRecord, parseInstruction } from "../instructions";
import type { LogicalLine } from "../logicalLines";

/** A single-line LogicalLine with realistic indentation in `raw`. */
function lineOf(text: string): LogicalLine {
  return { text, raw: `  ${text}`, lineNumber: 1 };
}

function op(
  type: LLVMOperand["type"],
  value: string,
  isWrite = false,
): LLVMOperand {
  return { type, value, isWrite };
}

describe("llvm parseInstruction", () => {
  describe("generic instructions", () => {
    it("when line assigns a result, should parse opcode, result, and per-token operands", () => {
      const inst = parseInstruction(
        lineOf("%result = add i32 %a, %b"),
      ) as LLVMGenericInstruction;
      expect(inst.type).toBe("Instruction");
      expect(inst.opcode).toBe("add");
      expect(inst.result).toBe("result");
      expect(inst.operands).toEqual([
        op("Other", "i32"),
        op("Local", "a"),
        op("Local", "b"),
      ]);
      // originalText: the raw physical line without its indentation.
      expect(inst.originalText).toBe("%result = add i32 %a, %b");
    });

    it("when line has no result, should parse a bare generic instruction", () => {
      const inst = parseInstruction(
        lineOf("fence seq_cst"),
      ) as LLVMGenericInstruction;
      expect(inst.opcode).toBe("fence");
      expect(inst.result).toBeUndefined();
      expect(inst.operands).toEqual([op("Other", "seq_cst")]);
    });

    it("when operand is a constant expression (probe-07), should keep parens as Other operands", () => {
      const inst = parseInstruction(
        lineOf("%x = add i32 ptrtoint (i32* @g to i32), 1"),
      ) as LLVMGenericInstruction;
      expect(inst.opcode).toBe("add");
      expect(inst.result).toBe("x");
      expect(inst.operands).toEqual([
        op("Other", "i32"),
        op("Other", "ptrtoint"),
        op("Other", "("),
        op("Other", "i32"),
        op("Other", "*"),
        op("Global", "g"),
        op("Other", "to"),
        op("Other", "i32"),
        op("Other", ")"),
        op("Other", "1"),
      ]);
    });

    it("when line is a phi, should surface incoming values AND block refs as operands", () => {
      // Block references (%a, %b) appearing as Local operands is ACCEPTED
      // at this layer; the defs/uses pass (plan step 11) applies the
      // phi-aware label filtering.
      const inst = parseInstruction(
        lineOf("%x = phi i32 [ 0, %a ], [ 1, %b ]"),
      ) as LLVMGenericInstruction;
      expect(inst.opcode).toBe("phi");
      expect(inst.result).toBe("x");
      expect(inst.operands).toEqual([
        op("Other", "i32"),
        op("Other", "["),
        op("Other", "0"),
        op("Local", "a"),
        op("Other", "]"),
        op("Other", "["),
        op("Other", "1"),
        op("Local", "b"),
        op("Other", "]"),
      ]);
    });

    it("when line is garbage, should degrade to an opaque generic instruction", () => {
      const inst = parseInstruction(
        lineOf("wibble %a, ???"),
      ) as LLVMGenericInstruction;
      expect(inst.opcode).toBe("wibble");
      expect(inst.result).toBeUndefined();
      expect(inst.operands).toEqual([
        op("Local", "a"),
        op("Other", "?"),
        op("Other", "?"),
        op("Other", "?"),
      ]);
    });

    it("when the first token is not a word, should use its text as the opcode", () => {
      const inst = parseInstruction(lineOf("??? %a")) as LLVMGenericInstruction;
      expect(inst.opcode).toBe("?");
      expect(inst.operands).toEqual([
        op("Other", "?"),
        op("Other", "?"),
        op("Local", "a"),
      ]);
    });
  });

  describe("call instructions", () => {
    it("when call has a varargs fn type (probe-02), should extract callee from before the LAST paren group", () => {
      const inst = parseInstruction(
        lineOf(
          "%call = call i32 (i8*, ...) @printf(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @.str, i32 0, i32 0))",
        ),
      ) as LLVMCallInstruction;
      expect(inst.opcode).toBe("call");
      expect(inst.callee).toBe("printf");
      expect(inst.dest).toBe("call");
      // The constant-expression argument survives as tokens; the global it
      // references is visible as a Global operand.
      expect(inst.args).toContainEqual(op("Global", ".str"));
      expect(inst.args[0]).toEqual(op("Other", "i8"));
    });

    it("when call argument is a GEP constant expression (probe-03), should keep callee and args", () => {
      const inst = parseInstruction(
        lineOf(
          "%c = call i32 @puts(i8* getelementptr ([4 x i8], [4 x i8]* @.str, i32 0, i32 0))",
        ),
      ) as LLVMCallInstruction;
      expect(inst.callee).toBe("puts");
      expect(inst.dest).toBe("c");
      expect(inst.args).toContainEqual(op("Global", ".str"));
    });

    it("when call uses the 2.x fn-pointer type, should still find the callee", () => {
      const inst = parseInstruction(
        lineOf("%r = call i32 (i8*, ...)* @printf(i8* %s)"),
      ) as LLVMCallInstruction;
      expect(inst.callee).toBe("printf");
      expect(inst.dest).toBe("r");
      expect(inst.args).toEqual([
        op("Other", "i8"),
        op("Other", "*"),
        op("Local", "s"),
      ]);
    });

    it("when call has no result, should leave dest undefined", () => {
      const inst = parseInstruction(
        lineOf("call void @bar()"),
      ) as LLVMCallInstruction;
      expect(inst.opcode).toBe("call");
      expect(inst.callee).toBe("bar");
      expect(inst.args).toEqual([]);
      expect(inst.dest).toBeUndefined();
    });

    const prefixed: { line: string; opcode: string; callee: string }[] = [
      { line: "tail call void @foo()", opcode: "tail call", callee: "foo" },
      {
        line: "%v = musttail call i32 @f(i32 %x)",
        opcode: "musttail call",
        callee: "f",
      },
      {
        line: "notail call void @g()",
        opcode: "notail call",
        callee: "g",
      },
    ];
    for (const { line, opcode, callee } of prefixed) {
      it(`should parse \`${line}\` with opcode "${opcode}"`, () => {
        const inst = parseInstruction(lineOf(line)) as LLVMCallInstruction;
        expect(inst.opcode).toBe(opcode);
        expect(inst.callee).toBe(callee);
      });
    }
  });

  describe("write marking (legacy heuristics)", () => {
    it("when instruction is a store, should mark the LAST Local/Global operand as written", () => {
      const inst = parseInstruction(
        lineOf("store i32 %val, i32* %ptr"),
      ) as LLVMStoreInstruction;
      expect(inst.opcode).toBe("store");
      expect(inst.operands).toEqual([
        op("Other", "i32"),
        op("Local", "val"),
        op("Other", "i32"),
        op("Other", "*"),
        op("Local", "ptr", true),
      ]);
    });

    it("when store targets a global, should mark the global as written", () => {
      const inst = parseInstruction(
        lineOf("store i32 1, i32* @g"),
      ) as LLVMStoreInstruction;
      expect(inst.operands).toEqual([
        op("Other", "i32"),
        op("Other", "1"),
        op("Other", "i32"),
        op("Other", "*"),
        op("Global", "g", true),
      ]);
    });

    it("when store carries trailing metadata, should keep it as Metadata operands after the pointer", () => {
      // Legacy compatibility: metadata operand values keep their `!` sigil,
      // and trailing `, !tbaa !3` stays in `operands` (the legacy argPart
      // rule consumed it); the write marking still lands on the pointer.
      const inst = parseInstruction(
        lineOf("store i32 %v, ptr %p, !tbaa !3"),
      ) as LLVMStoreInstruction;
      expect(inst.operands).toEqual([
        op("Other", "i32"),
        op("Local", "v"),
        op("Other", "ptr"),
        op("Local", "p", true),
        op("Metadata", "!tbaa"),
        op("Metadata", "!3"),
      ]);
    });

    it("when instruction is a cmpxchg, should mark the FIRST Local/Global operand as written", () => {
      const inst = parseInstruction(
        lineOf("cmpxchg i32* %ptr, i32 %cmp, i32 %new acquire monotonic"),
      ) as LLVMCmpxchgInstruction;
      expect(inst.opcode).toBe("cmpxchg");
      expect(inst.operands).toEqual([
        op("Other", "i32"),
        op("Other", "*"),
        op("Local", "ptr", true),
        op("Other", "i32"),
        op("Local", "cmp"),
        op("Other", "i32"),
        op("Local", "new"),
        op("Other", "acquire"),
        op("Other", "monotonic"),
      ]);
    });

    it("when instruction is an atomicrmw, should mark the FIRST Local/Global operand as written", () => {
      const inst = parseInstruction(
        lineOf("atomicrmw add i32* %ptr, i32 1 seq_cst"),
      ) as LLVMAtomicRMWInstruction;
      expect(inst.opcode).toBe("atomicrmw");
      const ptr = inst.operands.find((o) => o.type === "Local");
      expect(ptr).toEqual(op("Local", "ptr", true));
    });

    it("when a modern cmpxchg assigns a result, should keep opcode, result, and write marking", () => {
      // The dedicated cmpxchg/atomicrmw AST shapes cannot carry a result
      // (the legacy grammar had none), so the result-bearing form is a
      // generic-shaped node with the same opcode and marking.
      const inst = parseInstruction(
        lineOf("%old = cmpxchg ptr %p, i32 %c, i32 %n seq_cst seq_cst"),
      ) as LLVMGenericInstruction;
      expect(inst.opcode).toBe("cmpxchg");
      expect(inst.result).toBe("old");
      expect(inst.operands).toContainEqual(op("Local", "p", true));
      expect(inst.operands).toContainEqual(op("Local", "c"));
    });

    it("when a modern atomicrmw assigns a result, should keep opcode, result, and write marking", () => {
      const inst = parseInstruction(
        lineOf("%old = atomicrmw xchg ptr %p, i32 %v acq_rel"),
      ) as LLVMGenericInstruction;
      expect(inst.opcode).toBe("atomicrmw");
      expect(inst.result).toBe("old");
      expect(inst.operands).toContainEqual(op("Local", "p", true));
    });
  });

  describe("originalText", () => {
    it("should trim each physical line of a joined raw and keep the newlines", () => {
      const line: LogicalLine = {
        text: "invoke void @g() to label %c unwind label %l",
        raw: "  invoke void @g()\n          to label %c unwind label %l",
        lineNumber: 4,
      };
      const inst = parseInstruction(line);
      expect(inst.originalText).toBe(
        "invoke void @g()\nto label %c unwind label %l",
      );
    });
  });
});

describe("llvm parseDebugRecord", () => {
  it("should split content after the leading # like the legacy parser", () => {
    const record = parseDebugRecord(
      lineOf("#dbg_value(ptr %x, !12, !DIExpression(), !34)"),
    );
    expect(record.type).toBe("DebugRecord");
    expect(record.content).toBe("dbg_value(ptr %x, !12, !DIExpression(), !34)");
    expect(record.originalText).toBe(
      "#dbg_value(ptr %x, !12, !DIExpression(), !34)",
    );
  });
});
