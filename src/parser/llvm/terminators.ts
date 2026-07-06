/**
 * Per-line terminator parsers for LLVM IR — one logical line → AST node.
 *
 * Layer 3 of the line-oriented parser
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §3.2, §3.4,
 * step 7). `parseTerminator` is pure and total: it never throws, on any
 * input. It trusts the classifier's opcode (the §3.2 keyword table,
 * `TERMINATOR_OPCODES` in ./classify.ts) but stays sane on malformed
 * operand text.
 *
 * Uniform successor rule (§3.2, normative): the successors of any
 * terminator are the ordered occurrences of the token pair `label %x` in
 * its logical line. String literals are single opaque tokens, so `label`
 * text inside them is never counted, and `unwind to caller` has no `label`
 * token and thus no successor.
 *
 * Degradation (documented decision): a `br` / `switch` / `invoke` whose
 * expected structure cannot be found (missing targets, missing case
 * brackets, missing `to label` / `unwind label` clauses) degrades to an
 * `LLVMOpaqueTerminator` carrying the opcode and the uniform-rule
 * successors — never a structured node with fabricated or missing required
 * fields, and never a throw. The CFG then still gets every findable edge.
 *
 * Trailing `, !dbg !7`-style metadata is just tokens after the recognized
 * structure and can never fail a parse (§3.2).
 */

import type {
  LLVMBrInstruction,
  LLVMInvokeInstruction,
  LLVMOpaqueTerminator,
  LLVMRetInstruction,
  LLVMSwitchCase,
  LLVMSwitchInstruction,
  LLVMTerminator,
} from "../../ast/llvmAST";
import type { LogicalLine } from "./logicalLines";
import { originalTextOf } from "./instructions";
import { tokenizeLine } from "./tokenizer";
import type { Token } from "./tokenizer";

/** True when the token is punctuation with exactly this character. */
function isPunct(token: Token | undefined, ch: string): boolean {
  return token !== undefined && token.kind === "punct" && token.value === ch;
}

/** True when the token is a bare word with exactly this text. */
function isWord(token: Token | undefined, text: string): boolean {
  return token !== undefined && token.kind === "word" && token.value === text;
}

/** The §3.2 uniform successor rule over an already-tokenized line. */
function successorsOf(tokens: Token[]): string[] {
  const successors: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (isWord(tokens[i], "label") && tokens[i + 1].kind === "local") {
      successors.push(tokens[i + 1].value);
    }
  }
  return successors;
}

/**
 * A value token rendered the way the legacy parser's `Value` rule did:
 * locals lose their `%` sigil; globals, words (`true`, `null`), and numbers
 * keep their raw text.
 */
function valueText(token: Token): string {
  return token.kind === "local" ? token.value : token.text;
}

/** Word tokens that are value constants after `ret` (never part of a type). */
const RET_CONSTANT_WORDS: ReadonlySet<string> = new Set([
  "true",
  "false",
  "null",
  "undef",
  "poison",
  "none",
  "zeroinitializer",
]);

function isRetValueToken(token: Token): boolean {
  if (
    token.kind === "local" ||
    token.kind === "global" ||
    token.kind === "number"
  ) {
    return true;
  }
  return token.kind === "word" && RET_CONSTANT_WORDS.has(token.value);
}

/** Nesting depth bookkeeping over punct tokens, for top-level comma scans. */
const OPENERS: ReadonlySet<string> = new Set(["(", "[", "{", "<"]);
const CLOSERS: ReadonlySet<string> = new Set([")", "]", "}", ">"]);

/**
 * Drop a trailing metadata group: truncate at the first top-nesting-level
 * `,` that is directly followed by a metadata token (`ret i32 %a, !dbg !7`
 * → `ret i32 %a`). Aggregate/vector types keep their inner commas because
 * `{ } < > ( ) [ ]` all count as nesting.
 */
function dropTrailingMetadata(tokens: Token[]): Token[] {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== "punct") continue;
    if (OPENERS.has(token.value)) depth++;
    else if (CLOSERS.has(token.value)) depth--;
    else if (
      token.value === "," &&
      depth === 0 &&
      tokens[i + 1]?.kind === "metadata"
    ) {
      return tokens.slice(0, i);
    }
  }
  return tokens;
}

function opaque(
  opcode: string,
  tokens: Token[],
  originalText: string,
): LLVMOpaqueTerminator {
  return {
    type: "Instruction",
    opcode,
    successors: successorsOf(tokens),
    originalText,
  };
}

/**
 * `br label %a [, !md]` → unconditional; `br <ty> <val>, label %a, label %b
 * [, !md]` → conditional, any single type token (old IR used `bool`) and
 * any value token accepted. Anything else degrades to opaque.
 */
function parseBr(
  tokens: Token[],
  originalText: string,
): LLVMBrInstruction | LLVMOpaqueTerminator {
  if (isWord(tokens[1], "label") && tokens[2]?.kind === "local") {
    return {
      type: "Instruction",
      opcode: "br",
      destination: tokens[2].value,
      originalText,
    };
  }
  const successors = successorsOf(tokens);
  const value = tokens[2] as Token | undefined;
  if (
    successors.length >= 2 &&
    value !== undefined &&
    !isWord(value, "label")
  ) {
    return {
      type: "Instruction",
      opcode: "br",
      condition: valueText(value),
      trueTarget: successors[0],
      falseTarget: successors[1],
      originalText,
    };
  }
  return opaque("br", tokens, originalText);
}

/**
 * `ret void` → valType only; `ret <ty...> <val> [, !md]` → the last
 * value-like token (local / global / number / constant word) is the value,
 * everything between `ret` and it is the raw `valType` slice. When no token
 * is value-like (`ret void`, `ret { i32 } [...]`-shaped oddities), the
 * whole remainder is the `valType` — total either way.
 */
function parseRet(
  tokens: Token[],
  text: string,
  originalText: string,
): LLVMRetInstruction {
  const body = dropTrailingMetadata(tokens.slice(1));
  if (body.length === 0) {
    return { type: "Instruction", opcode: "ret", originalText };
  }
  const last = body[body.length - 1];
  if (isRetValueToken(last)) {
    const ret: LLVMRetInstruction = {
      type: "Instruction",
      opcode: "ret",
      value: valueText(last),
      originalText,
    };
    if (body.length >= 2) {
      ret.valType = text.slice(body[0].start, last.start).trim();
    }
    return ret;
  }
  return {
    type: "Instruction",
    opcode: "ret",
    valType: text.slice(body[0].start, last.end).trim(),
    originalText,
  };
}

/**
 * `switch <ty> <val>, label %default [ {<ty> <val>, label %target}* ] [, !md]`.
 * Case values are the raw text between the case's type token and its `,`
 * (`-1`, `4294967296`, hex as written) — §3.2's value-text-only edge-label
 * rule. Missing default or case brackets degrade to opaque.
 */
function parseSwitch(
  tokens: Token[],
  text: string,
  originalText: string,
): LLVMSwitchInstruction | LLVMOpaqueTerminator {
  const conditionType = tokens[1] as Token | undefined;
  const conditionValue = tokens[2] as Token | undefined;
  // Header shape: default target is the first `label %x` pair, and it must
  // come after the condition tokens.
  let defaultIndex = -1;
  for (let i = 3; i + 1 < tokens.length; i++) {
    if (isWord(tokens[i], "label") && tokens[i + 1].kind === "local") {
      defaultIndex = i;
      break;
    }
  }
  if (
    conditionType === undefined ||
    conditionValue === undefined ||
    isWord(conditionType, "label") ||
    isWord(conditionValue, "label") ||
    defaultIndex === -1
  ) {
    return opaque("switch", tokens, originalText);
  }

  let open = -1;
  for (let i = defaultIndex + 2; i < tokens.length; i++) {
    if (isPunct(tokens[i], "[")) {
      open = i;
      break;
    }
  }
  if (open === -1) return opaque("switch", tokens, originalText);
  let close = -1;
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (isPunct(tokens[i], "[")) depth++;
    else if (isPunct(tokens[i], "]")) {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return opaque("switch", tokens, originalText);

  const cases: LLVMSwitchCase[] = [];
  let i = open + 1;
  while (i < close) {
    // Each case is `<ty> <val...>, label %target`; LLVM prints one case per
    // line (joined by layer 1), with no separator between cases.
    let labelAt = -1;
    for (let j = i; j + 1 < close; j++) {
      if (isWord(tokens[j], "label") && tokens[j + 1].kind === "local") {
        labelAt = j;
        break;
      }
    }
    if (labelAt === -1) break; // trailing junk inside brackets: ignore
    let segmentEnd = labelAt;
    if (segmentEnd > i && isPunct(tokens[segmentEnd - 1], ",")) segmentEnd--;
    const caseType = segmentEnd > i ? tokens[i].text : "";
    const valueTokens = tokens.slice(i + 1, segmentEnd);
    const value =
      valueTokens.length === 0
        ? ""
        : text
            .slice(
              valueTokens[0].start,
              valueTokens[valueTokens.length - 1].end,
            )
            .trim();
    cases.push({
      type: caseType,
      value,
      target: tokens[labelAt + 1].value,
    });
    i = labelAt + 2;
  }

  return {
    type: "Instruction",
    opcode: "switch",
    conditionType: conditionType.text,
    conditionValue: valueText(conditionValue),
    defaultTarget: tokens[defaultIndex + 1].value,
    cases,
    originalText,
  };
}

/**
 * `[%x =] invoke ... @callee(...) to label %ok unwind label %err [, !md]`.
 * Callee via the legacy heuristic: the last Local/Global token before the
 * argument-list parens — the LAST complete top-level paren group before
 * `to`, so both the modern fn-type form and the 2.x fn-pointer-type form
 * (`invoke i32 (i8*, ...)* @printf(...)`) resolve to the callee, not a
 * parameter type. Missing `to label` / `unwind label` degrades to opaque.
 */
function parseInvoke(
  tokens: Token[],
  result: string | undefined,
  originalText: string,
): LLVMInvokeInstruction | LLVMOpaqueTerminator {
  let toIndex = -1;
  let normalTarget: string | undefined;
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (
      isWord(tokens[i], "to") &&
      isWord(tokens[i + 1], "label") &&
      tokens[i + 2].kind === "local"
    ) {
      toIndex = i;
      normalTarget = tokens[i + 2].value;
      break;
    }
  }
  let unwindTarget: string | undefined;
  for (let i = Math.max(toIndex + 3, 0); i + 2 < tokens.length; i++) {
    if (
      isWord(tokens[i], "unwind") &&
      isWord(tokens[i + 1], "label") &&
      tokens[i + 2].kind === "local"
    ) {
      unwindTarget = tokens[i + 2].value;
      break;
    }
  }
  if (normalTarget === undefined || unwindTarget === undefined) {
    return opaque("invoke", tokens, originalText);
  }

  const beforeTo = tokens.slice(0, toIndex);
  let depth = 0;
  let open = -1;
  let argsOpen = -1;
  beforeTo.forEach((token, i) => {
    if (isPunct(token, "(")) {
      if (depth === 0) open = i;
      depth++;
    } else if (isPunct(token, ")")) {
      depth--;
      if (depth === 0 && open !== -1) argsOpen = open;
      if (depth < 0) depth = 0;
    }
  });
  let callee = "";
  const limit = argsOpen === -1 ? beforeTo.length : argsOpen;
  for (let i = limit - 1; i >= 0; i--) {
    const token = beforeTo[i];
    if (token.kind === "local" || token.kind === "global") {
      callee = token.value;
      break;
    }
  }

  const invoke: LLVMInvokeInstruction = {
    type: "Instruction",
    opcode: "invoke",
    callee,
    normalTarget,
    unwindTarget,
    originalText,
  };
  if (result !== undefined) invoke.result = result;
  return invoke;
}

/**
 * Parse one terminator line. `opcode` comes from the step-6 classifier
 * (`classifyBody`), which already handled the `%x = invoke/callbr` result
 * prefix; the prefix is re-detected here only to capture the result name.
 * Every §3.2 opcode without dedicated structure (indirectbr, callbr,
 * resume, unreachable, cleanupret, catchret, catchswitch, unwind — and any
 * unexpected opcode) yields an `LLVMOpaqueTerminator` via the uniform
 * successor rule.
 */
export function parseTerminator(
  line: LogicalLine,
  opcode: string,
): LLVMTerminator {
  const originalText = originalTextOf(line);
  let tokens = tokenizeLine(line.text);
  let result: string | undefined;
  if (tokens[0]?.kind === "local" && isPunct(tokens[1], "=")) {
    result = tokens[0].value;
    tokens = tokens.slice(2);
  }

  switch (opcode) {
    case "br":
      return parseBr(tokens, originalText);
    case "ret":
      return parseRet(tokens, line.text, originalText);
    case "switch":
      return parseSwitch(tokens, line.text, originalText);
    case "invoke":
      return parseInvoke(tokens, result, originalText);
    default:
      return opaque(opcode, tokens, originalText);
  }
}
