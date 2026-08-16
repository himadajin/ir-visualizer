# Contract: GraphData / GraphNode.astData

`GraphData`, `GraphNode`, and `GraphEdge` (`src/types/graph.ts`) are the single graph
shape used by every IR mode, produced by the graphBuilders and consumed by
converter/layout. `GraphNode.astData` is typed per `nodeType`, so a graphBuilder pushing
the wrong AST type under a given `nodeType` is a compile error, not a silent `any`.

## GraphData / GraphEdge

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
  dashed?: boolean; // render with strokeDasharray (LLVM use-def phi edges)
  stroke?: MermaidEdgeStroke; // Mermaid only — specs/mermaid.md §5
  arrowhead?: string; // Mermaid only — FlowDB edge type
}
```

The SelectionDAG-only fields connect specific operand/type Handles instead of generic node
boundaries. They are optional fields on the one shared interface rather than a
mode-specific edge type — that is what lets `useGraphData` and `layout.ts` run a single
`updateGraph`/`getLayoutedElements` path for every mode.

`dashed` is mode-agnostic: the standard edge factory (`createReactFlowEdge`) applies a dash
pattern when it is set. The LLVM Use-Def view sets it on phi incoming-value edges
(`specs/llvm-use-def-view.md` §3.1). Mermaid dotted edges do not set `dashed`; they carry
`stroke: "dotted"` and Mermaid's `edgeBuilder` maps that onto the same dash pattern.

`stroke` and `arrowhead` are Mermaid-only. Other modes omit them. The Mermaid graphBuilder
copies both from the AST; the Mermaid `edgeBuilder` is what turns them into stroke style
and markers (`specs/mermaid.md` §5). LLVM's factory does not read them.

## Id uniqueness

**Ids are unique within a `GraphData`**: no two nodes share an `id`, and no two edges share
one (nodes and edges are separate namespaces). This is an obligation on every graphBuilder,
not a property converter/layout can restore — React Flow drops a duplicate id silently, so a
violation surfaces as a node or edge that is simply missing, with no error anywhere.

Ids are **opaque** downstream: converter, layout, and the edge router compare and index them
but never parse them, so each mode is free to choose its own id grammar. How each mode meets
the obligation:

- **LLVM** (both views) serializes a structured key injectively — `specs/llvm-ir.md` §4.1.
  Distinct keys always produce distinct ids, which reduces uniqueness to the parser keeping
  its AST keys distinct; block ids are unique within a function by `specs/llvm-ir.md` §3.3.
- **Mermaid** keys nodes by their source id and collects them through a `Map`, so a node
  mentioned several times in the source is one node; edge ids carry their source-order index.
- **SelectionDAG** uses the printed `tN` node numbers as ids and inherits uniqueness from the
  input's numbering; edge ids carry the operand index.

## GraphNode.astData

`astData` is a discriminated union keyed on `nodeType`, one variant per concrete node renderer:

```ts
interface GraphNodeBase {
  id: string;
  label: string;
  type?: string;
  language?: string;
  blockLabel?: string;
  parentId?: string; // container this node sits in — see Hierarchy
}

type GraphNode = GraphNodeBase &
  (
    | { nodeType: "llvm-basicBlock"; astData: LLVMBasicBlock }
    | { nodeType: "llvm-functionHeader"; astData: LLVMFunctionHeaderData }
    | { nodeType: "llvm-globalVariable"; astData: LLVMGlobalVariable }
    | { nodeType: "llvm-attributeGroup"; astData: LLVMAttributeGroup }
    | { nodeType: "llvm-metadata"; astData: LLVMMetadata }
    | { nodeType: "llvm-declaration"; astData: LLVMDeclaration }
    | { nodeType: "llvm-exit"; astData: Record<string, never> }
    | { nodeType: "llvm-useDefInstruction"; astData: LLVMUseDefInstructionData }
    | { nodeType: "llvm-useDefValue"; astData: LLVMUseDefValueData }
    | { nodeType: "mermaid-node"; astData: MermaidASTNode }
    | { nodeType: "selectionDAG-node"; astData: SelectionDAGNode }
    | { nodeType: "graph-group"; astData: Record<string, never> } // generic container
    | { nodeType?: undefined; astData?: undefined } // codeNode fallback, no specialized renderer
  );
```

`GraphNodeBase` holds the fields every node has regardless of mode. `parentId` is optional:
omitted means a root. There is one node list — containers are nodes, not a second structure.
Edges stay a flat `GraphEdge[]`; `source` and `target` may name a leaf or a container.

The `llvm-useDef*` astData shapes (`LLVMUseDefInstructionData`, `LLVMUseDefValueData`) are
view-data shapes living in `src/ast/llvmAST.ts` next to `LLVMFunctionHeaderData`: not AST
nodes of their own, just the typed payload a renderer expects. Conversion rules:
`specs/llvm-use-def-view.md`.

## Hierarchy

A node is a **leaf** (opaque box) or a **container** (`nodeType: "graph-group"`). Children
point at their parent with `parentId`. The tree may nest. An empty container is a valid
node: it has no children and still occupies a measured chrome box.

This is a graphBuilder obligation, like id uniqueness — layout will not repair a broken
tree. A `parentId` that is set must name a node in the same `GraphData`, that node must
be a container, and following `parentId` must not cycle.

LLVM (both views) and SelectionDAG never set `parentId`. The Use-Def view is flat so
layered layout ranks instructions by dataflow (`specs/llvm-use-def-view.md`); that is a
producer choice, not a restriction of this contract. Mermaid emits `graph-group` nodes
and `parentId` for flowchart subgraphs (`specs/mermaid.md` §4). The generic container
renderer is graph-layer (`graphGroup`, next to `codeNode`) so a mode can emit a group
without adding a renderer.

## Boundaries this contract does not type

- React Flow's own `Node.data` (the object actually handed to a rendered node component as
  `NodeProps.data`) is `Record<string, unknown>` — React Flow's `Node<T>` generic is not
  threaded through this codebase's node arrays. Each node component (e.g.
  `LLVMBasicBlockNode`) does one cast at that boundary — `data.astData as LLVMBasicBlock`.
  That is a single, narrow cast consuming a third-party API's loose typing, not a hole in
  this contract.
- Code that looks up a node by a runtime string (e.g. a test helper's
  `findNodeByType(nodes, nodeType: string)`) gets back a `GraphNode` whose `astData` is
  still the full union — TypeScript cannot narrow on a value it only sees at runtime. Such
  call sites cast through `unknown` (`node.astData as unknown as SelectionDAGNode`): an
  explicit, visible cast at the one place that generically doesn't know the type.
