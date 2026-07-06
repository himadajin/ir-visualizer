/**
 * String-aware tokenizer for one logical line of LLVM IR.
 *
 * Layer-3 primitive of the line-oriented parser
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §3, step 4).
 * Pure functions only; no newline handling — the logical-line layer owns that.
 *
 * Totality contract: `tokenizeLine` never throws, terminates on any input,
 * and covers every non-whitespace character of the line exactly once with
 * non-overlapping, strictly ordered tokens. Characters that fit no other
 * kind become single-character `punct` tokens (there is no `unknown` kind).
 */

export type TokenKind =
  | "local" // %name, %42, %"quoted name"
  | "global" // @name, @"quoted"
  | "metadata" // !name, !0, and a bare `!` (e.g. before `{` or `"`)
  | "attrGroup" // #0, #"quoted"
  | "string" // "..." and c"..." — raw text, quotes included, never unescaped
  | "word" // keywords, opcodes, types, identifiers (incl. #dbg_* records)
  | "number" // integers (incl. negative), floats, hex ints, LLVM hex floats
  | "punct"; // any single remaining character, incl. `;` and unknown chars

export interface Token {
  kind: TokenKind;
  /**
   * Canonical value: for `local` / `global` / `metadata` / `attrGroup` the
   * name without its sigil, unquoted when the quoted form was used (escape
   * sequences are kept verbatim, never unescaped). For every other kind it
   * equals `text`.
   */
  value: string;
  /**
   * Raw source slice `line.slice(start, end)` — keeps the sigil and quotes,
   * so quoted-ness is never lost (`text.startsWith('%"')` etc.).
   */
  text: string;
  /** 0-based column of the first character (inclusive). */
  start: number;
  /** 0-based column one past the last character (exclusive). */
  end: number;
}

/**
 * Characters allowed in an unquoted name after `%` / `@` / `!`
 * (LLVM identifier set: letters, digits, `$ . _ -` and `\` escapes).
 */
const NAME_CHAR = /[A-Za-z0-9$._\\-]/;
/** Bare words start with a letter, `_`, `$`, or `.` (`.` also covers `...`). */
const WORD_START = /[A-Za-z_$.]/;
/**
 * Bare-word continuation excludes `-` (unlike NAME_CHAR) so that `-` outside
 * a sigiled name is always either a negative-number sign or punctuation.
 */
const WORD_CHAR = /[A-Za-z0-9$._]/;
const DIGIT = /[0-9]/;
const HEX_DIGIT = /[0-9A-Fa-f]/;
/** Type prefixes of LLVM hex-float literals: 0xK…, 0xL…, 0xM…, 0xH…, 0xR…. */
const HEX_FLOAT_PREFIX = /[KLMHR]/;
const WHITESPACE = /\s/;

/**
 * Split a raw physical line at the first `;` that lies outside any string
 * literal. This is the §3.1 primitive: `c"...;..."` must keep its `;` as
 * data. LLVM string literals cannot contain a raw `"` (escaped as `\22`),
 * so toggling on each `"` is exact, not a heuristic.
 *
 * `comment` excludes the `;` itself and is `null` when the line has no
 * comment; `code` is the text before the `;`, untrimmed.
 */
export function stripComment(line: string): {
  code: string;
  comment: string | null;
} {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (ch === '"') {
      inString = !inString;
    } else if (ch === ";" && !inString) {
      return { code: line.slice(0, i), comment: line.slice(i + 1) };
    }
  }
  return { code: line, comment: null };
}

/**
 * Scan a string literal body. `start` points at the opening `"`; returns the
 * index one past the closing `"`, or `line.length` when unterminated (the
 * token then extends to the end of the line — never an error).
 */
function scanStringEnd(line: string, start: number): number {
  const close = line.indexOf('"', start + 1);
  return close === -1 ? line.length : close + 1;
}

/** Consume NAME_CHAR characters starting at `start`; returns the end index. */
function scanNameEnd(line: string, start: number): number {
  let i = start;
  while (i < line.length && NAME_CHAR.test(line.charAt(i))) i++;
  return i;
}

/**
 * Scan a numeric literal. `start` points at the first digit or at a `-`
 * directly followed by a digit. Handles integers, decimal floats with
 * optional exponent, hex integers, and LLVM hex floats. Returns the end
 * index.
 */
function scanNumberEnd(line: string, start: number): number {
  let i = start;
  if (line.charAt(i) === "-") i++;
  if (
    line.charAt(i) === "0" &&
    (line.charAt(i + 1) === "x" || line.charAt(i + 1) === "X")
  ) {
    i += 2;
    if (HEX_FLOAT_PREFIX.test(line.charAt(i))) i++;
    while (i < line.length && HEX_DIGIT.test(line.charAt(i))) i++;
    return i;
  }
  while (i < line.length && DIGIT.test(line.charAt(i))) i++;
  if (line.charAt(i) === "." && DIGIT.test(line.charAt(i + 1))) {
    i++;
    while (i < line.length && DIGIT.test(line.charAt(i))) i++;
  }
  if (line.charAt(i) === "e" || line.charAt(i) === "E") {
    let j = i + 1;
    if (line.charAt(j) === "+" || line.charAt(j) === "-") j++;
    if (DIGIT.test(line.charAt(j))) {
      j++;
      while (j < line.length && DIGIT.test(line.charAt(j))) j++;
      i = j;
    }
  }
  return i;
}

function makeToken(
  kind: TokenKind,
  value: string,
  line: string,
  start: number,
  end: number,
): Token {
  return { kind, value, text: line.slice(start, end), start, end };
}

/**
 * Tokenize a sigiled reference (`%` / `@` / `!`) starting at `start`.
 * Quoted form (`%"a b"`): value is the text between the quotes, escapes
 * kept verbatim. A sigil followed by neither a name character nor `"`
 * falls back per sigil: `!` becomes a bare `metadata` token with empty
 * value (so `!{...}` keeps its `!` classifiable as metadata); `%` / `@`
 * become `punct` (a lone sigil references nothing).
 */
function scanSigil(
  line: string,
  start: number,
  kind: "local" | "global" | "metadata",
): Token {
  const after = start + 1;
  const next = line.charAt(after);
  if (next === '"' && kind !== "metadata") {
    const end = scanStringEnd(line, after);
    const closed = line.charAt(end - 1) === '"' && end > after + 1;
    const value = line.slice(after + 1, closed ? end - 1 : end);
    return makeToken(kind, value, line, start, end);
  }
  const end = scanNameEnd(line, after);
  if (end === after) {
    if (kind === "metadata") {
      return makeToken("metadata", "", line, start, after);
    }
    return makeToken("punct", line.charAt(start), line, start, after);
  }
  return makeToken(kind, line.slice(after, end), line, start, end);
}

/**
 * Tokenize `#…` starting at `start`. `#` + digits is an attribute group
 * reference; `#"..."` its quoted form. `#` + a word-start character is ONE
 * `word` token including the `#` (covers `#dbg_value`-style debug records —
 * the step-6 classifier recognizes the `#dbg_` prefix on that single token).
 * A bare `#` is `punct`.
 */
function scanHash(line: string, start: number): Token {
  const after = start + 1;
  const next = line.charAt(after);
  if (DIGIT.test(next)) {
    let end = after;
    while (end < line.length && DIGIT.test(line.charAt(end))) end++;
    return makeToken("attrGroup", line.slice(after, end), line, start, end);
  }
  if (next === '"') {
    const end = scanStringEnd(line, after);
    const closed = line.charAt(end - 1) === '"' && end > after + 1;
    const value = line.slice(after + 1, closed ? end - 1 : end);
    return makeToken("attrGroup", value, line, start, end);
  }
  if (WORD_START.test(next)) {
    let end = after;
    while (end < line.length && WORD_CHAR.test(line.charAt(end))) end++;
    const text = line.slice(start, end);
    return makeToken("word", text, line, start, end);
  }
  return makeToken("punct", "#", line, start, after);
}

/**
 * Tokenize one logical line of LLVM IR. Whitespace separates tokens and is
 * never a token itself. See the totality contract at the top of this file.
 *
 * Note: `%struct.T` and `%val` both tokenize as `local` — separating type
 * aliases from values is a later pass (plan step 11), not the tokenizer's.
 */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line.charAt(i);
    if (WHITESPACE.test(ch)) {
      i++;
      continue;
    }
    let token: Token;
    if (ch === "%") {
      token = scanSigil(line, i, "local");
    } else if (ch === "@") {
      token = scanSigil(line, i, "global");
    } else if (ch === "!") {
      token = scanSigil(line, i, "metadata");
    } else if (ch === "#") {
      token = scanHash(line, i);
    } else if (ch === '"') {
      const end = scanStringEnd(line, i);
      token = makeToken("string", line.slice(i, end), line, i, end);
    } else if (ch === "c" && line.charAt(i + 1) === '"') {
      const end = scanStringEnd(line, i + 1);
      token = makeToken("string", line.slice(i, end), line, i, end);
    } else if (
      DIGIT.test(ch) ||
      (ch === "-" && DIGIT.test(line.charAt(i + 1)))
    ) {
      const end = scanNumberEnd(line, i);
      token = makeToken("number", line.slice(i, end), line, i, end);
    } else if (WORD_START.test(ch)) {
      let end = i + 1;
      while (end < line.length && WORD_CHAR.test(line.charAt(end))) end++;
      token = makeToken("word", line.slice(i, end), line, i, end);
    } else {
      token = makeToken("punct", ch, line, i, i + 1);
    }
    tokens.push(token);
    i = token.end;
  }
  return tokens;
}
