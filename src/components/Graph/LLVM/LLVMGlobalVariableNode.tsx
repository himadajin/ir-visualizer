import type { NodeProps } from "@xyflow/react";
import type { LLVMGlobalVariable } from "../../../ast/llvmAST";
import NodeShell from "../common/NodeShell";
import HighlightedCode from "../common/HighlightedCode";

const LLVMGlobalVariableNode = ({ data }: NodeProps) => {
  const gVar = data.astData as LLVMGlobalVariable;

  return (
    <NodeShell headerLabel={gVar.name}>
      <HighlightedCode code={gVar.originalText} language="llvm" />
    </NodeShell>
  );
};

export default LLVMGlobalVariableNode;
