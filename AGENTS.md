# AGENTS.md

## Project Overview

This project is an application that displays Intermediate Representation (IR) as a graph.
When you enter text in the editor, the active IR mode parses it and displays the resulting graph.
The graph is rendered using react-flow.

### How it Works

See `docs/internal/architecture.md` for the full data-flow diagram and layer map.

- Parses input text into an AST with the active mode's parser (`src/parser/*`). Mermaid and
  SelectionDAG use Ohm-js grammars; LLVM-IR uses a line-oriented parser.
- Converts AST into React Flow nodes and edges via `src/graphBuilder`.
- Renders the graph using `react-flow` and calculates layout and edge routes with ELK (elkjs) `src/utils/layout.ts`.
- Everything that differs per IR (parser, default code, editor language, node
  components, edge/layout behavior) is centralized in the IR mode registry
  (`src/irModes`) — see `docs/internal/contracts/ir-mode-registry.md`. Adding
  a new IR should mean adding one registry entry plus that IR's own
  parser/AST/graphBuilder/node-component files, not editing scattered
  `if (mode === ...)` branches.

## Directory

- `docs`: Project documentation (see `docs/README.md` for the structure and rules)
  - `docs/internal/contracts`: Interface contracts between layers
  - `docs/internal/specs`: Behavior specifications
  - `docs/user`: User-facing documentation
- `src`
  - `src/ast`: AST definitions
  - `src/components`: UI components
    - `src/components/AppShell`: Full-canvas shell and floating editor panel components
    - `src/components/Editor`: Code editor components
    - `src/components/Graph`: React Flow graph components, colocated with `*.stories.tsx` files
  - `src/graphBuilder`: Logic to transform AST into React Flow graph data (nodes and edges)
  - `src/hooks`: Custom React hooks (e.g., `useGraphData`, `useIRWorkspace`)
  - `src/irModes`: The IR mode registry — one file per IR plus the aggregating `index.ts`
  - `src/parser`: Mode-specific parser implementations and Ohm-js grammar files
  - `src/types`: Global TypeScript type definitions
  - `src/utils`: Utility functions for layout (ELK), and other helpers
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
- Track proposed work and implementation progress in GitHub Issues. Issue titles must be English Conventional Commit messages suitable for the eventual squash commit.
- Always run tests after making changes.
- Always run `npm run format` after making changes.
- Always run `npm run lint` after making changes.
