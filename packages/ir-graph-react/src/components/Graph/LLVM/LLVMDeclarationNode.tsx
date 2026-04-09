import type { NodeProps } from "@xyflow/react";
import type { LLVMDeclaration } from "@ir-graph-core";
import NodeShell from "../common/NodeShell";
import HighlightedCode from "../common/HighlightedCode";

const LLVMDeclarationNode = ({ data }: NodeProps) => {
  const decl = data.astData as LLVMDeclaration;

  return (
    <NodeShell headerLabel={decl.name}>
      <HighlightedCode code={decl.definition} language="llvm" />
    </NodeShell>
  );
};

export default LLVMDeclarationNode;
