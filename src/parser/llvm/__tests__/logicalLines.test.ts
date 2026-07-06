import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readLogicalLines } from "../logicalLines";
import type { LogicalLine } from "../logicalLines";

const corpusDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../__tests__/llvm/corpus",
);

function readCorpus(name: string): string {
  return readFileSync(join(corpusDir, name), "utf8");
}

/** Project each logical line to its stripped text — the main assertion shape. */
function texts(lines: LogicalLine[]): string[] {
  return lines.map((line) => line.text);
}

describe("llvm logical lines", () => {
  describe("blank and comment-only lines", () => {
    it("when lines are blank or comment-only, should emit no logical line for them", () => {
      const input = [
        "; a file comment",
        "",
        "   ",
        "@g = global i32 0 ; trailing comment",
        "",
      ].join("\n");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual(["@g = global i32 0"]);
      expect(lines[0].lineNumber).toBe(4);
      expect(diagnostics).toEqual([]);
    });

    it("when a semicolon sits inside a string, should keep it as data, not a comment", () => {
      const input = '@s = constant [4 x i8] c"a;b\\00" ; real comment';

      const { lines } = readLogicalLines(input);

      expect(texts(lines)).toEqual(['@s = constant [4 x i8] c"a;b\\00"']);
    });

    it("when an unterminated string swallows the semicolon, should pass the whole line through", () => {
      // stripComment defines this case: no comment is found at all.
      const input = '@s = constant [4 x i8] c"a;b';

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual(['@s = constant [4 x i8] c"a;b']);
      expect(diagnostics).toEqual([]);
    });
  });

  describe("bracket continuation in a function body", () => {
    it("when a switch spans multiple lines, should join them into ONE logical line", () => {
      const input = readCorpus("probe-13-switch-negative-case.ll");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "define void @f(i32 %v) {",
        "switch i32 %v, label %d [ i32 -1, label %a ]",
        "a:",
        "ret void",
        "d:",
        "ret void",
        "}",
      ]);
      expect(lines[1].lineNumber).toBe(2);
      expect(diagnostics).toEqual([]);
    });

    it("when lines are joined, should keep the original physical lines newline-joined in raw", () => {
      const input = readCorpus("probe-13-switch-negative-case.ll");

      const { lines } = readLogicalLines(input);

      expect(lines[1].raw).toBe(
        ["  switch i32 %v, label %d [", "    i32 -1, label %a", "  ]"].join(
          "\n",
        ),
      );
    });

    it("when an instruction follows a joined switch, should skip the joined lines in its lineNumber", () => {
      const input = [
        "define void @f(i32 %v) {",
        "  switch i32 %v, label %d [",
        "    i32 -1, label %a",
        "  ]",
        "d:",
        "  ret void",
        "}",
      ].join("\n");

      const { lines } = readLogicalLines(input);

      expect(
        lines.map((line) => [line.lineNumber, line.text.split(" ")[0]]),
      ).toEqual([
        [1, "define"],
        [2, "switch"],
        [5, "d:"],
        [6, "ret"],
        [7, "}"],
      ]);
    });

    it("when a comment-only line sits inside a continuation, should strip it and drop its hint", () => {
      const input = [
        "define void @f(i32 %v) {",
        "  switch i32 %v, label %d [",
        "; <label>:9",
        "    i32 0, label %a",
        "  ]",
        "  ret void",
        "}",
      ].join("\n");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "define void @f(i32 %v) {",
        "switch i32 %v, label %d [ i32 0, label %a ]",
        "ret void",
        "}",
      ]);
      expect(lines.every((line) => line.labelHint === undefined)).toBe(true);
      expect(diagnostics).toEqual([]);
    });

    it("when brackets sit inside a string literal, should not count them for continuation", () => {
      const input = [
        "define void @f() {",
        '  %p = call ptr @fmt(ptr c"a[b\\00")',
        "  ret void",
        "}",
      ].join("\n");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "define void @f() {",
        '%p = call ptr @fmt(ptr c"a[b\\00")',
        "ret void",
        "}",
      ]);
      expect(diagnostics).toEqual([]);
    });
  });

  describe("unbalanced brackets", () => {
    it("when a '[' is still open at the closing brace, should diagnose, emit one opaque line, and NOT consume the brace", () => {
      const input = [
        "define void @f(i32 %v) {",
        "  switch i32 %v, label %d [",
        "    i32 0, label %a",
        "}",
      ].join("\n");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "define void @f(i32 %v) {",
        "switch i32 %v, label %d [ i32 0, label %a",
        "}",
      ]);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].line).toBe(2);
      expect(diagnostics[0].message).toContain("line 2");
    });

    it("when a '[' is still open at EOF, should diagnose with the start line and emit one opaque line", () => {
      const input = [
        "define void @f(i32 %v) {",
        "  switch i32 %v, label %d [",
        "    i32 0, label %a",
      ].join("\n");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "define void @f(i32 %v) {",
        "switch i32 %v, label %d [ i32 0, label %a",
      ]);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].line).toBe(2);
    });

    it("when a top-level line has an unbalanced '[', should not join and not diagnose", () => {
      // Rule 3 (bracket continuation) is body-only; at top level every
      // non-blank, non-comment physical line is one logical line, as-is.
      const input = ["@g = global [2 x i32", "declare void @f()"].join("\n");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "@g = global [2 x i32",
        "declare void @f()",
      ]);
      expect(diagnostics).toEqual([]);
    });
  });

  describe("to-continuation in a function body", () => {
    it("when an invoke prints its targets on the next line, should join the two lines", () => {
      const input = [
        "define void @run() personality ptr @p {",
        "entry:",
        "  invoke void @may_throw()",
        "          to label %cont1 unwind label %lpad",
        "cont1:",
        "  ret void",
        "lpad:",
        "  resume { ptr, i32 } undef",
        "}",
      ].join("\n");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "define void @run() personality ptr @p {",
        "entry:",
        "invoke void @may_throw() to label %cont1 unwind label %lpad",
        "cont1:",
        "ret void",
        "lpad:",
        "resume { ptr, i32 } undef",
        "}",
      ]);
      expect(lines[2].lineNumber).toBe(3);
      expect(diagnostics).toEqual([]);
    });

    it("when several continuation lines match in a row, should keep joining while the rule matches", () => {
      const input = [
        "define void @f() {",
        "  invoke void @g()",
        "          to label %a unwind label %b",
        "          unwind label %c",
        "  ret void",
        "}",
      ].join("\n");

      const { lines } = readLogicalLines(input);

      expect(texts(lines)[1]).toBe(
        "invoke void @g() to label %a unwind label %b unwind label %c",
      );
      expect(lines[2]).toMatchObject({ text: "ret void", lineNumber: 5 });
    });

    it("when a top-level line is followed by a to-like line, should not join outside a body", () => {
      const input = ["declare void @g()", "to label %a unwind label %b"].join(
        "\n",
      );

      const { lines } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "declare void @g()",
        "to label %a unwind label %b",
      ]);
    });
  });

  describe("label hints", () => {
    it("when a '; <label>:N' comment precedes a line, should attach N and emit no line for the comment", () => {
      const input = [
        "define i32 @loop(i32 %n) {",
        "  br label %1",
        "",
        "; <label>:1                                       ; preds = %1, %0",
        "  %2 = phi i32 [ 0, %0 ], [ %3, %1 ]",
        "  ret i32 %2",
        "}",
      ].join("\n");

      const { lines } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "define i32 @loop(i32 %n) {",
        "br label %1",
        "%2 = phi i32 [ 0, %0 ], [ %3, %1 ]",
        "ret i32 %2",
        "}",
      ]);
      expect(lines[2]).toMatchObject({ labelHint: "1", labelHintLine: 4 });
      expect(lines[1].labelHint).toBeUndefined();
      expect(lines[3].labelHint).toBeUndefined();
    });

    it("when several hint comments precede a line, should keep the nearest one", () => {
      const input = [
        "define void @f() {",
        "; <label>:3",
        "; <label>:4",
        "  ret void",
        "}",
      ].join("\n");

      const { lines } = readLogicalLines(input);

      expect(lines[1]).toMatchObject({ text: "ret void", labelHint: "4" });
    });

    it("when a hint directly precedes the closing brace, should attach it to the brace line (harmless)", () => {
      const input = [
        "define void @f() {",
        "  ret void",
        "; <label>:5",
        "}",
      ].join("\n");

      const { lines } = readLogicalLines(input);

      expect(lines[2]).toMatchObject({ text: "}", labelHint: "5" });
      expect(lines[1].labelHint).toBeUndefined();
    });

    it("when a comment is not a label hint, should attach nothing", () => {
      const input = [
        "define void @f() {",
        "; preds = %entry",
        "  ret void",
        "}",
      ].join("\n");

      const { lines } = readLogicalLines(input);

      expect(lines.every((line) => line.labelHint === undefined)).toBe(true);
    });
  });

  describe("line endings", () => {
    it("when the input uses \\r\\n, should strip the \\r from text and raw", () => {
      const input = "define void @f() {\r\n  ret void\r\n}\r\n";

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual(["define void @f() {", "ret void", "}"]);
      expect(lines.map((line) => line.raw)).toEqual([
        "define void @f() {",
        "  ret void",
        "}",
      ]);
      expect(diagnostics).toEqual([]);
    });

    it("when the input has no trailing newline, should still emit the last line", () => {
      const { lines } = readLogicalLines("@g = global i32 0");

      expect(texts(lines)).toEqual(["@g = global i32 0"]);
      expect(lines[0].lineNumber).toBe(1);
    });

    it("when the input is empty, should emit nothing", () => {
      expect(readLogicalLines("")).toEqual({ lines: [], diagnostics: [] });
    });
  });

  describe("corpus end-to-end", () => {
    it("when reading era-cpp-eh.ll, should produce the exact logical-line sequence", () => {
      const input = readCorpus("era-cpp-eh.ll");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "declare void @may_throw()",
        "declare i32 @__gxx_personality_v0(...)",
        "define void @run() personality ptr @__gxx_personality_v0 {",
        "entry:",
        "invoke void @may_throw() to label %cont1 unwind label %lpad",
        "cont1:",
        "invoke void @may_throw() to label %cont2 unwind label %lpad",
        "cont2:",
        "ret void",
        "lpad:",
        "%lp = landingpad { ptr, i32 } cleanup",
        "resume { ptr, i32 } %lp",
        "}",
      ]);
      expect(diagnostics).toEqual([]);
    });

    it("when reading era-3x-loop-unnamed-blocks.ll, should keep texts, line numbers, and hints aligned", () => {
      const input = readCorpus("era-3x-loop-unnamed-blocks.ll");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "@counter = global i32 0",
        "define i32 @loop(i32 %n) {",
        "br label %1",
        "%2 = phi i32 [ 0, %0 ], [ %3, %1 ]",
        "%3 = add i32 %2, 1",
        "%4 = load i32* @counter",
        "%5 = icmp slt i32 %3, %n",
        "br i1 %5, label %1, label %6, !llvm.loop !0",
        "%7 = getelementptr i32* @counter, i32 0",
        "ret i32 %3",
        "}",
        "!0 = !{!0}",
      ]);
      expect(
        lines
          .filter((line) => line.labelHint !== undefined)
          .map((line) => [line.labelHint, line.labelHintLine, line.text]),
      ).toEqual([
        ["1", 9, "%2 = phi i32 [ 0, %0 ], [ %3, %1 ]"],
        ["6", 16, "%7 = getelementptr i32* @counter, i32 0"],
      ]);
      expect(diagnostics).toEqual([]);
    });

    it("when reading era-switch-heavy.ll, should join the switch and keep every block line", () => {
      const input = readCorpus("era-switch-heavy.ll");

      const { lines, diagnostics } = readLogicalLines(input);

      expect(texts(lines)).toEqual([
        "define i32 @classify(i64 %v) {",
        "entry:",
        "switch i64 %v, label %other [ i64 -1, label %neg i64 0, label %zero i64 1, label %one i64 4294967296, label %big ]",
        "neg:",
        "br label %merge",
        "zero:",
        "br label %merge",
        "one:",
        "br label %merge",
        "big:",
        "br label %merge",
        "other:",
        "br label %merge",
        "merge:",
        "ret i32 0",
        "}",
      ]);
      expect(lines[2].lineNumber).toBe(5);
      expect(diagnostics).toEqual([]);
    });
  });
});
