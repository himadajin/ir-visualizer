/**
 * Entry points for the line-oriented LLVM parser
 * (docs/internal/specs/llvm-ir.md §1).
 *
 * Same signatures as the removed Ohm-based parser's exports; re-exported by
 * ./index.ts since step 9. Edge emission for every terminator kind —
 * including invoke and opaque-successor terminators — lives in
 * `convertASTToGraph` (src/graphBuilder/llvmGraphBuilder.ts).
 */

import type { GraphData } from "../../types/graph";
import type { LLVMModule, LLVMParseDiagnostic } from "../../ast/llvmAST";
import { convertASTToGraph } from "../../graphBuilder/llvmGraphBuilder";
import { convertASTToUseDefGraph } from "../../graphBuilder/llvmUseDefGraphBuilder";
import { buildModule } from "./module";

/**
 * A graph plus the recoverable diagnostics recorded on the way to it
 * (specs/llvm-ir.md §3.4). Structurally an `IRParseResult`
 * (contracts/ir-mode-registry.md), so `llvmMode` passes it straight through —
 * the parser layer does not import from the registry to say so.
 */
export interface LLVMParseResult {
  graph: GraphData;
  /** Absent when the parse was clean (`LLVMModule.diagnostics` is optional). */
  diagnostics?: LLVMParseDiagnostic[];
}

export function parseLLVMToAST(input: string): LLVMModule {
  return buildModule(input);
}

export function parseLLVM(input: string): LLVMParseResult {
  const module = buildModule(input);
  return { graph: convertASTToGraph(module), diagnostics: module.diagnostics };
}

/**
 * Use-Def projection of the same text: the second view of the `llvm-ir`
 * mode (docs/internal/specs/llvm-use-def-view.md). Same AST, different
 * graphBuilder — no parser changes are involved, so its diagnostics are the
 * same ones the CFG view reports.
 */
export function parseLLVMUseDef(input: string): LLVMParseResult {
  const module = buildModule(input);
  return {
    graph: convertASTToUseDefGraph(module),
    diagnostics: module.diagnostics,
  };
}
