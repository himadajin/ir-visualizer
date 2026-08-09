# IR Visualizer

A web application that visualizes compiler intermediate representations (IR) as graphs. Type IR text into the floating editor panel and explore the result on the full-viewport canvas.

Demo: https://himadajin.github.io/ir-visualizer/

## Supported formats

| Mode         | Input                                                                | Graph               |
| ------------ | -------------------------------------------------------------------- | ------------------- |
| LLVM-IR      | LLVM-IR module (functions, basic blocks, global variables, metadata) | CFG / Use-Def graph |
| Mermaid      | Mermaid flowchart notation (subset)                                  | Flowchart           |
| SelectionDAG | LLVM SelectionDAG dump output                                        | DAG                 |

## How it works

```
Input text
  → Parsed by the active IR mode (src/parser)
  → AST (src/ast)
  → Converted to React Flow nodes/edges (src/graphBuilder)
  → Layout and edge routes computed with ELK (src/utils/layout.ts)
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

- **Users**: [Getting started](docs/user/getting-started.md) ·
  [Supported input formats](docs/user/supported-formats.md)
- **Developers**: start with the [architecture overview](docs/internal/architecture.md);
  contracts and specs live in [docs/](docs/README.md).

Documentation is the source of truth: update the relevant document before changing code. See [AGENTS.md](AGENTS.md) for agent-facing development rules.

## License

[MIT](LICENSE)
