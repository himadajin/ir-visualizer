/**
 * Entry points for the line-oriented LLVM parser
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §3, step 8).
 *
 * Same signatures as the legacy exports in ./legacy.ts. NOT re-exported by
 * ./index.ts yet — step 9 flips the index to this implementation; until
 * then only the step-8 compat/corpus suites consume these directly.
 *
 * Step-8 shim (deleted in step 9): `convertASTToGraph` predates the new
 * terminator kinds and only emits edges for br / ret / switch. Step 9
 * teaches the graphBuilder about invoke `to`/`unwind` edges and
 * opaque-terminator successor edges (plan §6, step 9); step 8 may not touch
 * existing files, so `parseLLVM` appends those edges here to satisfy the
 * corpus CFG projections. unreachable / resume / unwind have no successors
 * and correctly gain no edge.
 */

import type { GraphData } from "../../types/graph";
import type { LLVMModule } from "../../ast/llvmAST";
import { convertASTToGraph } from "../../graphBuilder/llvmGraphBuilder";
import { buildModule } from "./module";

/** Mirrors the graphBuilder's node id scheme (`func_<name>_block_<id>`). */
function nodeId(prefix: string, name: string): string {
  return `${prefix}_${name.replace(/[@%"]/g, "")}`;
}

/** Append invoke and opaque-successor edges (see the step-8 shim note). */
function addNewTerminatorEdges(module: LLVMModule, graph: GraphData): void {
  for (const func of module.functions) {
    const funcPrefix = nodeId("func", func.name);
    for (const block of func.blocks) {
      const blockId = `${funcPrefix}_block_${block.id}`;
      const terminator = block.terminator;
      if (terminator.opcode === "invoke" && "normalTarget" in terminator) {
        const toId = `${funcPrefix}_block_${terminator.normalTarget}`;
        const unwindId = `${funcPrefix}_block_${terminator.unwindTarget}`;
        graph.edges.push({
          id: `e-${blockId}-${toId}-to`,
          source: blockId,
          target: toId,
          label: "to",
          type: "arrow",
        });
        graph.edges.push({
          id: `e-${blockId}-${unwindId}-unwind`,
          source: blockId,
          target: unwindId,
          label: "unwind",
          type: "arrow",
        });
      } else if ("successors" in terminator) {
        terminator.successors.forEach((successor, index) => {
          const targetId = `${funcPrefix}_block_${successor}`;
          graph.edges.push({
            id: `e-${blockId}-${targetId}-s${String(index)}`,
            source: blockId,
            target: targetId,
            type: "arrow",
          });
        });
      }
    }
  }
}

export function parseLLVMToAST(input: string): LLVMModule {
  return buildModule(input);
}

export function parseLLVM(input: string): GraphData {
  const module = buildModule(input);
  const graph = convertASTToGraph(module);
  addNewTerminatorEdges(module, graph);
  return graph;
}
