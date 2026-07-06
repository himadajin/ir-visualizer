import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TERMINATOR_OPCODES,
  classifyBody,
  classifyTopLevel,
} from "../classify";
import type { BodyClassification, TopLevelKind } from "../classify";
import { readLogicalLines } from "../logicalLines";

const corpusDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../__tests__/llvm/corpus",
);

/** Flat projection of a body classification for table assertions. */
function bodyKind(classification: BodyClassification): string {
  switch (classification.kind) {
    case "label":
      return `label:${classification.id}`;
    case "terminator":
      return `terminator:${classification.opcode}`;
    default:
      return classification.kind;
  }
}

/**
 * The classified kind sequence of a whole file — the projection step 8
 * builds on. Routing mirrors the assembler's two-state machine (and the
 * logical-line reader's body tracking): `define ... {` enters a body, a
 * bare `}` is routed to the top level and leaves it.
 */
function classifiedSequence(text: string): string[] {
  const { lines } = readLogicalLines(text);
  const kinds: string[] = [];
  let inBody = false;
  for (const line of lines) {
    if (!inBody || line.text === "}") {
      const kind = classifyTopLevel(line.text);
      kinds.push(kind);
      if (kind === "define" && line.text.endsWith("{")) inBody = true;
      if (kind === "closeBrace") inBody = false;
    } else {
      kinds.push(bodyKind(classifyBody(line.text)));
    }
  }
  return kinds;
}

describe("llvm classify", () => {
  describe("classifyTopLevel", () => {
    const cases: [line: string, expected: TopLevelKind][] = [
      ["define dso_local i32 @main() #0 {", "define"],
      // The trailing `{` is the assembler's concern, not the classifier's.
      ["define void @f()", "define"],
      ["}", "closeBrace"],
      ["declare i32 @printf(ptr, ...)", "declare"],
      ["@g = global i32 0", "global"],
      ['@"quoted name" = private constant [4 x i8] c"abc\\00"', "global"],
      ['!0 = !{i32 1, !"wchar_size", i32 4}', "metadataDef"],
      ["!llvm.module.flags = !{!0}", "metadataDef"],
      [
        'attributes #0 = { noinline nounwind "no-trapping-math"="true" }',
        "attributes",
      ],
      ['attributes #"a b" = { nounwind }', "attributes"],
      ['target triple = "x86_64-pc-linux-gnu"', "target"],
      ['target datalayout = "e-m:e-i64:64"', "target"],
      ['source_filename = "main.c"', "sourceFilename"],
      ["%struct.T = type { i32, i8 }", "typeAlias"],
      ["%T = type opaque", "typeAlias"],
      ["$sym = comdat any", "comdat"],
      ['module asm ".globl foo"', "moduleAsm"],
      ["uselistorder ptr @f, { 1, 0 }", "uselistorder"],
      // The basic-block variant is documented as the same dropped kind.
      ["uselistorder_bb @f, %bb, { 2, 0, 1 }", "uselistorder"],
      ["this is not valid LLVM IR", "unknown"],
    ];

    it.each(cases)("when given %j, should classify it as %s", (line, kind) => {
      expect(classifyTopLevel(line)).toBe(kind);
    });

    it("when a local opens the line without `= type`, should classify unknown", () => {
      // Locals never open a top-level entry except type aliases; a stray
      // instruction outside any function has no home and must make the
      // whole parse fail via the step-8 unknown → throw escalation.
      expect(classifyTopLevel("%x = add i32 1, 2")).toBe("unknown");
    });

    it("when the keyword appears but not first, should not match it", () => {
      // `global` in third position must not shadow the leading-@ rule, and
      // a lone `module` (no `asm`) is not module-level assembly.
      expect(classifyTopLevel("@g = global i32 0")).toBe("global");
      expect(classifyTopLevel("module")).toBe("unknown");
    });

    it("when a bare ! precedes =, should classify unknown, not metadataDef", () => {
      // The tokenizer's bare-`!` token has an empty value; it names nothing.
      expect(classifyTopLevel("! = !{}")).toBe("unknown");
    });

    it("when a } has trailing tokens, should not classify closeBrace", () => {
      expect(classifyTopLevel("} extra")).toBe("unknown");
    });
  });

  describe("classifyBody labels", () => {
    const labels: [line: string, id: string][] = [
      ["entry:", "entry"],
      ["for.body:", "for.body"],
      ["5:", "5"],
      ['"weird label":', "weird label"],
      // The colon wins over the terminator keyword table.
      ["br:", "br"],
    ];

    it.each(labels)(
      "when given the label line %j, should extract id %j",
      (line, id) => {
        expect(classifyBody(line)).toEqual({ kind: "label", id });
      },
    );

    it("when tokens follow the colon, should NOT classify a label", () => {
      // Strict two-token rule: LLVM's printer emits nothing after a label's
      // colon except comments, and layer 1 already stripped those. Anything
      // else degrades to instruction instead of fabricating a block.
      expect(classifyBody("entry: ret void")).toEqual({ kind: "instruction" });
    });

    it("when the name is sigiled or a c-string, should NOT classify a label", () => {
      expect(classifyBody("%x:")).toEqual({ kind: "instruction" });
      expect(classifyBody('c"x":')).toEqual({ kind: "instruction" });
    });

    it("when a phi uses bracketed block refs, should classify instruction", () => {
      expect(classifyBody("%x = phi i32 [ 0, %entry ], [ %v, %loop ]")).toEqual(
        { kind: "instruction" },
      );
    });
  });

  describe("classifyBody terminators", () => {
    const terminators: [line: string, opcode: string][] = [
      ["ret void", "ret"],
      ["ret i32 -1", "ret"],
      ["br label %exit", "br"],
      ["br i1 %c, label %a, label %b", "br"],
      // Trailing metadata is just tokens after the recognized structure.
      ["br label %exit, !dbg !7, !llvm.loop !0", "br"],
      [
        "switch i32 %v, label %default [ i32 0, label %a i32 1, label %b ]",
        "switch",
      ],
      ["indirectbr ptr %addr, [label %a, label %b]", "indirectbr"],
      ["invoke void @may_throw() to label %cont unwind label %lpad", "invoke"],
      [
        'callbr void asm "", "r,!i"(i32 %x) to label %fall [label %ind]',
        "callbr",
      ],
      ["resume { ptr, i32 } %lp", "resume"],
      // Single-token line: still a terminator.
      ["unreachable", "unreachable"],
      ["cleanupret from %tok unwind label %lpad", "cleanupret"],
      ["catchret from %tok to label %cont", "catchret"],
      [
        "catchswitch within none [label %handler] unwind to caller",
        "catchswitch",
      ],
      // LLVM <= 2.x terminator (plan §3.5 old-IR goal).
      ["unwind", "unwind"],
      // invoke/callbr are the only terminators that carry a `%x =` result.
      ["%x = invoke i32 @f() to label %a unwind label %b", "invoke"],
      ['%ret = callbr i32 asm "", "=r,!i"() to label %a [label %b]', "callbr"],
    ];

    it.each(terminators)(
      "when given %j, should classify terminator %s",
      (line, opcode) => {
        expect(classifyBody(line)).toEqual({ kind: "terminator", opcode });
      },
    );

    it("when the keyword set is inspected, should contain exactly the 12 plan opcodes", () => {
      expect([...TERMINATOR_OPCODES].sort()).toEqual(
        [
          "br",
          "callbr",
          "catchret",
          "catchswitch",
          "cleanupret",
          "indirectbr",
          "invoke",
          "resume",
          "ret",
          "switch",
          "unreachable",
          "unwind",
        ].sort(),
      );
    });

    it("when a non-invoke terminator keyword follows %x =, should stay an instruction", () => {
      // `%x = ret` is nonsense IR; only invoke/callbr can carry a result.
      expect(classifyBody("%x = ret i32 0")).toEqual({ kind: "instruction" });
      expect(classifyBody("%x = br label %a")).toEqual({
        kind: "instruction",
      });
    });
  });

  describe("classifyBody debug records and fallback", () => {
    it("when a #dbg_* record starts the line, should classify debugRecord", () => {
      expect(
        classifyBody("#dbg_value(i32 %x, !12, !DIExpression(), !13)"),
      ).toEqual({ kind: "debugRecord" });
      expect(
        classifyBody("#dbg_declare(ptr %p, !1, !DIExpression(), !2)"),
      ).toEqual({ kind: "debugRecord" });
    });

    it("when a bare #0 starts the line, should fall back to instruction", () => {
      // #0 is an attrGroup token, not a word — no debug-record match.
      expect(classifyBody("#0")).toEqual({ kind: "instruction" });
    });

    it("when ordinary instructions appear, should classify instruction", () => {
      expect(classifyBody("%1 = alloca i32, align 4")).toEqual({
        kind: "instruction",
      });
      expect(classifyBody("store i32 0, ptr %1, align 4")).toEqual({
        kind: "instruction",
      });
      expect(classifyBody("%lp = landingpad { ptr, i32 } cleanup")).toEqual({
        kind: "instruction",
      });
    });

    it("when a stray } reaches classifyBody, should fall back to instruction", () => {
      // The assembler routes `}` at the top level; totality holds anyway.
      expect(classifyBody("}")).toEqual({ kind: "instruction" });
    });
  });

  describe("totality", () => {
    it("when classifying every corpus logical line, should never throw either way", () => {
      const files = readdirSync(corpusDir).filter((file) =>
        file.endsWith(".ll"),
      );
      expect(files.length).toBeGreaterThan(20);

      let lineCount = 0;
      for (const file of files) {
        const text = readFileSync(join(corpusDir, file), "utf8");
        const { lines } = readLogicalLines(text);
        for (const line of lines) {
          lineCount++;
          expect(() => classifyTopLevel(line.text)).not.toThrow();
          expect(() => classifyBody(line.text)).not.toThrow();
        }
      }
      expect(lineCount).toBeGreaterThan(100);
    });

    it("when classifying arbitrary junk strings, should return a defined kind, never throw", () => {
      // Fuzz-lite: a fixed list, no randomness (deterministic suite).
      const junk = [
        "",
        "   \t ",
        "{",
        "}",
        "} extra",
        ":",
        "::",
        "= = =",
        "%",
        "% @ !",
        "%%%%",
        "!!!",
        "###",
        "#",
        '"unterminated',
        'c"unterminated',
        '%"',
        "-",
        "0x",
        "label:extra:",
        "wibble %a, ??? `~ €",
        "define",
        "declare:",
        "invoke",
        "to label %x",
        "\\0",
      ];

      for (const line of junk) {
        const top = classifyTopLevel(line);
        const body = classifyBody(line);
        expect(typeof top).toBe("string");
        expect(body.kind).toBeDefined();
      }
    });
  });

  describe("corpus kind-sequence pins", () => {
    it("when classifying era-cpp-eh.ll, should produce the pinned kind sequence", () => {
      const text = readFileSync(join(corpusDir, "era-cpp-eh.ll"), "utf8");

      expect(classifiedSequence(text)).toEqual([
        "declare",
        "declare",
        "define",
        "label:entry",
        "terminator:invoke", // two-line invoke, joined by layer 1
        "label:cont1",
        "terminator:invoke",
        "label:cont2",
        "terminator:ret",
        "label:lpad",
        "instruction", // landingpad
        "terminator:resume",
        "closeBrace",
      ]);
    });

    it("when classifying era-current-clang-o0.ll, should produce the pinned kind sequence", () => {
      const text = readFileSync(
        join(corpusDir, "era-current-clang-o0.ll"),
        "utf8",
      );

      expect(classifiedSequence(text)).toEqual([
        "sourceFilename",
        "target",
        "target",
        "define",
        "instruction", // %1 = alloca
        "instruction", // %2 = alloca
        "instruction", // store 0
        "instruction", // store 41
        "instruction", // %3 = load
        "instruction", // %4 = icmp
        "terminator:br",
        "label:5", // `5:  ; preds = %0` — comment already stripped
        "instruction",
        "instruction",
        "instruction",
        "terminator:br",
        "label:8",
        "instruction",
        "terminator:br",
        "label:9",
        "instruction",
        "terminator:ret",
        "closeBrace",
        "attributes",
        "metadataDef", // !llvm.module.flags
        "metadataDef", // !llvm.ident
        "metadataDef", // !0
        "metadataDef", // !1
      ]);
    });
  });
});
