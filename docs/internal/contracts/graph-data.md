# Contract: GraphData / GraphNode.astData

- **Status:** Implemented (Phase 2, 2026-07-04)
- **Motivation:** `GraphNode.astData` was `Record<string, any>`, forcing
  `astData: x as unknown as Record<string, unknown>` casts in every graphBuilder and giving the
  compiler no way to catch a mismatch between a node's `nodeType` and the shape of its `astData`.

## GraphData / GraphEdge

`GraphData` and `GraphEdge` (`src/types/graph.ts`) are the single graph shape used by every IR mode.
Previously SelectionDAG had its own `SelectionDAGGraphData`/`SelectionDAGEdge` types purely because
its edges carry a few extra optional fields (`sourceHandle`, `targetHandle`, `isChainOrGlue`, used to
connect specific operand/type Handles instead of generic node boundaries). Those fields are now part
of the single `GraphEdge` interface, always optional:

```ts
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  sourceHandle?: string; // SelectionDAG only
  targetHandle?: string; // SelectionDAG only
  isChainOrGlue?: boolean; // SelectionDAG only
}
```

This is what let `useGraphData` and `layout.ts` collapse their SelectionDAG-specific code paths
(`updateSelectionDAGGraph`, `getSelectionDAGLayoutedElements`) into the single `updateGraph`/
`getLayoutedElements` used by every mode.

## GraphNode.astData

`astData` is a discriminated union keyed on `nodeType`, one variant per concrete node renderer:

```ts
type GraphNode = GraphNodeBase &
  (
    | { nodeType: "llvm-basicBlock"; astData: LLVMBasicBlock }
    | { nodeType: "llvm-functionHeader"; astData: LLVMFunctionHeaderData }
    | { nodeType: "llvm-globalVariable"; astData: LLVMGlobalVariable }
    | { nodeType: "llvm-attributeGroup"; astData: LLVMAttributeGroup }
    | { nodeType: "llvm-metadata"; astData: LLVMMetadata }
    | { nodeType: "llvm-declaration"; astData: LLVMDeclaration }
    | { nodeType: "llvm-exit"; astData: Record<string, never> }
    | { nodeType: "mermaid-node"; astData: MermaidASTNode }
    | { nodeType: "selectionDAG-node"; astData: SelectionDAGNode }
    | { nodeType?: undefined; astData?: undefined } // codeNode fallback, no specialized renderer
  );
```

`GraphNodeBase` holds the fields every node has regardless of mode: `id`, `label`, `type?`,
`language?`, `blockLabel?`.

**What this buys:** a graphBuilder pushing `{ ..., nodeType: "llvm-globalVariable", astData: gVar }`
is checked against the `LLVMGlobalVariable` shape at the call site — no cast needed, and pushing the
wrong AST type under a given `nodeType` is now a compile error instead of a silent `any`.

**What this does not buy:** React Flow's own `Node.data` (the object actually handed to a rendered
node component as `NodeProps.data`) is untyped (`Record<string, unknown>`) by React Flow's own
`Node<T>` generic not being threaded through this codebase's node arrays. Each node component (e.g.
`LLVMBasicBlockNode`) still does one cast at that boundary — `data.astData as LLVMBasicBlock` — same
as before. That cast is a single, narrow boundary cast consuming a third-party API's loose typing;
it is not the systemic hole this contract closes (the hole was in _our own_ `GraphNode`/`GraphData`
types, used across graphBuilder → converter → layout).

## Consequences for helper code that doesn't know the concrete `nodeType`

Code that looks up a node by a runtime string (e.g. a test helper's
`findNodeByType(nodes, nodeType: string)`) gets back a `GraphNode` whose `astData` is still the full
union — TypeScript can't narrow on a value it only sees at runtime. Call sites that need a specific
shape cast through `unknown` (`node.astData as unknown as SelectionDAGNode`), same as they would for
any other union that doesn't overlap enough for a direct assertion. This is expected and fine: it's
an explicit, visible cast at the one place that generically doesn't know the type, not a silent `any`
threaded through the whole pipeline.
