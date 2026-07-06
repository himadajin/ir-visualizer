/**
 * Per-line instruction parsers for LLVM IR — one logical line → AST node.
 *
 * Layer 3 of the line-oriented parser
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §3, §3.4, step 7).
 * Both entry points are pure and total: they never throw, on any input.
 * Structure is extracted only where the CFG or use-def needs it (store /
 * cmpxchg / atomicrmw write marking, call callee+args); everything else
 * becomes an opaque `LLVMGenericInstruction` (§3.4 in-body totality).
 *
 * Operand granularity (decision pinned by the step-7 suites): one operand
 * per token — `local` → Local, `global` → Global, named `metadata` →
 * Metadata with the `!` sigil restored (the legacy parser's `metadataID`
 * operands kept their `!`), a `,` punct is dropped (legacy dropped comma
 * argParts), and every other token becomes one Other operand carrying its
 * raw text. The legacy parser globbed runs of non-value text into single
 * Other operands, but no existing test pins that granularity and no consumer
 * reads Other operands, so the simpler per-token form is used. Trailing
 * `, !dbg !7` metadata stays in `operands` as Metadata entries — exactly
 * what the legacy `argPart` rule produced.
 */

import type {
  LLVMCallInstruction,
  LLVMDebugRecord,
  LLVMGenericInstruction,
  LLVMInstruction,
  LLVMOperand,
} from "../../ast/llvmAST";
import type { LogicalLine } from "./logicalLines";
import { tokenizeLine } from "./tokenizer";
import type { Token } from "./tokenizer";

/**
 * `originalText` for AST nodes built from a logical line: each physical line
 * of `raw` trimmed, joined with `\n`. Trimming matches the legacy parser's
 * indentation-free `sourceString`; keeping every physical line (joined
 * continuations included) is what the §5.8 line-conservation invariant
 * counts.
 */
export function originalTextOf(line: LogicalLine): string {
  return line.raw
    .split("\n")
    .map((piece) => piece.trim())
    .join("\n");
}

/** Instructions whose pointer operand gets the legacy `isWrite` marking. */
const WRITE_OPCODES: ReadonlySet<string> = new Set([
  "store",
  "cmpxchg",
  "atomicrmw",
]);

/** The `call` prefix words; the opcode string keeps them (`"tail call"`). */
const CALL_PREFIXES: ReadonlySet<string> = new Set([
  "tail",
  "musttail",
  "notail",
]);

/** True when the token is punctuation with exactly this character. */
function isPunct(token: Token | undefined, ch: string): boolean {
  return token !== undefined && token.kind === "punct" && token.value === ch;
}

/** True when the token is a bare word with exactly this text. */
function isWord(token: Token | undefined, text: string): boolean {
  return token !== undefined && token.kind === "word" && token.value === text;
}

/**
 * Map tokens to operands per the granularity decision in the file header.
 * A bare `!` token (empty metadata name, e.g. before `{` in `!{...}`) is not
 * a reference, so it stays an Other operand.
 */
function operandsFromTokens(tokens: Token[]): LLVMOperand[] {
  const operands: LLVMOperand[] = [];
  for (const token of tokens) {
    if (token.kind === "local") {
      operands.push({ type: "Local", value: token.value, isWrite: false });
    } else if (token.kind === "global") {
      operands.push({ type: "Global", value: token.value, isWrite: false });
    } else if (token.kind === "metadata" && token.value !== "") {
      operands.push({
        type: "Metadata",
        value: `!${token.value}`,
        isWrite: false,
      });
    } else if (isPunct(token, ",")) {
      continue; // legacy argPart dropped bare commas
    } else {
      operands.push({ type: "Other", value: token.text, isWrite: false });
    }
  }
  return operands;
}

/**
 * Legacy write-marking heuristics (pinned by the pre-rewrite parser):
 * `store` marks its LAST Local/Global operand as written (the pointer comes
 * last); `cmpxchg` / `atomicrmw` mark their FIRST (the pointer comes first).
 */
function markWrite(
  operands: LLVMOperand[],
  which: "first" | "last",
): LLVMOperand[] {
  let target = -1;
  operands.forEach((operand, i) => {
    if (operand.type !== "Local" && operand.type !== "Global") return;
    if (which === "first" && target !== -1) return;
    target = i;
  });
  return operands.map((operand, i) =>
    i === target ? { ...operand, isWrite: true } : operand,
  );
}

/**
 * Find the LAST complete top-level `( ... )` group — the call argument list.
 * Any fn-type parens (`call i32 (i8*, ...) @printf(...)`, or the 2.x
 * fn-pointer form `call i32 (i8*, ...)* @printf(...)`) come before it, so
 * "last group" is exactly the legacy callee heuristic's argument list.
 * Returns token indexes of the `(` and `)` or null when no group closes.
 */
function lastParenGroup(
  tokens: Token[],
): { open: number; close: number } | null {
  let depth = 0;
  let open = -1;
  let group: { open: number; close: number } | null = null;
  tokens.forEach((token, i) => {
    if (isPunct(token, "(")) {
      if (depth === 0) open = i;
      depth++;
    } else if (isPunct(token, ")")) {
      depth--;
      if (depth === 0 && open !== -1) group = { open, close: i };
      if (depth < 0) depth = 0;
    }
  });
  return group;
}

/**
 * The legacy callee heuristic: the last Local/Global token before the
 * argument-list parens, sigil-stripped. `""` when nothing qualifies (e.g.
 * inline asm) — the legacy "take the last argText anyway" fallback is not
 * reproduced: nothing pins it and an empty callee is more honest.
 */
function calleeBefore(tokens: Token[], limit: number): string {
  for (let i = limit - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token.kind === "local" || token.kind === "global") return token.value;
  }
  return "";
}

function parseCall(
  body: Token[],
  opcode: string,
  result: string | undefined,
  originalText: string,
): LLVMInstruction {
  const group = lastParenGroup(body);
  const callee = calleeBefore(body, group === null ? body.length : group.open);
  const args =
    group === null
      ? []
      : operandsFromTokens(body.slice(group.open + 1, group.close));
  const instruction: LLVMCallInstruction = {
    type: "Instruction",
    opcode,
    callee,
    args,
    originalText,
  };
  if (result !== undefined) instruction.dest = result;
  return instruction;
}

/**
 * Parse one in-body instruction line. Total — any line yields SOMETHING
 * (§3.4): unrecognized shapes degrade to an opaque `LLVMGenericInstruction`
 * whose opcode is the first token's text.
 *
 * Shape notes:
 * - `store` / `cmpxchg` / `atomicrmw` without a result produce their
 *   dedicated AST shapes (as the legacy parser did — its grammar had no
 *   result on them). With a `%x =` result (modern cmpxchg/atomicrmw), the
 *   same opcode and write marking are kept but the node is a
 *   `LLVMGenericInstruction`, the only shape that can carry `result`.
 * - phi lines are generic: incoming values AND incoming block references
 *   both surface as Local operands. That is accepted at this layer; the
 *   defs/uses pass (plan step 11) applies the phi-aware label filtering.
 */
export function parseInstruction(line: LogicalLine): LLVMInstruction {
  const originalText = originalTextOf(line);
  const tokens = tokenizeLine(line.text);

  let result: string | undefined;
  let rest = tokens;
  if (tokens[0]?.kind === "local" && isPunct(tokens[1], "=")) {
    result = tokens[0].value;
    rest = tokens.slice(2);
  }

  const first = rest[0] as Token | undefined;
  if (first === undefined) {
    // Unreachable from the classifier (blank lines never arrive), but the
    // totality contract holds anyway.
    const empty: LLVMGenericInstruction = {
      type: "Instruction",
      opcode: "",
      operands: [],
      originalText,
    };
    if (result !== undefined) empty.result = result;
    return empty;
  }

  if (first.kind === "word" && WRITE_OPCODES.has(first.value)) {
    const operands = markWrite(
      operandsFromTokens(rest.slice(1)),
      first.value === "store" ? "last" : "first",
    );
    if (result === undefined) {
      if (first.value === "store") {
        return {
          type: "Instruction",
          opcode: "store",
          operands,
          originalText,
        };
      }
      if (first.value === "cmpxchg") {
        return {
          type: "Instruction",
          opcode: "cmpxchg",
          operands,
          originalText,
        };
      }
      return {
        type: "Instruction",
        opcode: "atomicrmw",
        operands,
        originalText,
      };
    }
    return {
      type: "Instruction",
      opcode: first.value,
      result,
      operands,
      originalText,
    };
  }

  if (isWord(first, "call")) {
    return parseCall(rest.slice(1), "call", result, originalText);
  }
  if (
    first.kind === "word" &&
    CALL_PREFIXES.has(first.value) &&
    isWord(rest[1], "call")
  ) {
    return parseCall(
      rest.slice(2),
      `${first.value} call`,
      result,
      originalText,
    );
  }

  const opcode = first.kind === "word" ? first.value : first.text;
  const generic: LLVMGenericInstruction = {
    type: "Instruction",
    opcode,
    operands: operandsFromTokens(rest.slice(1)),
    originalText,
  };
  if (result !== undefined) generic.result = result;
  return generic;
}

/**
 * Parse a `#dbg_*` debug-record line. `content` is the line text after the
 * leading `#` — the legacy `DebugRecord = "#" restOfLine` split.
 */
export function parseDebugRecord(line: LogicalLine): LLVMDebugRecord {
  const content = line.text.startsWith("#") ? line.text.slice(1) : line.text;
  return {
    type: "DebugRecord",
    content,
    originalText: originalTextOf(line),
  };
}
