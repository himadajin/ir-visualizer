# Spec: LLVM-IR Use-Def view

Behavior specification for the Use-Def projection of LLVM-IR — the second view
of the `llvm-ir` mode (`views: [cfg, use-def]`), selected by the editor panel's view
toggle. Input syntax is unchanged from `specs/llvm-ir.md`; this spec covers only
the AST → `GraphData` conversion performed by
`src/graphBuilder/llvmUseDefGraphBuilder.ts`, which consumes the §3.5
`defs`/`uses` fields.

Conventions: unless noted otherwise, every normative statement in this spec is pinned by
`src/graphBuilder/__tests__/llvm/useDefGraph.test.ts`. Statements marked
_observed, untested_ describe current behavior with no covering test.

## 1. What the view shows

SSA dataflow, per function: one node per instruction line that participates in
dataflow, one edge per (defining line → reading line) relationship. The graph is
**flat** — no container nodes and no `parentId` (`contracts/graph-data.md`) — so ELK's
layered layout ranks instruction nodes directly by their use-def edges and vertical
position means dataflow depth. Basic-block membership is carried on the instruction node
itself as a colored badge (§2), not by geometry.

Control flow is **not** shown: a `br` contributes at most the read of its
condition, never an edge to another block. Module-level items that never
participate in SSA dataflow — globals, metadata, attribute groups, declarations,
targets, debug records — produce **no nodes**.

## 2. Nodes

Ids follow the shared grammar of `specs/llvm-ir.md` §4.1 and sit under the same
`func:<name>` prefix as the CFG builder's, so identical block labels or value names
across functions cannot collide, and the two views namespace identically.

### 2.1 Instruction nodes

`nodeType: "llvm-useDefInstruction"`, id `func:<name>:ud:<blockId>:<n>` where
`n` is the 0-based index of the line among the lines its block actually emits,
in program order.

One node per instruction **and** per terminator **that participates in
dataflow** — that is, whose `defs` or `uses` is non-empty. A line with an empty
`defs` **and** an empty `uses` gets **no node**: an unconditional `br label %x`,
a `ret void`, or an `unreachable` would otherwise be an isolated dot with no
incident edge.

Debug records (`#dbg_*`) and the §3.4 synthetic empty terminator (no source
line, `originalText === ""`, no `defs`/`uses`) never produce a node.

`astData` is
`{ text, def, uses, isTerminator, blockLabel, blockIndex }`:

| Field          | Value                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`         | the line's `originalText`                                                                                                                   |
| `def`          | the §3.5 def name (sigil-free), or `null` when the line defines nothing                                                                     |
| `uses`         | the §3.5 use names (sigil-free, deduplicated) — drives the per-operand target ports (§4)                                                    |
| `isTerminator` | whether the line is the block's terminator                                                                                                  |
| `blockLabel`   | the block's **display** label: `"entry"` for a first block whose label is `null`, otherwise the block's label, falling back to its block id |
| `blockIndex`   | the block's 0-based position within its function, in AST block order — a rendering input for the badge tint (§4), not a semantic ordering   |

### 2.2 Value nodes

`nodeType: "llvm-useDefValue"`, `astData: { name, kind, paramType? }`:

- `kind: "argument"` — one per **named** function parameter, id
  `func:<name>:udarg:<value name>`, emitted whether or not the parameter is used;
  `paramType` is the parameter's raw type text. Unnamed parameters get no node
  (the parser leaves `name: null`); a body referring to an implicit `%0`-style
  parameter name resolves as `external` instead.
- `kind: "external"` — created **lazily** for a `uses` entry whose name has no
  known def in the function (degraded parses, undefined names, implicit
  parameter names), id `func:<name>:udext:<value name>`. Use extraction is heuristic
  (§3.5), so edge construction must be total rather than throwing on an
  unresolved name.

## 3. Edges

For every emitted node `N` and every name `v` in `N.uses`, one edge from the
node that defines `v` — the instruction node whose `def` is `v`, else the
argument value node for `v`, else a lazily created external value node — to `N`.

- `id`: `edge:<sourceId>:<targetId>:<v>` (`specs/llvm-ir.md` §4.1).
- `targetHandle`: `"u-<v>"` — the edge lands on the target card's per-operand
  port for `v` (§4). Sources use the defining node's single source handle.
- **No label.** The defined name is already visible in the source node's text.
  Only phi edges are labeled (§3.1).
- `uses` is already deduplicated per line (§3.5), so a line reading `%v` twice
  gets one edge.
- Self-reference cannot occur: §3.5 excludes a line's own def from its `uses`.
- Terminators participate on both sides: `br`/`switch` conditions and `ret`
  values are uses; `invoke`/`callbr` results are defs that source edges into
  other blocks.

### 3.1 phi edges

For a `phi` line, the incoming `[ value, %block ]` pairs are re-extracted
**textually** from `originalText`: the AST keeps phi generic (`specs/llvm-ir.md`
§5) and `src/graphBuilder` must not import from `src/parser`, so the builder
scans the text itself.

An edge whose value name appears as a local incoming value gets `dashed: true`
and the label `%v (%bb)` naming the incoming block. When the same value arrives
from several blocks it is still one edge, and the label lists them:
`%v (%bb1, %bb2)`. Constant incoming values (e.g. `[ 0, %7 ]`) contribute no
edge — they are not in `uses`.

Quoted local names inside phi incoming lists are not matched by the textual scan
and fall back to a plain (solid, unlabeled) edge — _observed, untested_.

## 4. Layout and rendering behavior

- `GraphData.direction` is `"TD"`, and **no node carries `parentId`** — the view
  deliberately produces a flat graph so that the layered layout's ranking is the
  dataflow order (§1).
- The view supplies its own `layoutOptions` (_observed, untested_) and reuses
  the standard `codeGraphEdgeBuilder`: edge geometry comes from the live
  orthogonal router (`specs/graph-view.md` §4), not from ELK, and a loop-carried
  phi edge — whose source ends up at or below its target — is flagged and styled
  as a back edge from the final layout geometry without any special casing here.
- **Per-operand ports**: an instruction card exposes one target `Handle`
  (id `u-<name>`) per entry in `uses`, horizontally positioned at the first
  occurrence of `%name` in the monospace text (measured with the same
  `getFontMetrics` char width the size estimator uses, shifted right by the
  inline badge's width plus its gap), on the card's top edge; and a source
  `Handle` under the `def` name on the bottom edge. A name that cannot be
  located in the text falls back to the default centered handle. The layout
  declares the same offsets as ELK `FIXED_POS` ports so routed edges aim at the
  exact operand slot — a phi's incoming edges visibly land on their own
  `[ %v, %bb ]` operands. _(observed, untested — visual)_
- Instruction nodes render as single-row code cards: a block badge chip showing
  `blockLabel` sits inline to the **left** of the code line, tinted from an
  8-color muted palette indexed by `blockIndex % 8`. The badge is what preserves
  the CFG correspondence in the absence of containers.
  _(observed, untested — visual, covered by Storybook stories only)_
- Value nodes render as pills; `argument` and `external` are styled differently
  so a dangling reference is visibly not a parameter.
  _(observed, untested — visual)_
- `dashed` edges render with a dash pattern via the standard edge factory
  (`contracts/graph-data.md`).

## 5. Non-goals

- Control flow. It is the CFG view's job; this view drops edgeless terminators
  entirely (§2.1).
- Memory dependence (store→load) — out of scope permanently (§3.5).
- Cross-function dataflow (call argument → parameter linking).
- Use-def edges overlaid on the CFG view.
- Visual grouping of a block's instructions.
