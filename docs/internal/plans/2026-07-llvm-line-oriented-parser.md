# 2026-07 LLVM-IR Line-Oriented Parser Rewrite

- **Status:** In progress (steps 1–10 done)
- **Created:** 2026-07-06
- **Branch:** one feature branch — `fix-parser`; each numbered step below is exactly one
  commit
- **Commit workflow (owner decision, 2026-07-06):** for this plan, agents commit to the
  local branch themselves — a deviation from the usual owner-commits convention — under
  one condition: **every substantive change must pass a review by a party that did not
  write it** (§6.0 — which also defines the narrow mechanical-fix exemption). By default
  a fresh subagent implements each step and the plan-owning orchestrator agent reviews.
  The owner reviews the branch and performs the push (and PR) after all steps are
  complete. Never push from an agent.

## 1. Background and goals

An investigation on 2026-07-06 ran 25 real-world LLVM-IR snippets through the current
Ohm-based parser (`src/parser/llvm.ohm` / `llvm.ts`). 15 failed, including the classic
LLVM 2.x–3.x "hello world" (`call i32 (i8*, ...) @printf(...)` with a `getelementptr`
constant-expression argument) and any `br` carrying `!llvm.loop` metadata. One input
(`callbr`) parsed _silently wrong_: the following `cont:` label line was absorbed into the
previous block as a fake instruction, so a basic block vanished from the CFG.

Root cause: the grammar parses instruction interiors with character-level rules
(`args` / `argText`) that forbid `(` `)` `,` and newlines. Everything that trips it —
parentheses, metadata suffixes, negative numbers, spaced types — is unremarkable IR text.
Meanwhile the parts of the grammar that treat input as "rest of line, raw" (all top-level
entries) passed every test.

**Decision (owner, 2026-07-06):** rewrite the LLVM parser as a line-oriented parser instead
of patching the Ohm grammar. Motivations, in priority order:

1. **Stable parsing across LLVM versions** — accept output from old LLVM (~2.x) through
   current, without chasing syntax details we do not consume.
2. **Foundation for use-def chain visualization** (future feature) — requires a tokenizer
   that understands strings/comments and distinguishes value uses from block labels and
   type names; the Ohm character-soup approach cannot express that context.
3. **Error recovery** — a single Ohm `match` is all-or-nothing; per-line parsing lets one
   bad line degrade gracefully instead of blanking the whole graph.

Ohm stays in use for the mermaid and selectionDAG modes. The IR mode registry
(`docs/internal/contracts/ir-mode-registry.md`) isolates this per-mode choice.

## 2. Non-goals

- Rendering the use-def graph (separate future plan; this plan only makes the AST carry
  `defs`/`uses`).
- Redesigning the LLVM AST. `src/ast/llvmAST.ts` types are kept **additively compatible**
  so `llvmGraphBuilder.ts`, node components, and the existing test suites survive.
- Changing the mermaid / selectionDAG parsers, the registry contract, or `GraphData`.
- Memory dependence (store→load) edges — SSA values only, ever, in the use-def foundation.
- Perfect LLVM conformance. We accept a superset of printer output; we do not validate.

## 3. Design overview

Three layers, each a small pure module with its own unit tests:

```
input text
  │
  ├─ Layer 1  logicalLines.ts   physical lines → logical lines
  │            • string-aware comment stripping (keep raw text + stripped text)
  │            • join continuation lines (rules in §3.1)
  │            • record 1-based source line numbers
  │            • blank and comment-only lines are dropped here (never reach Layer 2)
  │
  ├─ Layer 2  classify.ts       logical line → LineKind (deterministic, keyword-driven)
  │            top level: define / close-brace / declare / global / metadata-def /
  │                       attributes / target / source_filename / type-alias /
  │                       comdat / module-asm / uselistorder / unknown
  │            in function: label / terminator (keyword table §3.2) / debug-record /
  │                       instruction (fallback — never fails)
  │
  └─ Layer 3  instructions.ts + terminators.ts   logical line → AST node
               tokenizer.ts tokenizes; per-opcode extractors give structure only
               where the CFG or use-def needs it; everything else stays raw text
```

`module.ts` drives the layers with a two-state machine (top-level ⇄ in-function) and
assembles `LLVMModule`. There is no backtracking anywhere; every line is consumed exactly
once, which structurally eliminates the "label absorbed as instruction" bug class.

### 3.0 File layout and migration naming

Final layout (a directory, mirroring one-file-per-concern):

```
src/parser/llvm/
  index.ts         parseLLVM / parseLLVMToAST — same signatures as today
  logicalLines.ts  tokenizer.ts  classify.ts  terminators.ts  instructions.ts
  module.ts        diagnostics.ts
  __tests__/ ...   (unit tests for the new modules; existing suites stay where they are)
```

`src/parser/llvm.ts` (file) and `src/parser/llvm/` (directory) cannot coexist as import
targets. Step 3 therefore _moves_ the old parser to `src/parser/llvm/legacy.ts` +
`src/parser/llvm/llvm.ohm`, with `index.ts` re-exporting legacy. All later steps add new
modules beside it; step 9 flips `index.ts` to the new implementation; step 10 deletes
legacy. External imports (`../parser/llvm`) never change.

### 3.1 Logical-line joining rules (exhaustive)

Applied only inside a function body, after string-aware comment stripping:

1. **Bracket continuation.** If a line has unbalanced `[` (outside strings), join following
   lines until balanced. Covers multi-line `switch` (LLVM prints one case per line) and any
   multi-line `callbr`/`indirectbr` target lists. Unbalanced at `}` or EOF → the reader
   records a diagnostic and emits the collected text as one opaque line; it never throws.
   Module assembly (step 8) escalates that diagnostic to the §3.4 structural throw — the
   reader stays pure, the module-level contract stays strict.
2. **`to`-continuation.** If the _next_ line starts with `to label` or `unwind label`
   (after trim), join it. Covers the modern two-line `invoke` printing:
   `invoke void @g()` ⏎ `        to label %cont unwind label %lpad`.
3. Nothing else joins. In particular, `landingpad` clause continuation lines
   (`cleanup` / `catch …` / `filter …` printed on their own line) deliberately do not
   join: each becomes a separate opaque instruction, which is harmless for the CFG and
   for defs/uses (the landingpad result is defined on the first line).

Comment stripping must be string-aware: `c"...;[..."` contains `;` and `[` that are data.
LLVM string literals cannot contain a raw `"` (quotes are escaped as `\22`), so "scan to
the next unescaped quote" is exact, not a heuristic.

`; <label>:N` comments are stripped like any comment **but** their `N` is retained as a
block-boundary hint for §3.3.

### 3.2 Terminators and the successor rule

Terminator keyword table (first token of the logical line, or after `%x =` for `invoke` /
`callbr`):

`ret`, `br`, `switch`, `indirectbr`, `invoke`, `callbr`, `resume`, `unreachable`,
`cleanupret`, `catchret`, `catchswitch`, `unwind` (LLVM ≤ 2.x instruction — required for
the old-IR goal).

**Uniform successor rule (normative):** the successors of any terminator are the ordered
occurrences of the token pair `label %x` in its logical line (strings excluded). Per-opcode
edge labels where the opcode is structurally understood:

- **`br` (conditional)** — `br <ty> <val>, label %a, label %b` → edges labeled `true` /
  `false`. Accept any `<ty>` token (old IR used `bool`), and any value token
  (`%x`, `true`, `false`, digits).
- **`br` (unconditional)** — one unlabeled edge.
- **`switch`** — `default` edge + one edge per case, labeled with the case's **value
  text only** (the raw token(s) after the case's type, up to the `,` — e.g. `-1`, not
  `i64 -1`; handles negative/hex values). This matches how the current graphBuilder
  labels case edges from `LLVMSwitchCase.value`, and the step-2 corpus projections pin
  this reading.
- **`ret`** — no `label` successors; graphBuilder keeps its shared per-function exit node.
- **`invoke`** — `to` edge labeled `to`, `unwind` edge labeled `unwind`.
- **`callbr`** — fallthrough `to` edge unlabeled, indirect targets unlabeled.
- **`indirectbr` / `catchret` / `cleanupret` / `catchswitch`** — generic rule, unlabeled
  edges (`unwind to caller` has no `label` token → correctly no edge).
- **`unreachable` / `resume` / `unwind`** — no successors, **no** exit edge (they are not
  returns).

Trailing `, !dbg !7`-style metadata is just tokens after the recognized structure; it can
never fail the parse. This one property fixes probe failures 05/06/08/09/12/13/23/24.

### 3.3 Blocks and implicit block numbering

- A block starts at a label line (`ident:`, `"quoted string":`, or numeric `7:`), or —
  after a terminator — at the next instruction line even without a label (**implicit
  block**), matching LLVM 3.x–6.x output where unnamed blocks appear only as
  `; <label>:N` comments.
- A block ends at its terminator. An instruction line after `{` with no terminator before
  `}` is a structural error (same policy as today, better message).
- Implicit block id resolution, in priority order:
  1. the `N` from an adjacent `; <label>:N` boundary comment;
  2. an unnamed-value counter: starts at the number of unnamed parameters; the unlabeled
     entry block itself consumes a counter value (its id is the counter value at function
     start — `0` for a function whose parameters are all named); thereafter, seeing
     `%N = ...` (numeric N) sets the counter to N+1, and each implicit block boundary
     takes the current counter value. This exactly reproduces LLVM's printer numbering
     for printer-generated input;
  3. fallback `implicit_<k>` plus a diagnostic (edges targeting a number that no block
     claims also produce a diagnostic — never a silent dangling edge).
- Unlabeled entry block id defaults to `entry` **only when the function body never
  references numeric labels** — otherwise the counter value is used. "References numeric
  labels" means label _uses_: `label %N` in a terminator, a `; <label>:N` hint, or a phi
  incoming-block reference `[ v, %N ]`; numeric instruction results (`%1 = ...`) do not
  count (so a modern `-O0` body full of `%1`/`%2` temporaries but with no numeric branch
  targets keeps id `entry`). (Today's hardcoded `entry` is why the default sample works;
  keep that behavior for named-label functions to avoid churn in existing tests.)

### 3.4 Error policy (decided)

- **Unrecognized line inside a function** — keep as an opaque `LLVMGenericInstruction`
  (opcode = first token, operands from token scan). Never throws.
- **Unrecognized non-blank line at top level** — throw (whole parse fails), same UX as
  today: garbage input must still show a parse error (pinned by `errors.test.ts` and the
  E2E smoke test).
- **Structural errors** (no terminator before `}`, `}` without `define`, unclosed function
  at EOF, unbalanced `[`) — throw, with a message naming the 1-based source line and the
  problem in plain words (not Ohm's "Expected …"). Unbalanced `[` is detected as a
  layer-1 diagnostic (§3.1) and escalated to this throw by module assembly in step 8.
- **Recoverable oddities** (implicit-id fallback, dangling terminator targets,
  label-after-unterminated-block recovery) — recorded in `LLVMModule.diagnostics` (new
  optional field), not thrown. UI consumption is out of scope. (Comdat lines are dropped
  diagnostic-free, per §3.5.)

### 3.5 Old-LLVM compatibility matrix (acceptance targets)

- **LLVM 2.x** — typed pointers `i8*`; fn-pointer call types
  `call i32 (i8*, ...)* @printf(...)`; the `unwind` terminator; one-line `invoke`;
  `bool`-ish `br`. _Handled by:_ tokens only; `unwind` in the keyword table; the §3.2 br
  rule.
- **LLVM 3.x–6.x** — `; <label>:N` unnamed blocks; old `load i8* %p` /
  `getelementptr [4 x i8]* @s, ...` (no separate pointee type); `!llvm.loop` / `!prof`
  suffixes on terminators. _Handled by:_ §3.3 implicit blocks; instruction interiors are
  raw text; suffix tokens are ignored.
- **LLVM 7.x–13.x** — `N:` printed labels; explicit pointee types. _Handled by:_ plain
  labels / raw text.
- **LLVM 14+** — opaque `ptr`; `#dbg_value(...)` debug records; `callbr`. _Handled by:_
  tokens; the existing DebugRecord line kind; the keyword table.
- **Any version** — `$name = comdat any`, `module asm "..."`, `uselistorder`.
  _Handled by:_ classified, parsed-and-dropped (like today's TypeAlias), diagnostic-free.

The 25 probe snippets from the 2026-07-06 investigation become the acceptance corpus
(§5, step 2); all 31 corpus entries (25 probes + 6 era files) must pass after step 9.

## 4. AST changes (additive only)

In `src/ast/llvmAST.ts`:

```ts
// new terminator variants (added to LLVMTerminator / LLVMInstruction unions)
export interface LLVMInvokeInstruction extends LLVMInstructionBase {
  opcode: "invoke";
  callee: string;
  normalTarget: string; // "to label %x"
  unwindTarget: string; // "unwind label %y"
  result?: string;
}
export interface LLVMOpaqueTerminator extends LLVMInstructionBase {
  opcode: string; // callbr | indirectbr | resume | unreachable | ...
  successors: string[]; // from the uniform successor rule, may be empty
}

// use-def foundation (step 11) — optional so earlier steps compile
interface LLVMInstructionBase {
  /* existing fields unchanged */
  defs?: string[]; // usually 0 or 1 local name
  uses?: string[]; // local value names actually read (no labels, no type aliases)
}

// diagnostics (step 7)
export interface LLVMParseDiagnostic {
  line: number;
  message: string;
}
export interface LLVMModule {
  /* existing */ diagnostics?: LLVMParseDiagnostic[];
}
```

`LLVMBrInstruction` / `LLVMRetInstruction` / `LLVMSwitchInstruction` /
`LLVMCallInstruction` / store / cmpxchg / atomicrmw keep their exact shapes, including the
store/cmpxchg/atomicrmw `isWrite` operand heuristics (pinned by `instructions.test.ts`).

## 5. Test design

Principles:

- **Assert projections, not AST dumps.** Corpus expectations are hand-written CFG
  projections (function names, ordered block ids, edge triples `(source, target, label?)`,
  terminator opcodes, diagnostic count) — full-AST snapshots are brittle and hide intent.
- **Every layer has its own unit suite** so a regression pinpoints the layer, not "the
  parser".
- **Every normative sentence in the rewritten spec carries a Pinned-by test** (docs rule).

Suites (all under `src/parser/`, vitest, node environment):

1. `llvm/__tests__/tokenizer.test.ts` — strings containing `;` `[` `%d` `,`; quoted
   identifiers `%"a b"`, `@"x"`; `%struct.T` vs `%val`; negative ints, floats,
   hex (`0x…`); `!dbg` / `!0` / `!{...}`; `#0`; `c"...\22..."` escape handling.
2. `llvm/__tests__/logicalLines.test.ts` — multi-line switch join; two-line invoke join;
   `; <label>:N` hint retention; comment stripping inside/outside strings; unbalanced `[`
   diagnostic; line-number bookkeeping across joins.
3. `llvm/__tests__/classify.test.ts` — table-driven: every top-level kind incl. comdat /
   module-asm / uselistorder; every terminator keyword (incl. `unwind`, and `%x = invoke`);
   labels (named / numeric / quoted, with `; preds =` trailing comment); `#dbg_*` records;
   fallback-to-instruction is total (property: classify never throws on any string).
4. `llvm/__tests__/terminators.test.ts` (new-module unit level) — every opcode entry of
   §3.2, each with and without trailing metadata; old-style `br bool`; `br i1 true`;
   negative and hex switch case values; `unwind to caller`.
5. `llvm/__tests__/instructions.test.ts` (new-module unit level) — call forms: fn-type,
   old fn-pointer-type, tail/musttail/notail, constant-expression args (GEP/bitcast/
   ptrtoint), callee extraction; phi bracket pairs; store/cmpxchg/atomicrmw write marking;
   opaque fallback for garbage lines.
6. **Existing suites as the compatibility net** — `__tests__/llvm/{moduleStructure,
topLevelDecls, terminators, instructions, invariants, graphData}.test.ts` must pass
   against the new parser **unmodified except** where this plan changes policy on purpose:
   `errors.test.ts`'s "unsupported terminator throws" flips to "unreachable parses, block
   has no exit edge" (spec §5 update in the same commit, step 9).
7. `__tests__/llvm/corpus.test.ts` + `__tests__/llvm/corpus/*.ll` — acceptance corpus:
   the 25 probe snippets plus one realistic file per era entry of §3.5 (2.x hello-world with
   invoke/unwind; 3.x loop with `; <label>:N` + old load/gep; current clang -O0 opaque-ptr;
   C++ EH with invoke/landingpad/resume; switch-heavy; vectors/aggregates). Each entry in
   a `manifest.ts` with its expected projection. Until step 9 the manifest marks the 22
   entries the old parser cannot reproduce with `expectedToFail: { reason }` (15 probes
   throw, probe 20 and the modern-clang era file misparse silently, and the other era
   files throw); step 9 deletes those flags (all entries must then pass).
8. Invariants (extend `__tests__/llvm/invariants.test.ts`):
   - **line conservation:** every non-comment, non-blank body line of every corpus file
     appears in exactly one instruction/terminator `originalText` of exactly one block
     (kills the silent-absorption bug class);
   - every edge target id exists as a block, or a diagnostic mentions it;
   - `entry` is `blocks[0]` and identical to `LLVMFunction.entry`;
   - parsing is deterministic (two runs, deep-equal);
   - garbage-tolerance property: for each corpus file, inserting a nonsense line
     (`wibble %a, ???`) into a function body still parses, adds exactly one opaque
     instruction, and leaves the edge set unchanged.
9. `llvm/__tests__/useDef.test.ts` (step 11) — `%c` used / `%a %b` not (br); phi values
   used, phi block refs not; `%struct.T` excluded via type-alias table; `@g` in defs never;
   `c"%d"` string contents never; `defs` = assignment result exactly.
10. E2E (`e2e/smoke.spec.ts`): one added scenario — paste the 2.x hello-world corpus file
    into llvm mode, expect a rendered graph (node count > 0) and no error banner.

Coverage target: `npm run test:coverage` ≥ 90% lines for `src/parser/llvm/` (the modules
are pure functions; this is cheap to reach and keeps refactors honest).

## 6. Commit plan (single branch, one commit each)

Every commit ends with `npm run format && npm run lint && npm run test:run` green (repo
rule). Doc edits land in the same commit as the code they govern, spec-first within the
commit.

### 6.0 Per-step workflow (mandatory for every step)

Two roles, chosen so that the party with the most accumulated plan context sits at the
review gate, and so that **no substantive diff is ever reviewed only by its author**.
"Mechanical" is defined narrowly: a change is mechanical only if it alters neither
runtime behavior nor what any test assertion pins (typos, naming, comment wording,
formatting); when in doubt, it is substantive. Mechanical fixes by the reviewer are the
single, deliberate exemption from the non-author-review rule — everything else in this
section preserves it.

- **Orchestrator** — the long-lived session agent that owns this plan's context (the
  investigation, the design rationale, all prior steps). Reviews, fixes mechanically,
  and commits. Does not implement substantive step code except where noted below.
- **Implementer** — a fresh-context subagent spawned per step with: this plan document,
  the step number, and the plan sections that step references. Writes the step's code
  and tests in the working tree. May be resumed (same context) for rework.

Default flow (steps 2, 4–11):

1. **Delegate.** Orchestrator spawns the implementer for the step. The implementer works
   on the feature branch working tree only, runs the repo checks itself, and reports
   what it did and any deviations from the plan.
2. **Independent verification.** The orchestrator re-runs
   `npm run format && npm run lint && npm run test:run` itself (plus `npm run build` for
   steps 9–10 and `npm run test:e2e` for step 12) — the implementer's claims are not
   trusted; the results are re-derived.
3. **Orchestrator review** of the full diff. Checklist, at minimum:
   - the diff implements the referenced plan sections (e.g. §3.1 for step 5) — no more,
     no less; flag scope creep per §7;
   - **test quality, not just presence**: assertions pin the behavior the plan's spec
     sections describe; projections rather than AST dumps (§5 principles); failure cases
     and edge cases from the relevant §5 suite description are actually present;
   - cross-step consistency: module boundaries match what later steps expect
     (e.g. the step-4 tokenizer API is what step 7 consumes);
   - code quality: naming/idiom consistent with the codebase, no leftover debug code,
     comments state constraints only;
   - for steps that touch specs: every changed normative sentence has a Pinned-by
     reference to a test in the diff.
4. **Findings routing.** Mechanical fixes (per the definition above) the orchestrator
   applies directly, then re-runs item 2. Substantive rework — including missing or
   wrong test cases — goes back to the same implementer via resume, then re-verify
   (item 2) and re-review (item 3). If the orchestrator ends up writing substantive
   code itself, that portion must get an independent fresh-context subagent review
   before commit, so that no author reviews their own substantive work.
5. **Commit** by the orchestrator, with the step's conventional-commit subject and a
   `Co-Authored-By: <agent> <noreply@anthropic.com>` footer identifying the agent. One
   step = one commit; if a step turns out to need a preparatory refactor, ask the owner
   before splitting.
6. **Never push.** The owner reviews the branch and pushes/opens the PR after step 12.

Intensity adjustments:

- **Steps 8 and 9 (highest risk — module assembly; the switch + spec rewrite):** in
  addition to the orchestrator review, an independent fresh-context subagent review is
  required. Both approvals must cover the **final pre-commit diff**: any change applied
  after an approval — even a mechanical one — reopens that approval.
- **Steps 3 and 12 (mechanical move / docs + E2E scenario):** the orchestrator may
  implement directly; an independent fresh-context subagent review is then required
  before commit (the inverse role split, preserving the same invariant), and items 2, 5,
  and 6 of the default flow still apply. If the orchestrator does not implement
  directly, the default flow applies unchanged.

Owner-directed plan amendments (like the one introducing this section) are committed as
standalone `docs:` commits outside the step numbering, under the same invariant: authored
by the orchestrator → reviewed by an independent subagent.

### Step 1 — `docs: add line-oriented LLVM parser plan`

- This document.

### Step 2 — `test: add LLVM IR acceptance corpus with expected-failure manifest`

- §5.7 corpus files + manifest + `corpus.test.ts`, running against the **old** parser.
- The 22 entries the old parser cannot reproduce carry `expectedToFail: { reason }` and
  run via `it.fails` with the same assertion body as passing entries. Establishes the
  baseline the rewrite must beat.
- Exit: suite green, failures documented in the manifest.

### Step 3 — `refactor: move Ohm LLVM parser to src/parser/llvm/legacy.ts`

- Mechanical move (llvm.ts → llvm/legacy.ts, llvm.ohm → llvm/llvm.ohm), new
  `llvm/index.ts` re-exporting legacy.
- No behavior change; all suites and imports untouched apart from the parser's own
  relative paths.
- Also delete the leftover thinking-aloud comment block in the moved file
  (old llvm.ts:325-333).

### Step 4 — `feat: add string-aware LLVM tokenizer`

- `tokenizer.ts` + suite §5.1. Pure, no consumers yet.

### Step 5 — `feat: add logical-line reader for LLVM IR`

- `logicalLines.ts` + suite §5.2. Implements §3.1 exactly.

### Step 6 — `feat: add LLVM line classifier`

- `classify.ts` + suite §5.3. Implements the §3.2 keyword table + top-level kinds.

### Step 7 — `feat: add LLVM instruction and terminator line parsers`

- `terminators.ts`, `instructions.ts`, `diagnostics.ts`, AST additions from §4 (except
  defs/uses) + suites §5.4, §5.5.
- Produces existing AST node shapes.

### Step 8 — `feat: assemble LLVM modules from classified lines`

- `module.ts` (state machine, blocks incl. §3.3 numbering, §3.4 error policy — including
  escalating the layer-1 unbalanced-`[` diagnostic, currently the reader's only
  diagnostic, to the §3.4 structural throw) + new-parser entry points in `llvm/parse.ts`
  (not yet exported by index).
- Temporarily point a copied run of the existing six compatibility suites at it, or
  parameterize those suites over both parsers — either way:
- Exit: **existing suites pass against the new parser**; corpus manifest passes with the
  22 `expectedToFail` flags removed locally (do not remove them in this commit).

### Step 9 — `feat!: switch LLVM mode to the line-oriented parser`

- `llvm/index.ts` exports the new implementation; delete the dual-run shim from step 8;
  delete the 22 corpus `expectedToFail` flags; update `errors.test.ts` per §3.4.
- **Rewrite `docs/internal/specs/llvm-ir.md`** (§2 unchanged sections, new §3
  terminators, §3.4 error policy, §3.3 numbering — every claim Pinned-by).
- Update graphBuilder for new terminators: invoke `to`/`unwind` edges, opaque-successor
  edges, unreachable/resume no-edge (+ graphBuilder tests).
- Exit: full unit + corpus green.

### Step 10 — `chore: remove Ohm LLVM grammar and legacy parser`

- Delete `legacy.ts`, `llvm.ohm`; `grammarCache.ts` stays (mermaid/selectionDAG).
- Exit: `npm run build` green, no `ohm` import remains under a `llvm` path.

### Step 11 — `feat: extract defs/uses on LLVM instructions`

- Type-alias table pass, per-opcode use extraction (phi/br label exclusion) filling
  `defs`/`uses` (§4) + suite §5.9.
- Spec section "Use-def foundation" marked as parser-only (no consumer).

### Step 12 — `docs: update user docs and E2E for LLVM version coverage`

- `docs/user/supported-formats.md`: accepted-version matrix from §3.5, error-recovery
  behavior.
- E2E scenario §5.10.
- Set this plan's Status to Complete with deviations noted.

Steps 4–7 are pure additions (old parser still serves the app), so the branch is safe to
pause at any commit; the only behavior-changing commits are 9 and 10.

## 7. Risks and mitigations

- **Implicit block numbering (§3.3) is the only genuinely tricky algorithm.** Mitigation:
  it is priority-ordered with the `; <label>:N` hint first (covers real 3.x–6.x output),
  the counter second, and a diagnosed fallback third — wrong numbering can only produce a
  _reported_ dangling edge, never a silently wrong CFG.
- **Existing tests may encode old-parser accidents** (e.g. exact `definition` whitespace).
  Handle case by case in step 8; if the new parser's output is more faithful to the source,
  prefer changing the test _and_ the spec sentence together, noting it in the step-9 commit.
- **`callee` extraction heuristics** (last `@x`/`%x` before the arg list) must keep working
  for old fn-pointer-type calls — covered explicitly in §5.5; do not "improve" the
  heuristic beyond what tests pin.
- **Scope creep toward full IR understanding.** The rule of thumb is: if neither the CFG
  nor defs/uses needs it, it stays raw text. Reviewers should push back on any grammar-like
  precision added elsewhere.

## 8. Follow-ups (out of this plan)

- Use-def chain graph view: new graphBuilder + registry consideration (likely a submode or
  toggle), its own plan document. Blocked on step 11 only.
- Surfacing `LLVMModule.diagnostics` in the editor UI (squiggles / banner).
- Def-use hover highlighting using the line numbers now present in the AST.
