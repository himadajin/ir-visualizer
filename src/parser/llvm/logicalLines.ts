/**
 * Logical-line reader for LLVM IR — physical lines → logical lines.
 *
 * Layer 1 of the line-oriented parser
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §3, §3.1, step 5).
 * Pure function; reuses the tokenizer's `stripComment` for string-aware
 * comment stripping and `tokenizeLine` for exact bracket counting (brackets
 * inside string literals sit inside `string` tokens, so they are never
 * counted).
 *
 * Blank lines and comment-only lines produce NO logical line — the step-6
 * classifier therefore never sees blanks. Comment-only `; <label>:N` lines
 * still contribute a `labelHint` to the following logical line (§3.3).
 *
 * Joining (§3.1) applies only inside a function body, tracked minimally:
 * a logical line whose stripped text starts with `define` and ends with `{`
 * enters body state; a logical line whose stripped text is exactly `}`
 * leaves it. This is deliberately the same cheap test the step-8 assembler
 * uses, so the two layers can never disagree; nesting never occurs in LLVM
 * IR. Outside a body no joining ever happens: every non-blank, non-comment
 * physical line is one logical line.
 *
 * An unterminated string literal that swallows a `;` follows `stripComment`'s
 * definition: no comment is found, and the whole line passes through as code.
 */

import { stripComment, tokenizeLine } from "./tokenizer";

export interface LogicalLine {
  /**
   * Comment-stripped, trimmed content ready for tokenizing/classification.
   * For joined lines the non-empty stripped pieces are joined with a single
   * space, so `tokenizeLine` sees them as one line.
   */
  text: string;
  /**
   * The original physical line(s) verbatim (line terminators removed),
   * newline-joined, so later steps can reconstruct `originalText` and the
   * §5.8 line-conservation invariant can hold.
   */
  raw: string;
  /** 1-based physical line number of the first piece. */
  lineNumber: number;
  /**
   * When one or more comment-only `; <label>:N` lines precede this line,
   * the N of the nearest one — the §3.3 implicit-block-id hint. Attached
   * uniformly to whatever logical line comes next (even a `}` line, where
   * the consumer harmlessly ignores it).
   */
  labelHint?: string;
  /** 1-based physical line number of the hint comment itself. */
  labelHintLine?: number;
}

/** Matches the §4 `LLVMParseDiagnostic` shape structurally (no AST import). */
export interface LogicalLineDiagnostic {
  line: number;
  message: string;
}

export interface LogicalLinesResult {
  lines: LogicalLine[];
  diagnostics: LogicalLineDiagnostic[];
}

/**
 * A `; <label>:N` block-boundary hint: the comment text (as returned by
 * `stripComment`, i.e. everything after the first `;`) starts — after
 * optional whitespace — with `<label>:` followed by digits. Trailing text is
 * allowed: real 3.x output prints `; <label>:1  ; preds = %1, %0`, where the
 * whole trailer (including the second `;`) is part of the comment text.
 */
const LABEL_HINT = /^\s*<label>:(\d+)/;

/** Net `[`-minus-`]` count of stripped code, via punct tokens (never raw
 * `indexOf` — brackets inside strings are opaque to the tokenizer). */
function bracketDelta(strippedCode: string): number {
  let delta = 0;
  for (const token of tokenizeLine(strippedCode)) {
    if (token.kind !== "punct") continue;
    if (token.value === "[") delta++;
    else if (token.value === "]") delta--;
  }
  return delta;
}

/** §3.1 rule 2, token-wise: first token `to` or `unwind`, second `label`. */
function isToContinuation(strippedCode: string): boolean {
  const tokens = tokenizeLine(strippedCode);
  if (tokens.length < 2) return false;
  const first = tokens[0];
  const second = tokens[1];
  return (
    first.kind === "word" &&
    (first.value === "to" || first.value === "unwind") &&
    second.kind === "word" &&
    second.value === "label"
  );
}

/** Split into physical lines; accepts \n and \r\n (and no trailing newline). */
function splitPhysicalLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

/**
 * Convert raw input text into an ordered array of logical lines plus
 * diagnostics, per the §3.1 joining rules. Pure; never throws — an
 * unbalanced `[` at `}` or EOF is recorded as a diagnostic and the collected
 * text is still emitted as one opaque logical line (§3.1); module assembly
 * escalates that diagnostic to the §3.4 structural throw.
 */
export function readLogicalLines(text: string): LogicalLinesResult {
  const physical = splitPhysicalLines(text);
  const lines: LogicalLine[] = [];
  const diagnostics: LogicalLineDiagnostic[] = [];
  let inBody = false;
  let pendingHint: { value: string; line: number } | undefined;

  let i = 0;
  while (i < physical.length) {
    const raw = physical[i];
    const lineNumber = i + 1;
    const { code, comment } = stripComment(raw);
    const stripped = code.trim();
    i++;

    if (stripped === "") {
      // Blank or comment-only: no logical line. A `; <label>:N` comment
      // leaves a hint for the next logical line; the nearest hint wins.
      if (comment !== null) {
        const match = LABEL_HINT.exec(comment);
        if (match !== null) {
          pendingHint = { value: match[1], line: lineNumber };
        }
      }
      continue;
    }

    const pieces = [stripped];
    const raws = [raw];

    if (inBody && stripped !== "}") {
      // §3.1 rule 1 — bracket continuation. Comment-only/blank pieces inside
      // the continuation are stripped like any piece (contributing no text);
      // a labelHint inside a continuation is meaningless and is dropped.
      let balance = bracketDelta(stripped);
      while (balance > 0 && i < physical.length) {
        const nextStripped = stripComment(physical[i]).code.trim();
        if (nextStripped === "}") break; // never consume the closing brace
        raws.push(physical[i]);
        if (nextStripped !== "") pieces.push(nextStripped);
        balance += bracketDelta(nextStripped);
        i++;
      }
      if (balance > 0) {
        diagnostics.push({
          line: lineNumber,
          message: `Unclosed '[' in the line starting at line ${String(
            lineNumber,
          )}; the collected text was kept as one opaque line.`,
        });
      }

      // §3.1 rule 2 — `to`-continuation. Applies after a bracket-balanced
      // join too; keeps joining while the next physical line matches.
      while (i < physical.length) {
        const nextStripped = stripComment(physical[i]).code.trim();
        if (!isToContinuation(nextStripped)) break;
        raws.push(physical[i]);
        pieces.push(nextStripped);
        i++;
      }
    }

    const line: LogicalLine = {
      text: pieces.join(" "),
      raw: raws.join("\n"),
      lineNumber,
    };
    if (pendingHint !== undefined) {
      line.labelHint = pendingHint.value;
      line.labelHintLine = pendingHint.line;
      pendingHint = undefined;
    }
    lines.push(line);

    if (!inBody && stripped.startsWith("define") && stripped.endsWith("{")) {
      inBody = true;
    } else if (inBody && stripped === "}") {
      inBody = false;
    }
  }

  return { lines, diagnostics };
}
