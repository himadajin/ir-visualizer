import type { NodeProps } from "@xyflow/react";
import NodeShell from "../common/NodeShell";
import HighlightedCode from "../common/HighlightedCode";

interface FunctionHeaderData {
  definition: string;
  name: string;
}

const LLVMFunctionHeaderNode = ({ data }: NodeProps) => {
  const funcData = data.astData as FunctionHeaderData;

  return (
    <NodeShell borderRadius="20px">
      <HighlightedCode code={funcData.definition} language="llvm" />
    </NodeShell>
  );
};

export default LLVMFunctionHeaderNode;
