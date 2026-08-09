# docs directory

All project documentation lives here. **Documentation is the source of truth: when changing code, update the relevant document first, then modify the code.**

## Structure

```
docs/
├── internal/            # Developer-facing documentation
│   ├── architecture.md  # One-page orientation: data flow, layers, where behavior is specified.
│   │                    # Read this first.
│   ├── contracts/       # Contracts: interfaces, types, and invariants between layers.
│   │                    # Code that violates a contract is considered a bug in the code.
│   └── specs/           # Specs: behavior specifications for features and IR support.
│                        # Syntax accepted by parsers, graph conversion rules, etc.
│                        # Every normative claim carries a "Pinned by" test reference or an
│                        # explicit "observed, untested" marker.
└── user/                # User-facing documentation: usage, supported IR formats, known limitations.
```

## Rules

- When adding a feature or refactoring, first update (or create) the relevant document under `specs/` or `contracts/`, then change the code.
- Track proposals, implementation notes, and progress in GitHub Issues rather than repository documents. Issue titles are English Conventional Commit messages suitable for the eventual squash commit.
- Keep durable behavior and architectural decisions in `specs/`, `contracts/`, or `architecture.md`; Issues and pull requests must link to those documents rather than replace them.
- File names are `kebab-case.md`.
- All documents are written in English.
