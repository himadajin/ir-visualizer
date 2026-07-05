# AGENTS.md

## Project Overview

This project is an application that displays Intermediate Representation (IR) as a graph.
When you input into the editor on the left, Ohm-js is used to parse the syntax, and the graph is displayed in the viewer on the right.
The graph is rendered using react-flow.

### How it Works

- Parses input text into an AST using Ohm-js (`src/parser/*`).
- Converts AST into React Flow nodes and edges via `src/graphBuilder`.
- Renders the graph using `react-flow` and calculates layout with Dagre `src/utils/layout.ts`.
- Everything that differs per IR (parser, default code, editor language, node
  components, edge/layout behavior) is centralized in the IR mode registry
  (`src/irModes`) — see `docs/internal/contracts/ir-mode-registry.md`. Adding
  a new IR should mean adding one registry entry plus that IR's own
  parser/AST/graphBuilder/node-component files, not editing scattered
  `if (mode === ...)` branches.

## Directory

- `docs`: Project documentation (see `docs/README.md` for the structure and rules)
  - `docs/internal/contracts`: Interface contracts between layers
  - `docs/internal/plans`: Plans for large-scale changes
  - `docs/internal/specs`: Behavior specifications
  - `docs/user`: User-facing documentation
- `src`
  - `src/ast`: AST definitions
  - `src/components`: UI components
    - `src/components/AppShell`: Top-level layout components (toolbar, editor/graph panes)
    - `src/components/Editor`: Code editor components
    - `src/components/Graph`: React Flow graph components, colocated with `*.stories.tsx` files
  - `src/graphBuilder`: Logic to transform AST into React Flow graph data (nodes and edges)
  - `src/hooks`: Custom React hooks (e.g., `useGraphData`, `useIRWorkspace`)
  - `src/irModes`: The IR mode registry — one file per IR plus the aggregating `index.ts`
  - `src/parser`: Ohm-js grammar files and parser implementations
  - `src/types`: Global TypeScript type definitions
  - `src/utils`: Utility functions for layout (Dagre), and other helpers
  - `src/test`: Shared Vitest setup (jest-dom matchers)
  - `src/__tests__`: Integration tests
- `e2e`: Playwright smoke end-to-end tests
- `.storybook`: Storybook configuration (component gallery for graph node components)

## Setup commands

- Build project: `npm run build`
- Start dev server: `npm run dev`
- Lint code: `npm run lint`
- Format code: `npm run format`
- Run unit/integration tests: `npm run test:run`
- Run unit/integration tests with coverage: `npm run test:coverage`
- Run Playwright E2E smoke tests: `npm run test:e2e`
- Start Storybook: `npm run storybook`

## Rules

- Documentation-first: `docs/` is the source of truth. Before changing code, update the relevant document under `docs/` (create it if missing). See `docs/README.md`.
- Always run tests after making changes.
- Always run `npm run format` after making changes.
- Always run `npm run lint` after making changes.
