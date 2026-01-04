export interface LLVMModule {
    type: 'Module';
    functions: LLVMFunction[];
}

export interface LLVMFunction {
    type: 'Function';
    name: string;
    params: LLVMParam[];
    blocks: LLVMBasicBlock[];
    definition: string;
}

export interface LLVMParam {
    type: string;
    name: string | null;
}

export interface LLVMBasicBlock {
    type: 'BasicBlock';
    id: string;
    label?: string;
    instructions: LLVMInstruction[];
}

export interface LLVMInstruction {
    type: 'Instruction';
    opcode: string;
    result?: string; // LHS (Defined operand, e.g. "%1")
    operands: string; // RHS (e.g. "i32 0, i32 0") - keeping as string for now
    originalText: string;
}
