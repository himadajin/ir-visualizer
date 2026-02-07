import type { NodeProps } from "@xyflow/react";
import type { LLVMMetadata } from "../../../ast/llvmAST";
import NodeShell from "../common/NodeShell";
import HighlightedCode from "../common/HighlightedCode";

const LLVMMetadataNode = ({ data }: NodeProps) => {
  const meta = data.astData as LLVMMetadata;

  return (
    <NodeShell headerLabel={meta.id}>
      <HighlightedCode code={meta.originalText} language="llvm" />
    </NodeShell>
  );
};

export default LLVMMetadataNode;
