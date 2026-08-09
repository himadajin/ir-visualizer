# AGENTS.md

## Project Overview

This project is an application that displays Intermediate Representation (IR) as a graph.
When you enter text in the editor, the active IR mode parses it and displays the resulting graph.
The graph is rendered using react-flow.

## Engineering Principles

- Do not preserve backwards compatibility.
  Remove obsolete paths instead of adding compatibility layers, migrations.
- Choose the simplest implementation that fully meets the current requirements.
  Avoid speculative abstractions, configuration, and indirection.
- Keep components modular and concerns clearly separated.
- Make architecture decisions for the long term.
  Do not accept stopgap that only works for now and is meant to be replaced later.

## Architecture

See `docs/internal/architecture.md` for the data-flow diagram and layer map.

One constraint to uphold: everything that differs per IR (parser, default code, editor language, node components, edge/layout behavior)
is centralized in the IR mode registry (`src/irModes`) — see `docs/internal/contracts/ir-mode-registry.md`.
Adding a new IR means adding one registry entry plus that IR's own
parser/AST/graphBuilder/node-component files, not editing scattered `if (mode === ...)` branches.

## Repository notes

Only the non-obvious conventions; explore `src/` directly for the rest.

- `docs/` has its own structure and rules — see `docs/README.md`.
- Graph node components in `src/components/Graph` are colocated with their `*.stories.tsx` files.
- `e2e/` contains Playwright smoke tests only; unit/integration tests live in `src`.

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

- Documentation-first: `docs/` is the source of truth.
  Before changing code, update the relevant document under `docs/` (create it if missing).
  See `docs/README.md`.
- Track proposed work and implementation progress in GitHub Issues.
- After making changes, run `npm run test:run`, `npm run format`, and `npm run lint`.

## Commits, issues, and pull requests

Two principles govern how changes are named and described.

A change has one name, and that name is its commit message.
Titles for issues, PRs, and commits alike follow [Conventional Commits](https://www.conventionalcommits.org/)
(e.g. `docs: update config schema`, `feat(match): add typo-tolerant matching`, `fix(zle): clear listing on accept-line`)
and are written in English so they flow through tooling.
The issue names the change first; the PR reuses that title verbatim,
so it lands on `main` unedited as the commit message on squash merge.
GitHub appends the ` (#N)` suffix at that point.
Include a scope once the affected component is known.

An issue body is written for a future reader who has no access to the conversation that spawned it.
Open with one or two paragraphs stating the current state, the change or decision being made, and the reason;
the body should stand on its own from there. Use vocabulary the reader can resolve:
refer to other issues as `#N` plus a short description,
and accompany any number used as evidence with its measurement environment and reproduction steps.
Bodies may be English or Japanese.
