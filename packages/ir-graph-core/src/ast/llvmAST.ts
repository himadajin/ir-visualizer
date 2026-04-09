export interface LLVMModule {
  type: "Module";
  functions: LLVMFunction[];
  globalVariables: LLVMGlobalVariable[];
  attributes: LLVMAttributeGroup[];
  metadata: LLVMMetadata[];
  declarations: LLVMDeclaration[];
  targets: LLVMTarget[];
  sourceFilenames: LLVMSourceFilename[];
}

export interface LLVMFunction {
  type: "Function";
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
  type: "BasicBlock";
  id: string;
  label: string | null;
  instructions: LLVMBasicBlockItem[];
  terminator: LLVMTerminator;
}

export type LLVMBasicBlockItem = LLVMInstruction | LLVMDebugRecord;

export type LLVMInstruction =
  | LLVMStoreInstruction
  | LLVMCmpxchgInstruction
  | LLVMAtomicRMWInstruction
  | LLVMBrInstruction
  | LLVMRetInstruction
  | LLVMSwitchInstruction
  | LLVMCallInstruction
  | LLVMGenericInstruction;

// Base interface for shared properties if needed,
// allows discriminated union by 'opcode' effectively if we expand it properly,
// but for now we rely on the specific interfaces.
interface LLVMInstructionBase {
  type: "Instruction";
  originalText: string;
}

export interface LLVMGenericInstruction extends LLVMInstructionBase {
  opcode: string;
  result?: string;
  operands: LLVMOperand[];
}

export interface LLVMStoreInstruction extends LLVMInstructionBase {
  opcode: "store";
  operands: LLVMOperand[];
}

export interface LLVMCmpxchgInstruction extends LLVMInstructionBase {
  opcode: "cmpxchg";
  operands: LLVMOperand[];
}

export interface LLVMAtomicRMWInstruction extends LLVMInstructionBase {
  opcode: "atomicrmw";
  operands: LLVMOperand[];
}

export interface LLVMCallInstruction extends LLVMInstructionBase {
  opcode: string; // 'call', 'tail call', etc.
  callee: string;
  args: LLVMOperand[];
  dest?: string; // result variable
}

export interface LLVMOperand {
  type: "Local" | "Global" | "Metadata" | "Other";
  value: string;
  isWrite: boolean;
}

export type LLVMTerminator =
  | LLVMBrInstruction
  | LLVMRetInstruction
  | LLVMSwitchInstruction
  | LLVMCallInstruction
  | LLVMGenericInstruction;

export interface LLVMBrInstruction extends LLVMInstructionBase {
  opcode: "br";
  destination?: string; // For unconditional br
  condition?: string; // For conditional br
  trueTarget?: string; // For conditional br
  falseTarget?: string; // For conditional br
}

export interface LLVMRetInstruction extends LLVMInstructionBase {
  opcode: "ret";
  valType?: string;
  value?: string;
}

export interface LLVMSwitchInstruction extends LLVMInstructionBase {
  opcode: "switch";
  conditionType: string;
  conditionValue: string;
  defaultTarget: string;
  cases: LLVMSwitchCase[];
}

export interface LLVMSwitchCase {
  type: string;
  value: string;
  target: string;
}

export interface LLVMGlobalVariable {
  type: "GlobalVariable";
  name: string;
  value: string;
  originalText: string;
}

export interface LLVMAttributeGroup {
  type: "AttributeGroup";
  id: string;
  value: string;
  originalText: string;
}

export interface LLVMMetadata {
  type: "Metadata";
  id: string; // e.g. "!0" or "!llvm.module.flags"
  value: string;
  originalText: string;
}

export interface LLVMDeclaration {
  type: "Declaration";
  name: string;
  definition: string;
}

export interface LLVMTarget {
  type: "Target";
  key: string;
  value: string;
}

export interface LLVMDebugRecord {
  type: "DebugRecord";
  content: string;
  originalText: string;
}

export interface LLVMSourceFilename {
  type: "SourceFilename";
  name: string;
  originalText: string;
}
