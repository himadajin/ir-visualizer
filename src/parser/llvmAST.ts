export interface LLVMModule {
    type: 'Module';
    functions: LLVMFunction[];
    globalVariables: LLVMGlobalVariable[];
    attributes: LLVMAttributeGroup[];
    metadata: LLVMMetadata[];
    declarations: LLVMDeclaration[];
    targets: LLVMTarget[];
    sourceFilenames: LLVMSourceFilename[];
}

export interface LLVMFunction {
    type: 'Function';
    name: string;
    params: LLVMParam[];
    blocks: LLVMBasicBlock[];
    definition: string;
    entry: LLVMBasicBlock;
}

export interface LLVMParam {
    type: string;
    name: string | null;
}

export interface LLVMBasicBlock {
    type: 'BasicBlock';
    id: string;
    label: string | null;
    instructions: LLVMBasicBlockItem[];
    terminator: LLVMTerminator;
}

export type LLVMBasicBlockItem = LLVMInstruction | LLVMDebugRecord;

export interface LLVMInstruction {
    type: 'Instruction';
    opcode: string;
    result?: string; // LHS (Defined operand, e.g. "%1")
    operands: string; // RHS (e.g. "i32 0, i32 0") - keeping as string for now
    usage: LLVMOperand[];
    originalText: string;
}

export interface LLVMOperand {
    type: 'Local' | 'Global' | 'Metadata';
    value: string;
    isWrite: boolean;

}

export type LLVMTerminator = LLVMBrInstruction | LLVMRetInstruction | LLVMSwitchInstruction | LLVMInstruction;

export interface LLVMBrInstruction {
    type: 'Instruction';
    opcode: 'br';
    destination?: string; // For unconditional br
    condition?: string;   // For conditional br
    trueTarget?: string;  // For conditional br
    falseTarget?: string; // For conditional br
    originalText: string;
}

export interface LLVMRetInstruction {
    type: 'Instruction';
    opcode: 'ret';
    valType?: string;
    value?: string;
    originalText: string;
}

export interface LLVMSwitchInstruction {
    type: 'Instruction';
    opcode: 'switch';
    conditionType: string;
    conditionValue: string;
    defaultTarget: string;
    cases: LLVMSwitchCase[];
    originalText: string;
}

export interface LLVMSwitchCase {
    type: string;
    value: string;
    target: string;
}

export interface LLVMGlobalVariable {
    type: 'GlobalVariable';
    name: string;
    value: string;
    originalText: string;
}

export interface LLVMAttributeGroup {
    type: 'AttributeGroup';
    id: string;
    value: string;
    originalText: string;
}

export interface LLVMMetadata {
    type: 'Metadata';
    id: string; // e.g. "!0" or "!llvm.module.flags"
    value: string;
    originalText: string;
}

export interface LLVMDeclaration {
    type: 'Declaration';
    name: string;
    definition: string;
}

export interface LLVMTarget {
    type: 'Target';
    key: string;
    value: string;
}

export interface LLVMDebugRecord {
    type: 'DebugRecord';
    content: string;
    originalText: string;
}

export interface LLVMSourceFilename {
    type: 'SourceFilename';
    name: string;
    originalText: string;
}
