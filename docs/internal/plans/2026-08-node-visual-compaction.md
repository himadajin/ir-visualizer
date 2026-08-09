# Plan: node visual compaction (engineer-tool node grammar)

- **Status:** Implemented 2026-08-09.
- **Motivation:** Nodes are visibly taller and wider than their content
  justifies, and the corner-chip header reads as a whiteboard tool rather
  than a compiler tool. Companion to `2026-08-elk-edge-routing.md`, which
  fixed the edges and listed this as follow-up.

## 1. Problems

1. **Corner-chip header costs 28 px.** `NodeShell` renders the block label as
   an absolutely positioned chip and reserves `padding-top: 28px` for it; a
   one-line block is ~60 px tall.
2. **Estimation ≠ rendering.** `converter.ts` estimates with `NODE_PADDING
(20 px per side)` and a 24 px header offset while `NodeShell` actually
   renders 10 px padding and the 28 px chip pad — the layout engine spaces
   nodes for boxes ~25 px larger than what is drawn. The §5 "single-source
   constants" rule exists but these values were never actually shared.
3. **Loose typography.** 14 px / 20 px line height is airy for a zoomable
   graph view; engineer tools (IDA, Ghidra, Compiler Explorer) sit around
   11–12 px with ~1.3 line height.
4. **Minimum width 40 chars (~360 px)** makes short CFG blocks and the exit
   pill needlessly wide.
5. **Use-Def cards stack a badge row over the code line**, nearly doubling
   card height for one line of content.

## 2. Agreed decisions

Discussed and agreed with the project owner (2026-08-09):

1. **Density 12 px / 16 px** for all node text (shared constants, so
   SelectionDAG nodes and the size estimator move with it).
2. **Full-width header band** replaces the corner chip: a ~20 px strip at the
   node's top edge — light gray fill, bottom hairline, 11 px semibold label,
   left-aligned. The IDA/Ghidra block-title idiom.
3. **Use-Def block badge goes inline-left** of the code line (`[12] %15 =
sub …`), collapsing cards to a single row; operand-port x offsets shift by
   the badge width (computable — monospace).
4. **Outline: 2 px radius, keep the 1 px `#777` border and white surface.**
   Pill shapes (function header, exit, value pills) keep their large radii.

## 3. Design

- `common/nodeTextStyle.ts` becomes the single source for the whole node
  frame, not just the font: `NODE_FONT_SIZE "12px"`, `NODE_LINE_HEIGHT
"16px"`, `NODE_PADDING_X 8`, `NODE_PADDING_Y 6`, `NODE_BORDER_WIDTH 1`,
  `NODE_BORDER_RADIUS 2`, `NODE_HEADER_HEIGHT 20`, plus header band colors.
- `NodeShell` restructures to: wrapper (border, radius, background,
  `overflow: hidden`) → optional header band (border-box `NODE_HEADER_HEIGHT`,
  hairline bottom border) → content div carrying the padding. The `style`
  prop stays on the wrapper (Mermaid overrides the border through it;
  inherited text properties still reach the content).
- `converter.ts` estimates **exactly** the rendered box:
  `width = chars·charW + 2·(NODE_PADDING_X + NODE_BORDER_WIDTH)`,
  `height = lines·lineH + 2·(NODE_PADDING_Y + NODE_BORDER_WIDTH) +
(header ? NODE_HEADER_HEIGHT : 0)`. `MIN_CHARS_LLVM` drops 40 → 16.
  `NODE_PADDING`/`HEADER_OFFSET` literals are deleted.
- Use-Def cards: one flex row `badge · gap · code`; the card frame reuses the
  shared padding constants (the separate `USE_DEF_CARD_PADDING` dies). The
  badge width estimate moves next to `getUseDefPorts`, which adds
  `badgeWidth + gap` to every port's x. Estimator height loses the badge row
  term.

## 4. Out of scope

- Dark mode, node color themes, SelectionDAG structure (it only inherits the
  font/line-height change).
- CFG successor ports (unchanged from the edge plan).
