import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type {
  LLVMModule,
  LLVMBasicBlock,
  LLVMBrInstruction,
  LLVMSwitchInstruction,
} from "../ast/llvmAST";

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
        astData: gVar as unknown as Record<string, unknown>,
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
        astData: attr as unknown as Record<string, unknown>,
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
        astData: meta as unknown as Record<string, unknown>,
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
        astData: decl as unknown as Record<string, unknown>,
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
        astData: block as unknown as Record<string, unknown>,
      });

      if (block.terminator) {
        const terminator = block.terminator;

        if (terminator.opcode === "br") {
          const br = terminator as LLVMBrInstruction;
          if (br.condition) {
            // Conditional Branch
            const trueTarget = br.trueTarget!;
            const falseTarget = br.falseTarget!;

            const trueId = `${funcPrefix}_block_${trueTarget}`;
            const falseId = `${funcPrefix}_block_${falseTarget}`;

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
          } else if (br.destination) {
            // Unconditional Branch
            const target = br.destination;
            const targetId = `${funcPrefix}_block_${target}`;
            edges.push({
              id: `e-${blockId}-${targetId}`,
              source: blockId,
              target: targetId,
              type: "arrow",
            });
          }
        } else if (terminator.opcode === "ret") {
          // Unique exit per function? Or shared exit?
          // Typically CFG has unique exit per function.
          const exitId = `${funcPrefix}_exit`;

          // Check if exit node exists for this function, if not add it
          if (!nodes.find((n) => n.id === exitId)) {
            nodes.push({
              id: exitId,
              label: "exit",
              type: "round", // Exit is usually round
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
        } else if (terminator.opcode === "switch") {
          const sw = terminator as LLVMSwitchInstruction;

          // Default case
          const defaultTarget = sw.defaultTarget;
          const defaultId = `${funcPrefix}_block_${defaultTarget}`;
          edges.push({
            id: `e-${blockId}-${defaultId}-default`,
            source: blockId,
            target: defaultId,
            label: "default",
            type: "arrow",
          });

          // Other cases
          sw.cases.forEach((c) => {
            const val = c.value;
            const target = c.target;
            const targetId = `${funcPrefix}_block_${target}`;

            edges.push({
              id: `e-${blockId}-${targetId}-case-${val}`,
              source: blockId,
              target: targetId,
              label: val,
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
