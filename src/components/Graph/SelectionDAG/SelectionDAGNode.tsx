import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type {
  SelectionDAGNode as SelectionDAGNodeAST,
  SelectionDAGOperand,
} from "../../../ast/selectionDAGAST";
import HighlightedCode from "../common/HighlightedCode";

const formatOperand = (op: SelectionDAGOperand): string => {
  switch (op.kind) {
    case "node":
      return op.index !== undefined ? `${op.nodeId}:${op.index}` : op.nodeId;
    case "inline": {
      const types = op.types.length > 0 ? `<${op.types.join(",")}>` : "";
      const detail = op.details?.detail ? ` ${op.details.detail}` : "";
      return `${op.opName}${types}${detail}`;
    }
    case "null":
      return "<null>";
  }
};

const codeSegmentStyle: React.CSSProperties = {
  background: "#f5f5f5",
  padding: "2px 2px",
  borderRadius: "2px",
};

interface SelectionDAGOperandProps {
  node: SelectionDAGNodeAST;
  index: number;
}

const SelectionDAGOperandItem = ({ node, index }: SelectionDAGOperandProps) => {
  const operand = node.operands?.[index];
  if (!operand) return null;

  const isLast = index === (node.operands?.length ?? 0) - 1;

  return (
    <div
      style={{
        position: "relative",
        padding: "2px 2px",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id={`${node.nodeId}-operand-${index}`}
        style={{
          top: "-10px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "4px",
          height: "4px",
          background: "#ffffff",
          border: "1px solid #050505",
        }}
        isConnectable={true}
      />
      <div>
        <HighlightedCode
          code={formatOperand(operand)}
          language="llvm"
          inline
          style={codeSegmentStyle}
        />
        {!isLast ? "," : ""}
      </div>
    </div>
  );
};

const SelectionDAGNode = ({ data }: NodeProps) => {
  const node = data.astData as SelectionDAGNodeAST;
  const operands = node.operands ?? [];

  const detailParts: string[] = [];
  if (node.details?.flags && node.details.flags.length > 0) {
    detailParts.push(node.details.flags.join(" "));
  }
  if (node.details?.detail) {
    detailParts.push(node.details.detail);
  }
  if (node.details?.reg) {
    const r = node.details.reg;
    detailParts.push(`${r.type}:${r.value}`);
  }

  return (
    <div
      style={{
        border: "1px solid #050505",
        borderRadius: "4px",
        background: "#fff",
        fontFamily: "monospace",
        fontSize: "13px",
        padding: "6px 10px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        whiteSpace: "nowrap",
        position: "relative",
      }}
    >
      {/* Output part: Node ID & Source Handle */}
      <div style={{ position: "relative", padding: "2px 2px" }}>
        <HighlightedCode
          code={node.nodeId}
          language="llvm"
          inline
          style={codeSegmentStyle}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            bottom: "-10px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "4px",
            height: "4px",
            background: "#ffffff",
            border: "1px solid #050505",
          }}
          isConnectable={false}
        />
      </div>
      :
      <HighlightedCode
        code={`${node.types.join(",")}`}
        language="llvm"
        inline
        style={codeSegmentStyle}
      />
      =
      <HighlightedCode
        code={` ${node.opName} ${
          detailParts.length > 0 ? detailParts.join(" ") + " " : ""
        }`}
        language="llvm"
        inline
        style={codeSegmentStyle}
      />
      {/* Input part: Operands & Target Handles */}
      {operands.map((_, i) => (
        <SelectionDAGOperandItem key={i} node={node} index={i} />
      ))}
    </div>
  );
};

export default SelectionDAGNode;
