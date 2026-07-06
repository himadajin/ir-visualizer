import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type { LLVMModule, LLVMBasicBlock } from "../ast/llvmAST";

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

  // Helper to generate unique IDs if necessary
  const uniqueId = (prefix: string, name: string) =>
    `${prefix}_${name.replace(/[@%"]/g, "")}`;

  // 1. Process Global Variables
  if (module.globalVariables) {
    module.globalVariables.forEach((gVar) => {
      nodes.push({
        id: uniqueId("global", gVar.name),
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
        id: uniqueId("attr", attr.id),
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
        id: uniqueId("meta", meta.id),
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
    module.declarations.forEach((decl) => {
      nodes.push({
        id: uniqueId("decl", decl.name),
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
    // Namespace function blocks to avoid collisions if multiple functions use same labels (e.g. "entry")
    // Although LLVM IR usually has implicit or explicit numbering that prevents simple clashes,
    // separate functions definitely have separate scopes.
    const funcPrefix = uniqueId("func", func.name);
    const headerId = `${funcPrefix}_header`;

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
      // Block IDs need to be scoped to function because 'entry' or numbered blocks '%1' repeat across functions.
      // Using a composite ID: funcName_blockName
      const rawBlockId = block.id;
      // block.id comes from Label rule (ident) or 'entry'.
      // If it's a numeric label from source (like "4:"), ohm might capture "4".
      const blockId = `${funcPrefix}_block_${rawBlockId}`;

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
          const trueId = `${funcPrefix}_block_${terminator.trueTarget ?? ""}`;
          const falseId = `${funcPrefix}_block_${terminator.falseTarget ?? ""}`;

          edges.push({
            id: `e-${blockId}-${trueId}-true`,
            source: blockId,
            target: trueId,
            label: "true",
            type: "arrow",
          });
          edges.push({
            id: `e-${blockId}-${falseId}-false`,
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
          const targetId = `${funcPrefix}_block_${terminator.destination}`;
          edges.push({
            id: `e-${blockId}-${targetId}`,
            source: blockId,
            target: targetId,
            type: "arrow",
          });
        } else if (terminator.opcode === "ret") {
          // ret has no positive shape marker; the parser never produces an
          // opaque node with opcode "ret", so the opcode check is exact.
          // One shared exit node per function, created on first ret.
          const exitId = `${funcPrefix}_exit`;

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
            id: `e-${blockId}-${exitId}`,
            source: blockId,
            target: exitId,
            type: "arrow",
          });
        } else if ("defaultTarget" in terminator) {
          // Structured switch: default edge + one labeled edge per case.
          const defaultId = `${funcPrefix}_block_${terminator.defaultTarget}`;
          edges.push({
            id: `e-${blockId}-${defaultId}-default`,
            source: blockId,
            target: defaultId,
            label: "default",
            type: "arrow",
          });

          terminator.cases.forEach((c) => {
            const targetId = `${funcPrefix}_block_${c.target}`;
            edges.push({
              id: `e-${blockId}-${targetId}-case-${c.value}`,
              source: blockId,
              target: targetId,
              label: c.value,
              type: "arrow",
            });
          });
        } else if ("normalTarget" in terminator) {
          // Structured invoke: `to`- and `unwind`-labeled edges.
          const toId = `${funcPrefix}_block_${terminator.normalTarget}`;
          const unwindId = `${funcPrefix}_block_${terminator.unwindTarget}`;
          edges.push({
            id: `e-${blockId}-${toId}-to`,
            source: blockId,
            target: toId,
            label: "to",
            type: "arrow",
          });
          edges.push({
            id: `e-${blockId}-${unwindId}-unwind`,
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
            const targetId = `${funcPrefix}_block_${successor}`;
            edges.push({
              id: `e-${blockId}-${targetId}-s${String(index)}`,
              source: blockId,
              target: targetId,
              type: "arrow",
            });
          });
        }
      }
    });

    if (func.entry) {
      const entryBlockId = `${funcPrefix}_block_${func.entry.id}`;
      edges.push({
        id: `e-${headerId}-${entryBlockId}`,
        source: headerId,
        target: entryBlockId,
        type: "arrow",
      });
    }
  });

  return { nodes, edges, direction: "TD" };
}
