# Contract: IR mode registry

- **Status:** Implemented (Phase 2, 2026-07-04)
- **Motivation:** see `docs/internal/plans/2026-07-refactoring-roadmap.md` — before Phase 2,
  adding a 4th IR required editing ~14 scattered call sites. This contract defines the single
  interface an IR mode must implement so that adding one only means adding one registry
  entry (plus the mode's own parser/AST/node-component files).

## The interface

Each IR mode is a single object implementing `IRModeDefinition` (`src/irModes/types.ts`):

```ts
interface IRModeDefinition {
  key: string; // e.g. "llvm-ir", "mermaid", "selectionDAG" — stable, used as the toolbar <Select> value
  label: string; // toolbar display label, e.g. "LLVM-IR"
  editorLanguage: string; // Monaco language id registered in CodeEditor
  defaultCode: string; // code shown when the mode is selected
  parse: (code: string) => GraphData; // text -> graph, throws Error on invalid input
  nodeTypes: Record<string, ComponentType<NodeProps>>; // this mode's React Flow node renderers
  edgeBuilder: IREdgeBuilder; // see below
  dagreOptions?: Partial<dagre.GraphLabel>; // e.g. SelectionDAG's { ranksep: 50 }
}
```

`IREdgeBuilder` (`src/utils/layout.ts`) captures the two things that differ between how LLVM/Mermaid
and SelectionDAG decide what an edge should look like:

```ts
interface IREdgeBuilder {
  classifyEdgeType(params: {
    edge: GraphEdge;
    sourcePos?: { x: number; y: number };
    targetPos?: { x: number; y: number };
    previousType?: string;
  }): string;
  buildReactFlowEdge(edge: GraphEdge, edgeType: string): Edge;
}
```

- LLVM/Mermaid (`codeGraphEdgeBuilder`) classify an edge as `"backEdge"` when it's a self-loop or the
  source node sits at or below the target node (control-flow back-edges), otherwise `"customBezier"`.
- SelectionDAG (`selectionDAGEdgeBuilder`) never reclassifies: it reuses `previousType` when present
  (so an edge's rendered style is stable across incremental updates) and otherwise defaults to
  `"customBezier"`. SelectionDAG edges connect specific operand/type Handles rather than generic
  node boundaries, so position-based back-edge detection doesn't apply.

All three current modes live in `src/irModes/`: `llvmMode.ts`, `mermaidMode.ts`,
`selectionDAGMode.ts`, aggregated by `src/irModes/index.ts` into `IR_MODES` (keyed map) and
`IR_MODE_LIST` (array, for iterating in the toolbar).

## What consumes the registry

- `App.tsx` / `useIRWorkspace` — looks up the active mode by key, calls `mode.parse(code)`,
  uses `mode.defaultCode` on mode switch and `mode.editorLanguage` for the editor.
- `useGraphData` — takes the full mode object into `updateGraph(graph, mode)` /
  `resetLayout()`, so layout and edge-building are mode-driven rather than branching by string.
- `GraphViewer` — merges `nodeTypes` from every entry in `IR_MODE_LIST` (plus the
  mode-agnostic fallback `codeNode`) instead of importing each mode's node components directly.

## Adding a 4th IR mode

1. Add the parser/AST/graphBuilder files for the new IR under `src/parser`, `src/ast`,
   `src/graphBuilder` (unchanged from before this contract — this part was never the problem).
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
