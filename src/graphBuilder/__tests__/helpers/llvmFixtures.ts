import type {
  LLVMBasicBlock,
  LLVMBrInstruction,
  LLVMFunction,
  LLVMGenericInstruction,
  LLVMModule,
  LLVMRetInstruction,
  LLVMSwitchInstruction,
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

export function createBlock(
  id: string,
  terminator: LLVMBrInstruction | LLVMRetInstruction | LLVMSwitchInstruction,
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
