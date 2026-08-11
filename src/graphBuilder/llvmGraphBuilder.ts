import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type { LLVMModule, LLVMBasicBlock } from "../ast/llvmAST";
import {
  attributeGroupId,
  basicBlockId,
  declarationId,
  edgeId,
  functionExitId,
  functionHeaderId,
  functionId,
  globalVariableId,
  metadataId,
} from "./llvmIds";

/**
 * Build the label text from a BasicBlock's instructions and terminator.
 * This is used both for the label field (fallback / dimension calculation)
 * and matches what BasicBlockNode renders from the AST.
 */
function buildBasicBlockLabel(block: LLVMBasicBlock): string {
  const lines: string[] = block.instructions.map((i) => i.originalText);
  if (block.terminator) {
    lines.push(block.terminator.originalText);
  }
  return lines.join("\n");
}

export function convertASTToGraph(module: LLVMModule): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 1. Process Global Variables
  if (module.globalVariables) {
    module.globalVariables.forEach((gVar) => {
      nodes.push({
        id: globalVariableId(gVar.name),
        label: gVar.originalText,
        type: "square",
        language: "llvm",
        nodeType: "llvm-globalVariable",
        astData: gVar,
      });
    });
  }

  // 2. Process Attributes
  if (module.attributes) {
    module.attributes.forEach((attr) => {
      nodes.push({
        id: attributeGroupId(attr.id),
        label: attr.originalText,
        type: "square",
        language: "llvm",
        nodeType: "llvm-attributeGroup",
        astData: attr,
      });
    });
  }

  // 3. Process Metadata
  if (module.metadata) {
    module.metadata.forEach((meta) => {
      nodes.push({
        id: metadataId(meta.id),
        label: meta.originalText,
        type: "square",
        language: "llvm",
        nodeType: "llvm-metadata",
        astData: meta,
      });
    });
  }

  // 4. Process Declarations
  if (module.declarations) {
    module.declarations.forEach((decl, index) => {
      nodes.push({
        id: declarationId(index),
        label: decl.definition,
        type: "square",
        language: "llvm",
        nodeType: "llvm-declaration",
        astData: decl,
      });
    });
  }

  // 5. Process Functions
  module.functions.forEach((func) => {
    // Every id below hangs off the function's own namespace (§4.1), so blocks
    // and values may reuse labels such as `entry` across functions.
    const funcPrefix = functionId(func.name);
    const headerId = functionHeaderId(funcPrefix);

    // Entry Node
    nodes.push({
      id: headerId,
      label: func.definition || `define ${func.name} (...)`,
      type: "round",
      language: "llvm",
      nodeType: "llvm-functionHeader",
      astData: {
        definition: func.definition || `define ${func.name} (...)`,
        name: func.name,
      },
    });

    const blocks = func.blocks;

    blocks.forEach((block) => {
      const blockId = basicBlockId(funcPrefix, block.id);

      nodes.push({
        id: blockId,
        label: buildBasicBlockLabel(block),
        blockLabel: block.label || undefined,
        type: "square",
        language: "llvm",
        nodeType: "llvm-basicBlock",
        astData: block,
      });

      if (block.terminator) {
        const terminator = block.terminator;

        // Terminator dispatch narrows on SHAPE (field presence), not on
        // opcode alone: the parser degrades a br / switch / invoke whose
        // structure it cannot find to an LLVMOpaqueTerminator that keeps
        // the opcode but carries only `successors` (spec §3.2). An
        // opcode-based switch would read fields such a node does not have.
        if ("condition" in terminator && terminator.condition !== undefined) {
          // Conditional branch: true / false labeled edges.
          const trueId = basicBlockId(funcPrefix, terminator.trueTarget ?? "");
          const falseId = basicBlockId(
            funcPrefix,
            terminator.falseTarget ?? "",
          );

          edges.push({
            id: edgeId(blockId, trueId, "true"),
            source: blockId,
            target: trueId,
            label: "true",
            type: "arrow",
          });
          edges.push({
            id: edgeId(blockId, falseId, "false"),
            source: blockId,
            target: falseId,
            label: "false",
            type: "arrow",
          });
        } else if (
          "destination" in terminator &&
          terminator.destination !== undefined
        ) {
          // Unconditional branch: one unlabeled edge.
          const targetId = basicBlockId(funcPrefix, terminator.destination);
          edges.push({
            id: edgeId(blockId, targetId),
            source: blockId,
            target: targetId,
            type: "arrow",
          });
        } else if (terminator.opcode === "ret") {
          // ret has no positive shape marker; the parser never produces an
          // opaque node with opcode "ret", so the opcode check is exact.
          // One shared exit node per function, created on first ret.
          const exitId = functionExitId(funcPrefix);

          if (!nodes.find((n) => n.id === exitId)) {
            nodes.push({
              id: exitId,
              label: "exit",
              type: "round",
              language: "text",
              nodeType: "llvm-exit",
              astData: {},
            });
          }

          edges.push({
            id: edgeId(blockId, exitId),
            source: blockId,
            target: exitId,
            type: "arrow",
          });
        } else if ("defaultTarget" in terminator) {
          // Structured switch: default edge + one labeled edge per case.
          const defaultId = basicBlockId(funcPrefix, terminator.defaultTarget);
          edges.push({
            id: edgeId(blockId, defaultId, "default"),
            source: blockId,
            target: defaultId,
            label: "default",
            type: "arrow",
          });

          terminator.cases.forEach((c) => {
            const targetId = basicBlockId(funcPrefix, c.target);
            edges.push({
              id: edgeId(blockId, targetId, "case", c.value),
              source: blockId,
              target: targetId,
              label: c.value,
              type: "arrow",
            });
          });
        } else if ("normalTarget" in terminator) {
          // Structured invoke: `to`- and `unwind`-labeled edges.
          const toId = basicBlockId(funcPrefix, terminator.normalTarget);
          const unwindId = basicBlockId(funcPrefix, terminator.unwindTarget);
          edges.push({
            id: edgeId(blockId, toId, "to"),
            source: blockId,
            target: toId,
            label: "to",
            type: "arrow",
          });
          edges.push({
            id: edgeId(blockId, unwindId, "unwind"),
            source: blockId,
            target: unwindId,
            label: "unwind",
            type: "arrow",
          });
        } else if ("successors" in terminator) {
          // Uniform successor rule: one unlabeled edge per successor
          // (callbr, indirectbr, catchret, cleanupret, catchswitch, and
          // degraded br/switch/invoke). unreachable / resume / unwind
          // arrive with successors: [] and correctly gain no edge.
          terminator.successors.forEach((successor, index) => {
            const targetId = basicBlockId(funcPrefix, successor);
            edges.push({
              id: edgeId(blockId, targetId, "succ", String(index)),
              source: blockId,
              target: targetId,
              type: "arrow",
            });
          });
        }
      }
    });

    if (func.entry) {
      const entryBlockId = basicBlockId(funcPrefix, func.entry.id);
      edges.push({
        id: edgeId(headerId, entryBlockId),
        source: headerId,
        target: entryBlockId,
        type: "arrow",
      });
    }
  });

  return { nodes, edges, direction: "TD" };
}
