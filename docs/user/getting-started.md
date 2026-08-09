# Getting started

IR Visualizer turns compiler intermediate representations (IR) into interactive graphs.
Paste IR text into the floating editor panel; the graph fills the canvas behind it.

**Try it now:** https://himadajin.github.io/ir-visualizer/ — it opens with a working LLVM-IR
example already loaded.

## The UI

The app is canvas-first: the graph fills the whole viewport, and everything else floats above
it. There is no app toolbar and no left/right split — just the canvas, one editor panel at the
top-left, and a control cluster at the bottom-right.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────┐                       │
│ │ IR Visualizer  [LLVM-IR ▾] [CFG|Use-Def]  Clear  ⌄ │                       │
│ ├────────────────────────────────────────────────────┤                       │
│ │ define i32 @f(i32 %a) {                            │                       │
│ │   %x = add i32 %a, 1                               │← drag to resize       │
│ │   br label %next                                   │                       │
│ │ }                                                  │  graph canvas fills   │
│ │                                                    │  the whole viewport   │
│ ├────────────────────────────────────────────────────┤  behind the panel     │
│ │ ✓ parsed · 7 nodes · 8 edges                       │                       │
│ └────────────────────────────────────────────────────┘                       │
│                                                                              │
│                                                                              │
│                                            [+] [−] [fit]  │  [reset layout]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Editor panel** (floating, top-left): holds everything that isn't the canvas — a header
  row, the editor itself, and a status footer. Drag its right edge to make it wider or
  narrower (wide screens only).
- **Mode selector** (panel header): switch between **LLVM-IR**, **SelectionDAG**, and **Mermaid**.
  Switching loads that mode's example code, so you always start from something that renders.
  See [supported-formats.md](supported-formats.md) for what each mode accepts.
- **View toggle** (next to the mode selector, LLVM-IR only): switch between the **CFG** and
  **Use-Def** views of the same code. Unlike switching modes, switching views keeps what you
  typed. See [supported-formats.md](supported-formats.md#llvm-ir).
- **Editor**: type or paste IR. The graph re-renders about a second after you stop typing.
- **Clear** (panel header): empties the editor.
- **Collapse** (`⌄`, panel header): collapses the panel to a small **Code** pill when you want
  the whole viewport for the graph; click the pill to bring the panel back.
- **Status footer** (bottom of the panel): the only place parse status is reported — no popups
  over the graph. A successful parse shows `✓ parsed · N nodes · M edges`; a failure shows
  `error:` followed by the full message, and the previous graph stays on screen until the
  input parses again.
- **Graph canvas**: scroll/pinch to zoom, drag the background to pan, drag nodes to rearrange
  them. Node positions survive edits that don't change the graph's structure (e.g. editing an
  instruction inside a block), so your manual arrangement isn't lost while you type.
- **Canvas controls** (floating, bottom-right): zoom in, zoom out, and fit view, then — past
  the divider — **Reset Layout**. Fit view accounts for the editor panel, so the graph is
  centred in the part of the canvas you can actually see.
- **Reset Layout**: recomputes the automatic layout and re-fits the view — use it after
  dragging nodes around or when a big edit makes the layout messy. It's separated from the
  zoom buttons by a divider because it discards your manual node positions.
- **Narrow screens** (≤ 768 px): the canvas stays full-screen and the editor panel becomes a
  **bottom sheet** covering roughly the lower half of the viewport. The **Code** pill moves to
  the bottom-left and opens and closes the sheet, and the canvas controls lift above the sheet
  while it's open. There's no Code/Graph toggle, and the drag-resize edge is wide-screen only.

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
