# Spec: LLVM-IR Use-Def view

Behavior specification for the Use-Def projection of LLVM-IR — the second view
of the `llvm-ir` mode (`views: [cfg, use-def]`), selected by the toolbar's view
toggle. Input syntax is unchanged from `specs/llvm-ir.md`; this spec covers only
the AST → `GraphData` conversion performed by
`src/graphBuilder/llvmUseDefGraphBuilder.ts`, which consumes the §3.5
`defs`/`uses` fields (the consumer that §3.5 deferred).

Conventions: every normative statement carries a **Pinned by** reference to the
test(s) that fix the behavior. Unqualified test names refer to
`src/graphBuilder/__tests__/llvm/useDefGraph.test.ts`. Statements marked
_observed, untested_ describe current behavior with no covering test.

Plan: `docs/internal/plans/2026-08-llvm-use-def-view.md`.

## 1. What the view shows

SSA dataflow, per function: one node per instruction line that participates in
dataflow, one edge per (defining line → reading line) relationship. The graph is
**flat** — there are no container nodes and no `parentId`, so Dagre ranks
instruction nodes directly by their use-def edges and vertical position means
dataflow depth. Basic-block membership is carried on the instruction node itself
as a colored badge (§2), not by geometry.

Control flow is **not** shown: a `br` contributes at most the read of its
condition, never an edge to another block. Module-level items that never
participate in SSA dataflow — globals, metadata, attribute groups, declarations,
targets, debug records — produce **no nodes**.

> Pinned by: "module-level items produce no nodes"

## 2. Nodes

All ids are namespaced by function, using the same `func_<name>` prefixing
convention as the CFG builder, so identical block labels or value names across
functions cannot collide. Quoted identifiers are an exception: `uniqueId`
strips only the sigil (`@`/`%`) and surrounding quotes, so a quoted name whose
_contents_ include `@`, `%`, or `"` can still collide with an unrelated name
after stripping (e.g. `@"a@b"` and `@ab` both prefix to `func_ab`) — a
pre-existing encoding gap shared with the CFG builder (`llvmGraphBuilder.ts`);
fixing it is follow-up work outside this spec (_observed, untested_).

> Pinned by: "node and edge ids stay unique across functions with identical
> labels, defs, params, and external names" (instruction, argument, external
> node ids and edge ids together, across functions); per-node-type
> namespacing is further pinned in §2.1 and §2.2.

### 2.1 Instruction nodes

`nodeType: "llvm-useDefInstruction"`, id `<funcPrefix>_ud_<blockId>_i<n>` where
`n` is the 0-based index of the line among the lines its block actually emits,
in program order.

One node per instruction **and** per terminator **that participates in
dataflow** — that is, whose `defs` or `uses` is non-empty. A line with an empty
`defs` **and** an empty `uses` gets **no node**: an unconditional `br label %x`,
a `ret void`, or an `unreachable` would otherwise be an isolated dot with no
incident edge.

> Pinned by: "one node per instruction with defs or uses",
> "lines with neither defs nor uses get no node",
> "terminators that read or define values get nodes"

Debug records (`#dbg_*`) and the §3.4 synthetic empty terminator (no source
line, `originalText === ""`, no `defs`/`uses`) never produce a node.

> Pinned by: "debug records and the synthetic empty terminator get no node"

`astData` is
`{ text, def, isTerminator, blockLabel, blockIndex }`:

| Field          | Value                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`         | the line's `originalText`                                                                                                                   |
| `def`          | the §3.5 def name (sigil-free), or `null` when the line defines nothing                                                                     |
| `isTerminator` | whether the line is the block's terminator                                                                                                  |
| `blockLabel`   | the block's **display** label: `"entry"` for a first block whose label is `null`, otherwise the block's label, falling back to its block id |
| `blockIndex`   | the block's 0-based position within its function, in AST block order                                                                        |

`blockIndex` exists to drive the badge tint (§4); it is a rendering input, not a
semantic ordering claim.

> Pinned by: "instruction node ids are namespaced per function",
> "instruction astData carries text, def and isTerminator",
> "blockLabel is entry for the unlabeled entry block",
> "blockIndex is the block's position in its function"

### 2.2 Value nodes

`nodeType: "llvm-useDefValue"`, `astData: { name, kind, paramType? }`:

- `kind: "argument"` — one per **named** function parameter, id
  `<funcPrefix>_udarg_<name>`, emitted whether or not the parameter is used;
  `paramType` is the parameter's raw type text. Unnamed parameters get no node
  (the parser leaves `name: null`); a body referring to an implicit `%0`-style
  parameter name resolves as `external` instead.
- `kind: "external"` — created **lazily** for a `uses` entry whose name has no
  known def in the function (degraded parses, undefined names, implicit
  parameter names), id `<funcPrefix>_udext_<name>`. Use extraction is heuristic
  (§3.5), so edge construction must be total rather than throwing on an
  unresolved name.

> Pinned by: "one argument node per named parameter",
> "unnamed parameters get no argument node",
> "external value node for names with no known def"

## 3. Edges

For every emitted node `N` and every name `v` in `N.uses`, one edge from the
node that defines `v` — the instruction node whose `def` is `v`, else the
argument value node for `v`, else a lazily created external value node — to `N`.

- `id`: `e-<sourceId>-<targetId>-<v>`.
- **No label.** The defined name is already visible in the source node's text,
  so a `%v` label would be redundant. Only phi edges are labeled (§3.1).
- `uses` is already deduplicated per line (§3.5), so a line reading `%v` twice
  gets one edge.
- Self-reference cannot occur: §3.5 excludes a line's own def from its `uses`.
- Terminators participate on both sides: `br`/`switch` conditions and `ret`
  values are uses; `invoke`/`callbr` results are defs that source edges into
  other blocks.

> Pinned by: "one edge per use, from the defining node",
> "plain use-def edges carry no label", "edge ids embed the value name",
> "a value read twice on one line gets one edge",
> "uses of parameters connect to the argument node"

### 3.1 phi edges

For a `phi` line, the incoming `[ value, %block ]` pairs are re-extracted
**textually** from `originalText`: the AST keeps phi generic (`specs/llvm-ir.md`
§5, "phi instructions do not contribute edges") and `src/graphBuilder` must not
import from `src/parser`, so the builder scans the text itself.

An edge whose value name appears as a local incoming value gets `dashed: true`
and the label `%v (%bb)` naming the incoming block. When the same value arrives
from several blocks it is still one edge, and the label lists them:
`%v (%bb1, %bb2)`. Constant incoming values (e.g. `[ 0, %7 ]`) contribute no
edge — they are not in `uses`.

Quoted local names inside phi incoming lists are not matched by the textual scan
and fall back to a plain (solid, unlabeled) edge — _observed, untested_.

> Pinned by: "phi incoming edges are dashed and labeled with the incoming block",
> "a value arriving from several blocks gets one edge listing them",
> "constant phi incoming values contribute no edge"

## 4. Layout and rendering behavior

- `GraphData.direction` is `"TD"`, and **no node carries `parentId`** — the view
  deliberately produces a flat graph so that Dagre's ranking is the dataflow
  order (see the plan's §2 retrospective for why containers were rejected).
- The view supplies its own `dagreOptions` (_observed, untested_) and reuses the
  standard `codeGraphEdgeBuilder`: back edges are classified from vertical
  position, so a loop-carried phi edge — whose source sits at or below its
  target — renders as a back edge without any special casing.
- Instruction nodes render as code cards with a block badge chip showing
  `blockLabel`, tinted from an 8-color muted palette indexed by
  `blockIndex % 8`. The badge is what preserves the CFG correspondence in the
  absence of containers.
- Value nodes render as pills; `argument` and `external` are styled differently
  so a dangling reference is visibly not a parameter.
- `dashed` edges render with a dash pattern via the standard edge factory
  (`contracts/graph-data.md`).

> Pinned by: "direction is TD", "no node carries parentId"; the rendering
> details are _observed, untested_ (visual, covered by Storybook stories only).

## 5. Non-goals

- Control flow. It is the CFG view's job; this view drops edgeless terminators
  entirely (§2.1).
- Memory dependence (store→load) — out of scope permanently (§3.5).
- Cross-function dataflow (call argument → parameter linking).
- Use-def edges overlaid on the CFG view.
- Visual grouping of a block's instructions (see the plan's §9).
