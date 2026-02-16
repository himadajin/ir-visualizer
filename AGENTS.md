# AGENTS.md

## Project Overview

This project is an application that displays Intermediate Representation (IR) as a graph.
When you input into the editor on the left, Ohm-js is used to parse the syntax, and the graph is displayed in the viewer on the right.
The graph is rendered using react-flow.

### How it Works

- Parses input text into an AST using Ohm-js (`src/parser/*`).
- Converts AST into React Flow nodes and edges via `src/graphBuilder`.
- Renders the graph using `react-flow` and calculates layout with Dagre `src/utils/layout.ts`.

## Directory

- `src`
  - `src/ast`: AST definitions
  - `src/components`: UI components
    - `src/components/Editor`: Code editor components
    - `src/components/Graph`: React Flow graph components
  - `src/graphBuilder`: Logic to transform AST into React Flow graph data (nodes and edges)
  - `src/hooks`: Custom React hooks (e.g., `useGraphData`)
  - `src/pages`: Page components and debug views
  - `src/parser`: Ohm-js grammar files and parser implementations
  - `src/types`: Global TypeScript type definitions
  - `src/utils`: Utility functions for layout (Dagre), and other helpers
  - `src/__tests__`: Integration tests

## Setup commands

- Build project: `npm run build`
- Start dev server: `npm run dev`
- Lint code: `npm run lint`
- Format code: `npm run format`
- Run tests: `npm run test:run`

## Rules

- Always run tests after making changes.
- Always run `npm run format` after making changes.
- Always run `npm run lint` after making changes.
