# IR Visualizer

A web application that visualizes compiler intermediate representations (IR) as graphs. Type IR text into the editor on the left, and the graph is rendered on the right.

Demo: https://himadajin.github.io/ir-visualizer/

## Supported formats

| Mode         | Input                                                                | Graph                    |
| ------------ | -------------------------------------------------------------------- | ------------------------ |
| LLVM-IR      | LLVM-IR module (functions, basic blocks, global variables, metadata) | Control flow graph (CFG) |
| Mermaid      | Mermaid flowchart notation (subset)                                  | Flowchart                |
| SelectionDAG | LLVM SelectionDAG dump output                                        | DAG                      |

## How it works

```
Input text
  → Parsed with Ohm-js (src/parser)
  → AST (src/ast)
  → Converted to React Flow nodes/edges (src/graphBuilder)
  → Layout computed with Dagre (src/utils/layout.ts)
  → Rendered with React Flow (src/components/Graph)
```

## Development

Requires Node.js 24 or later (see `.nvmrc`).

```bash
npm ci                 # Install dependencies
npm run dev            # Start dev server
npm run build          # Production build (includes type check)
npm run test           # Run unit/integration tests (watch mode)
npm run test:run       # Run unit/integration tests once
npm run test:coverage  # Run unit/integration tests with coverage
npm run test:e2e       # Run Playwright smoke E2E tests
npm run storybook      # Start Storybook (component gallery for graph nodes)
npm run lint           # ESLint
npm run format         # Format with Prettier
```

Pushes to `main` are automatically deployed to GitHub Pages (`.github/workflows/deploy.yml`).

## Documentation

Design docs, specs, and plans live in [docs/](docs/README.md). Documentation is the source of truth: update the relevant document before changing code. See [AGENTS.md](AGENTS.md) for agent-facing development rules.

## License

[MIT](LICENSE)
