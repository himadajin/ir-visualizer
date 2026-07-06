import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripComment, tokenizeLine } from "../tokenizer";
import type { Token } from "../tokenizer";

/** Project each token to its [kind, value] pair — the main assertion shape. */
function kindValues(tokens: Token[]): [string, string][] {
  return tokens.map((token) => [token.kind, token.value]);
}

describe("llvm tokenizer", () => {
  describe("strings", () => {
    it("when a c-string contains ; [ %d and commas, should keep it one raw string token", () => {
      const tokens = tokenizeLine('c"a;[%d,\\00"');

      expect(kindValues(tokens)).toEqual([["string", 'c"a;[%d,\\00"']]);
    });

    it("when a string contains \\22 escapes, should not end the token at the escaped quote", () => {
      const tokens = tokenizeLine('c"say \\22hi\\22\\00", i32 1');

      expect(kindValues(tokens)).toEqual([
        ["string", 'c"say \\22hi\\22\\00"'],
        ["punct", ","],
        ["word", "i32"],
        ["number", "1"],
      ]);
    });

    it("when a plain quoted string appears, should tokenize it raw with quotes", () => {
      const tokens = tokenizeLine('target triple = "x86_64-pc-linux-gnu"');

      expect(kindValues(tokens)).toEqual([
        ["word", "target"],
        ["word", "triple"],
        ["punct", "="],
        ["string", '"x86_64-pc-linux-gnu"'],
      ]);
    });

    it("when a string is unterminated, should extend the token to end of line without throwing", () => {
      const tokens = tokenizeLine('c"broken');

      expect(kindValues(tokens)).toEqual([["string", 'c"broken']]);
    });
  });

  describe("locals and globals", () => {
    it("when locals are quoted, should unquote the value but keep the raw text", () => {
      const tokens = tokenizeLine('%"a b" = add i32 %x, 1');

      expect(tokens[0]).toMatchObject({
        kind: "local",
        value: "a b",
        text: '%"a b"',
      });
    });

    it("when a global is quoted, should unquote the value but keep the raw text", () => {
      const tokens = tokenizeLine('@"x" = global i32 0');

      expect(tokens[0]).toMatchObject({
        kind: "global",
        value: "x",
        text: '@"x"',
      });
    });

    it("when a type alias %struct.T and a value %val appear, should give both the local kind", () => {
      // The type-alias vs value distinction is a later pass (plan step 11),
      // deliberately NOT the tokenizer's concern.
      const tokens = tokenizeLine("%p = getelementptr %struct.T, ptr %val");

      expect(kindValues(tokens)).toEqual([
        ["local", "p"],
        ["punct", "="],
        ["word", "getelementptr"],
        ["local", "struct.T"],
        ["punct", ","],
        ["word", "ptr"],
        ["local", "val"],
      ]);
    });

    it("when a local is numeric, should keep the digits as the value", () => {
      const tokens = tokenizeLine("%2 = load i32, ptr %1");

      expect(kindValues(tokens)[0]).toEqual(["local", "2"]);
      expect(kindValues(tokens)[6]).toEqual(["local", "1"]);
    });

    it("when identifiers contain . _ $ or digits, should keep each as one word or local token", () => {
      const tokens = tokenizeLine("br label %for.body");
      const call = tokenizeLine("call void @_ZN3foo3barEv()");

      expect(kindValues(tokens)).toEqual([
        ["word", "br"],
        ["word", "label"],
        ["local", "for.body"],
      ]);
      expect(kindValues(call)[2]).toEqual(["global", "_ZN3foo3barEv"]);
    });
  });

  describe("metadata and attribute groups", () => {
    it("when !dbg and !0 trail an instruction, should tokenize each as one metadata token", () => {
      const tokens = tokenizeLine("br label %exit, !dbg !7, !llvm.loop !0");

      expect(kindValues(tokens)).toEqual([
        ["word", "br"],
        ["word", "label"],
        ["local", "exit"],
        ["punct", ","],
        ["metadata", "dbg"],
        ["metadata", "7"],
        ["punct", ","],
        ["metadata", "llvm.loop"],
        ["metadata", "0"],
      ]);
    });

    it("when a bare ! opens a metadata node !{...}, should emit an empty-valued metadata token", () => {
      const tokens = tokenizeLine('!0 = !{!"branch_weights", i32 1}');

      expect(kindValues(tokens)).toEqual([
        ["metadata", "0"],
        ["punct", "="],
        ["metadata", ""],
        ["punct", "{"],
        ["metadata", ""],
        ["string", '"branch_weights"'],
        ["punct", ","],
        ["word", "i32"],
        ["number", "1"],
        ["punct", "}"],
      ]);
    });

    it("when #0 references an attribute group, should tokenize it as attrGroup", () => {
      const tokens = tokenizeLine("define void @f() #0 {");

      expect(kindValues(tokens)).toEqual([
        ["word", "define"],
        ["word", "void"],
        ["global", "f"],
        ["punct", "("],
        ["punct", ")"],
        ["attrGroup", "0"],
        ["punct", "{"],
      ]);
    });

    it('when a quoted attribute group #"x" appears, should tokenize it as attrGroup', () => {
      const tokens = tokenizeLine('call void @g() #"x"');

      expect(kindValues(tokens)[5]).toEqual(["attrGroup", "x"]);
    });

    it("when a #dbg_value debug record starts a line, should keep #dbg_value as ONE word token", () => {
      // The step-6 classifier recognizes the "#dbg_" prefix on this token.
      const tokens = tokenizeLine(
        "#dbg_value(i32 %x, !12, !DIExpression(), !13)",
      );

      expect(kindValues(tokens)[0]).toEqual(["word", "#dbg_value"]);
      expect(tokens[0].text).toBe("#dbg_value");
    });
  });

  describe("numbers", () => {
    it("when integers are negative, should bind the leading minus to the number", () => {
      const tokens = tokenizeLine("ret i32 -1");

      expect(kindValues(tokens)).toEqual([
        ["word", "ret"],
        ["word", "i32"],
        ["number", "-1"],
      ]);
    });

    it("when floats use exponent or decimal form, should keep each as one number token", () => {
      const tokens = tokenizeLine("fadd double 1.000000e+00, -2.5");

      expect(kindValues(tokens)).toEqual([
        ["word", "fadd"],
        ["word", "double"],
        ["number", "1.000000e+00"],
        ["punct", ","],
        ["number", "-2.5"],
      ]);
    });

    it("when hex integers and LLVM hex floats appear, should keep each as one number token", () => {
      const tokens = tokenizeLine("i64 0xFF, double 0x7FF0000000000000");
      const hexFloat = tokenizeLine("x86_fp80 0xK4001A000000000000000");

      expect(kindValues(tokens)[1]).toEqual(["number", "0xFF"]);
      expect(kindValues(tokens)[4]).toEqual(["number", "0x7FF0000000000000"]);
      expect(kindValues(hexFloat)[1]).toEqual([
        "number",
        "0xK4001A000000000000000",
      ]);
    });

    it("when a minus is not followed by a digit, should tokenize the minus as punct", () => {
      const tokens = tokenizeLine("sub i32 %a, - %b");

      expect(kindValues(tokens)[4]).toEqual(["punct", "-"]);
    });
  });

  describe("punctuation and totality", () => {
    it("when an ellipsis appears in a signature, should keep ... as ONE word token", () => {
      const tokens = tokenizeLine("declare i32 @printf(ptr, ...)");

      expect(kindValues(tokens)).toEqual([
        ["word", "declare"],
        ["word", "i32"],
        ["global", "printf"],
        ["punct", "("],
        ["word", "ptr"],
        ["punct", ","],
        ["word", "..."],
        ["punct", ")"],
      ]);
    });

    it("when a stray semicolon reaches the tokenizer, should emit it as punct without crashing", () => {
      const tokens = tokenizeLine("ret void ; tail");

      expect(kindValues(tokens)).toEqual([
        ["word", "ret"],
        ["word", "void"],
        ["punct", ";"],
        ["word", "tail"],
      ]);
    });

    it("when characters fit no kind, should fall back to single-char punct tokens", () => {
      const tokens = tokenizeLine("wibble %a, ??? `~ €");

      expect(kindValues(tokens)).toEqual([
        ["word", "wibble"],
        ["local", "a"],
        ["punct", ","],
        ["punct", "?"],
        ["punct", "?"],
        ["punct", "?"],
        ["punct", "`"],
        ["punct", "~"],
        ["punct", "€"],
      ]);
    });

    it("when sigils have no name attached, should degrade to punct or empty metadata, not throw", () => {
      expect(kindValues(tokenizeLine("% @ !"))).toEqual([
        ["punct", "%"],
        ["punct", "@"],
        ["metadata", ""],
      ]);
      expect(() => tokenizeLine("")).not.toThrow();
      expect(tokenizeLine("   \t ")).toEqual([]);
    });
  });

  describe("offsets", () => {
    it("when tokenizing a br line, should report exact start/end column offsets", () => {
      const line = "  br i1 %c, label %a, label %b";
      const tokens = tokenizeLine(line);

      expect(tokens[0]).toMatchObject({ text: "br", start: 2, end: 4 });
      expect(tokens[2]).toMatchObject({ text: "%c", start: 8, end: 10 });
      expect(tokens[5]).toMatchObject({ text: "%a", start: 18, end: 20 });
      expect(tokens[8]).toMatchObject({ text: "%b", start: 28, end: 30 });
    });

    it("when a token is quoted, should span the sigil and both quotes", () => {
      const line = 'store i32 0, ptr %"a b"';
      const tokens = tokenizeLine(line);
      const quoted = tokens[tokens.length - 1];

      expect(quoted).toMatchObject({ start: 17, end: 23 });
      expect(line.slice(quoted.start, quoted.end)).toBe('%"a b"');
    });

    it("when tokenizing any corpus line, should cover every non-whitespace character exactly once", () => {
      const corpusDir = join(
        dirname(fileURLToPath(import.meta.url)),
        "../../__tests__/llvm/corpus",
      );
      const lines = readdirSync(corpusDir)
        .filter((file) => file.endsWith(".ll"))
        .flatMap((file) =>
          readFileSync(join(corpusDir, file), "utf8").split("\n"),
        );
      expect(lines.length).toBeGreaterThan(100);

      for (const rawLine of lines) {
        const { code } = stripComment(rawLine);
        const tokens = tokenizeLine(code);

        let cursor = 0;
        for (const token of tokens) {
          // Strictly ordered and non-overlapping, gaps are whitespace only.
          expect(token.start).toBeGreaterThanOrEqual(cursor);
          expect(token.end).toBeGreaterThan(token.start);
          expect(code.slice(cursor, token.start).trim()).toBe("");
          expect(token.text).toBe(code.slice(token.start, token.end));
          cursor = token.end;
        }
        expect(code.slice(cursor).trim()).toBe("");
      }
    });
  });

  describe("stripComment", () => {
    it("when a comment follows code, should split at the semicolon", () => {
      const result = stripComment("  ret void  ; done");

      expect(result).toEqual({ code: "  ret void  ", comment: " done" });
    });

    it("when a semicolon sits inside a string, should not treat it as a comment", () => {
      const result = stripComment('@s = constant [4 x i8] c"a;b\\00" ; real');

      expect(result).toEqual({
        code: '@s = constant [4 x i8] c"a;b\\00" ',
        comment: " real",
      });
    });

    it("when a line is only a comment, should return empty code", () => {
      const result = stripComment("; <label>:7: preds = %entry");

      expect(result).toEqual({
        code: "",
        comment: " <label>:7: preds = %entry",
      });
    });

    it("when a line has no comment, should return the line unchanged with null comment", () => {
      const result = stripComment("  br label %loop");

      expect(result).toEqual({ code: "  br label %loop", comment: null });
    });
  });
});
