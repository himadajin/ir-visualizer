import type { NodeProps } from "@xyflow/react";
import type { MermaidASTNode } from "../../../ast/mermaidAST";
import NodeShell from "../common/NodeShell";

const shapeToBorderRadius = (shape?: string): string => {
  switch (shape) {
    case "round":
      return "20px";
    case "curly":
      return "4px";
    case "square":
    default:
      return "4px";
  }
};

const shapeToBorderStyle = (shape?: string): string => {
  if (shape === "curly") {
    return "2px dashed #777";
  }
  return "1px solid #777";
};

const MermaidNode = ({ data }: NodeProps) => {
  const node = data.astData as MermaidASTNode;

  const borderRadius = shapeToBorderRadius(node.shape);
  const border = shapeToBorderStyle(node.shape);

  return (
    <NodeShell
      borderRadius={borderRadius}
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
