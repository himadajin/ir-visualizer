import type { NodeProps } from "@xyflow/react";
import type { LLVMFunctionHeaderData } from "../../../ast/llvmAST";
import NodeShell from "../common/NodeShell";
import HighlightedCode from "../common/HighlightedCode";
import { NODE_BORDER_RADIUS_PILL } from "../common/nodeTextStyle";

const LLVMFunctionHeaderNode = ({ data }: NodeProps) => {
  const funcData = data.astData as LLVMFunctionHeaderData;

  return (
    <NodeShell borderRadius={`${NODE_BORDER_RADIUS_PILL}px`}>
      <HighlightedCode code={funcData.definition} language="llvm" />
    </NodeShell>
  );
};

export default LLVMFunctionHeaderNode;
