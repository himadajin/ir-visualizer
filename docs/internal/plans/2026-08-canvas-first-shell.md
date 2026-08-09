# Plan: Canvas-first shell (layout redesign)

Status: **accepted — in progress** (agreed 2026-08-09; see "Agreed design
decisions" below for the details that supersede the original proposal text)

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

## Agreed design decisions (2026-08-09)

The points below were settled after the proposal was written and are
authoritative where they differ from §§1–4 above. The proposal predates the flat
Use-Def view toggle (`docs/internal/specs/llvm-use-def-view.md`), so the toolbar
it describes is missing one control; that gap is closed here.

### Concept: quiet shell chrome, code-colored canvas

Floating chrome — editor panel, collapsed pill, canvas control cluster — uses
the pre-#60 **quiet gray language**: neutral grays, sans-serif type, light
borders, no decorated hue. The graph nodes keep their own visual grammar
(`src/components/Graph/common/NodeShell.tsx`: white surface, `1px solid #777`
border, `4px` radius, monospace type, corner-chip idiom) unchanged — node
styling is out of scope for this plan. The shell chrome does **not** borrow
that grammar; the two are deliberately distinct now, so the graph nodes read
as the one visually "interesting" layer and the chrome stays out of their way.

### Design tokens

All values are derived from colors already present in the codebase; no new hues
are invented.

| Token          | Value                                                                  | Use                                                                      |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ground`       | `#FAFAFA`                                                              | Full-viewport canvas background; dot `<Background />` dots `#D7DBDF`     |
| `paper`        | `#FFFFFF`                                                              | Surface of panel / pill / control cluster (identical to nodes)           |
| `control`      | `#d0d0d0` (hover `controlHover` `#999`, focused `controlFocus` `#777`) | Border on interactive shell controls (select, toggle group, buttons)     |
| `line`         | `#999`                                                                 | Outer border of floating surfaces (panel, pill, control cluster)         |
| `ink`          | `#1F2328`                                                              | Primary text                                                             |
| `ink-muted`    | `#57606A`                                                              | Secondary text (status footer)                                           |
| `ok`           | `#1A7F37`                                                              | Parse-success indicator only — never decorative                          |
| `error`        | `#CF222E`                                                              | Parse-failure indicator only — never decorative                          |
| `selectedFill` | `#e8e8e8` (text `#222`, weight 600)                                    | Selected toggle-button state (replaces the deleted `accent` token)       |
| `hoverFill`    | `#f0f0f0`                                                              | Hover fill for shell chrome buttons                                      |
| `focusRing`    | 2 px `#57606A`                                                         | Focus-visible ring on all interactive shell chrome (neutral, not accent) |
| elevation      | `0 1px 2px rgba(31,35,40,.05), 0 4px 12px rgba(31,35,40,.06)`          | Floating chrome only; graph nodes stay flat (no shadow)                  |

The `accent` (`#8250DF`) token from the original proposal is **deleted**.
Green `ok` / red `error` are the only semantic (non-gray) colors anywhere in
the shell. Graph nodes keep their existing `1px solid #777` border
unchanged — that border is NodeShell's, not a shell-chrome token, and is out
of scope here.

- **No translucency and no backdrop blur anywhere.** All surfaces are fully
  opaque. This explicitly rejects the "subtle translucency/blur" allowed in §2.
- **Typography**: no webfonts are added. All shell chrome (brand title, mode
  selector, toggles, buttons) uses the app's system sans-serif stack
  (`system-ui`). Monospace is reserved for the status footer (compiler-output
  feel) and the canvas/graph nodes themselves — it is no longer used for shell
  chrome.

### Signature element: the brand title

The editor panel header carries a small sans-serif **"IR Visualizer" title**
(~13 px, `#333`), vertically centered in the header row — not a NodeShell-style
corner chip. The corner-chip idiom remains exclusively a graph-node affordance;
the panel is chrome around the canvas, not a node itself.

### Panel header composition

Left to right: the brand title, the **IR mode selector** (registry-driven,
unchanged contract), the **CFG/Use-Def view toggle** for modes that define
`views`, a **Clear** action, and a **collapse** button. The view toggle moves
out of the removed toolbar and into the panel header — **not** into the canvas
control cluster: it selects _what is projected_, which belongs with the source
text, whereas the cluster only manipulates the viewport.

### Status footer: a compiler diagnostic line

One line of monospace text, styled after a compiler diagnostic:

- Success: `✓ parsed · N nodes · M edges` — check glyph in `ok`, text in
  `ink-muted`.
- Failure: `error: <full message>` with a 2 px left rule in `error`. The message
  is **not truncated** (the current 100-character truncation is removed); long
  messages wrap and scroll within a max-height of roughly 8 lines.

### Collapse pill and its position

The panel collapses to a small floating pill, styled as a **plain small
button** with a sans-serif `Code` label — not a miniature node. Collapse state
is session-local `useState`. The old narrow-mode `activePane: "editor" |
"graph"` state is replaced by a single `panelOpen: boolean` shared by both wide
and narrow modes. The pill sits **top-left in wide mode** and **bottom-left in
narrow mode** (thumb reach).

### Event containment

The panel is a DOM **sibling** of the React Flow canvas, not a React Flow
`<Panel>`, so canvas gestures cannot leak into it. A `stopPropagation` wheel
handler on the panel root is a safety net, not the primary mechanism.

### Canvas control cluster

One horizontal row at the bottom-right: zoom in, zoom out, fit view, then a 1 px
divider, then reset layout. The divider separates viewport operations from the
position-destroying reset. `fitView` is called with a left padding equal to the
current panel width plus its margin, using @xyflow/react 12.10's object padding
form (e.g. `fitView({ padding: { left: "436px" } })`); padding is `0` while the
panel is collapsed. This applies to the initial fit, the fit-view button, and
the re-fit after Reset Layout.

### Motion policy

Exactly one orchestrated moment: the panel ⇄ pill collapse/expand morph
(~180 ms ease-out) paired with an animated `fitView` recenter. No other
animations. Everything is disabled under `prefers-reduced-motion`.

### Accessibility floor

2 px `focusRing` (`#57606A`, neutral gray, not accent) on every interactive
piece of chrome, full keyboard operability, and WCAG AA contrast for
status-footer text.

### Spec sections affected

Both `specs/graph-view.md` **§1 (Parse cycle)** and **§6 (Shell UI)** change:
§1's "shown in a snackbar (truncated to 100 characters)" wording is replaced by
the status-footer behavior. The original proposal mentioned only §6.

## Amendment (2026-08-09): re-parse loop fix

Implementing §3 uncovered a **pre-existing bug** that makes the canvas-first
controls impossible to build on top of the current hooks, so one exception to
"What does _not_ change" below is required.

`useGraphData.updateGraph` was a `useCallback` listing `nodes` and `edges` among
its dependencies, so every graph update produced a new `updateGraph` identity.
`useIRWorkspace`'s debounced parse effect lists `updateGraph` as a dependency,
so each update re-armed the effect and, 750 ms later, re-parsed the unchanged
code and replaced every node object again — an endless parse/replace cycle. The
practical symptom: React Flow never settles, so **every `fitView()` after the
initial mount fit is silently swallowed** (`zoomIn` works, `fitView` does
nothing). The canvas-first shell depends on that call in three places — the
§6.4 fit-view button, the collapse/expand animated recenter, and the re-fit
after Reset Layout — none of which can work while the loop runs.

`useGraphData` is therefore changed as a **prerequisite** of this plan:
`updateGraph` and `resetLayout` get stable identities by reading the latest
nodes/edges (and the last topology signature and last parsed graph) through
refs instead of dependencies. `useIRWorkspace` is untouched. The observable
parse-cycle semantics are unchanged: the 750 ms debounce and
keep-last-good-graph-on-error behavior of `specs/graph-view.md` §1, and the
topology-signature rules of §2 (full re-layout on signature change,
position/edge-type preservation on content-only updates), all hold exactly as
specified and remain pinned by the existing tests.

## Amendment (2026-08-09): quiet visual language revision

After using the shipped shell (PR #60), the node-grammar chrome described in
"Agreed design decisions" above proved too heavy in practice: the panel,
pill, and control cluster borrowing NodeShell's corner-chip idiom and
monospace type meant the controls competed visually with the graph nodes
instead of framing them, and the `accent` purple was the only decorated hue
in an otherwise code-colored tool. The canvas-first **layout** from §§1–4
(full-bleed canvas, floating panel, bottom-right control cluster, narrow-mode
sheet) is unaffected and stays as shipped. Only the shell chrome's **visual
language** reverts to the pre-#60 quiet gray look: neutral grays, sans-serif
type, and light borders for panel/pill/controls, with the `accent` token
deleted and the corner-chip/monospace grammar left exclusively to the graph
nodes. "Agreed design decisions" above has been edited in place to reflect
this; see the design-tokens table, the brand-title, collapse-pill, and
accessibility-floor subsections for the specifics. `specs/graph-view.md` §6
is updated to match.

## What does _not_ change

- The IR mode registry contract, parsers, graph builders, layout, node
  components, and `useIRWorkspace` (`useGraphData` gets the identity-stability
  fix described in the amendment above). This is otherwise a shell-only
  change: `src/App.tsx` + `src/components/AppShell/*` + `GraphViewer`'s
  controls, plus the specs listed below.
- Parse cycle behavior (debounce, keep-last-good-graph-on-error) per
  `specs/graph-view.md` §1.

## Implementation plan

1. **Docs first**: rewrite `specs/graph-view.md` §6 (Shell UI) to specify the
   canvas-first shell (panel, status footer, control cluster, narrow-mode
   bottom sheet, design tokens) and amend §1 (Parse cycle) so the error
   destination is the status footer, untruncated, instead of the snackbar;
   touch `architecture.md`'s component-layer description.
2. **Shell restructure**: new `AppShell/CanvasShell.tsx` (full-bleed viewer) and
   `AppShell/EditorPanel.tsx` (header + editor + status footer + collapse);
   delete `ToolbarPane`/`EditorToolbar`; `App.tsx` composes the two layers.
   The mode selector, the CFG/Use-Def view toggle, and Clear move into the panel
   header; the error prop moves from `GraphPane` to the panel footer;
   `activePane` is replaced by `panelOpen`.
3. **Controls**: replace `<Controls />` + Reset `<Panel>` with the unified
   cluster; panel-width-aware `fitView` padding.
4. **Narrow mode**: bottom-sheet variant behind the existing
   `useMediaQuery(768px)` check.
5. **Tests**: update `e2e/smoke.spec.ts` selectors (mode selector, view toggle,
   and Clear now live in the panel header; the "invalid code shows a parse
   error" assertion targets the status footer, not a snackbar). Run unit + e2e +
   lint + format.

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
