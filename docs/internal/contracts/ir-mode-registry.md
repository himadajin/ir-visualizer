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
  editorLanguage: string; // Monaco language id registered in CodeEditor
  defaultCode: string; // code shown when the mode is selected
  parse: (code: string) => GraphData; // text -> graph, throws Error on invalid input
  nodeTypes: Record<string, ComponentType<NodeProps>>; // this mode's React Flow node renderers
  edgeBuilder: IREdgeBuilder; // see below
  layoutOptions?: Record<string, string>; // ELK layout options, e.g. layer spacing
  views?: IRViewDefinition[]; // optional alternative projections — see "Views" below
}
```

## Views

A mode may expose several **views** of the same text — e.g. LLVM-IR's CFG vs its
Use-Def dataflow graph (`specs/llvm-use-def-view.md`). A view is a projection:
same editor language, same default code, same parser front-end, different
`GraphData`.

```ts
interface IRViewDefinition {
  key: string; // stable, e.g. "cfg", "use-def"
  label: string; // toggle label, e.g. "CFG"
  parse: (code: string) => GraphData; // same throw-on-invalid rule as the mode's parse
  edgeBuilder?: IREdgeBuilder; // defaults to the mode's edgeBuilder
  layoutOptions?: Record<string, string>; // defaults to the mode's layoutOptions
}
```

Rules:

- `views` is optional. A mode without it has a single implicit view built from
  its top-level `parse`/`edgeBuilder`/`layoutOptions`.
- When present, `views` has ≥ 2 entries and `views[0]` is the **default view**;
  it must behave identically to the mode's top-level fields (share the same
  function references — don't duplicate logic).
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
type IRLayoutBehavior = Pick<IRModeDefinition, "edgeBuilder" | "layoutOptions">;
```

`useGraphData.updateGraph(graph, behavior)` takes `IRLayoutBehavior` rather than
the full `IRModeDefinition`; a mode object satisfies it structurally, and the
workspace passes the active view's resolved `edgeBuilder`/`layoutOptions`.

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

## What consumes the registry

- `App.tsx` / `useIRWorkspace` — looks up the active mode by key, calls `mode.parse(code)`,
  uses `mode.defaultCode` on mode switch and `mode.editorLanguage` for the editor.
- `useGraphData` — takes an `IRLayoutBehavior` into `updateGraph(graph, behavior)` /
  `resetLayout()`, so layout and edge-building are mode- (or view-) driven rather than
  branching by string.
- `GraphViewer` — merges `nodeTypes` from every entry in `IR_MODE_LIST` (plus the
  mode-agnostic fallback `codeNode`) instead of importing each mode's node components directly.

## Adding a 4th IR mode

1. Add the parser/AST/graphBuilder files for the new IR under `src/parser`, `src/ast`,
   `src/graphBuilder`.
2. Add the mode's node component(s) under `src/components/Graph/<NewMode>/`.
3. Write `src/irModes/newMode.ts` implementing `IRModeDefinition`. Reuse `codeGraphEdgeBuilder`
   unless the new IR needs custom edge semantics like SelectionDAG.
4. Add the new entry to `IR_MODES`/`IR_MODE_LIST` in `src/irModes/index.ts`.

No other file should need to change. If it does, that's a signal the registry contract has a gap.

## Known behavior difference not covered by this contract

SelectionDAG's `parse` (`parseSelectionDAGToGraphData`) tolerates unparseable lines by treating
them as comments rather than throwing, because real SelectionDAG dumps mix a free-text header line
with the actual `tN: ... = ...` node lines. This is intentional per-line tolerance, not a violation
of the "`parse` throws `Error` on invalid input" rule above — the SelectionDAG grammar's unit of
parsing is a line, and a "failure" for one line does not fail the whole `parse` call. LLVM and
Mermaid parse the entire input as one document and do throw on failure. See
`src/parser/selectionDAG.ts` for the code-level comment.
