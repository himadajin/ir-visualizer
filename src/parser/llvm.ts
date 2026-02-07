/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import * as ohm from "ohm-js";
import llvmGrammar from "./llvm.ohm?raw";
import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type {
  LLVMModule,
  LLVMFunction,
  LLVMBasicBlock,
  LLVMInstruction,
  LLVMDebugRecord,
  LLVMBasicBlockItem,
  LLVMBrInstruction,
  LLVMRetInstruction,
  LLVMSwitchInstruction,
  LLVMOperand,
} from "./llvmAST";

let _grammar: ohm.Grammar | null = null;
let _semantics: ohm.Semantics | null = null;

function getGrammarAndSemantics() {
  if (!_grammar) {
    try {
      _grammar = ohm.grammar(llvmGrammar);
      _semantics = _grammar.createSemantics();
      registerSemantics(_semantics);
    } catch (error) {
      console.error("Failed to initialize LLVM grammar:", error);
      throw error;
    }
  }
  return { grammar: _grammar, semantics: _semantics! };
}

function registerSemantics(semantics: ohm.Semantics) {
  semantics.addOperation<any>("toAST", {
    Module(topLevels: any) {
      const children = topLevels.children
        .map((c: any) => c.toAST())
        .filter((c: any) => c !== null);
      return {
        type: "Module",
        functions: children.filter((c: any) => c && c.type === "Function"),
        globalVariables: children.filter(
          (c: any) => c && c.type === "GlobalVariable",
        ),
        attributes: children.filter(
          (c: any) => c && c.type === "AttributeGroup",
        ),
        metadata: children.filter((c: any) => c && c.type === "Metadata"),
        declarations: children.filter(
          (c: any) => c && c.type === "Declaration",
        ),
        targets: children.filter((c: any) => c && c.type === "Target"),
        sourceFilenames: children.filter(
          (c: any) => c && c.type === "SourceFilename",
        ),
      } as LLVMModule;
    },
    TopLevel(content: any) {
      return content.toAST();
    },
    EmptyLine(_space: any) {
      return null;
    },
    Function(
      def: any,
      header: any,
      name: any,
      lp: any,
      paramsNode: any,
      rp: any,
      attrs: any,
      _lb: any,
      entryBlock: any,
      otherBlocks: any,
      _rb: any,
    ) {
      const funcName = name.sourceString;
      // Handle optional attrs (Ohm ? produces empty list or result)
      const attrsStr = attrs.numChildren > 0 ? attrs.sourceString : "";
      const definition =
        `${def.sourceString} ${header.sourceString} ${funcName} ${lp.sourceString}${paramsNode.sourceString}${rp.sourceString} ${attrsStr}`
          .trim()
          .replace(/\s+/g, " ");

      const entryNode = entryBlock.toAST();
      const otherBlockNodes = otherBlocks.children.map((b: any) => b.toAST());
      const blockNodes: LLVMBasicBlock[] = [entryNode, ...otherBlockNodes];

      const params =
        paramsNode.numChildren > 0 ? paramsNode.children[0].toAST() : [];

      return {
        type: "Function",
        name: funcName,
        params,
        blocks: blockNodes,
        definition: definition,
        entry: entryNode,
      } as LLVMFunction;
    },
    Declaration(_declare: any, _rest: any) {
      return {
        type: "Declaration",
        name: "declaration", // We could parse declaration name if needed, but for now just stashing text
        definition: this.sourceString.trim(),
      };
    },
    GlobalAssignment(name: any, _eq: any, _rest: any) {
      const gName = name.sourceString;
      const fullText = this.sourceString;
      const value = fullText.substring(fullText.indexOf("=") + 1).trim();
      return {
        type: "GlobalVariable",
        name: gName,
        value: value,
        originalText: fullText,
      };
    },
    AttributeDef(_attr: any, id: any, _eq: any, _rest: any) {
      return {
        type: "AttributeGroup",
        id: id.sourceString,
        value: this.sourceString
          .substring(this.sourceString.indexOf("=") + 1)
          .trim(),
        originalText: this.sourceString,
      };
    },
    MetadataDef(id: any, _eq: any, _rest: any) {
      return {
        type: "Metadata",
        id: id.sourceString,
        value: this.sourceString
          .substring(this.sourceString.indexOf("=") + 1)
          .trim(),
        originalText: this.sourceString,
      };
    },
    TargetDef(target: any, _rest: any) {
      return {
        type: "Target",
        key: target.sourceString,
        value: this.sourceString.trim(),
      };
    },
    SourceFilename(_sf: any, _eq: any, name: any) {
      return {
        type: "SourceFilename",
        name: name.sourceString,
        originalText: this.sourceString,
      };
    },
    TypeAlias(_name: any, _eq: any, _type: any, _rest: any) {
      return null;
    },
    FuncHeader(_content: any) {
      return this.sourceString;
    },
    FuncAttrs(_content: any) {
      return this.sourceString;
    },
    Params(first: any, _comma: any, rest: any) {
      const firstParam = first.toAST();
      const restParams = rest.children.map((p: any) => p.toAST());
      return [firstParam, ...restParams];
    },
    Param(first: any, value: any) {
      return {
        type: first.sourceString.trim(),
        name: value.sourceString,
      };
    },
    EntryBasicBlock(labelOpt: any, items: any, terminator: any) {
      const labelNode =
        labelOpt.numChildren > 0 ? labelOpt.children[0].toAST() : null;
      const itemNodes: LLVMBasicBlockItem[] = items.children.map((i: any) =>
        i.toAST(),
      );
      const termNode: LLVMInstruction = terminator.toAST();
      const allItems = [...itemNodes, termNode];

      return {
        type: "BasicBlock",
        id: labelNode || "entry",
        label: labelNode || null,
        instructions: allItems,
        terminator: termNode,
      } as LLVMBasicBlock;
    },
    BasicBlock(label: any, items: any, terminator: any) {
      const labelNode = label.toAST();
      const itemNodes: LLVMBasicBlockItem[] = items.children.map((i: any) =>
        i.toAST(),
      );
      const termNode: LLVMInstruction = terminator.toAST();
      const allItems = [...itemNodes, termNode];

      return {
        type: "BasicBlock",
        id: labelNode,
        label: labelNode,
        instructions: allItems,
        terminator: termNode,
      } as LLVMBasicBlock;
    },
    BasicBlockItem(inner: any) {
      return inner.toAST();
    },
    DebugRecord(_hash: any, content: any) {
      return {
        type: "DebugRecord",
        content: content.sourceString,
        originalText: this.sourceString,
      } as LLVMDebugRecord;
    },
    Label(l: any, _colon: any) {
      return l.sourceString;
    },
    Instruction(inner: any) {
      return inner.toAST();
    },
    StoreInstruction(_store: any, argsNode: any, _meta: any) {
      const parts = argsNode.toAST();
      const operandsList: LLVMOperand[] = parts.filter((p: any) => p !== null);

      // Logic: The LAST Local/Global operand is the pointer (Write).
      let lastIdx = -1;
      operandsList.forEach((op, i) => {
        if (op.type === "Local" || op.type === "Global") lastIdx = i;
      });

      const operands = operandsList.map((op, i) => {
        if (i === lastIdx) {
          return { ...op, isWrite: true };
        }
        return op;
      });

      return {
        type: "Instruction",
        opcode: "store",
        operands: operands,
        originalText: this.sourceString,
      } as LLVMInstruction;
    },
    CmpxchgInstruction(_cmpxchg: any, argsNode: any, _meta: any) {
      const parts = argsNode.toAST();
      const operandsList: LLVMOperand[] = parts.filter((p: any) => p !== null);

      // Logic: The first operand is pointer (write).
      // cmpxchg <ty> <pointer>, <ty> <cmp>, <ty> <new> [sync scope] <ordering> <failure_ordering>
      let valCount = 0;
      const operands = operandsList.map((op) => {
        if (op.type === "Local" || op.type === "Global") {
          valCount++;
          if (valCount === 1) {
            return { ...op, isWrite: true };
          }
        }
        return op;
      });

      return {
        type: "Instruction",
        opcode: "cmpxchg",
        operands: operands,
        originalText: this.sourceString,
      } as LLVMInstruction;
    },
    AtomicRMWInstruction(_atomicrmw: any, argsNode: any, _meta: any) {
      const parts = argsNode.toAST();
      const operandsList: LLVMOperand[] = parts.filter((p: any) => p !== null);

      // Logic: The first operand is pointer (write).
      // atomicrmw <op> <ty> <pointer>, <ty> <val> <ordering>
      let valCount = 0;
      const operands = operandsList.map((op) => {
        if (op.type === "Local" || op.type === "Global") {
          valCount++;
          if (valCount === 1) {
            return { ...op, isWrite: true };
          }
        }
        return op;
      });

      return {
        type: "Instruction",
        opcode: "atomicrmw",
        operands: operands,
        originalText: this.sourceString,
      } as LLVMInstruction;
    },
    CallTarget(localVal: any, _eq: any) {
      return localVal.sourceString;
    },
    CallInstruction(
      targetOpt: any,
      opcodeNode: any,
      preArgsNode: any,
      _lp: any,
      argsNode: any,
      _rp: any,
      _postArgsNode: any,
      _meta: any,
    ) {
      const dest =
        targetOpt.numChildren > 0 ? targetOpt.children[0].toAST() : undefined;
      const opcode = opcodeNode.sourceString; // 'call', 'tail call', etc.

      const preArgs: LLVMOperand[] = preArgsNode
        .toAST()
        .filter((p: any) => p !== null);
      const callArgs: LLVMOperand[] = argsNode
        .toAST()
        .filter((p: any) => p !== null);

      // Find callee in preArgs: usually the last Local or Global
      let callee = "";
      // If no Local/Global, maybe it's an inline asm or constant, but identifying last 'value' is a good heuristic.
      for (let i = preArgs.length - 1; i >= 0; i--) {
        const op = preArgs[i];
        if (op.type === "Local" || op.type === "Global") {
          callee = op.value;
          break;
        }
      }
      // If not found, maybe just take the last thing?
      if (!callee && preArgs.length > 0) {
        callee = preArgs[preArgs.length - 1].value;
      }

      return {
        type: "Instruction",
        opcode: opcode,
        callee: callee,
        args: callArgs,
        dest: dest,
        operands: [], // Keeping base interface happy if needed, or we can populate it with all args?
        // The base `LLVMInstruction` union type doesn't enforce `operands` on `CallInstruction` specifically
        // if we defined `LLVMCallInstruction` to extend `LLVMInstructionBase` and not `LLVMGenericInstruction`.
        // But let's check LLVMInstruction type definition.
        // It is a union. `LLVMCallInstruction` has `args`.
        // `LLVMStoreInstruction` has `operands`.
        // Generic `LLVMInstruction` interface in `llvmAST.ts` (the old one) had `operands`.
        // But I replaced the type alias.
        // So I don't need 'operands' here if `LLVMCallInstruction` interface doesn't require it.
        // I checked `llvmAST.ts` content I wrote. `LLVMCallInstruction` does NOT have `operands`.
        originalText: this.sourceString,
      } as LLVMInstruction;
    },
    AssignInstruction(
      localVal: any,
      _eq: any,
      opcodeNode: any,
      argsNode: any,
      _meta: any,
    ) {
      const result = localVal.sourceString;
      const opcode = opcodeNode.sourceString;
      const parts = argsNode.toAST();
      const operandsList: LLVMOperand[] = parts.filter((p: any) => p !== null);

      return {
        type: "Instruction",
        opcode: opcode,
        result: result,
        operands: operandsList,
        originalText: this.sourceString,
      } as LLVMInstruction;
    },
    GenericInstruction(opcodeNode: any, argsNode: any, _meta: any) {
      const opcode = opcodeNode.sourceString;
      const parts = argsNode.toAST();
      const operandsList: LLVMOperand[] = parts.filter((p: any) => p !== null);

      return {
        type: "Instruction",
        opcode: opcode,
        operands: operandsList,
        originalText: this.sourceString,
      } as LLVMInstruction;
    },
    CallOpcode(_pre: any, _call: any) {
      return this.sourceString; // "tail call" etc.
    },
    args(parts: any) {
      return parts.children.map((c: any) => c.toAST());
    },
    argPart(inner: any) {
      // inner can be globalValue, localValue, metadataID, "," or argText
      if (inner.sourceString.trim() === ",") return null;

      const node = inner.toAST();
      const ruleName = inner.ctorName;

      if (ruleName === "globalValue") {
        return { type: "Global", value: node, isWrite: false };
      }
      if (ruleName === "localValue") {
        return { type: "Local", value: node, isWrite: false };
      }
      if (ruleName === "metadataID") {
        return { type: "Metadata", value: node, isWrite: false };
      }
      if (ruleName === "argText") {
        // node is the string
        return { type: "Other", value: node, isWrite: false };
      }

      // Should not happen with new grammar
      return null;
    },
    argText(_chars: any) {
      return this.sourceString;
    },
    metadataID(_bang: any, _rest: any) {
      return this.sourceString;
    },
    Terminator(inner: any) {
      return inner.toAST();
    },
    BrInstruction_conditional(
      _br: any,
      _i1: any,
      cond: any,
      _comma1: any,
      _l1: any,
      trueLabel: any,
      _comma2: any,
      _l2: any,
      falseLabel: any,
    ) {
      return {
        type: "Instruction",
        opcode: "br",
        condition: cond.toAST(),
        trueTarget: trueLabel.toAST(),
        falseTarget: falseLabel.toAST(),
        originalText: this.sourceString,
      } as LLVMBrInstruction;
    },
    BrInstruction_unconditional(_br: any, _label: any, dest: any) {
      return {
        type: "Instruction",
        opcode: "br",
        destination: dest.toAST(),
        originalText: this.sourceString,
      } as LLVMBrInstruction;
    },
    RetInstruction(_ret: any, typeNode: any, valNode: any, _meta: any) {
      const val =
        valNode.numChildren > 0 ? valNode.children[0].toAST() : undefined;
      return {
        type: "Instruction",
        opcode: "ret",
        valType: typeNode.sourceString,
        value: val,
        originalText: this.sourceString,
      } as LLVMRetInstruction;
    },
    SwitchInstruction(
      _switch: any,
      typeNode: any,
      valNode: any,
      _comma: any,
      _l: any,
      defaultLabel: any,
      _lb: any,
      cases: any,
      _rb: any,
      _meta: any,
    ) {
      const caseNodes = cases.children.map((c: any) => c.toAST());
      return {
        type: "Instruction",
        opcode: "switch",
        conditionType: typeNode.sourceString,
        conditionValue: valNode.toAST(),
        defaultTarget: defaultLabel.toAST(),
        cases: caseNodes,
        originalText: this.sourceString,
      } as LLVMSwitchInstruction;
    },
    SwitchCase(
      typeNode: any,
      valNode: any,
      _comma: any,
      _l: any,
      targetLabel: any,
    ) {
      return {
        type: typeNode.sourceString,
        value: valNode.toAST(),
        target: targetLabel.toAST(),
      };
    },
    Value(v: any) {
      const raw = v.sourceString;
      return raw.startsWith("%") ? raw.substring(1) : raw;
    },
    type(_content: any) {
      return this.sourceString;
    },
    localValue(_percent: any, val: any) {
      return val.sourceString;
    },
    globalValue(_at: any, val: any) {
      return val.sourceString;
    },
    _iter(...children: any[]) {
      return children.map((c) => c.toAST());
    },
    _terminal() {
      return this.sourceString;
    },
  });
}

function convertASTToGraph(module: LLVMModule): GraphData {
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
    });

    const blocks = func.blocks;

    blocks.forEach((block) => {
      // Block IDs need to be scoped to function because 'entry' or numbered blocks '%1' repeat across functions.
      // Using a composite ID: funcName_blockName
      const rawBlockId = block.id;
      // block.id comes from Label rule (ident) or 'entry'.
      // If it's a numeric label from source (like "4:"), ohm might capture "4".
      const blockId = `${funcPrefix}_block_${rawBlockId}`;

      const codeContent = block.instructions
        .map((i) => i.originalText)
        .join("\n");

      nodes.push({
        id: blockId,
        label: codeContent,
        blockLabel: block.label || undefined,
        type: "square",
        language: "llvm",
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
              label: val, // We need the value from AST. Currently AST has `value` as node, need string?
              // Wait, `value` in switch case is `type Value`. `toAST` returns it as string if it's digit or %val.
              // Let's check `SwitchCase` semantics.
              // `value` is `valNode.toAST()`. `Value` rule returns string (substring(1) if %) or digits.
              // So it is a string.
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

export function parseLLVM(input: string): GraphData {
  const { grammar, semantics } = getGrammarAndSemantics();
  const match = grammar.match(input);
  if (match.failed()) {
    console.error("LLVM Parse Error:", match.message);
    throw new Error(match.message);
  }
  const nodes = semantics(match).toAST() as LLVMModule;
  return convertASTToGraph(nodes);
}

export function parseLLVMToAST(input: string): LLVMModule {
  const { grammar, semantics } = getGrammarAndSemantics();
  const match = grammar.match(input);
  if (match.failed()) {
    throw new Error(match.message);
  }
  return semantics(match).toAST() as LLVMModule;
}
