import { useEffect } from "react";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import type { LLVMBasicBlock } from "../../../ast/llvmAST";
import {
  CFG_TARGET_HANDLE,
  cfgPortFraction,
  getCFGSuccessors,
} from "../../../graphBuilder/llvmCFGSuccessors";
import NodeShell from "../common/NodeShell";
import HighlightedCode from "../common/HighlightedCode";
import { NODE_BORDER_WIDTH } from "../common/nodeTextStyle";

const LLVMBasicBlockNode = ({ id, data }: NodeProps) => {
  const block = data.astData as LLVMBasicBlock;
  const successors = getCFGSuccessors(block.terminator);
  const portSignature = JSON.stringify(
    successors.map((successor) => successor.id),
  );
  const updateNodeInternals = useUpdateNodeInternals();
  // A reorder or new id can change handles without changing the node's size.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, portSignature, updateNodeInternals]);

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
    <NodeShell
      headerLabel={headerLabel}
      targetHandles={
        <Handle
          id={CFG_TARGET_HANDLE}
          type="target"
          position={Position.Top}
          isConnectable={false}
          style={{ opacity: 0, top: 0, left: "50%", width: 1, height: 1 }}
        />
      }
      sourceHandles={successors.map((successor, index) => {
        const fraction = cfgPortFraction(index, successors.length);
        return (
          <Handle
            key={successor.id}
            id={successor.id}
            type="source"
            position={Position.Bottom}
            isConnectable={false}
            style={{
              opacity: 0,
              bottom: 0,
              width: 1,
              height: 1,
              // CSS percentages use the padding box; ports use the outer border.
              left: `calc(${String(fraction * 100)}% + ${String((2 * fraction - 1) * NODE_BORDER_WIDTH)}px)`,
              transform: "translate(-50%, 50%)",
            }}
          />
        );
      })}
    >
      <HighlightedCode code={code} language="llvm" />
    </NodeShell>
  );
};

export default LLVMBasicBlockNode;
