import type { NodeProps } from "@xyflow/react";
import type { LLVMAttributeGroup } from "../../../ast/llvmAST";
import NodeShell from "../common/NodeShell";
import HighlightedCode from "../common/HighlightedCode";

const LLVMAttributeGroupNode = ({ data }: NodeProps) => {
  const attr = data.astData as LLVMAttributeGroup;

  return (
    <NodeShell headerLabel={`#${attr.id}`}>
      <HighlightedCode code={attr.originalText} language="llvm" />
    </NodeShell>
  );
};

export default LLVMAttributeGroupNode;
