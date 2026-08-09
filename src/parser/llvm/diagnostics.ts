/**
 * Diagnostic helpers for the line-oriented LLVM parser
 * (docs/internal/specs/llvm-ir.md §3.4).
 *
 * `LLVMParseDiagnostic` lives in the AST module because it is part
 * of `LLVMModule`; this file gives the parser layers one local name for it.
 * The logical-line reader's structural `LogicalLineDiagnostic` is the same
 * shape, so its diagnostics are assignable here without conversion — module
 * assembly (step 8) just collects both.
 */

import type { LLVMParseDiagnostic } from "../../ast/llvmAST";

export type { LLVMParseDiagnostic };

/** Build one recoverable diagnostic (1-based physical source line). */
export function diag(line: number, message: string): LLVMParseDiagnostic {
  return { line, message };
}
