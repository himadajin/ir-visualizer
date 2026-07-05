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
│   ├── plans/           # Plans: execution plans for refactorings and large-scale changes.
│   │                    # Completed plans are kept (with their status recorded), not deleted.
│   └── specs/           # Specs: behavior specifications for features and IR support.
│                        # Syntax accepted by parsers, graph conversion rules, etc.
│                        # Every normative claim carries a "Pinned by" test reference or an
│                        # explicit "observed, untested" marker.
└── user/                # User-facing documentation: usage, supported IR formats, known limitations.
```

## Rules

- When adding a feature or refactoring, first update (or create) the relevant document under `specs/` or `contracts/`, then change the code.
- For large-scale work, write a plan under `plans/` first and get agreement before starting.
- File names are `kebab-case.md`. Plans are dated: `YYYY-MM-<topic>.md`.
- All documents are written in English.
