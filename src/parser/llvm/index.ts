// Entry point for the LLVM-IR parser: the line-oriented implementation
// (docs/internal/plans/2026-07-llvm-line-oriented-parser.md, step 9).
// legacy.ts / llvm.ohm remain only until step 10 deletes them.
export { parseLLVM, parseLLVMToAST } from "./parse";
