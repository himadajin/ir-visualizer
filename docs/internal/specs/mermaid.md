# Spec: Mermaid mode

Behavior specification for the `mermaid` mode: the accepted Mermaid-flowchart subset
(`src/parser/mermaid.ohm` / `mermaid.ts`) and the flowchart-to-graph conversion
(`src/graphBuilder/mermaidGraphBuilder.ts`).

Conventions: every normative statement is covered by a **Pinned by** reference to the test
file(s) that fix the behavior. Statements marked _observed, untested_ describe current
behavior with no covering test.

## 1. Input model

The whole input is parsed as one document. On failure (including empty input or a missing
header), `parse` throws an `Error` with Ohm's match diagnostic.

> Pinned by: `src/parser/__tests__/mermaid/errors.test.ts`

## 2. Accepted syntax

- **Header** (required, first non-separator content): `graph <dir>` or `flowchart <dir>` where
  `<dir>` is `TB | TD | BT | RL | LR`. The direction string is carried into
  `GraphData.direction` as-is.
- **Statements** after the header, separated by newlines and/or `;`:
  - Node declaration: `Id` with an optional label (see shapes below).
  - Edge: `Node Link Node`.
- **Node ids** are alphanumeric (`alnum+`). **Shapes** by label bracket:

  | Syntax     | `shape`  | Rendered as (see `MermaidNode.tsx`) |
  | ---------- | -------- | ----------------------------------- |
  | `A[text]`  | `square` | 4px-radius solid border             |
  | `A(text)`  | `round`  | 20px-radius solid border            |
  | `A{text}`  | `curly`  | dashed border                       |
  | (no label) | —        | label falls back to the node id     |

- **Links**: `-->` (arrow) and `---` (line), each optionally labeled `-->|text|`, plus the
  middle-text forms `--text-->` / `--text---`. The arrow/line distinction is stored on the AST
  edge (`edgeType`) but does not currently change rendering. _(rendering distinction: observed,
  untested)_

> Pinned by: `src/parser/__tests__/mermaid/headerAndDirection.test.ts`,
> `src/parser/__tests__/mermaid/statements.test.ts`,
> `src/parser/__tests__/mermaid/nodes.test.ts`,
> `src/parser/__tests__/mermaid/edges.test.ts`

## 3. Node deduplication and label back-fill

A node may appear in any number of declarations and edges; it is created once, keyed by id.
If a node was first seen without a label (label === id) and a later occurrence carries a label,
the label and shape are back-filled.

> Pinned by: `src/parser/__tests__/mermaid/statements.test.ts`,
> `src/parser/__tests__/mermaid/invariants.test.ts`,
> `src/parser/__tests__/mermaid/nodes.test.ts`

## 4. Conversion rules

- Every AST node becomes one `GraphNode` with `nodeType: "mermaid-node"`,
  `language: "mermaid"`, and the AST node as `astData`; `type` carries the shape.
- Every AST edge becomes one `GraphEdge`; ids are `e<i>-<source>-<target>` (index-prefixed, so
  parallel edges between the same endpoints stay unique).
- `GraphData.direction` is the header direction.

> Pinned by: `src/graphBuilder/__tests__/mermaid/{nodes,edges,metadata,invariants}.test.ts`,
> `src/parser/__tests__/mermaid/graphData.test.ts`

## 5. Known quirks

These are current, test-pinned behavior — changing them is a spec change:

1. **Edge labels keep their pipe delimiters.** `A -->|Yes| B` produces the label string
   `"|Yes|"`, not `"Yes"`, and it renders that way in the graph.
2. **Double-quoted labels keep their quotes.** `A["Quoted"]` parses as a `square` node whose
   label is `"Quoted"` including the quotes — the grammar's `squareQuote` alternative is
   unreachable because the plain `square` rule matches first.

> Pinned by: `src/parser/__tests__/mermaid/edges.test.ts`,
> `src/parser/__tests__/mermaid/nodes.test.ts`

## 6. Known limitations

- Only the flowchart subset above is supported. Subgraphs, styling/class statements, click
  handlers, other node shapes (`((...))`, `>...]`, `[/.../]`, ...), multi-link chains
  (`A --> B --> C`), and `&`-lists are not in the grammar; input using them throws.
  _(observed, untested)_
- **`%%` comment lines crash the parser at runtime** ("Missing semantic action for
  'comment'"): the grammar accepts them as statements but the semantics has no action for
  the `comment` rule. Tracked by
  [Issue #75](https://github.com/himadajin/ir-visualizer/issues/75).
