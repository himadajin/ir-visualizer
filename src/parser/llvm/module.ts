/**
 * Module assembler for the line-oriented LLVM parser — logical lines →
 * `LLVMModule` (docs/internal/plans/2026-07-llvm-line-oriented-parser.md
 * §3, §3.3, §3.4, step 8).
 *
 * A two-state machine (top-level ⇄ in-function) drives the earlier layers:
 * `readLogicalLines` (layer 1) → `classifyTopLevel` / `classifyBody`
 * (layer 2) → `parseInstruction` / `parseTerminator` (layer 3). Every line
 * is consumed exactly once; there is no backtracking.
 *
 * Use-def foundation (step 11): every instruction and terminator parsed
 * from a source line additionally gets `defs`/`uses` attached via
 * `extractUseDef` (./useDef.ts), using the module-wide `%T = type ...`
 * name table. The only node without them is the §3.4 synthetic empty
 * terminator, which has no source line.
 *
 * Error policy (§3.4):
 * - Unrecognized top-level line → throw, naming the 1-based line.
 * - Structural errors (no terminator before `}`, `}` without `define`,
 *   unclosed function at EOF, a `define` line not ending in `{`, an empty
 *   function body, unbalanced `[`) → throw. The layer-1 unbalanced-`[`
 *   diagnostic — currently the reader's only diagnostic kind — is escalated
 *   here to that throw; the reader itself stays pure.
 * - Unrecognized in-body line → opaque instruction, never a throw.
 * - Recoverable oddities → `LLVMModule.diagnostics` (set only when
 *   non-empty): implicit-block-id fallback, terminator targets no block
 *   claims, and a label starting a new block while the previous block has
 *   no terminator (see below).
 *
 * Decisions pinned here (each carried by a module.test.ts case):
 * - **Label after an unterminated block does NOT throw.** §3.4 makes "no
 *   terminator before `}`" structural, but says nothing about a label
 *   arriving first, and the step-8 exit criterion (the pre-rewrite suites
 *   pass unmodified) pins inputs of exactly that shape. The previous block
 *   is closed with a synthetic empty terminator (`opcode: ""`, no
 *   successors, so it contributes no CFG edge) plus a diagnostic — the
 *   label still starts a real block, so nothing is silently absorbed.
 * - **Empty function body (`define … { }`) throws**, like the legacy
 *   parser, which required at least one block ending in a terminator.
 * - **A `define` line that does not end with `{` throws** (§3.4 structural
 *   error): the printer always opens the body on the define line, and
 *   without the `{` there is no function body to attach lines to.
 * - `typeAlias` / `comdat` / `moduleAsm` / `uselistorder` lines are
 *   classified, parsed-and-dropped, diagnostic-free (§3.5) — nothing is
 *   recorded, exactly like the legacy parser's TypeAlias handling.
 * - A varargs parameter (`...`) is kept as `{ type: "...", name: null }`
 *   rather than skipped: dropping it would misalign the param count with
 *   the source, and `LLVMParam.name` already admits null for the unnamed
 *   LLVM 2.x style params.
 *
 * Implicit block numbering (§3.3) — id priority for a block that starts
 * without a label line:
 * 1. the `N` of an adjacent `; <label>:N` boundary comment (layer 1's
 *    `labelHint`), which also resynchronizes the counter to N+1;
 * 2. the unnamed-value counter. It starts from the parameter list: each
 *    unnamed parameter consumes one slot, and a parameter explicitly named
 *    `%N` (numeric — the printed form of an unnamed parameter) sets the
 *    counter to N+1. The unlabeled entry block consumes the counter value
 *    at function start; thereafter `%N = ...` results and printed numeric
 *    labels `N:` set the counter to N+1, and each hint-less implicit
 *    boundary takes the current value (then increments). This reproduces
 *    LLVM's printer numbering for printer-generated input.
 * 3. fallback `implicit_<k>` plus a diagnostic, used when the candidate id
 *    from 1–2 collides with a block id this function already assigned.
 *
 * The unlabeled entry block keeps the legacy id `entry` when the body never
 * *uses* a numeric label — a use is a `label %N` token pair, a
 * `; <label>:N` hint, or a phi incoming-block reference `[ v, %N ]`;
 * numeric instruction results (`%1 = ...`) do not count (§3.3). Otherwise
 * it takes the counter value. Either way the unlabeled entry consumes one
 * counter slot, matching the printer.
 *
 * After each function is assembled, every terminator target that no block
 * id claims produces a diagnostic — never a throw, never a silent dangling
 * edge (§3.3).
 */

import type {
  LLVMBasicBlock,
  LLVMBasicBlockItem,
  LLVMFunction,
  LLVMModule,
  LLVMOpaqueTerminator,
  LLVMParam,
  LLVMParseDiagnostic,
  LLVMTerminator,
} from "../../ast/llvmAST";
import { classifyBody, classifyTopLevel } from "./classify";
import { diag } from "./diagnostics";
import {
  originalTextOf,
  parseDebugRecord,
  parseInstruction,
} from "./instructions";
import { readLogicalLines } from "./logicalLines";
import type { LogicalLine } from "./logicalLines";
import { parseTerminator } from "./terminators";
import { tokenizeLine } from "./tokenizer";
import type { Token } from "./tokenizer";
import { collectTypeAliasNames, extractUseDef } from "./useDef";

const NUMERIC = /^\d+$/;

/** True when the token is punctuation with exactly this character. */
function isPunct(token: Token | undefined, ch: string): boolean {
  return token !== undefined && token.kind === "punct" && token.value === ch;
}

/** True when the token is a bare word with exactly this text. */
function isWord(token: Token | undefined, text: string): boolean {
  return token !== undefined && token.kind === "word" && token.value === text;
}

/** §3.4 structural throw: 1-based line number + the problem in plain words. */
function structuralError(line: number, message: string): Error {
  return new Error(`Line ${String(line)}: ${message}`);
}

/** Everything `parseDefineLine` extracts from one `define ... {` line. */
interface DefineHeader {
  /** Function name with its `@` sigil (legacy convention). */
  name: string;
  params: LLVMParam[];
  /** Single-spaced `define <header> @name (<params>) <attrs>` (legacy). */
  definition: string;
}

/**
 * Split the tokens of a `(...)` group at top-level commas; `( [ { <` open
 * nesting and `) ] } >` close it, so aggregate / vector / function-pointer
 * parameter types keep their inner commas.
 */
function splitAtTopLevelCommas(tokens: Token[]): Token[][] {
  const segments: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === "punct") {
      if ("([{<".includes(token.value)) depth++;
      else if (")]}>".includes(token.value)) depth--;
      else if (token.value === "," && depth === 0) {
        segments.push(current);
        current = [];
        continue;
      }
    }
    current.push(token);
  }
  segments.push(current);
  return segments.filter((segment) => segment.length > 0);
}

/**
 * One parameter from its token segment: the trailing `%local` token is the
 * name (raw text, sigil kept — the legacy `Param` convention pinned by
 * moduleStructure.test.ts); everything before it is the raw type text.
 * Without a trailing local the whole segment is the type and the name is
 * null (unnamed params, `...`).
 */
function paramFromSegment(segment: Token[], text: string): LLVMParam {
  const last = segment[segment.length - 1];
  if (last.kind === "local" && segment.length >= 1) {
    const first = segment[0];
    const type =
      segment.length === 1 ? "" : text.slice(first.start, last.start).trim();
    return { type, name: last.text };
  }
  return {
    type: text.slice(segment[0].start, last.end).trim(),
    name: null,
  };
}

/**
 * Parse one `define ... {` logical line into name / params / definition.
 * Throws the §3.4 structural error on a define line that does not end with
 * `{` or has no `@name (...)` shape to anchor on.
 */
function parseDefineLine(line: LogicalLine): DefineHeader {
  const text = line.text;
  if (!text.endsWith("{")) {
    throw structuralError(
      line.lineNumber,
      "this 'define' line does not end with '{' — a function body must open on the same line.",
    );
  }
  const tokens = tokenizeLine(text);
  const nameIndex = tokens.findIndex((token) => token.kind === "global");
  if (nameIndex === -1) {
    throw structuralError(
      line.lineNumber,
      "this 'define' line has no function name (expected '@name').",
    );
  }
  const nameToken = tokens[nameIndex];

  let open = -1;
  let close = -1;
  let depth = 0;
  for (let i = nameIndex + 1; i < tokens.length; i++) {
    if (isPunct(tokens[i], "(")) {
      if (depth === 0 && open === -1) open = i;
      depth++;
    } else if (isPunct(tokens[i], ")")) {
      depth--;
      if (depth === 0 && open !== -1) {
        close = i;
        break;
      }
    }
  }
  if (open === -1 || close === -1) {
    throw structuralError(
      line.lineNumber,
      "this 'define' line has no parameter list (expected '(...)' after the function name).",
    );
  }

  const params = splitAtTopLevelCommas(tokens.slice(open + 1, close)).map(
    (segment) => paramFromSegment(segment, text),
  );

  // Legacy definition string: `define <header> @name (<params>) <attrs>`,
  // whitespace collapsed to single spaces (legacy Function semantics).
  const header = text.slice(tokens[0].end, nameToken.start);
  const paramsText = text.slice(tokens[open].end, tokens[close].start).trim();
  const attrs = text.slice(tokens[close].end, text.length - 1);
  const definition =
    `define ${header} ${nameToken.text} (${paramsText}) ${attrs}`
      .trim()
      .replace(/\s+/g, " ");

  return { name: nameToken.text, params, definition };
}

/**
 * §3.3 "references numeric labels": a `label %N` token pair, a
 * `; <label>:N` hint, or a phi incoming-block reference `[ v, %N ]` (a
 * numeric local directly before the closing `]`). Numeric instruction
 * results do not count.
 */
function referencesNumericLabels(bodyLines: LogicalLine[]): boolean {
  for (const line of bodyLines) {
    if (line.labelHint !== undefined) return true;
    const tokens = tokenizeLine(line.text);
    let base = 0;
    if (tokens[0]?.kind === "local" && isPunct(tokens[1], "=")) base = 2;
    const isPhi = isWord(tokens[base], "phi");
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const next = tokens[i + 1] as Token | undefined;
      if (
        isWord(token, "label") &&
        next?.kind === "local" &&
        NUMERIC.test(next.value)
      ) {
        return true;
      }
      if (
        isPhi &&
        token.kind === "local" &&
        NUMERIC.test(token.value) &&
        isPunct(next, "]")
      ) {
        return true;
      }
    }
  }
  return false;
}

/** The unnamed-value counter's start value, derived from the param list. */
function initialCounter(params: LLVMParam[]): number {
  let counter = 0;
  for (const param of params) {
    if (param.name === null) {
      counter++; // an unnamed parameter consumes one slot
    } else if (
      param.name.startsWith("%") &&
      NUMERIC.test(param.name.slice(1))
    ) {
      counter = Number(param.name.slice(1)) + 1; // printed unnamed form %N
    }
  }
  return counter;
}

/** Ordered CFG targets of one terminator, for the dangling-target check. */
function targetsOf(terminator: LLVMTerminator): string[] {
  switch (terminator.opcode) {
    case "br":
      if ("destination" in terminator && terminator.destination !== undefined) {
        return [terminator.destination];
      }
      if ("trueTarget" in terminator && terminator.trueTarget !== undefined) {
        return [terminator.trueTarget, terminator.falseTarget ?? ""].filter(
          (target) => target !== "",
        );
      }
      break;
    case "switch":
      if ("defaultTarget" in terminator) {
        return [
          terminator.defaultTarget,
          ...terminator.cases.map((c) => c.target),
        ];
      }
      break;
    case "invoke":
      if ("normalTarget" in terminator) {
        return [terminator.normalTarget, terminator.unwindTarget];
      }
      break;
    default:
      break;
  }
  if ("successors" in terminator) return terminator.successors;
  return [];
}

/** An open (not yet terminated) basic block under construction. */
interface OpenBlock {
  id: string;
  label: string | null;
  instructions: LLVMBasicBlockItem[];
}

/**
 * The §3.4 synthetic terminator used when a label line closes an
 * unterminated block: empty opcode, no successors, so it contributes no
 * CFG edge and no dangling-target candidate.
 */
function syntheticTerminator(): LLVMOpaqueTerminator {
  return { type: "Instruction", opcode: "", successors: [], originalText: "" };
}

/**
 * Assemble one function's body lines into blocks (§3.3), appending
 * recoverable oddities to `diagnostics`. `closeLine` is the 1-based line
 * number of the function's `}`, used by the structural errors.
 */
function assembleFunction(
  header: DefineHeader,
  bodyLines: LogicalLine[],
  closeLine: number,
  diagnostics: LLVMParseDiagnostic[],
  typeAliases: ReadonlySet<string>,
): LLVMFunction {
  const numericLabelUse = referencesNumericLabels(bodyLines);
  let counter = initialCounter(header.params);
  const blocks: LLVMBasicBlock[] = [];
  const usedIds = new Set<string>();
  const targets: { target: string; line: number }[] = [];
  let current: OpenBlock | null = null;
  let fallbackCount = 0;

  const closeBlock = (terminator: LLVMTerminator): void => {
    const block = current as OpenBlock;
    blocks.push({
      type: "BasicBlock",
      id: block.id,
      label: block.label,
      instructions: block.instructions,
      terminator,
    });
    usedIds.add(block.id);
    current = null;
  };

  /** Start the block a label-less body line implies (entry or implicit). */
  const openImplicitBlock = (line: LogicalLine): void => {
    let id: string;
    if (line.labelHint !== undefined) {
      id = line.labelHint; // priority 1: the `; <label>:N` boundary comment
      counter = Number(line.labelHint) + 1;
    } else if (blocks.length === 0) {
      // The unlabeled entry block: id `entry` unless the body uses numeric
      // labels; either way it consumes one counter slot (§3.3).
      id = numericLabelUse ? String(counter) : "entry";
      counter++;
    } else {
      id = String(counter); // priority 2: the unnamed-value counter
      counter++;
    }
    if (usedIds.has(id)) {
      const fallback = `implicit_${String(fallbackCount)}`;
      fallbackCount++;
      diagnostics.push(
        diag(
          line.lineNumber,
          `implicit block id '${id}' is already taken in this function; the block was renamed '${fallback}'.`,
        ),
      );
      id = fallback;
    }
    current = { id, label: null, instructions: [] };
  };

  /** `%N = ...` results and printed `N:` labels resync the counter (§3.3). */
  const observeNumericDefinition = (name: string): void => {
    if (NUMERIC.test(name)) counter = Number(name) + 1;
  };

  for (const line of bodyLines) {
    const classified = classifyBody(line.text);
    switch (classified.kind) {
      case "label": {
        if (current !== null) {
          // §3.4 decision (see file header): recover, never absorb silently.
          diagnostics.push(
            diag(
              line.lineNumber,
              `label '${classified.id}:' starts a new block, but the previous block '${(current as OpenBlock).id}' has no terminator; it was closed without one.`,
            ),
          );
          closeBlock(syntheticTerminator());
        }
        observeNumericDefinition(classified.id);
        current = { id: classified.id, label: classified.id, instructions: [] };
        break;
      }
      case "terminator": {
        if (current === null) openImplicitBlock(line);
        const tokens = tokenizeLine(line.text);
        if (tokens[0]?.kind === "local" && isPunct(tokens[1], "=")) {
          observeNumericDefinition(tokens[0].value);
        }
        const terminator = parseTerminator(line, classified.opcode);
        const terminatorUseDef = extractUseDef(line, typeAliases);
        terminator.defs = terminatorUseDef.defs;
        terminator.uses = terminatorUseDef.uses;
        for (const target of targetsOf(terminator)) {
          targets.push({ target, line: line.lineNumber });
        }
        closeBlock(terminator);
        break;
      }
      case "debugRecord": {
        if (current === null) openImplicitBlock(line);
        (current as OpenBlock).instructions.push(parseDebugRecord(line));
        break;
      }
      case "instruction": {
        if (current === null) openImplicitBlock(line);
        const instruction = parseInstruction(line);
        if ("result" in instruction && instruction.result !== undefined) {
          observeNumericDefinition(instruction.result);
        }
        const useDef = extractUseDef(line, typeAliases);
        instruction.defs = useDef.defs;
        instruction.uses = useDef.uses;
        (current as OpenBlock).instructions.push(instruction);
        break;
      }
    }
  }

  if (current !== null) {
    throw structuralError(
      closeLine,
      `block '${(current as OpenBlock).id}' of function '${header.name}' has no terminator before '}' — every block must end with a terminator such as 'ret' or 'br'.`,
    );
  }
  if (blocks.length === 0) {
    throw structuralError(
      closeLine,
      `function '${header.name}' has an empty body — a function needs at least one basic block ending in a terminator.`,
    );
  }

  for (const { target, line } of targets) {
    if (!usedIds.has(target)) {
      diagnostics.push(
        diag(
          line,
          `terminator targets label '%${target}', but no block in function '${header.name}' has that id.`,
        ),
      );
    }
  }

  return {
    type: "Function",
    name: header.name,
    params: header.params,
    blocks,
    definition: header.definition,
    entry: blocks[0],
  };
}

/** Text after the first `=` token, trimmed — the legacy value convention. */
function valueAfterEquals(text: string, tokens: Token[]): string {
  const eq = tokens.find((token) => isPunct(token, "="));
  return eq === undefined ? "" : text.slice(eq.end).trim();
}

/**
 * Assemble a whole module from raw input text. Throws on §3.4 structural
 * errors and unrecognized top-level lines; records recoverable oddities in
 * `module.diagnostics` (present only when non-empty).
 */
export function buildModule(input: string): LLVMModule {
  const { lines, diagnostics: readerDiagnostics } = readLogicalLines(input);
  // §3.4: the reader's unbalanced-`[` diagnostic (its only kind) escalates
  // to the structural throw here; the reader itself never throws.
  if (readerDiagnostics.length > 0) {
    const first = readerDiagnostics[0];
    throw structuralError(
      first.line,
      "unbalanced '[' — the bracket group starting on this line never closes.",
    );
  }

  const module: LLVMModule = {
    type: "Module",
    functions: [],
    globalVariables: [],
    attributes: [],
    metadata: [],
    declarations: [],
    targets: [],
    sourceFilenames: [],
  };
  const diagnostics: LLVMParseDiagnostic[] = [];
  // Use-def foundation (step 11): the module-wide `%T = type ...` name
  // table, fed into per-line defs/uses extraction inside every function.
  const typeAliases = collectTypeAliasNames(lines);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kind = classifyTopLevel(line.text);
    const tokens = tokenizeLine(line.text);
    i++;

    switch (kind) {
      case "define": {
        const header = parseDefineLine(line);
        const bodyLines: LogicalLine[] = [];
        let closeLine = -1;
        while (i < lines.length) {
          const bodyLine = lines[i];
          i++;
          if (bodyLine.text === "}") {
            closeLine = bodyLine.lineNumber;
            break;
          }
          bodyLines.push(bodyLine);
        }
        if (closeLine === -1) {
          throw structuralError(
            line.lineNumber,
            `function '${header.name}' is never closed — missing '}' before the end of the input.`,
          );
        }
        module.functions.push(
          assembleFunction(
            header,
            bodyLines,
            closeLine,
            diagnostics,
            typeAliases,
          ),
        );
        break;
      }
      case "closeBrace":
        throw structuralError(
          line.lineNumber,
          "found '}' without a matching 'define' — there is no open function body here.",
        );
      case "declare":
        module.declarations.push({
          type: "Declaration",
          name: "declaration", // legacy convention: the name is not extracted
          definition: line.text,
        });
        break;
      case "global":
        module.globalVariables.push({
          type: "GlobalVariable",
          name: tokens[0].text,
          value: valueAfterEquals(line.text, tokens),
          originalText: originalTextOf(line),
        });
        break;
      case "metadataDef":
        module.metadata.push({
          type: "Metadata",
          id: tokens[0].text,
          value: valueAfterEquals(line.text, tokens),
          originalText: originalTextOf(line),
        });
        break;
      case "attributes":
        module.attributes.push({
          type: "AttributeGroup",
          id: tokens[1]?.text ?? "",
          value: valueAfterEquals(line.text, tokens),
          originalText: originalTextOf(line),
        });
        break;
      case "target":
        module.targets.push({
          type: "Target",
          key: "target",
          value: line.text,
        });
        break;
      case "sourceFilename":
        module.sourceFilenames.push({
          type: "SourceFilename",
          // Legacy kept the stringLiteral's quotes in `name`.
          name: tokens[2]?.text ?? "",
          originalText: originalTextOf(line),
        });
        break;
      case "typeAlias":
      case "comdat":
      case "moduleAsm":
      case "uselistorder":
        break; // §3.5: classified, parsed-and-dropped, diagnostic-free
      case "unknown":
        throw structuralError(
          line.lineNumber,
          `unrecognized top-level line '${line.text}' — expected a define, declare, global, metadata, attributes, target, or source_filename entry.`,
        );
    }
  }

  if (diagnostics.length > 0) module.diagnostics = diagnostics;
  return module;
}
