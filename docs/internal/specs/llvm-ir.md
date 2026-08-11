# Spec: LLVM-IR mode

Behavior specification for the `llvm-ir` mode: which subset of LLVM-IR the line-oriented
parser accepts (`src/parser/llvm/`) and how the AST becomes a control-flow graph
(`src/graphBuilder/llvmGraphBuilder.ts`). The parser intentionally favors a total,
line-oriented pipeline over full LLVM conformance: it extracts only the structure needed by
the CFG and Use-Def views and preserves the rest as source text. This spec pins that behavior.

Conventions: every normative statement is covered by a **Pinned by** reference to the test
file(s) that fix the behavior. Statements marked _observed, untested_ describe current
behavior with no covering test.

## 1. Input model

The input is processed line by line, in three layers: physical lines become **logical
lines** (comment stripping, continuation joining, 1-based source line numbers), each logical
line is **classified** by its leading keyword, and classified lines are **assembled** into an
`LLVMModule` by a two-state machine (top level ⇄ in-function). Every line is consumed
exactly once; there is no backtracking. One bad line inside a function degrades to an opaque
instruction instead of failing the whole parse (see §3.4).

`;` comments are stripped anywhere, string-aware: a `;` inside a string literal is data,
not a comment. Blank and comment-only lines produce no logical line.

`; <label>:N` comments are stripped like any comment, but their `N` is retained as a
block-boundary hint for implicit block numbering (§3.3).

> Pinned by: `src/parser/llvm/__tests__/logicalLines.test.ts`,
> `src/parser/llvm/__tests__/classify.test.ts`,
> `src/parser/llvm/__tests__/module.test.ts`,
> `src/parser/__tests__/llvm/errors.test.ts`

**Version coverage:** the parser accepts printer output from LLVM ~2.x through current —
typed pointers and the `unwind` terminator (2.x), `; <label>:N` unnamed blocks and old-style
`load`/`getelementptr` (3.x–6.x), printed numeric labels (7.x–13.x), opaque `ptr`,
`#dbg_*` records and `callbr` (14+). The acceptance evidence is the corpus: 25 `probe-*.ll`
snippets plus 6 `era-*.ll` files, one per era, each with a hand-written CFG projection.

> Pinned by: `src/parser/__tests__/llvm/corpus.test.ts` +
> `src/parser/__tests__/llvm/corpus/manifest.ts`

## 2. Accepted top-level entries

A module is a sequence of the following, in any order and any count:

| Entry           | Syntax accepted                                     | Parsed into                                           |
| --------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Function        | `define <header> @name(<params>) <attrs> {` … `}`   | `LLVMFunction` (structural — see §3)                  |
| Declaration     | `declare <rest of line>`                            | `LLVMDeclaration` (raw text; `name` is not extracted) |
| Global variable | `@name = <rest of line>`                            | `LLVMGlobalVariable` (name + raw value text)          |
| Attribute group | `attributes #N = <rest of line>` (also `#"string"`) | `LLVMAttributeGroup` (id + raw value text)            |
| Metadata        | `!id = <rest of line>`                              | `LLVMMetadata` (id + raw value text)                  |
| Target          | `target <rest of line>`                             | `LLVMTarget`                                          |
| Source filename | `source_filename = "<string>"`                      | `LLVMSourceFilename`                                  |
| Type alias      | `%name = type <rest of line>`                       | Dropped (classified, not kept in the AST)             |
| Comdat          | `$name = comdat <rest of line>`                     | Dropped, diagnostic-free                              |
| Module asm      | `module asm "<string>"`                             | Dropped, diagnostic-free                              |
| uselistorder    | `uselistorder… <rest of line>`                      | Dropped, diagnostic-free                              |

Entries are classified into dedicated arrays on `LLVMModule`; multiple functions keep their
source order. Any other non-blank top-level line throws (§3.4).

Note the "rest of line" pattern: most non-function entries are captured **textually**, not
structurally. Their bodies are never re-parsed; node components render `originalText` as-is.

> Pinned by: `src/parser/__tests__/llvm/topLevelDecls.test.ts`,
> `src/parser/__tests__/llvm/moduleStructure.test.ts`,
> `src/parser/__tests__/llvm/invariants.test.ts`,
> `src/parser/llvm/__tests__/module.test.ts`,
> `src/parser/llvm/__tests__/classify.test.ts`

## 3. Functions, blocks, instructions

- A function is `define` + free-text header (return type, cconv, etc., captured as text) +
  `@name` + parameter list + optional attribute text + a braced body. The `{` must sit at
  the end of the define line (§3.4 otherwise). Parameters are split at top-level commas;
  each keeps its raw type text and its `%name` (or `name: null` for unnamed and `...`
  parameters). `LLVMFunction.definition` is the single-spaced define line without the `{`.
- The body is one entry block (label optional; id per §3.3) followed by further blocks,
  each started by a label line (`ident:`, `"quoted":`, or numeric `7:`) or — after a
  terminator — implicitly by the next instruction line. Block order is preserved; the entry
  block is also stored as `LLVMFunction.entry`.
- Block items are instructions or debug records (`#dbg_*` lines, kept as raw text). Every
  block must end with a terminator (§3.2); a missing one is either a structural error or
  the label-recovery case of §3.4.
- Non-terminator instructions are parsed into loose categories: `store`/`cmpxchg`/`atomicrmw`
  (operand-scanned, write-target heuristics), calls (`[%dst =] [tail|musttail|notail] call ...`,
  callee = last `@x`/`%x` before the **last** top-level paren group, which also covers the
  2.x fn-pointer-type form), assignments (`%x = <opcode> ...`), and generic instructions.
  All keep `originalText`; operand extraction is heuristic and per-token (globals `@x`,
  locals `%x`, metadata `!x`, everything else is `Other`).

> Pinned by: `src/parser/llvm/__tests__/module.test.ts`,
> `src/parser/llvm/__tests__/classify.test.ts`,
> `src/parser/llvm/__tests__/instructions.test.ts`,
> `src/parser/__tests__/llvm/moduleStructure.test.ts`,
> `src/parser/__tests__/llvm/invariants.test.ts`,
> `src/parser/__tests__/llvm/terminators.test.ts`,
> `src/parser/__tests__/llvm/instructions.test.ts`

### 3.1 Logical-line joining

Applied only inside a function body, after comment stripping:

1. **Bracket continuation.** A line with an unbalanced `[` (outside strings) absorbs the
   following lines until balanced — this joins the multi-line `switch` case list (LLVM
   prints one case per line) and multi-line `callbr`/`indirectbr` target lists. A `[` still
   open at `}` or EOF is a structural error (§3.4).
2. **`to`-continuation.** A line whose successor starts with `to label` or `unwind label`
   absorbs that successor — this joins the modern two-line `invoke` printing.
3. Nothing else joins. In particular, `landingpad` clause lines printed on their own line
   (`cleanup`, `catch …`, `filter …`) do not join; each becomes a separate opaque
   instruction, which is harmless for the CFG (_observed, untested — the corpus landingpads
   are single-line_).

Joined logical lines keep the 1-based line number of their first physical line;
`originalText` keeps every physical line, trimmed and newline-joined.

> Pinned by: `src/parser/llvm/__tests__/logicalLines.test.ts`,
> `src/parser/llvm/__tests__/module.test.ts`,
> `src/parser/llvm/__tests__/instructions.test.ts`

### 3.2 Terminators

Terminator keyword table — the first token of the logical line, or the token after `%x =`
for `invoke`/`callbr` only:

`ret`, `br`, `switch`, `indirectbr`, `invoke`, `callbr`, `resume`, `unreachable`,
`cleanupret`, `catchret`, `catchswitch`, `unwind` (the LLVM ≤ 2.x terminator).

**Uniform successor rule (normative):** the successors of any terminator are the ordered
occurrences of the token pair `label %x` in its logical line; string literals are single
opaque tokens, so `label` text inside them never counts, and `unwind to caller` has no
`label` token and thus no successor.

Per-opcode structure, on top of that rule:

| Terminator                                                      | Parsed into                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `br label %a`                                                   | `LLVMBrInstruction` with `destination`                                                                                                           |
| `br <ty> <val>, label %a, label %b`                             | `LLVMBrInstruction` with `condition`/`trueTarget`/`falseTarget`; any single type token (old IR used `bool`) and any value token (`%x`, literals) |
| `ret [ <ty...> [<val>] ]`                                       | `LLVMRetInstruction`; the last value-like token is `value`, the tokens before it are the raw `valType`                                           |
| `switch <ty> <val>, label %d [ <cases> ]`                       | `LLVMSwitchInstruction`; each case value is its raw source text only (`-1`, `0x10`, `4294967296` — no type prefix)                               |
| `[%x =] invoke … to label %ok unwind label %err`                | `LLVMInvokeInstruction` with `callee` (same heuristic as calls), `normalTarget`, `unwindTarget`, optional `result`                               |
| `callbr`, `indirectbr`, `cleanupret`, `catchret`, `catchswitch` | `LLVMOpaqueTerminator`: opcode + uniform-rule `successors`                                                                                       |
| `unreachable`, `resume`, `unwind`                               | `LLVMOpaqueTerminator` with `successors: []` — they are not returns and get no exit edge (§4)                                                    |

**Degradation:** a `br`/`switch`/`invoke` whose expected structure cannot be found (missing
targets, missing case brackets, missing `to label`/`unwind label` clause) degrades to an
`LLVMOpaqueTerminator` that keeps the opcode and the uniform-rule successors — never a throw,
never a structured node with fabricated fields. Consumers must therefore dispatch on field
presence, not opcode (§4).

Trailing `, !dbg !7`-style metadata after the recognized structure is ignored and can never
fail the parse. `parseTerminator` is total: it never throws, on any input.

> Pinned by: `src/parser/llvm/__tests__/classify.test.ts`,
> `src/parser/llvm/__tests__/terminators.test.ts`,
> `src/parser/__tests__/llvm/terminators.test.ts`,
> `src/parser/__tests__/llvm/errors.test.ts`,
> `src/parser/__tests__/llvm/corpus.test.ts`

### 3.3 Block ids

A block started by a label line takes that label as its id, in the canonical form of §1. A
block that starts without a label line gets its id from, in priority order:

1. the `N` of an adjacent `; <label>:N` boundary comment (which also resynchronizes the
   counter to N+1);
2. the unnamed-value counter: it starts from the parameter list (each unnamed parameter
   consumes one slot; a parameter printed as `%N` sets the counter to N+1); the unlabeled
   entry block consumes the counter value at function start; thereafter `%N = ...` results
   and printed `N:` labels set the counter to N+1, and each hint-less implicit boundary
   takes the current value. This reproduces LLVM's printer numbering for printer-generated
   input;
3. fallback `implicit_<k>` plus a diagnostic, when the candidate id from 1–2 is already
   taken in the function.

The unlabeled entry block keeps the id `entry` **only when the function body never uses a
numeric label** — a use is a `label %N` token pair, a `; <label>:N` hint, or a phi
incoming-block reference `[ v, %N ]`; numeric instruction results (`%1 = ...`) do **not**
count. Otherwise the entry takes the counter value (e.g. `0`, or `3` after three unnamed
parameters).

**Ids are unique within a function.** Rule 3's rename is not specific to implicit blocks: a
label line whose id is already taken — `a:` … `a:` — is renamed from the same `implicit_<k>`
sequence and records a diagnostic naming the duplicated label. The renamed block keeps the
written label in `LLVMBasicBlock.label`, so both blocks still display `a` and only their
identity differs. Terminators targeting `%a` reach the first block, the one that kept the id.
Real LLVM rejects a duplicated label outright; the parser degrades visibly instead, because a
shared id would collapse two blocks into one graph node and silently drop the second along
with its edges (§4.1's serialization is injective, so a duplicate block id is the only way to
reach a duplicate node id).

Every terminator target that no block id claims produces a diagnostic — never a throw,
never a silent dangling edge.

> Pinned by: `src/parser/llvm/__tests__/module.test.ts`,
> `src/parser/__tests__/llvm/errors.test.ts`,
> `src/parser/__tests__/llvm/corpus.test.ts`

### 3.4 Error policy

| Input                                                                                                                                         | Behavior                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Unrecognized line inside a function body                                                                                                      | Kept as an opaque `LLVMGenericInstruction` (opcode = first token); never a throw                  |
| Unrecognized non-blank line at top level                                                                                                      | Throw — garbage input still shows a parse error                                                   |
| Structural error (no terminator before `}`, `}` without `define`, unclosed function at EOF, `define` without `{`, empty body, unbalanced `[`) | Throw, with a message naming the 1-based source line and the problem in plain words (`Line N: …`) |
| Recoverable oddity (block-id collision fallback, dangling terminator target, label after an unterminated block)                               | Recorded in `LLVMModule.diagnostics` (present only when non-empty), not thrown                    |

**Label-after-unterminated-block recovery:** when a label line arrives while the previous
block has no terminator, the parser does not throw and does not absorb the label. The
previous block is closed with a synthetic empty terminator (`opcode: ""`, no successors —
so it contributes no CFG edge), a diagnostic is recorded, and the label starts its block
normally.

`LLVMModule.diagnostics` entries carry a 1-based `line` and a `message`. A message is one
self-contained sentence with no severity word in it: the mode passes the list straight through
as `IRParseResult.diagnostics` (`contracts/ir-mode-registry.md`), and the status footer owns
the `warning:` prefix (`specs/graph-view.md` §6.3). Both views of the mode report the same
list — they share this front-end and differ only in the graphBuilder.

> Pinned by: `src/parser/__tests__/llvm/errors.test.ts`,
> `src/parser/llvm/__tests__/module.test.ts`

### 3.5 Use-def foundation

Every instruction and terminator parsed from a source line carries two extra fields,
`defs` and `uses` (possibly empty arrays of sigil-free local names). The consumer is the
**Use-Def view** (`specs/llvm-use-def-view.md`, built by
`src/graphBuilder/llvmUseDefGraphBuilder.ts`); the CFG graphBuilder described in §4 ignores
both fields. SSA values only — memory dependence (store→load) is out of scope,
permanently. The one node without the fields is the synthetic empty terminator of the
§3.4 label recovery, which has no source line (and, having neither defs nor uses, gets no
Use-Def node either).

**`defs`** is the `%x =` assignment result exactly: 0 or 1 entry, including invoke and
callbr results. Globals are never defs.

**`uses`** are the local value names the line actually READS, deduplicated in
first-occurrence order:

- Block labels are not uses: any `label %x` pair (br/switch targets, invoke `to`/`unwind`,
  callbr/indirectbr lists).
- phi incoming VALUES are uses; incoming-block refs (`[ v, %bb ]` second slot) are not.
- Type-alias names (`%struct.T`) are excluded via a module-wide `%T = type …` name table,
  position-independent (an alias printed after the function still applies); the alias
  lines themselves stay dropped from the AST (§2).
- Globals (`@g`) are never uses (locals only); string contents (`c"%d"`) never match —
  strings are opaque tokens.
- The line's own def is never a use.
- br/switch conditions, ret values, call/invoke arguments, and operands of generic
  instructions are uses.
- A local callee (`%fp(...)`) is a use — the function pointer is read.
- **Store-pointer decision:** the pointer a `store` writes through IS a use — the address
  itself is read to perform the store; only the pointed-to memory is written.

Extraction is total (never throws) and token-based; it does not validate SSA form. Every
corpus file parses with well-formed defs/uses on every node.

> Pinned by: `src/parser/llvm/__tests__/useDef.test.ts`

## 4. CFG construction rules

Node kinds produced (see `contracts/graph-data.md` for the `nodeType`↔`astData` mapping):

| `nodeType`                                                                           | One per                    | Notes                                   |
| ------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------- |
| `llvm-functionHeader`                                                                | function                   | Rounded node with the `define ...` line |
| `llvm-basicBlock`                                                                    | basic block                | Header chip shows the block label       |
| `llvm-exit`                                                                          | function **with ≥1 `ret`** | Single shared exit node per function    |
| `llvm-globalVariable` / `llvm-attributeGroup` / `llvm-metadata` / `llvm-declaration` | module entry               | Free-standing nodes, no edges           |

Edge rules:

1. Function header → entry block.
2. `br i1 %c, label %a, label %b` → two edges labeled `true` / `false`.
3. `br label %a` → one unlabeled edge.
4. `ret` → edge to the function's exit node (created on first `ret`).
5. `switch` → one edge labeled `default` plus one edge per case labeled with the case's
   value text.
6. `invoke` → one edge labeled `to` (normal target) and one labeled `unwind` (unwind
   target).
7. Any other terminator carrying `successors` → one unlabeled edge per successor, in order
   (`callbr`, `indirectbr`, `catchret`, `cleanupret`, `catchswitch`, and degraded
   `br`/`switch`/`invoke`).
8. A terminator with empty `successors` (`unreachable`, `resume`, `unwind`) → no edges and
   no exit node.

The dispatch narrows on the **shape** of the terminator (presence of `condition`,
`destination`, `defaultTarget`, `normalTarget`, `successors`), not on its opcode: a degraded
`switch` still has opcode `"switch"` but no `cases` field and must fall through to the
uniform-successor rule instead of crashing.

`parseLLVM(input).graph` is exactly `convertASTToGraph(parseLLVMToAST(input))`; the entry point
returns the module's `diagnostics` (§3.4) alongside it, because a caller that wants the graph
wants to know what the parser recovered from on the way to it.

The produced graph always has `direction: "TD"`.

> Pinned by: `src/graphBuilder/__tests__/llvm/edges.test.ts`,
> `src/graphBuilder/__tests__/llvm/nodes.test.ts`,
> `src/graphBuilder/__tests__/llvm/invariants.test.ts`,
> `src/parser/__tests__/llvm/graphData.test.ts`,
> `src/parser/__tests__/llvm/errors.test.ts`

### 4.1 Node and edge ids

Both LLVM views build ids the same way, from `src/graphBuilder/llvmIds.ts`. An id is a
`:`-joined list of fragments, where `:` separates and `%` escapes. A fragment carrying free
text — a name, a block id, a case value — is escaped so it can contain neither character:
`%` becomes `%25`, `:` becomes `%3A`, and nothing else is rewritten. Fixed tags (`func`,
`block`, `edge`, …) come from a closed vocabulary and never need escaping. Ids are therefore
**injective** — two different sources never produce the same id — and decodable back to their
fragments.

A name is reduced to its **canonical** form before it is escaped: sigil removed, surrounding
quotes removed, escape sequences kept verbatim. This is the reduction the tokenizer already
performs for `Token.value` (§1), so block ids and terminator targets arrive canonical and
only the AST's raw-text names (function, global, metadata, attribute group) are reduced here.
`@"main"` and `@main` are the same LLVM name and share an id by construction; `@"a@b"` keeps
its inner `@` and stays distinct from `@ab`. The AST deliberately keeps the raw spelling for
display, which is why the reduction is restated in the id layer instead of imported from
`src/parser` (`architecture.md`).

| `nodeType`            | Id                                                |
| --------------------- | ------------------------------------------------- |
| `llvm-functionHeader` | `func:<name>:header`                              |
| `llvm-basicBlock`     | `func:<name>:block:<blockId>`                     |
| `llvm-exit`           | `func:<name>:exit`                                |
| `llvm-globalVariable` | `global:<name>`                                   |
| `llvm-attributeGroup` | `attr:<id>`                                       |
| `llvm-metadata`       | `meta:<id>`                                       |
| `llvm-declaration`    | `decl:<index>` — 0-based position in module order |

Declarations are keyed by position because their names are not extracted (§5); every other
kind is keyed by its canonical name, so the id is stable under edits elsewhere in the module.
Use-Def node ids follow the same grammar under the same `func:<name>` prefix
(`specs/llvm-use-def-view.md` §2).

An edge id is the tag `edge`, then its source id, its target id, then the variant fragments
that distinguish parallel edges between the same pair:

| Edge (§4 rule)         | Variant                   |
| ---------------------- | ------------------------- |
| header → entry (1)     | _none_                    |
| conditional `br` (2)   | `true` / `false`          |
| unconditional `br` (3) | _none_                    |
| `ret` → exit (4)       | _none_                    |
| `switch` (5)           | `default`, `case:<value>` |
| `invoke` (6)           | `to` / `unwind`           |
| uniform successors (7) | `succ:<index>`            |

The successor index (rule 7) and the case value (rule 5) are what keep two edges to the same
target apart; a `switch` whose case value is literally `default` stays distinct from the
default edge because the tag is separate from the value.

Splicing whole ids into an edge id needs no second escaping level: every id kind is a fixed
number of fragments once its tags are read (after `func` comes one name fragment, then a tag
that fixes the rest), so a concatenation of ids reads back unambiguously.

> Pinned by: `src/graphBuilder/__tests__/llvm/invariants.test.ts`,
> `src/graphBuilder/__tests__/llvm/useDefGraph.test.ts`

## 5. Known limitations

- `catchswitch`, `catchret`, `cleanupret`, `callbr`, and `indirectbr` are understood only
  through the uniform successor rule: their edges are unlabeled and carry no per-opcode
  semantics (e.g. a `callbr` fallthrough edge is not distinguished from its indirect
  targets).
- `landingpad` clause continuation lines (`cleanup` / `catch …` / `filter …` printed on
  their own line) become separate opaque instructions in the block (_observed, untested_);
  single-line landingpads — what the corpus contains — parse as one instruction.
- `phi` instructions do not contribute CFG edges (they are generic instructions textually).
  The Use-Def view recovers their incoming pairs by scanning `originalText`
  (`specs/llvm-use-def-view.md` §3.1).
- Operand classification is heuristic, and only the write-target marking of
  `store`/`cmpxchg`/`atomicrmw` is exercised; use-def consumers should read the dedicated
  `defs`/`uses` fields (§3.5) instead of operands.
- The type-alias exclusion in `uses` (§3.5) is name-based: a local _value_ that shares its
  name with a declared type alias would be excluded too (_observed, untested_ — printer
  output does not produce such collisions).
- Comments (`;`) are stripped and not preserved anywhere (label hints excepted, §1).
- Extracting declaration names is still not done (`LLVMDeclaration.name` is always the
  literal `"declaration"`), which is why declaration node ids are keyed by position (§4.1)
  rather than by name.
