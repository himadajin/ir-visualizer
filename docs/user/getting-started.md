# Getting started

IR Visualizer turns compiler intermediate representations (IR) into interactive graphs.
Paste IR text into the floating editor panel; the graph fills the canvas behind it.

**Try it now:** https://himadajin.github.io/ir-visualizer/ — it opens with a working LLVM-IR
example already loaded.

## The UI

```
┌───────────────────────────────────────────────┐
│ ┌─ Editor panel ─────┐                      │
│ │ IR Visualizer [Mode ▾]│   Full graph canvas  │
│ │ [CFG|Use-Def] [Clear]│                      │
│ │                       │                      │
│ │ Code editor           │                      │
│ │                       │      [+−][Fit]│Reset│
│ │ ✓ parsed · nodes · edges│                      │
│ └───────────────────────┘                      │
└───────────────────────────────────────────────┘
```

- **Mode selector** (panel header): switch between **LLVM-IR**, **SelectionDAG**, and **Mermaid**.
  Switching loads that mode's example code, so you always start from something that renders.
  See [supported-formats.md](supported-formats.md) for what each mode accepts.
- **View toggle** (next to the mode selector, LLVM-IR only): switch between the **CFG** and
  **Use-Def** views of the same code. Unlike switching modes, switching views keeps what you
  typed. See [supported-formats.md](supported-formats.md#llvm-ir).
- **Editor**: type or paste IR. The graph re-renders about a second after you stop typing.
  If the input doesn't parse, the panel's status footer shows the full error and the previous
  graph stays until the input parses again.
- **Clear**: empties the editor.
- **Graph view**: scroll/pinch to zoom, drag the background to pan, drag nodes to rearrange
  them. Node positions survive edits that don't change the graph's structure (e.g. editing an
  instruction inside a block), so your manual arrangement isn't lost while you type.
- **Reset Layout**: recomputes the automatic layout and re-fits the view — use it after
  dragging nodes around or when a big edit makes the layout messy.
- **Collapse**: collapse the panel to a **Code** pill when you want the whole viewport for the
  graph; use the pill to reopen it.
- **Narrow screens** (≤ 768 px): the editor becomes a bottom sheet over the full-screen
  canvas. The same **Code** pill opens it, and the canvas controls move above the sheet.

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
- **Mermaid** renders the flowchart as written. ELK routes edges orthogonally; self-loops and
  edges whose target lies above their source use the muted loop accent.
