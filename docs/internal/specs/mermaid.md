# Spec: Mermaid mode

Behavior specification for the `mermaid` mode: flowchart text is parsed by the
pinned upstream mermaid flowchart parser (`mermaid@11.16.1`), adapted into
`MermaidAST` (`src/parser/mermaid.ts`), and converted to `GraphData`
(`src/graphBuilder/mermaidGraphBuilder.ts`).

This mode is an IR viewer of flowchart structure, not a mermaid renderer. The
upstream package is a parser source of truth; mermaid's diagram renderer is not
part of the product. The adapter imports mermaid's flowchart parser/DB module
rather than the all-diagram `mermaid` entry, so other diagram types never land
in the bundle (`contracts/bundle-budget.md`).

Conventions: every normative statement is covered by a **Pinned by** reference to
the test file(s) that fix the behavior. Statements marked _observed, untested_
describe current behavior with no covering test.

## 1. Input model

The whole input is one document. `parse` is async (upstream `parser.parse` is).
On failure it rejects with an `Error`.

- Empty input, a missing flowchart header, and input that is not a flowchart
  (sequence diagrams, class diagrams, `swimlane`, …) reject. The mermaid mode
  does not parse other mermaid diagram types.
- A flowchart that mermaid's parser rejects (syntax error) rejects with that
  parser's message.
- YAML frontmatter and `%%{init}%%` / `%%{initialize}%%` directives are stripped
  before parse and otherwise ignored (they do not change this app's layout,
  theme, or security settings).
- Full-line `%%` comments (not `%%{`) are stripped before parse. They may appear
  before the header.

> Pinned by: `src/parser/__tests__/mermaid/errors.test.ts`,
> `src/parser/__tests__/mermaid/comments.test.ts`,
> `src/parser/__tests__/mermaid/headerAndDirection.test.ts`

## 2. Accepted syntax

Accepted input is mermaid flowchart syntax as implemented by the pinned
package: `graph` / `flowchart` / `flowchart-elk` headers, every node shape the
parser knows (bracket forms and `@{ shape: ... }`), edge stroke and arrowhead
variants, chains (`A --> B --> C`), `&`-lists, subgraphs (including nesting),
and `style` / `classDef` / `class` / `linkStyle` statements.

`style` / `classDef` / `class` / `linkStyle` parse and contribute nothing to
`MermaidAST` (no classes, no CSS). `click`, tooltips, and hyperlinks parse and
are ignored. Interaction is permanently out of scope.

The adapter does not re-implement flowchart grammar. What the pinned parser
accepts, this mode accepts; what it rejects, this mode rejects. Upgrade
breakage is caught by the fixture corpus.

> Pinned by: `src/parser/__tests__/mermaid/corpus.test.ts`,
> `src/parser/__tests__/mermaid/nodes.test.ts`,
> `src/parser/__tests__/mermaid/edges.test.ts`,
> `src/parser/__tests__/mermaid/statements.test.ts`,
> `src/parser/__tests__/mermaid/subgraphs.test.ts`

## 3. `MermaidAST`

`MermaidAST` is the stable internal contract. FlowDB types do not leak past the
adapter.

- **`direction`** is FlowDB's `getDirection()` after parse. Mermaid stores `TD`
  as `TB`; both mean top-down, and layout maps any non-`LR` value to ELK
  `DOWN` (`specs/graph-view.md` §3).
- **`nodes`**: one entry per FlowDB vertex that is not a subgraph id. `id` is
  the vertex id; `label` is the vertex text with surrounding quotes stripped
  (fallback: the id); `shape` is the upstream shape name (`square`, `round`,
  `diamond`, `stadium`, `hexagon`, …, or a `@{ shape: ... }` catalog name).
  Omitted shape means the default rectangle.
- **`edges`**: one entry per FlowDB edge, in source order. `label` is omitted
  when the edge has no label text (pipe delimiters are not part of the label).
  `stroke` is `normal` | `thick` | `dotted` | `invisible`. `arrowhead` is
  FlowDB's `type` (`arrow_point`, `arrow_open`, `arrow_circle`, `arrow_cross`,
  `double_arrow_point`, …).
- **`subgraphs`**: one entry per FlowDB subgraph, with `id`, `title` (empty
  string when untitled), `nodeIds` (the subgraph's unique child ids — leaves
  and nested subgraph ids), and `direction` when FlowDB supplies one.
  Per-subgraph direction is stored and not applied to layout (the graph layer
  has one `GraphData.direction`).

A node mentioned several times is one node, keyed by id. Label and shape
back-fill follow FlowDB (a later labeled occurrence fills an unlabeled one).

> Pinned by: `src/parser/__tests__/mermaid/nodes.test.ts`,
> `src/parser/__tests__/mermaid/edges.test.ts`,
> `src/parser/__tests__/mermaid/headerAndDirection.test.ts`,
> `src/parser/__tests__/mermaid/invariants.test.ts`,
> `src/parser/__tests__/mermaid/subgraphs.test.ts`,
> `src/parser/__tests__/mermaid/corpus.test.ts`

## 4. Conversion rules

- Every AST node becomes one `GraphNode` with `nodeType: "mermaid-node"`,
  `language: "mermaid"`, and the AST node as `astData`; `type` carries the
  upstream shape name.
- Every AST subgraph becomes one `GraphNode` with `nodeType: "graph-group"`,
  `label` equal to the title (or the id when the title is empty). Children
  (leaves and nested groups) set `parentId` to that subgraph id. A subgraph
  id used as an edge endpoint names the group, not a second leaf
  (`contracts/graph-data.md`, Hierarchy).
- Every AST edge becomes one `GraphEdge`; ids are `e<i>-<source>-<target>`
  (index-prefixed, so parallel edges between the same endpoints stay unique).
  Stroke and arrowhead stay on the AST; they do not yet change rendering.
- `GraphData.direction` is the AST direction.

> Pinned by: `src/graphBuilder/__tests__/mermaid/{nodes,edges,metadata,invariants,subgraphs}.test.ts`,
> `src/parser/__tests__/mermaid/graphData.test.ts`

## 5. Rendering

This mode maps upstream shape names onto **semantic families** and gives each
family a distinct presentation inside the shared node frame
(`specs/graph-view.md` §5–§6.6). It does not reproduce mermaid geometry
(diamonds, cylinders, …). Keys are FlowDB `vertex.type` strings as stored on
`MermaidASTNode.shape`: JISON bracket names (`square`, `lean_right`, …) and
`@{ shape: ... }` catalog names and aliases (`rect`, `diam`, `lean-r`, …).
FlowDB does not canonicalize aliases, so both spellings of the same mermaid
shape are listed.

| Family     | Presentation                                     |
| ---------- | ------------------------------------------------ |
| process    | 2px-radius, 1px solid `#777` (the default frame) |
| decision   | 2px-radius, 2px dashed `#777`                    |
| terminal   | 20px-radius (pill), 1px solid `#777`             |
| data/IO    | 2px-radius, 1px dotted `#777`                    |
| storage    | 2px-radius, 2px solid `#777`                     |
| subroutine | 2px-radius, 3px double `#777`                    |

| Family             | Upstream `shape` names                                                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| process            | `square`, `rect`, `proc`, `process`, `rectangle`, `squareRect`                                                                                                                                                                                        |
| decision           | `diamond`, `diam`, `decision`, `question`                                                                                                                                                                                                             |
| terminal           | `round`, `rounded`, `event`, `roundedRect`, `stadium`, `terminal`, `pill`, `circle`, `circ`, `ellipse`, `sm-circ`, `start`, `small-circle`, `stateStart`, `dbl-circ`, `double-circle`, `doublecircle`, `fr-circ`, `stop`, `framed-circle`, `stateEnd` |
| data/IO            | `lean_right`, `lean-r`, `lean-right`, `in-out`, `lean_left`, `lean-l`, `lean-left`, `out-in`                                                                                                                                                          |
| storage            | `cylinder`, `cyl`, `db`, `database`, `datastore`, `data-store`, `h-cyl`, `das`, `horizontal-cylinder`, `lin-cyl`, `disk`, `lined-cylinder`, `bow-rect`, `stored-data`, `bow-tie-rectangle`, `win-pane`, `internal-storage`, `window-pane`             |
| subroutine         | `subroutine`, `fr-rect`, `subprocess`, `subproc`, `framed-rectangle`                                                                                                                                                                                  |
| process (fallback) | any other name, including omitted, `hexagon` / `hex`, `doc`, `delay`, `bang`, `cloud`, and future catalog names                                                                                                                                       |

The fallback is spec, not a stopgap: unknown and future shapes always render
as process. Edge stroke/arrowhead variants are carried on the AST and
currently all render as the standard routed edge.

> Pinned by: `src/components/Graph/Mermaid/__tests__/shapeFamily.test.ts`,
> `src/components/Graph/Mermaid/MermaidNode.stories.tsx`
