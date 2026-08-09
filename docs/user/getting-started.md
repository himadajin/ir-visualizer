# Getting started

IR Visualizer turns compiler intermediate representations (IR) into interactive graphs.
Paste IR text into the editor on the left; the graph appears on the right.

**Try it now:** https://himadajin.github.io/ir-visualizer/ — it opens with a working LLVM-IR
example already loaded.

## The UI

```
┌───────────────────────────────────────────────┐
│ IR Visualizer            [Code|Graph] [Mode ▾] │  ← toolbar
├─────────────────────┬─────────────────────────┤
│              [Clear]│           [Reset Layout] │
│                     │                          │
│   Code editor       ║   Graph view             │
│                     ║                          │
│                     │   [zoom / fit controls]  │
└─────────────────────┴─────────────────────────┘
                      ↑ drag to resize
```

- **Mode selector** (top right): switch between **LLVM-IR**, **SelectionDAG**, and **Mermaid**.
  Switching loads that mode's example code, so you always start from something that renders.
  See [supported-formats.md](supported-formats.md) for what each mode accepts.
- **View toggle** (next to the mode selector, LLVM-IR only): switch between the **CFG** and
  **Use-Def** views of the same code. Unlike switching modes, switching views keeps what you
  typed. See [supported-formats.md](supported-formats.md#llvm-ir).
- **Editor**: type or paste IR. The graph re-renders about a second after you stop typing.
  If the input doesn't parse, an error message pops up over the graph and the previous graph
  stays until the input parses again.
- **Clear**: empties the editor.
- **Graph view**: scroll/pinch to zoom, drag the background to pan, drag nodes to rearrange
  them. Node positions survive edits that don't change the graph's structure (e.g. editing an
  instruction inside a block), so your manual arrangement isn't lost while you type. Edges
  always follow the live position of the nodes they connect, including while you're mid-drag,
  so there's nothing to repair afterward — dragging a node never changes how its edges are
  drawn, only where they point.
- **Reset Layout**: recomputes the automatic layout and re-fits the view — use it when a big
  edit, or a lot of manual dragging, has left the arrangement messy. It's about tidying node
  positions, not edges: edges are always current, dragged or not.

**Known limitation:** edge routing avoids node boxes, and nothing else. If you drag one node
onto or nearly onto another, an edge can visibly cut between the two boxes instead of routing
around them. Two edges in the default LLVM-IR example do this too, without any dragging — the
automatic layout leaves a gap a couple of pixels narrower than routing needs there. Both are
about the layout, not something you did wrong.

- **Narrow screens** (≤ 768 px): the editor and graph become a single pane; use the
  **Code / Graph** toggle in the toolbar to switch between them.

## Reading the graphs

- **LLVM-IR** renders a control-flow graph per function: a rounded header node
  (`define ...`), one node per basic block (labeled chips show the block name), edges for
  branches (`true`/`false` on conditional branches, case values on `switch`), and a shared
  `exit` node for returns. Global variables, declarations, metadata, and attribute groups
  appear as free-standing nodes.
- **SelectionDAG** renders the DAG with dataflow edges from producers to consumers, attached
  to the exact operand/result-type cells. Dashed edges are chain/glue dependencies. The
  colored left column encodes the node kind (green = EntryToken, purple = register copies,
  blue = load/store, orange = target-specific ops, yellow = TokenFactor).
- **Mermaid** renders the flowchart as written; back-edges (arrows that point "up") take a
  loop-around curve.
