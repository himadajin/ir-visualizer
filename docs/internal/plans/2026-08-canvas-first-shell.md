# Plan: Canvas-first shell (layout redesign proposal)

Status: **proposal — awaiting agreement** (no code changes yet)

## Motivation

The current shell is a fixed left/right split: a full-width toolbar on top, the
Monaco editor pane on the left, a drag-resizer, and the React Flow graph pane on
the right (`src/App.tsx`, `src/components/AppShell/*`). This has a few problems:

- The graph — the actual product — only ever gets the right half of the screen.
  Wide graphs (LLVM CFGs, SelectionDAGs) feel cramped and need constant panning.
- The split reads as a "two documents side by side" layout rather than a modern
  canvas tool. Tools in this space (Figma, tldraw, Compiler Explorer's graph
  views, node editors) treat the canvas as the workspace and float everything
  else above it.
- Three stacked chrome strips (app toolbar, editor toolbar, resizer) spend
  vertical/horizontal space on low-value chrome.

## Target design

**The graph canvas fills the entire viewport. Everything else floats above it
as overlay panels.**

```
┌──────────────────────────────────────────────────────────────┐
│ ┌─ Editor panel (floating) ──┐                               │
│ │ ◆ IR Visualizer  [LLVM ▾]  │        ┌────────┐             │
│ │ ───────────────────────────│        │ entry: │             │
│ │  1  define i32 @f(...)     │        └───┬────┘             │
│ │  2  entry:                 │      ┌─────┴─────┐            │
│ │  3    br label %loop       │      ▼           ▼            │
│ │  ...                       │  ┌───────┐   ┌───────┐        │
│ │ ───────────────────────────│  │ loop: │   │ exit: │        │
│ │ ✓ Parsed · 12 nodes        │  └───────┘   └───────┘        │
│ └────────────────────────────┘                               │
│                                              ┌─────────────┐ │
│                                              │ ⊕ ⊖ ⤢ ↺ Fit │ │
│                                              └─────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 1. Full-bleed canvas

- `GraphViewer` becomes the root layer, `position: fixed; inset: 0`. The dot
  `<Background />` covers the whole viewport — it is the app's ground.
- The top `ToolbarPane` (36 px full-width strip) is **removed**. Its two
  responsibilities move into the editor panel header (brand + mode selector)
  and, in narrow mode, a floating toggle (see §4).

### 2. Floating editor panel

A single overlay card (top-left, with a margin from the viewport edges,
rounded corners, shadow) replaces `EditorPane` + `EditorToolbar`:

- **Header row**: app brand mark, IR mode selector (registry-driven, unchanged
  contract), overflow actions (Clear), and a collapse button.
- **Body**: the existing Monaco `CodeEditor`, unchanged. The editor surface
  stays fully opaque for readability; only the panel chrome may use subtle
  translucency/blur.
- **Status footer** (new): one-line parse status — `✓ Parsed` on success, the
  error message on failure. This **replaces the snackbar** over the graph;
  errors live next to the code that caused them and are no longer truncated to
  100 characters (long messages wrap/scroll inside the footer).
- **Resize**: right edge drag, reusing `usePaneResize` (min 280 px, max ~60 vw,
  initial 420 px).
- **Collapse**: the panel collapses to a small floating "Code" pill at the
  top-left, giving the graph 100 % of the screen. State is `useState` only
  (session-local) in the first iteration.
- **Event containment**: the panel stops pointer/wheel propagation so typing,
  scrolling, and selecting in the editor never pans/zooms the canvas beneath.

### 3. Canvas control cluster

The default React Flow `<Controls />` (bottom-left) and the ad-hoc top-right
"Reset Layout" `<Panel>` button merge into **one floating cluster at the
bottom-right**: zoom in / zoom out / fit view / reset layout, styled
consistently with the editor panel. `fitView` is called with left `padding`
derived from the current panel width so "fit" centers the graph in the
_visible_ area, not underneath the panel.

### 4. Narrow mode (≤ 768 px)

The canvas stays full-screen. The editor panel becomes a **bottom sheet**
covering ~55 % of the viewport height, toggled by the floating "Code" pill.
This replaces the current toolbar Code/Graph `ToggleButtonGroup`; the
drag-resizer remains wide-mode-only, as today.

## What does _not_ change

- The IR mode registry contract, parsers, graph builders, layout, node
  components, and all of `useIRWorkspace`/`useGraphData`. This is a shell-only
  change: `src/App.tsx` + `src/components/AppShell/*` + `GraphViewer`'s
  controls, plus the specs listed below.
- Parse cycle behavior (debounce, keep-last-good-graph-on-error) per
  `specs/graph-view.md` §1.

## Implementation plan

1. **Docs first**: rewrite `specs/graph-view.md` §6 (Shell UI) to specify the
   canvas-first shell (panel, status footer, control cluster, narrow-mode
   bottom sheet); touch `architecture.md`'s component-layer description.
2. **Shell restructure**: new `AppShell/CanvasShell.tsx` (full-bleed viewer) and
   `AppShell/EditorPanel.tsx` (header + editor + status footer + collapse);
   delete `ToolbarPane`/`EditorToolbar`; `App.tsx` composes the two layers.
   Error prop moves from `GraphPane` to the panel footer.
3. **Controls**: replace `<Controls />` + Reset `<Panel>` with the unified
   cluster; panel-width-aware `fitView` padding.
4. **Narrow mode**: bottom-sheet variant behind the existing
   `useMediaQuery(768px)` check.
5. **Tests**: update `e2e/smoke.spec.ts` selectors (mode selector and Clear now
   live in the panel header; error assertion targets the status footer, not a
   snackbar). Run unit + e2e + lint + format.

Steps 2–3 land together (the shell doesn't compile halfway); step 4 can be a
follow-up PR.

## Risks / open questions

- **Graph hidden behind the panel**: mitigated by fitView padding + collapse,
  but very wide graphs still overlap. Acceptable — panning is native to a
  canvas tool.
- **E2E churn**: the smoke tests encode the current shell; step 5 is mandatory,
  not optional.
- **Snackbar removal** changes documented behavior ("errors appear as a
  snackbar over the graph pane") — the spec update in step 1 is the agreement
  point for that.
- Persisting panel width/collapse state to `localStorage` is deferred.
