import { CFG_TARGET_HANDLE, getCFGSuccessors } from "./llvmCFGSuccessors";
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

      for (const successor of getCFGSuccessors(block.terminator)) {
        const targetId =
          successor.target === null
            ? functionExitId(funcPrefix)
            : basicBlockId(funcPrefix, successor.target);

        if (
          successor.target === null &&
          !nodes.some((node) => node.id === targetId)
        ) {
          nodes.push({
            id: targetId,
            label: "exit",
            type: "round",
            language: "text",
            nodeType: "llvm-exit",
            astData: {},
          });
        }
        edges.push({
          id: edgeId(blockId, targetId, ...successor.edgeVariant),
          source: blockId,
          target: targetId,
          sourceHandle: successor.id,
          ...(successor.target === null
            ? {}
            : { targetHandle: CFG_TARGET_HANDLE }),
          ...(successor.label === undefined ? {} : { label: successor.label }),
          type: "arrow",
        });
      }
    });

    if (func.entry) {
      const entryBlockId = basicBlockId(funcPrefix, func.entry.id);
      edges.push({
        id: edgeId(headerId, entryBlockId),
        source: headerId,
        target: entryBlockId,
        targetHandle: CFG_TARGET_HANDLE,
        type: "arrow",
      });
    }
  });

  return { nodes, edges, direction: "TD" };
}
