// Entry point for the LLVM-IR parser. Currently re-exports the legacy
// Ohm-based implementation; step 9 of
// docs/internal/plans/2026-07-llvm-line-oriented-parser.md switches this to
// the line-oriented parser, and step 10 deletes legacy.ts.
export { parseLLVM, parseLLVMToAST } from "./legacy";
