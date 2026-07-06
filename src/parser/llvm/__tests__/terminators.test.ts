import { describe, expect, it } from "vitest";
import type {
  LLVMBrInstruction,
  LLVMInvokeInstruction,
  LLVMOpaqueTerminator,
  LLVMRetInstruction,
  LLVMSwitchInstruction,
} from "../../../ast/llvmAST";
import { TERMINATOR_OPCODES } from "../classify";
import { readLogicalLines } from "../logicalLines";
import type { LogicalLine } from "../logicalLines";
import { parseTerminator } from "../terminators";

/** A single-line LogicalLine with realistic indentation in `raw`. */
function lineOf(text: string): LogicalLine {
  return { text, raw: `  ${text}`, lineNumber: 1 };
}

/**
 * Run a (possibly multi-line) body through the layer-1 reader and return
 * its first logical line — integration with the §3.1 joining rules.
 */
function bodyLine(body: string): LogicalLine {
  const { lines } = readLogicalLines(`define void @f() {\n${body}\n}`);
  return lines[1];
}

describe("llvm parseTerminator", () => {
  describe("br", () => {
    it("when branch is unconditional, should parse the destination", () => {
      const t = parseTerminator(
        lineOf("br label %next"),
        "br",
      ) as LLVMBrInstruction;
      expect(t.opcode).toBe("br");
      expect(t.destination).toBe("next");
      expect(t.condition).toBeUndefined();
      expect(t.originalText).toBe("br label %next");
    });

    it("when unconditional branch carries loop metadata, should ignore it", () => {
      const t = parseTerminator(
        lineOf("br label %loop, !llvm.loop !5"),
        "br",
      ) as LLVMBrInstruction;
      expect(t.destination).toBe("loop");
    });

    it("when branch is conditional, should parse condition and both targets", () => {
      const t = parseTerminator(
        lineOf("br i1 %cond, label %then, label %else"),
        "br",
      ) as LLVMBrInstruction;
      expect(t.opcode).toBe("br");
      expect(t.condition).toBe("cond");
      expect(t.trueTarget).toBe("then");
      expect(t.falseTarget).toBe("else");
      expect(t.destination).toBeUndefined();
    });

    it("when conditional branch carries prof metadata, should ignore it", () => {
      const t = parseTerminator(
        lineOf("br i1 %c, label %a, label %b, !prof !0"),
        "br",
      ) as LLVMBrInstruction;
      expect(t.condition).toBe("c");
      expect(t.trueTarget).toBe("a");
      expect(t.falseTarget).toBe("b");
    });

    it("when branch uses the old bool type, should still parse (LLVM 2.x)", () => {
      const t = parseTerminator(
        lineOf("br bool %c, label %a, label %b"),
        "br",
      ) as LLVMBrInstruction;
      expect(t.condition).toBe("c");
      expect(t.trueTarget).toBe("a");
      expect(t.falseTarget).toBe("b");
    });

    it("when condition is the literal true, should keep the literal text", () => {
      const t = parseTerminator(
        lineOf("br i1 true, label %a, label %b"),
        "br",
      ) as LLVMBrInstruction;
      expect(t.condition).toBe("true");
    });

    it("when branch targets cannot be found, should degrade to an opaque terminator", () => {
      // Documented degradation (§3.4): no fabricated br fields, the
      // uniform-rule successors are kept instead.
      const none = parseTerminator(
        lineOf("br i1 %c"),
        "br",
      ) as LLVMOpaqueTerminator;
      expect(none.opcode).toBe("br");
      expect(none.successors).toEqual([]);

      const one = parseTerminator(
        lineOf("br i1 %c, label %only"),
        "br",
      ) as LLVMOpaqueTerminator;
      expect(one.successors).toEqual(["only"]);
    });
  });

  describe("ret", () => {
    const cases: {
      line: string;
      valType: string | undefined;
      value: string | undefined;
    }[] = [
      { line: "ret void", valType: "void", value: undefined },
      { line: "ret i32 %a", valType: "i32", value: "a" },
      { line: "ret i32 42", valType: "i32", value: "42" },
      { line: "ret i32 -1", valType: "i32", value: "-1" },
      { line: "ret i8* null", valType: "i8*", value: "null" },
      { line: "ret ptr undef", valType: "ptr", value: "undef" },
      {
        line: "ret float 0x3FF0000000000000",
        valType: "float",
        value: "0x3FF0000000000000",
      },
      // Spaced aggregate and vector types stay one raw valType slice.
      { line: "ret { i32, i32 } %v", valType: "{ i32, i32 }", value: "v" },
      { line: "ret <4 x i32> %vec", valType: "<4 x i32>", value: "vec" },
      {
        line: "ret { i32, i8 } zeroinitializer",
        valType: "{ i32, i8 }",
        value: "zeroinitializer",
      },
      // A trailing metadata group is excluded before value detection.
      { line: "ret i32 %a, !dbg !7", valType: "i32", value: "a" },
      { line: "ret void, !dbg !5", valType: "void", value: undefined },
    ];
    for (const { line, valType, value } of cases) {
      it(`should parse \`${line}\` as valType=${String(valType)} value=${String(value)}`, () => {
        const t = parseTerminator(lineOf(line), "ret") as LLVMRetInstruction;
        expect(t.opcode).toBe("ret");
        expect(t.valType).toBe(valType);
        expect(t.value).toBe(value);
      });
    }
  });

  describe("switch", () => {
    it("when switch is a joined single line, should parse header and cases", () => {
      const t = parseTerminator(
        lineOf("switch i32 %v, label %d [ i32 0, label %a i32 1, label %b ]"),
        "switch",
      ) as LLVMSwitchInstruction;
      expect(t.opcode).toBe("switch");
      expect(t.conditionType).toBe("i32");
      expect(t.conditionValue).toBe("v");
      expect(t.defaultTarget).toBe("d");
      expect(t.cases).toEqual([
        { type: "i32", value: "0", target: "a" },
        { type: "i32", value: "1", target: "b" },
      ]);
    });

    it("when a multi-line switch comes through the logical-line reader, should parse every case", () => {
      const line = bodyLine(
        [
          "  switch i32 %v, label %d [",
          "    i32 -1, label %a",
          "    i32 1, label %b",
          "  ]",
        ].join("\n"),
      );
      const t = parseTerminator(line, "switch") as LLVMSwitchInstruction;
      expect(t.defaultTarget).toBe("d");
      expect(t.cases).toEqual([
        { type: "i32", value: "-1", target: "a" },
        { type: "i32", value: "1", target: "b" },
      ]);
      // originalText: each physical line trimmed, joined by newlines.
      expect(t.originalText).toBe(
        "switch i32 %v, label %d [\ni32 -1, label %a\ni32 1, label %b\n]",
      );
    });

    it("when case values are negative, hex, or beyond 32 bits, should keep the value text as written", () => {
      const t = parseTerminator(
        lineOf(
          "switch i64 %v, label %d [ i64 -1, label %a i64 0x1F, label %b i64 4294967296, label %c ]",
        ),
        "switch",
      ) as LLVMSwitchInstruction;
      // §3.2: the case value is the VALUE TEXT ONLY, never `i64 -1`.
      expect(t.cases.map((c) => c.value)).toEqual(["-1", "0x1F", "4294967296"]);
      expect(t.cases.map((c) => c.type)).toEqual(["i64", "i64", "i64"]);
    });

    it("when switch carries trailing metadata after the case list, should ignore it", () => {
      const t = parseTerminator(
        lineOf("switch i32 %v, label %d [ i32 0, label %a ], !prof !1"),
        "switch",
      ) as LLVMSwitchInstruction;
      expect(t.defaultTarget).toBe("d");
      expect(t.cases).toEqual([{ type: "i32", value: "0", target: "a" }]);
    });

    it("when switch structure is missing, should degrade to an opaque terminator", () => {
      // Documented degradation (§3.4): missing case brackets / default.
      const noBrackets = parseTerminator(
        lineOf("switch i32 %v, label %d"),
        "switch",
      ) as LLVMOpaqueTerminator;
      expect(noBrackets.opcode).toBe("switch");
      expect(noBrackets.successors).toEqual(["d"]);

      const noDefault = parseTerminator(
        lineOf("switch i32 %v"),
        "switch",
      ) as LLVMOpaqueTerminator;
      expect(noDefault.successors).toEqual([]);
    });
  });

  describe("invoke", () => {
    it("when a 2.x one-line invoke has a fn-pointer type and result, should extract callee and targets", () => {
      const t = parseTerminator(
        lineOf(
          "%r = invoke i32 (i8*, ...)* @printf(i8* getelementptr ([13 x i8]* @.str, i32 0, i32 0)) to label %ok unwind label %err",
        ),
        "invoke",
      ) as LLVMInvokeInstruction;
      expect(t.opcode).toBe("invoke");
      // The fn-pointer type parens precede the argument list; the callee
      // heuristic must not be fooled by them.
      expect(t.callee).toBe("printf");
      expect(t.normalTarget).toBe("ok");
      expect(t.unwindTarget).toBe("err");
      expect(t.result).toBe("r");
    });

    it("when a modern two-line invoke is joined by the logical-line reader, should parse targets", () => {
      const line = bodyLine(
        "  invoke void @g()\n          to label %cont unwind label %lpad",
      );
      const t = parseTerminator(line, "invoke") as LLVMInvokeInstruction;
      expect(t.callee).toBe("g");
      expect(t.normalTarget).toBe("cont");
      expect(t.unwindTarget).toBe("lpad");
      expect(t.result).toBeUndefined();
      expect(t.originalText).toBe(
        "invoke void @g()\nto label %cont unwind label %lpad",
      );
    });

    it("when invoke carries trailing metadata, should ignore it", () => {
      const t = parseTerminator(
        lineOf("invoke void @g() to label %c unwind label %l, !dbg !9"),
        "invoke",
      ) as LLVMInvokeInstruction;
      expect(t.normalTarget).toBe("c");
      expect(t.unwindTarget).toBe("l");
    });

    it("when invoke misses its unwind clause, should degrade to an opaque terminator", () => {
      // Documented degradation (§3.4): invoke needs both clauses.
      const t = parseTerminator(
        lineOf("invoke void @g() to label %cont"),
        "invoke",
      ) as LLVMOpaqueTerminator;
      expect(t.opcode).toBe("invoke");
      expect(t.successors).toEqual(["cont"]);
    });
  });

  describe("opaque terminators (uniform successor rule)", () => {
    const cases: { line: string; opcode: string; successors: string[] }[] = [
      { line: "unreachable", opcode: "unreachable", successors: [] },
      {
        line: "resume { i8*, i32 } %lp",
        opcode: "resume",
        successors: [],
      },
      // The LLVM <= 2.x terminator instruction (§3.5).
      { line: "unwind", opcode: "unwind", successors: [] },
      {
        line: "cleanupret from %tok unwind label %bb",
        opcode: "cleanupret",
        successors: ["bb"],
      },
      // `unwind to caller` has no `label` token, so no successor.
      {
        line: "cleanupret from %tok unwind to caller",
        opcode: "cleanupret",
        successors: [],
      },
      {
        line: "catchret from %tok to label %continue",
        opcode: "catchret",
        successors: ["continue"],
      },
      {
        line: "%cs = catchswitch within none [label %h1, label %h2] unwind to caller",
        opcode: "catchswitch",
        successors: ["h1", "h2"],
      },
      {
        line: "%cs = catchswitch within none [label %h1] unwind label %next",
        opcode: "catchswitch",
        successors: ["h1", "next"],
      },
      {
        line: 'callbr void asm "", "!i"() to label %cont [label %alt]',
        opcode: "callbr",
        successors: ["cont", "alt"],
      },
      {
        line: "indirectbr i8* %target, [label %bb1, label %bb2]",
        opcode: "indirectbr",
        successors: ["bb1", "bb2"],
      },
    ];
    for (const { line, opcode, successors } of cases) {
      it(`should parse \`${line}\` with successors [${successors.join(", ")}]`, () => {
        const t = parseTerminator(lineOf(line), opcode) as LLVMOpaqueTerminator;
        expect(t.opcode).toBe(opcode);
        expect(t.successors).toEqual(successors);
      });

      it(`should ignore trailing metadata on \`${line}\``, () => {
        const t = parseTerminator(
          lineOf(`${line}, !dbg !7`),
          opcode,
        ) as LLVMOpaqueTerminator;
        expect(t.successors).toEqual(successors);
      });
    }

    it("when a string literal contains `label %x`, should never count it as a successor", () => {
      const t = parseTerminator(
        lineOf(
          'callbr void asm "br label %fake", "r,!i"(i32 %x) to label %real [label %alt]',
        ),
        "callbr",
      ) as LLVMOpaqueTerminator;
      expect(t.successors).toEqual(["real", "alt"]);
    });
  });

  describe("totality", () => {
    it("should never throw for any table opcode over malformed operand text", () => {
      const junkOperands = [
        "",
        " ??? ",
        '"unterminated string',
        "label label label",
        ", , ,",
      ];
      for (const opcode of TERMINATOR_OPCODES) {
        for (const junk of junkOperands) {
          expect(() =>
            parseTerminator(lineOf(`${opcode} ${junk}`.trim()), opcode),
          ).not.toThrow();
        }
      }
    });
  });
});
