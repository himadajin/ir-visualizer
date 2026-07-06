/**
 * Line classifier for LLVM IR — one logical line → line kind.
 *
 * Layer 2 of the line-oriented parser
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §3, §3.2–§3.5,
 * step 6). Both classifiers are pure and total: they never throw, on any
 * input string. Classification is keyword-driven over `tokenizeLine` tokens —
 * never regexes over raw text — so string-literal contents can never
 * confuse it.
 *
 * Input contract (layer 1): `text` is the comment-stripped, trimmed `text`
 * of one `LogicalLine`; blank lines never reach the classifier. Totality is
 * unconditional anyway — junk degrades to `unknown` (top level) or
 * `instruction` (in body). Per §3.4, module assembly (step 8) escalates a
 * top-level `unknown` to the structural throw; in-body lines can never fail.
 */

import { tokenizeLine } from "./tokenizer";
import type { Token } from "./tokenizer";

/** Top-level line kinds — the §3 Layer-2 list (minus `blank`, which the
 * logical-line reader never emits). */
export type TopLevelKind =
  | "define"
  | "closeBrace"
  | "declare"
  | "global"
  | "metadataDef"
  | "attributes"
  | "target"
  | "sourceFilename"
  | "typeAlias"
  | "comdat"
  | "moduleAsm"
  | "uselistorder"
  | "unknown";

/**
 * The §3.2 terminator keyword table — the single normative copy; steps 7/8
 * and the spec rewrite reference this const, never a duplicated list.
 * `unwind` is the LLVM ≤ 2.x terminator instruction (old-IR goal, §3.5),
 * unrelated to the `unwind label` clause of `invoke`.
 */
export const TERMINATOR_OPCODES: ReadonlySet<string> = new Set([
  "ret",
  "br",
  "switch",
  "indirectbr",
  "invoke",
  "callbr",
  "resume",
  "unreachable",
  "cleanupret",
  "catchret",
  "catchswitch",
  "unwind",
]);

/**
 * The only terminators that can carry a `%x =` result (§3.2: "first token of
 * the logical line, or after `%x =` for invoke/callbr"). The other ten
 * keywords are recognized ONLY in first position — `%x = ret ...` is
 * nonsense IR and deliberately stays an `instruction`.
 */
const RESULT_TERMINATOR_OPCODES: ReadonlySet<string> = new Set([
  "invoke",
  "callbr",
]);

export type BodyClassification =
  | { kind: "label"; id: string }
  | { kind: "terminator"; opcode: string }
  | { kind: "debugRecord" }
  | { kind: "instruction" };

/** True when the token is punctuation with exactly this character. */
function isPunct(token: Token | undefined, ch: string): boolean {
  return token !== undefined && token.kind === "punct" && token.value === ch;
}

/** True when the token is a bare word with exactly this text. */
function isWord(token: Token | undefined, text: string): boolean {
  return token !== undefined && token.kind === "word" && token.value === text;
}

/**
 * Classify one top-level logical line. Total; anything unrecognized is
 * `unknown` (step 8 turns that into the §3.4 throw — garbage input at top
 * level must still fail the parse).
 *
 * Decisions pinned here:
 * - `define` is recognized by its first word alone; the trailing `{` is the
 *   assembler's concern (step 8), not the classifier's.
 * - `uselistorder_bb` (the basic-block variant) classifies as `uselistorder`
 *   too — both are §3.5 "classified, parsed-and-dropped" rows.
 * - `metadataDef` requires a *named* `!x` token: the tokenizer's bare-`!`
 *   token has an empty value and references nothing, so `! = ...` is
 *   `unknown`.
 * - A leading local (`%x = ...`) opens a top-level entry ONLY as a type
 *   alias (`%T = type ...`). Locals otherwise exist only inside function
 *   bodies, so `%x = add i32 1, 2` at top level is `unknown`, not an
 *   instruction — there is no function to put it in.
 */
export function classifyTopLevel(text: string): TopLevelKind {
  const tokens = tokenizeLine(text);
  if (tokens.length === 0) return "unknown";
  const first = tokens[0];
  const second: Token | undefined = tokens[1];

  if (tokens.length === 1 && isPunct(first, "}")) return "closeBrace";

  if (first.kind === "word") {
    if (first.value === "define") return "define";
    if (first.value === "declare") return "declare";
    if (first.value === "attributes") return "attributes";
    if (first.value === "target") return "target";
    if (first.value === "source_filename") return "sourceFilename";
    if (first.value === "module" && isWord(second, "asm")) return "moduleAsm";
    if (first.value === "uselistorder" || first.value === "uselistorder_bb") {
      return "uselistorder";
    }
    // Comdat names tokenize as words whose text keeps the `$` sigil
    // (`$sym`); a quoted comdat (`$"s"`) degrades to a lone `$` word —
    // still starts with `$`, still a comdat line.
    if (first.text.startsWith("$")) return "comdat";
    return "unknown";
  }

  if (first.kind === "global" && isPunct(second, "=")) return "global";
  if (first.kind === "metadata" && first.value !== "" && isPunct(second, "=")) {
    return "metadataDef";
  }
  if (
    first.kind === "local" &&
    isPunct(second, "=") &&
    isWord(tokens[2], "type")
  ) {
    return "typeAlias";
  }
  return "unknown";
}

/**
 * Extract the block id from a label line's first token, mirroring the
 * tokenizer's quoted-name treatment: strip the surrounding quotes, keep
 * escape sequences verbatim (never unescaped). Handles the unterminated-
 * string degenerate case (no closing quote) without throwing.
 */
function labelId(token: Token): string {
  if (token.kind !== "string") return token.value;
  const closed = token.text.length >= 2 && token.text.endsWith('"');
  return token.text.slice(1, closed ? -1 : undefined);
}

/**
 * Classify one logical line inside a function body. Total; the fallback
 * `instruction` never fails (§3.4 — unrecognized body lines become opaque
 * generic instructions in step 7).
 *
 * Decisions pinned here:
 * - **Label strictness:** a label line is EXACTLY two tokens — a word,
 *   number, or plain-quoted string, then `:`. LLVM's printer emits nothing
 *   after the colon except comments, which layer 1 already stripped (the
 *   era files' `5:` lines carried only `; preds = ...` trailers), so
 *   anything after `:` means the line is not a printed label; it falls
 *   through to `instruction` rather than fabricating a block. Only the
 *   §3.3 forms match: `ident:`, `7:`, `"weird label":` — a `c"..."` string
 *   is never a label name, and sigiled tokens (`%x:`) never match.
 * - The label check runs FIRST: `br:` is a label named `br` — the colon
 *   wins over the terminator keyword.
 * - Terminators per `TERMINATOR_OPCODES` in first position; only
 *   invoke/callbr are also recognized after `%x =` (see
 *   `RESULT_TERMINATOR_OPCODES`).
 * - `#dbg_value(...)`-style debug records arrive as ONE word token whose
 *   text starts `#dbg_` (tokenizer contract); `#0` is an `attrGroup` token,
 *   not a word, so it falls back to `instruction`.
 * - A bare `}` never reaches classifyBody (the step-8 assembler routes it
 *   at the top level), but totality holds anyway: it falls back to
 *   `instruction`.
 */
export function classifyBody(text: string): BodyClassification {
  const tokens = tokenizeLine(text);
  if (tokens.length === 0) return { kind: "instruction" };
  const first = tokens[0];

  if (
    tokens.length === 2 &&
    isPunct(tokens[1], ":") &&
    (first.kind === "word" ||
      first.kind === "number" ||
      (first.kind === "string" && first.text.startsWith('"')))
  ) {
    return { kind: "label", id: labelId(first) };
  }

  if (first.kind === "word" && first.text.startsWith("#dbg_")) {
    return { kind: "debugRecord" };
  }

  if (first.kind === "word" && TERMINATOR_OPCODES.has(first.value)) {
    return { kind: "terminator", opcode: first.value };
  }

  if (
    first.kind === "local" &&
    isPunct(tokens[1], "=") &&
    tokens[2] !== undefined &&
    tokens[2].kind === "word" &&
    RESULT_TERMINATOR_OPCODES.has(tokens[2].value)
  ) {
    return { kind: "terminator", opcode: tokens[2].value };
  }

  return { kind: "instruction" };
}
