/**
 * Entry points for the line-oriented LLVM parser
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §3, steps 8–9).
 *
 * Same signatures as the removed Ohm-based parser's exports; re-exported by
 * ./index.ts since step 9. Edge emission for every terminator kind —
 * including invoke and opaque-successor terminators — lives in
 * `convertASTToGraph` (src/graphBuilder/llvmGraphBuilder.ts).
 */

import type { GraphData } from "../../types/graph";
import type { LLVMModule } from "../../ast/llvmAST";
import { convertASTToGraph } from "../../graphBuilder/llvmGraphBuilder";
import { buildModule } from "./module";

export function parseLLVMToAST(input: string): LLVMModule {
  return buildModule(input);
}

export function parseLLVM(input: string): GraphData {
  return convertASTToGraph(buildModule(input));
}
