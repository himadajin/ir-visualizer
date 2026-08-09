# Plan: LLVM-IR Use-Def graph view

- **Status:** In progress (2026-08-09)
- **Depends on:** the §3.5 use-def foundation of `docs/internal/specs/llvm-ir.md`
  (parser-only `defs`/`uses` fields, implemented by
  `plans/2026-07-llvm-line-oriented-parser.md` step 11). This plan builds the
  consumer that §3.5 explicitly deferred.

## 1. Goal

Add a second way to look at LLVM-IR: a **use-def graph** showing SSA dataflow
(which instruction defines each value, which instructions read it), next to the
existing CFG view. The parser already attaches `defs`/`uses` to every
instruction and terminator; this plan adds the graphBuilder, the registry
support for multiple views, the node components, and the UI entry point that
consume them. No parser changes.

The graph is **flat**: instruction nodes are ranked directly by their use-def
edges, so vertical position means dataflow depth. Basic-block membership is
carried by a colored badge on each instruction node instead of by a container.

## 2. Prototype retrospective

A prototype (branch `claude/llvm-ir-use-def-graph-j6y5fs`, not merged) built the
same view with **one React Flow container node per basic block** and a compound
layout path in `src/utils/layout.ts`. It is the reason this plan exists, and the
reason the design changed:

- **Dimension estimation drift.** Container size was computed from the estimated
  dimensions of its stacked children (`converter.ts`'s character-count
  estimation, §5 of `specs/graph-view.md`). Estimates are close enough for
  spacing between free-standing nodes, but a container is a hard boundary: when
  the real rendered children are taller or wider than the estimate, the parent
  is already too small.
- **`extent: "parent"` clamping cascades.** React Flow then clamps every child
  back inside the undersized parent, so children pile up on the parent's edge
  and overlap each other. The failure is visual, not thrown, and it gets worse
  the longer the instruction text is — i.e. on exactly the real-world input the
  view is for.
- **Dagre ranks containers, not dataflow.** With containers as the top-level
  nodes, child-to-child edges have to be lifted to the container level for
  ranking, and intra-block edges are dropped from ranking entirely. The
  resulting vertical order expresses block order, not dataflow depth — which
  discards the main thing a use-def view is supposed to show. Program order
  inside a block is _a_ topological order of its dataflow, but it is not the
  one a reader wants: chains that fan out across blocks get no rank at all.

Compound layout is therefore **rejected**: no container nodes, no `parentId`, no
`extent: "parent"`, no compound path in `layout.ts`. Revisiting grouping with a
layout engine that supports it natively (ELK) is possible future work (§9), not
part of this plan.

The prototype's non-layout parts were sound and are carried over: the view
toggle as the UI entry point, the `views?` registry extension, the lazy external
value nodes, and the textual phi-incoming extraction.

## 3. Decisions (settled up front)

| Question                  | Decision                                                                                                                          | Why                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI entry point            | **View toggle inside the LLVM-IR mode** (CFG / Use-Def), not a 4th registry mode                                                  | Same text, same parser, different projection. A separate mode would reset the editor to `defaultCode` on switch (`useIRWorkspace.changeMode`), losing the code the user was looking at.    |
| Registry impact           | Extend `IRModeDefinition` with optional `views` (§4)                                                                              | The registry contract has no multi-view concept today; extending the contract beats a mode-key special case in the toolbar. Modes without `views` are untouched.                           |
| Graph shape               | **Flat.** No containers, no `parentId`; Dagre ranks instruction nodes directly by use-def edges                                   | Rank then equals dataflow depth, which is the point of the view. Avoids the estimation/clamping failure of §2 entirely.                                                                    |
| Block correspondence      | A **block badge** on each instruction node: the block's display label, tinted from an 8-color muted palette cycled by block index | Keeps the CFG correspondence readable without a geometric container. Color survives the flat layout scattering a block's instructions across ranks.                                        |
| Node granularity          | One node per instruction/terminator line **that participates in dataflow**                                                        | SSA: each value has exactly one defining line, so instruction nodes double as value nodes. A line with empty `defs` and empty `uses` (`br label %x`, `ret void`) would be an isolated dot. |
| Edge labels               | Plain use-def edges are **unlabeled**; only phi edges carry a label                                                               | The defined name is already visible in the source node's text, so `%v` on the edge is redundant clutter at the density this view produces.                                                 |
| Function arguments        | Synthetic value nodes (one per named parameter), plus the same shape for dangling references                                      | Arguments have no defining instruction; without a source node their flow is invisible. Dangling refs (degraded parses, undefined names) reuse the shape so edge construction stays total.  |
| phi edges                 | Dashed, labeled `%v (%bb)` with the incoming block(s)                                                                             | phi incoming values are cross-iteration/cross-path flow; visually separating them makes loops legible, and the incoming block is not otherwise recoverable from the graph.                 |
| Non-function module items | Omitted from the use-def view (globals, metadata, attribute groups, declarations, targets, debug records)                         | `uses` are SSA locals only (§3.5); those items never participate.                                                                                                                          |

## 4. Registry contract extension (`contracts/ir-mode-registry.md`)

```ts
/** One selectable projection of a mode's text (e.g. LLVM's CFG vs Use-Def). */
interface IRViewDefinition {
  key: string; // stable, e.g. "cfg", "use-def"
  label: string; // toggle label, e.g. "CFG"
  parse: (code: string) => GraphData;
  edgeBuilder?: IREdgeBuilder; // defaults to the mode's
  dagreOptions?: Partial<dagre.GraphLabel>; // defaults to the mode's
}

interface IRModeDefinition {
  // ...existing fields...
  /**
   * Optional alternative projections. When present: >= 2 entries, views[0]
   * is the default and MUST behave identically to the mode's top-level
   * parse/edgeBuilder/dagreOptions (share the function references).
   */
  views?: IRViewDefinition[];
}
```

- `useIRWorkspace` gains `viewKey` state. Switching views keeps the editor code
  (that is the whole point); switching modes resets `viewKey` to the default
  view. The active view supplies `parse`, `edgeBuilder`, `dagreOptions`.
- `useGraphData.updateGraph`'s second parameter narrows from `IRModeDefinition`
  to an `IRLayoutBehavior = Pick<IRModeDefinition, "edgeBuilder" | "dagreOptions">`
  so the workspace can pass view-resolved behavior. Existing callers satisfy the
  narrower type structurally.
- `ToolbarPane` shows a CFG/Use-Def `ToggleButtonGroup` only when the active mode
  has `views`.
- A view switch changes the topology signature, so `useGraphData` performs a full
  re-layout in each direction. Positions are not preserved across view switches;
  this is accepted (documented in `specs/graph-view.md`).

## 5. GraphData extension (`contracts/graph-data.md`)

- `GraphEdge` gains `dashed?: boolean` — rendered as `strokeDasharray` by the
  standard edge factory. Used by phi edges; mode-agnostic on purpose.
- `GraphNodeBase` is **unchanged** (no `parentId`, per §2).
- Two new `nodeType` variants (astData shapes live in `src/ast/llvmAST.ts` next
  to `LLVMFunctionHeaderData`, which set the precedent for view-data shapes):
  - `llvm-useDefInstruction` /
    `LLVMUseDefInstructionData { text, def, isTerminator, blockLabel, blockIndex }`.
  - `llvm-useDefValue` /
    `LLVMUseDefValueData { name, kind: "argument" | "external", paramType? }`.

## 6. Graph construction (`src/graphBuilder/llvmUseDefGraphBuilder.ts`)

New spec: `docs/internal/specs/llvm-use-def-view.md` (normative rules + pinning
tests). Summary:

- Per function: one value node per named parameter; one instruction node per
  instruction and terminator that has a non-empty `defs` or `uses`; all ids
  namespaced by function with the CFG builder's `func_<name>` prefix.
- A def map (parameter name / instruction def → node id) resolves each `uses`
  entry to its source node; an unresolved name lazily creates an `external`
  value node.
- One edge per (def node → using node, value) triple, unlabeled.
- phi lines: incoming `[ value, %block ]` pairs are re-extracted from
  `originalText` (textual scan; the AST keeps phi generic per `specs/llvm-ir.md`
  §5 "phi instructions do not contribute edges"). A use matching an incoming
  value gets `dashed: true` and label `%v (%bb)`. `src/graphBuilder` must not
  import from `src/parser` (layering rule), hence the textual scan.
- `direction: "TD"`; the view supplies its own `dagreOptions`.

## 7. Components (`src/components/Graph/LLVM/UseDef/`)

- `LLVMUseDefInstructionNode` — a code card: the instruction text plus a block
  badge chip (`blockLabel`, tinted by `blockIndex % 8`), top target handle,
  bottom source handle.
- `LLVMUseDefValueNode` — a pill showing `%name` (+ parameter type when known),
  source handle only; `argument` and `external` are styled differently so a
  dangling reference is visibly not a parameter.
- Colocated `*.stories.tsx` for each, per Storybook convention.

## 8. Steps

1. Docs first: this plan; contract updates (`ir-mode-registry.md`,
   `graph-data.md`); new `specs/llvm-use-def-view.md`; `specs/llvm-ir.md` §3.5
   "no consumer yet" note updated; `specs/graph-view.md` view-toggle behavior;
   `architecture.md` registry line; `docs/user/supported-formats.md`.
2. Types: `IRViewDefinition`, `views?`, `IRLayoutBehavior`; `dashed`; the two new
   astData shapes + `GraphNode` union variants.
3. graphBuilder + unit tests
   (`src/graphBuilder/__tests__/llvm/useDefGraph.test.ts`).
4. Edge factory: honor `dashed` in `converter.ts`.
5. Node components + stories.
6. Registry entry (`llvmMode.views`), workspace/toolbar wiring, `updateGraph`
   signature narrowing.
7. Integration test additions; E2E: toggle to Use-Def in the smoke suite and
   assert instruction nodes appear.
8. `npm run test:run`, `format`, `lint`, `build`.

## 9. Non-goals

- Memory dependence (store→load) — permanently out of scope per §3.5.
- Cross-function dataflow (call argument → parameter linking).
- Views for Mermaid/SelectionDAG (single-view modes stay as they are).
- Overlaying use-def edges on the CFG view (the "hybrid" idea).
- Visual grouping of a block's instructions. Containers are rejected for Dagre
  (§2); revisiting this with ELK, which supports hierarchical layout natively,
  is possible future work.
