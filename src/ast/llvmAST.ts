export interface LLVMModule {
  type: "Module";
  functions: LLVMFunction[];
  globalVariables: LLVMGlobalVariable[];
  attributes: LLVMAttributeGroup[];
  metadata: LLVMMetadata[];
  declarations: LLVMDeclaration[];
  targets: LLVMTarget[];
  sourceFilenames: LLVMSourceFilename[];
  /**
   * Recoverable parse oddities (plan §3.4) recorded by the line-oriented
   * parser; absent for a clean parse. Structural errors still throw.
   */
  diagnostics?: LLVMParseDiagnostic[];
}

/** One recoverable parse diagnostic (plan §4, step 7). */
export interface LLVMParseDiagnostic {
  /** 1-based physical source line number. */
  line: number;
  message: string;
}

export interface LLVMFunction {
  type: "Function";
  name: string;
  params: LLVMParam[];
  blocks: LLVMBasicBlock[];
  definition: string;
  entry: LLVMBasicBlock;
}

/** astData shape for the synthetic function-header node (not a distinct AST node in its own right). */
export interface LLVMFunctionHeaderData {
  definition: string;
  name: string;
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
  | LLVMInvokeInstruction
  | LLVMOpaqueTerminator
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
  | LLVMInvokeInstruction
  | LLVMOpaqueTerminator
  | LLVMGenericInstruction;

export interface LLVMInvokeInstruction extends LLVMInstructionBase {
  opcode: "invoke";
  /** Callee name without its sigil (legacy `LLVMCallInstruction` convention). */
  callee: string;
  /** Block id after `to label` (without the `%` sigil). */
  normalTarget: string;
  /** Block id after `unwind label` (without the `%` sigil). */
  unwindTarget: string;
  /** Result local (without the `%` sigil), for `%x = invoke ...`. */
  result?: string;
}

/**
 * Any terminator understood only through the §3.2 uniform successor rule
 * (callbr / indirectbr / resume / unreachable / cleanupret / catchret /
 * catchswitch / unwind), plus the documented degradation target for a
 * br / switch / invoke whose expected structure cannot be found.
 */
export interface LLVMOpaqueTerminator extends LLVMInstructionBase {
  opcode: string;
  /** Ordered `label %x` occurrences (without `%` sigils); may be empty. */
  successors: string[];
}

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
