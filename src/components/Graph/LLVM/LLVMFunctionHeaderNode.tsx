import type { NodeProps } from "@xyflow/react";
import type { LLVMFunctionHeaderData } from "../../../ast/llvmAST";
import NodeShell from "../common/NodeShell";
import HighlightedCode from "../common/HighlightedCode";

const LLVMFunctionHeaderNode = ({ data }: NodeProps) => {
  const funcData = data.astData as LLVMFunctionHeaderData;

  return (
    <NodeShell borderRadius="20px">
      <HighlightedCode code={funcData.definition} language="llvm" />
    </NodeShell>
  );
};

export default LLVMFunctionHeaderNode;
