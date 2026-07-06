import type {
  LLVMBasicBlock,
  LLVMFunction,
  LLVMGenericInstruction,
  LLVMModule,
  LLVMOpaqueTerminator,
  LLVMRetInstruction,
  LLVMTerminator,
} from "../../../ast/llvmAST";

export function createModule(overrides: Partial<LLVMModule> = {}): LLVMModule {
  return {
    type: "Module",
    functions: [],
    globalVariables: [],
    attributes: [],
    metadata: [],
    declarations: [],
    targets: [],
    sourceFilenames: [],
    ...overrides,
  };
}

export function createRetTerminator(): LLVMRetInstruction {
  return {
    type: "Instruction",
    opcode: "ret",
    valType: "void",
    originalText: "ret void",
  };
}

export function createOpaqueTerminator(
  opcode: string,
  successors: string[],
  originalText: string,
): LLVMOpaqueTerminator {
  return {
    type: "Instruction",
    opcode,
    successors,
    originalText,
  };
}

export function createBlock(
  id: string,
  terminator: LLVMTerminator,
  instructions: LLVMGenericInstruction[] = [],
): LLVMBasicBlock {
  return {
    type: "BasicBlock",
    id,
    label: id,
    instructions,
    terminator,
  };
}

export function createFunction(
  name: string,
  blocks: LLVMBasicBlock[],
): LLVMFunction {
  return {
    type: "Function",
    name,
    params: [],
    blocks,
    definition: `define void @${name}()`,
    entry: blocks[0],
  };
}
