# Spec: LLVM-IR mode

Behavior specification for the `llvm-ir` mode: which subset of LLVM-IR the parser accepts
(`src/parser/llvm.ohm` / `llvm.ts`) and how the AST becomes a control-flow graph
(`src/graphBuilder/llvmGraphBuilder.ts`).

Conventions: every normative statement carries a **Pinned by** reference to the test(s) that
fix the behavior. Statements marked _observed, untested_ describe current behavior with no
covering test.

## 1. Input model

The whole input is parsed as one document (an LLVM module). If any part fails to match the
grammar, `parse` throws an `Error` whose message is Ohm's match diagnostic; there is no partial
result.

> Pinned by: `src/parser/__tests__/llvm/errors.test.ts`

`;` line comments are treated as whitespace anywhere.

> Pinned by: `errors.test.ts` ("semicolon comments")

## 2. Accepted top-level entries

A module is a sequence of the following, in any order and any count:

| Entry           | Syntax accepted                                     | Parsed into                                           |
| --------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Function        | `define <header> @name(<params>) <attrs> { ... }`   | `LLVMFunction` (structural — see §3)                  |
| Declaration     | `declare <rest of line>`                            | `LLVMDeclaration` (raw text; `name` is not extracted) |
| Global variable | `@name = <rest of line>`                            | `LLVMGlobalVariable` (name + raw value text)          |
| Attribute group | `attributes #N = <rest of line>` (also `#"string"`) | `LLVMAttributeGroup` (id + raw value text)            |
| Metadata        | `!id = <rest of line>`                              | `LLVMMetadata` (id + raw value text)                  |
| Target          | `target <rest of line>`                             | `LLVMTarget`                                          |
| Type alias      | `%name = type <rest of line>`                       | Dropped (parsed, not kept in the AST)                 |
| Source filename | `source_filename = "<string>"`                      | `LLVMSourceFilename`                                  |

Entries are classified into dedicated arrays on `LLVMModule`; multiple functions keep their
source order.

> Pinned by: `src/parser/__tests__/llvm/topLevelDecls.test.ts`,
> `src/parser/__tests__/llvm/moduleStructure.test.ts`,
> `src/parser/__tests__/llvm/invariants.test.ts`

Note the "rest of line" pattern: most non-function entries are captured **textually**, not
structurally. Their bodies are never re-parsed; node components render `originalText` as-is.

## 3. Functions, blocks, instructions

- A function is `define` + free-text header (return type, cconv, etc., captured as text) +
  `@name` + parameter list + optional attribute text + a braced body.
  Parameters are parsed as `(type-ish text, %name)` pairs in order.
  > Pinned by: `moduleStructure.test.ts` ("defines parameters")
- The body is one entry block (label optional; id defaults to `entry` when unlabeled) followed
  by zero or more labeled blocks. Block order is preserved; the entry block is also stored as
  `LLVMFunction.entry`.
  > Pinned by: `moduleStructure.test.ts`, `invariants.test.ts` ("entry block inside parsed blocks")
- Block items are instructions or debug records (`#...` lines, kept as raw text). Every block
  **must end with a terminator** — `br`, `ret`, or `switch`; these are the only structurally
  parsed terminators.
  > Pinned by: `terminators.test.ts`
- Non-terminator instructions are parsed into loose categories: `store`/`cmpxchg`/`atomicrmw`
  (operand-scanned, write-target heuristics), calls (`[%dst =] [tail|musttail|notail] call ...`),
  assignments (`%x = <opcode> ...`), and generic instructions. All keep `originalText`; operand
  extraction is heuristic (globals `@x`, locals `%x`, metadata `!x`, everything else is `Other`).
  > Pinned by: `instructions.test.ts`

## 4. CFG construction rules

Node kinds produced (see `contracts/graph-data.md` for the `nodeType`↔`astData` mapping):

| `nodeType`                                                                           | One per                    | Notes                                   |
| ------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------- |
| `llvm-functionHeader`                                                                | function                   | Rounded node with the `define ...` line |
| `llvm-basicBlock`                                                                    | basic block                | Header chip shows the block label       |
| `llvm-exit`                                                                          | function **with ≥1 `ret`** | Single shared exit node per function    |
| `llvm-globalVariable` / `llvm-attributeGroup` / `llvm-metadata` / `llvm-declaration` | module entry               | Free-standing nodes, no edges           |

Edge rules:

1. Function header → entry block.
2. `br i1 %c, label %a, label %b` → two edges labeled `true` / `false`.
3. `br label %a` → one unlabeled edge.
4. `ret` → edge to the function's exit node (created on first `ret`).
5. `switch` → one edge labeled `default` plus one edge per case labeled with the case value.

> Pinned by: `src/graphBuilder/__tests__/llvm/edges.test.ts`,
> `src/graphBuilder/__tests__/llvm/nodes.test.ts`

ID namespacing: node ids embed the function name (`func_<name>_block_<label>` etc.) so multiple
functions can reuse block labels (`entry`, numeric labels) without collision; ids are unique
across the whole graph.

> Pinned by: `src/graphBuilder/__tests__/llvm/invariants.test.ts`

The produced graph always has `direction: "TD"`.

> Pinned by: `src/graphBuilder/__tests__/llvm/invariants.test.ts`,
> `src/parser/__tests__/llvm/graphData.test.ts`

## 5. Known limitations

- Only `br`/`ret`/`switch` create control-flow edges. Other terminators (`invoke`, `unreachable`,
  `callbr`, `indirectbr`, `resume`, ...) are not in the grammar; a block ending with one fails to
  parse (the whole input throws).
  > Pinned by: `errors.test.ts` ("unsupported terminator")
- `phi` instructions do not contribute edges (they are generic instructions textually).
- Blocks with no terminator are a parse error — real LLVM requires a terminator too, so this
  mainly bites hand-written snippets.
- Operand classification is heuristic; it exists for potential future use (e.g. def-use
  highlighting), and only the write-target marking of `store`/`cmpxchg`/`atomicrmw` is exercised.
- Comments (`;`) are accepted but not preserved anywhere.

Follow-ups worth considering (not planned): `invoke`/`unreachable` support; extracting
declaration names (`LLVMDeclaration.name` is currently always the literal `"declaration"`).
