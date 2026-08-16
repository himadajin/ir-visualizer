import type { NodeProps } from "@xyflow/react";
import type { MermaidASTNode } from "../../../ast/mermaidAST";
import NodeShell from "../common/NodeShell";
import {
  NODE_WRAP_MAX_CHARS_MERMAID,
  NODE_WRAP_MIN_CHARS_MERMAID,
} from "../common/nodeTextStyle";
import { mermaidFamilyPresentation, mermaidShapeFamily } from "./shapeFamily";

const MermaidNode = ({ data }: NodeProps) => {
  const node = data.astData as MermaidASTNode;
  const { borderRadius, border } = mermaidFamilyPresentation(
    mermaidShapeFamily(node.shape),
  );

  return (
    <NodeShell
      borderRadius={borderRadius}
      wrap={{
        minChars: NODE_WRAP_MIN_CHARS_MERMAID,
        maxChars: NODE_WRAP_MAX_CHARS_MERMAID,
      }}
      style={{
        border,
        textAlign: "center",
      }}
    >
      <div>{node.label || node.id}</div>
    </NodeShell>
  );
};

export default MermaidNode;
