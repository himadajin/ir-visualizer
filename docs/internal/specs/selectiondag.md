# Spec: SelectionDAG mode

Behavior specification for the `selectionDAG` mode: the accepted LLVM SelectionDAG dump format
(`src/parser/selectionDAG.ohm` / `selectionDAG.ts`) and the DAG construction
(`src/graphBuilder/selectionDAGGraphBuilder.ts`).

Conventions: every normative statement is covered by a **Pinned by** reference to the test
file(s) that fix the behavior. Statements marked _observed, untested_ describe current
behavior with no covering test.

## 1. Input model — line-based, tolerant

Unlike the LLVM-IR and Mermaid parsers, this parser works **per line** and never throws:

- Blank lines are skipped.
- Each remaining line is matched against the `Line` rule. A line that parses as a node becomes
  a `node` entry; anything else (the dump's free-text header, `SelectionDAG has N nodes:`,
  malformed node lines) becomes a `comment` entry.
- Entries keep their 1-based source line number, in non-decreasing order, and node/comment
  interleaving order is preserved.

This tolerance is intentional (real `llc` dumps mix header text with node lines) — see the
"Known behavior difference" section of `contracts/ir-mode-registry.md`.

> Pinned by: `src/parser/__tests__/selectionDAG/errorsAndFallbacks.test.ts`,
> `src/parser/__tests__/selectionDAG/fullParse.test.ts`,
> `src/parser/__tests__/selectionDAG/invariants.test.ts`

## 2. Node-line syntax

A node line is `<nodeId>: <types> = <rhs>` with optional leading indentation.

- **nodeId**: `t<digits>` (current format) or `0x<hex>` (old LLVM dumps).
- **types**: comma-separated list, e.g. `i64,ch` — each type is an identifier
  (`i32`, `ch`, `glue`, `v4f32`, ...).
- **rhs**: either the special form `ValueType: <ty>` (parsed as opName `ValueType` with
  `vtDetail`), or: `opName [flags] [<detail>] [reg] [\[verbose\]] [operands] [tail attrs]`.
  - **opName** variants: plain identifier (`add`, `store`), machine-ISD name with a namespace
    (`RISCVISD::RET_GLUE`), or the unknown form `<<...>>`.
  - **flags**: the fixed set `nuw nsw exact samesign nneg nnan ninf nsz arcp contract afn
reassoc nofpexcept`.
  - **detail**: one `<...>` group (e.g. `store<(store (s64) into %ir.a.addr)>`,
    `Constant<42>`); trailing `<...>`/`name=value` attributes after the operands are folded
    into `details.detail`.
  - **reg**: `$noreg` | `SS#N` | `%name` (VirtReg) | `$name` (PhysReg) | `#N` (Numbered) |
    bare capitalized name (Bare).
  - **verbose**: an `[ORD=N]`-style bracket group, accepted before or after the operands
    (old-format dumps).

- **operands**: comma-separated; each is one of

  | Kind        | Syntax                                | AST `kind`                  |
  | ----------- | ------------------------------------- | --------------------------- |
  | node ref    | `t5`, `t5:1` (with result index)      | `node`                      |
  | wrapped ref | `<t5>`, `<t5:1>`                      | `node` with `wrapped: true` |
  | inline      | `Register:i64 %0`, `Constant:i32<42>` | `inline`                    |
  | immediate   | `-?digits`                            | `immediate`                 |
  | null        | `<null>`                              | `null`                      |

> Pinned by: `src/parser/__tests__/selectionDAG/nodeSyntax.test.ts`,
> `src/parser/__tests__/selectionDAG/operandsAndDetails.test.ts`,
> `src/parser/__tests__/selectionDAG/registerAndValueType.test.ts`

## 3. DAG construction rules

- Each parsed node becomes one `GraphNode` with `nodeType: "selectionDAG-node"`,
  `language: "llvm"`, the AST node as `astData`, and a compact one-line label (used only for
  fallback sizing). Comment entries produce nothing.
- Edges are generated **from operands**: for every operand of kind `node` whose id refers to a
  node present in the same dump, one edge goes _from the referenced node to the referencing
  node_ (dataflow direction). Inline, immediate, and null operands, and references to unknown
  ids, produce no edge.
- Edges attach to specific **Handles** instead of generic node borders:
  `sourceHandle = "<srcId>-type-<resultIndex>"` (the operand's `:N` index, default 0) and
  `targetHandle = "<dstId>-operand-<operandIndex>"`. These ids must match the Handle ids that
  `SelectionDAGNode.tsx` renders per type cell / operand cell.
- If the referenced result type at that index is `ch` or `glue`, the edge is flagged
  `isChainOrGlue` and renders **dashed** (see `createSelectionDAGReactFlowEdge`).
- The graph is always `direction: "TD"`; SelectionDAG layout uses the shared
  between-layer spacing (`NODE_NODE_BETWEEN_LAYERS` in `src/utils/spacing.ts` —
  see `specs/graph-view.md` §3). _(the spacing value: observed, untested)_

> Pinned by: `src/graphBuilder/__tests__/selectionDAG/{nodes,edges,metadata}.test.ts`,
> `src/parser/__tests__/selectionDAG/invariants.test.ts`,
> `src/utils/__tests__/converter.test.ts`

## 4. Node rendering

`SelectionDAGNode.tsx` renders a table-like box: a colored left column with the node id, an
operands row (one cell per operand, each `node` operand carrying its target Handle), an
opName+details row, and a types row (one cell per result type, each carrying a source Handle).
The node shrink-wraps that table; ELK places it from the measured box
(`specs/graph-view.md` §5).

The left-column color encodes an opName **category**
(`src/components/Graph/SelectionDAG/selectionDAGNodeColor.ts`):

| Category         | Rule                                        | Color     |
| ---------------- | ------------------------------------------- | --------- |
| `entryToken`     | opName === `EntryToken`                     | `#c8e6c9` |
| `tokenFactor`    | opName === `TokenFactor`                    | `#fff9c4` |
| `register`       | `CopyFromReg` / `CopyToReg`                 | `#e1bee7` |
| `targetSpecific` | opName contains `::`                        | `#ffe0b2` |
| `memory`         | opName is `load`/`store` (case-insensitive) | `#bbdefb` |
| `default`        | everything else                             | `#f4f2ff` |

> Pinned by: `src/components/Graph/SelectionDAG/__tests__/selectionDAGNodeColor.test.ts`

## 5. Known limitations

- A malformed node line silently becomes a comment (by design, §1) — there is no user-visible
  signal that a line the user intended as a node was skipped.
- Nodes referenced by operands but not defined in the dump produce no edge and no placeholder
  node.
- Related feature request: [#42](https://github.com/himadajin/ir-visualizer/issues/42) —
  optionally inlining constant/register nodes that old-LLVM dumps emit as separate nodes.
