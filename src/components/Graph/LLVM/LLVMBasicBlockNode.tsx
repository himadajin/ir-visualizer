import type { NodeProps } from "@xyflow/react";
import type { LLVMBasicBlock } from "../../../ast/llvmAST";
import NodeShell from "../common/NodeShell";
import HighlightedCode from "../common/HighlightedCode";

const LLVMBasicBlockNode = ({ data }: NodeProps) => {
  const block = data.astData as LLVMBasicBlock;

  const headerLabel = block.label === null ? "entry" : block.label || undefined;

  // Build code content from instructions + terminator
  const lines: string[] = [];
  for (const item of block.instructions) {
    lines.push(item.originalText);
  }
  if (block.terminator) {
    lines.push(block.terminator.originalText);
  }
  const code = lines.join("\n");

  return (
    <NodeShell headerLabel={headerLabel}>
      <HighlightedCode code={code} language="llvm" />
    </NodeShell>
  );
};

export default LLVMBasicBlockNode;
