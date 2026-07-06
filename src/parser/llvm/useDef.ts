/**
 * Use-def extraction for LLVM instructions and terminators — one logical
 * line → the SSA local names it defines and reads
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §2, §4, step 11).
 *
 * Parser-only foundation: the module assembler (module.ts) attaches the
 * result to every instruction and terminator parsed from a source line; no
 * graphBuilder or UI consumer reads `defs`/`uses` yet. SSA values only —
 * memory dependence (store→load) is a §2 non-goal, ever.
 *
 * Both functions are pure and total: they never throw, on any input.
 *
 * Extraction rules (each pinned by useDef.test.ts):
 * - `defs` is the `%x =` assignment result exactly — 0 or 1 local name,
 *   sigil-free (invoke/callbr results included, since they share the same
 *   prefix shape). Globals can never be defs: only a `local` token before
 *   `=` counts.
 * - `uses` are the `local` tokens actually READ, deduplicated in
 *   first-occurrence order, excluding:
 *   - block labels — any local directly after the word `label` (br/switch
 *     targets, invoke `to`/`unwind` clauses, callbr/indirectbr lists);
 *   - phi incoming-block refs — in a `phi` line, the local directly before
 *     a closing `]` (the second slot of `[ v, %bb ]`);
 *   - type-alias names (`%struct.T`) — via the module-wide alias table;
 *   - the line's own def (self-reference is not valid SSA anyway);
 *   - the opcode position (the first token after the optional `%x =`
 *     prefix), mirroring parseInstruction, which never treats it as an
 *     operand.
 *   String contents (`c"%d"`) need no rule: strings are single opaque
 *   tokens, and globals are `global` tokens — neither ever matches `local`.
 * - Included on purpose: br/switch conditions, ret values, call/invoke
 *   arguments, local callees (`%fp(...)` — reading the function pointer),
 *   phi incoming VALUES, operands of generic instructions, and the pointer
 *   a `store` writes through — the address itself is READ to perform the
 *   store; only the pointed-to memory is written.
 */

import type { LogicalLine } from "./logicalLines";
import { tokenizeLine } from "./tokenizer";
import type { Token } from "./tokenizer";

/** What one line defines and reads; both arrays may be empty. */
export interface UseDef {
  defs: string[];
  uses: string[];
}

/** True when the token is punctuation with exactly this character. */
function isPunct(token: Token | undefined, ch: string): boolean {
  return token !== undefined && token.kind === "punct" && token.value === ch;
}

/** True when the token is a bare word with exactly this text. */
function isWord(token: Token | undefined, text: string): boolean {
  return token !== undefined && token.kind === "word" && token.value === text;
}

/**
 * Collect the names of all `%T = type ...` lines — the type-alias table
 * that keeps `%struct.T` out of `uses`. The aliases themselves stay dropped
 * from the AST (module.ts §3.5 behavior is unchanged); only the name set is
 * fed into use extraction.
 *
 * Scans every logical line, position-independent: an alias printed after a
 * function still excludes its name inside that function. No body
 * instruction has the `%x = type ...` shape, so scanning body lines too
 * cannot misfire.
 */
export function collectTypeAliasNames(
  lines: readonly LogicalLine[],
): Set<string> {
  const names = new Set<string>();
  for (const line of lines) {
    const tokens = tokenizeLine(line.text);
    if (
      tokens[0]?.kind === "local" &&
      isPunct(tokens[1], "=") &&
      isWord(tokens[2], "type")
    ) {
      names.add(tokens[0].value);
    }
  }
  return names;
}

/**
 * Extract `defs` and `uses` from one instruction or terminator line, per
 * the rules in the file header. `typeAliases` is the module-wide table from
 * `collectTypeAliasNames`.
 */
export function extractUseDef(
  line: LogicalLine,
  typeAliases: ReadonlySet<string>,
): UseDef {
  const tokens = tokenizeLine(line.text);
  let def: string | undefined;
  let rest = tokens;
  if (tokens[0]?.kind === "local" && isPunct(tokens[1], "=")) {
    def = tokens[0].value;
    rest = tokens.slice(2);
  }
  const isPhi = isWord(rest[0], "phi");

  const uses: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < rest.length; i++) {
    const token = rest[i];
    if (token.kind !== "local") continue;
    if (isWord(rest[i - 1], "label")) continue; // block label, not a value
    if (isPhi && isPunct(rest[i + 1], "]")) continue; // phi incoming-block ref
    if (typeAliases.has(token.value)) continue; // %struct.T-style type name
    if (token.value === def) continue; // the line's own result
    if (seen.has(token.value)) continue; // dedup, first occurrence wins
    seen.add(token.value);
    uses.push(token.value);
  }

  return { defs: def === undefined ? [] : [def], uses };
}
