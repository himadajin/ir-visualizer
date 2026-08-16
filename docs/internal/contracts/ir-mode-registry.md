# Contract: IR mode registry

Everything that differs per IR (parser, default code, editor language, node components,
edge/layout behavior) is centralized in one registry entry per IR. Adding an IR means
adding one entry plus that IR's own parser/AST/graphBuilder/node-component files — never
editing scattered per-mode dispatch sites.

## The interface

Each IR mode is a single object implementing `IRModeDefinition` (`src/irModes/types.ts`):

```ts
interface IRModeDefinition {
  key: string; // e.g. "llvm-ir", "mermaid", "selectionDAG" — stable, used as the panel <Select> value
  label: string; // editor-panel display label, e.g. "LLVM-IR"
  editorLanguage: EditorLanguageId; // one of the declared editor languages — see below
  defaultCode: string; // code shown when the mode is selected
  parse: (code: string) => Promise<IRParseResult>; // text -> graph + diagnostics, rejects with Error on invalid input
  nodeTypes: Record<string, ComponentType<NodeProps>>; // this mode's React Flow node renderers
  edgeBuilder: IREdgeBuilder; // see below
  layoutOptions?: Record<string, string>; // ELK layout options, e.g. layer spacing
  bundleOf?: (edge: GraphEdge) => string | undefined; // see "Bundles" below
  views?: IRViewDefinition[]; // optional alternative projections — see "Views" below
}
```

## Parsing is asynchronous

`parse` returns a promise because a mode's parser may need to do async work before it can
produce a graph — Mermaid's upstream parser lazy-loads its diagram definitions
(`specs/mermaid.md`), and nothing in this contract should force a parser to be synchronous
just because two of the three current ones happen to be.

The rules:

- **Invalid input rejects with an `Error`.** A parser that detects the problem synchronously
  may simply `throw` inside its async function — that is the same thing. Callers see one
  failure shape.
- **The parser layer stays synchronous where the IR allows it.** `src/parser/**` exports the
  natural shape for its grammar; a mode whose parser is synchronous adapts it in its registry
  entry (`const parseCfg = async (code) => (await import("../parser/llvm")).parseLLVM(code)`)
  rather than making the parser lie about being async.
- **Stale results are discarded, not applied.** `useIRWorkspace` parses in a debounced effect;
  when the code, mode, or view changes while a parse is in flight, the effect's cleanup marks
  that parse cancelled and neither its graph, its diagnostics nor its error reaches state. A
  slow parse can therefore never overwrite the result of a newer one. This is the parse-stage
  counterpart of the layout generation counter in `useGraphData` (`specs/graph-view.md` §2);
  the two stages guard independently.
- **`parse` is not cancellable.** It takes no `AbortSignal` — the caller drops the result. No
  current parser can be interrupted mid-run, and adding a signal nothing honors would be
  indirection without a payer.
- **A mode's parser lives behind a lazy boundary.** The adapter `import()`s its parser module
  rather than importing it at the top of the registry entry, so a visitor fetches only the
  parser of the mode they selected. The registry entry itself stays eager — key, label,
  editor language, default code, node components and edge behavior are all needed before any
  parse happens. This is what makes the asynchrony pay for itself rather than merely wrapping
  a synchronous call, and it is a budgeted invariant: see `contracts/bundle-budget.md`.

## Editor language

`editorLanguage` names a TextMate grammar rather than an arbitrary string. The grammars the
app can highlight are declared once, in `src/irModes/editorLanguages.ts`, as a map from
Monaco language id to a dynamic import of that grammar; `EditorLanguageId` is the key type of
that map, so a mode cannot name a language whose grammar is not shipped.

Everything downstream is derived from that one declaration: `src/utils/highlighter.ts` builds
the single app-wide Shiki highlighter from it, and `CodeEditor` registers exactly those ids
with Monaco. Neither file mentions an IR. Two modes may share a language — SelectionDAG uses
`llvm` — and the grammar is loaded once.

The same highlighter renders code inside graph nodes (`HighlightedCode`). There is one
instance, not one per call site. `text` needs no entry: Shiki treats `text`/`plaintext` as
having no grammar.

## Recoverable diagnostics

Rejecting with an `Error` is how a parser reports that it produced **no graph**. A parser may
also produce a graph and still have something to say about the input: a line it recovered from
rather than understood. That is a second, non-fatal outcome, and `parse` carries it in the same
result rather than in a per-mode side channel:

```ts
interface IRParseResult {
  graph: GraphData; // what the layout stage consumes
  diagnostics?: IRParseDiagnostic[]; // recoverable problems; omitted when there are none
}

interface IRParseDiagnostic {
  line: number; // 1-based line in the editor text
  message: string; // one self-contained sentence, no severity prefix
}
```

The rules:

- **A diagnostic never implies failure.** A parse that returns diagnostics succeeded: the graph
  is applied and the error state clears exactly as for a clean parse. The two outcomes are
  disjoint — a rejected parse has no diagnostics, because it has no result at all.
- **The message carries no severity word.** The presentation layer owns that; the footer renders
  the `warning:` prefix (`specs/graph-view.md` §6.3).
- **`line` is 1-based and refers to the text that was parsed**, so it stays meaningful next to
  the editor. A recovery with no source line has no diagnostic to report.
- **Diagnostics belong to the parse, not to the graph.** They are not part of `GraphData`
  (`contracts/graph-data.md`): the layout stage never sees them, and a topology signature is
  unaffected by them.
- **Views of one mode may disagree.** Diagnostics are whatever the active view's `parse`
  returned. LLVM-IR's two views share a front-end and therefore report the same set, but nothing
  in this contract requires that.

Today only the LLVM-IR mode populates the field (`specs/llvm-ir.md` §3.4, from
`LLVMModule.diagnostics`); Mermaid and SelectionDAG return a bare `{ graph }`. The channel is
mode-agnostic so that the SelectionDAG case below can start reporting its skipped lines without
another contract change.

## Views

A mode may expose several **views** of the same text — e.g. LLVM-IR's CFG vs its
Use-Def dataflow graph (`specs/llvm-use-def-view.md`). A view is a projection:
same editor language, same default code, same parser front-end, different
`GraphData`.

```ts
interface IRViewDefinition {
  key: string; // stable, e.g. "cfg", "use-def"
  label: string; // toggle label, e.g. "CFG"
  parse: (code: string) => Promise<IRParseResult>; // same reject-on-invalid rule as the mode's parse
  edgeBuilder?: IREdgeBuilder; // defaults to the mode's edgeBuilder
  layoutOptions?: Record<string, string>; // defaults to the mode's layoutOptions
  bundleOf?: (edge: GraphEdge) => string | undefined; // defaults to the mode's bundleOf
}
```

Rules:

- `views` is optional. A mode without it has a single implicit view built from
  its top-level `parse`/`edgeBuilder`/`layoutOptions`/`bundleOf`.
- When present, `views` has ≥ 2 entries and `views[0]` is the **default view**;
  it must behave identically to the mode's top-level fields (share the same
  function references — don't duplicate logic). When `parse` is an async adapter
  around a synchronous parser, that adapter is a single module-level `const` used
  by both sites, not two `async` arrows that happen to have the same body.
- `useIRWorkspace` owns the active view key. Switching **views keeps the editor
  code** (that is the point of views); switching **modes resets** the view to the
  default and replaces the code with `defaultCode`.
- The editor panel renders a view `ToggleButtonGroup` only when the active mode has
  `views`.
- A mode's `nodeTypes` covers every view's node renderers (GraphViewer merges
  `nodeTypes` per mode, not per view).
- Because a view switch changes the topology signature, `useGraphData` does a
  full re-layout in each direction; positions are not preserved across view
  switches (`specs/graph-view.md` §2).

The layout-relevant half of a mode is named separately so a view-resolved value
can be passed wherever layout behavior is needed:

```ts
type IRLayoutBehavior = Pick<
  IRModeDefinition,
  "edgeBuilder" | "layoutOptions" | "bundleOf"
>;
```

`useGraphData.updateGraph(graph, behavior)` takes `IRLayoutBehavior` rather than
the full `IRModeDefinition`; a mode object satisfies it structurally, and the
workspace passes the active view's resolved `edgeBuilder`/`layoutOptions`/`bundleOf`.

`IREdgeBuilder` (`src/utils/layout.ts`) captures how a mode turns a `GraphEdge`
into a React Flow edge:

```ts
interface IREdgeBuilder {
  buildReactFlowEdge(edge: GraphEdge): Edge;
}
```

- LLVM/Mermaid (`codeGraphEdgeBuilder`) build `type: "routed"` edges; the ELK layout
  attaches each edge's back-edge flag to `edge.data` afterwards (derived from the final
  layout geometry, not chosen by the builder), and the edge's geometry is computed at
  render time from the live node rectangles (`specs/graph-view.md` §4). A builder
  therefore contributes no geometry at all.
- SelectionDAG (`selectionDAGEdgeBuilder`) builds React Flow built-in `default` (bezier)
  edges connecting specific operand/type Handles; routing does not apply to them.

All three current modes live in `src/irModes/`: `llvmMode.ts`, `mermaidMode.ts`,
`selectionDAGMode.ts`, aggregated by `src/irModes/index.ts` into `IR_MODES` (keyed map) and
`IR_MODE_LIST` (array, for iterating in the editor panel).

## Bundles

Whether two edges may be drawn on top of one another is decided by whether they carry the
same value (`specs/graph-view.md` §4). "The same value" is an IR-level question that the
router cannot answer and must not try to — so it belongs here, answered once per mode.

`bundleOf` maps an edge to the id of the bundle it belongs to, or `undefined` for none.
Two edges may share geometry exactly when it returns the same defined id for both.
`undefined` is a bundle of one rather than a wildcard: an edge outside every bundle must
stay separate from everything.

| mode / view       | `bundleOf`              | why                                                                                           |
| ----------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| LLVM-IR · Use-Def | `(edge) => edge.source` | the out-edges of one instruction node are the uses of that node's single def — one SSA value  |
| LLVM-IR · CFG     | omitted                 | conditional successors are mutually exclusive alternatives with distinct labels, not one flow |
| Mermaid           | omitted                 | an edge is a user-authored relation; the language has no notion of a value being carried      |
| SelectionDAG      | omitted                 | not routed at all — bezier edges on operand handles                                           |

Use-Def keys on the source **node** because an instruction node has exactly one def. An IR
whose nodes expose several def ports would key on the port instead
(`` `${edge.source}:${edge.sourceHandle}` ``); that is a change to one mode's `bundleOf`,
not to this contract.

`bundleOf` is view-resolved like `edgeBuilder`/`layoutOptions` and travels with them in
`IRLayoutBehavior` — LLVM-IR is the case that needs this, since its two views disagree.
`getLayoutedElements` applies it once when it builds the React Flow edges, stamping the
result on `data.bundleId`; `useEdgeRoutes` copies that onto `RouteRequest.bundleId`
(`contracts/edge-routing.md`). The registry is therefore consulted at build time only —
nothing on the render path asks a mode a question.

**Status: declared here, not yet in `src/irModes/types.ts`.** The field and the Use-Def
implementation land with #88; the router-side guarantee it feeds lands with #86.

## What consumes the registry

- `App.tsx` / `useIRWorkspace` — looks up the active mode by key, awaits `mode.parse(code)`
  in the debounced parse effect (discarding the result if it is stale, see "Parsing is
  asynchronous"), hands `result.graph` to `useGraphData` and `result.diagnostics` to the status
  footer, uses `mode.defaultCode` on mode switch and `mode.editorLanguage` for the editor.
- `useGraphData` — takes an `IRLayoutBehavior` into `updateGraph(graph, behavior)` /
  `applyLayout(sizes)`, so layout, edge-building and bundling are mode- (or view-) driven rather
  than branching by string.
- `GraphViewer` — merges `nodeTypes` from every entry in `IR_MODE_LIST` (plus the
  mode-agnostic `codeNode` fallback and the generic `graphGroup` container) instead of
  importing each mode's node components directly.
- `CodeEditor` / `src/utils/highlighter.ts` — consume `src/irModes/editorLanguages.ts` (see
  "Editor language"), never `IR_MODE_LIST`, so neither is coupled to how many IRs exist.

## Adding a 4th IR mode

1. Add the parser/AST/graphBuilder files for the new IR under `src/parser`, `src/ast`,
   `src/graphBuilder`.
2. Add the mode's node component(s) under `src/components/Graph/<NewMode>/`.
3. If the IR needs an editor language the app does not ship yet, add it to
   `src/irModes/editorLanguages.ts`. Reusing an existing one (as SelectionDAG reuses `llvm`)
   needs no change there.
4. Write `src/irModes/newMode.ts` implementing `IRModeDefinition`. Have `parse` `import()` the
   parser rather than importing it at the top of the file (see "Parsing is asynchronous").
   Reuse `codeGraphEdgeBuilder` unless the new IR needs custom edge semantics like
   SelectionDAG. Declare `bundleOf` only if the IR has same-value fan-out (see Bundles);
   omitting it means no two of its edges may overlap, which is the right answer for a
   control-flow graph.
5. Add the new entry to `IR_MODES`/`IR_MODE_LIST` in `src/irModes/index.ts`.

No other file should need to change. If it does, that's a signal the registry contract has a gap.

## Known behavior difference not covered by this contract

SelectionDAG's `parse` (`parseSelectionDAGToGraphData`) tolerates unparseable lines by treating
them as comments rather than failing, because real SelectionDAG dumps mix a free-text header line
with the actual `tN: ... = ...` node lines. This is intentional per-line tolerance, not a violation
of the "`parse` rejects with `Error` on invalid input" rule above — the SelectionDAG grammar's unit
of parsing is a line, and a "failure" for one line does not fail the whole `parse` call. LLVM and
Mermaid parse the entire input as one document and do fail on invalid input. See
`src/parser/selectionDAG.ts` for the code-level comment.

A skipped line is exactly the "recovered from rather than understood" case that
`IRParseResult.diagnostics` exists for, so this difference is now reportable rather than
structurally invisible. The mode does not report it yet.
