import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type {
  SelectionDAGNode as SelectionDAGNodeAST,
  SelectionDAGOperand,
} from "../../../ast/selectionDAGAST";

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

const SelectionDAGNode = ({ data }: NodeProps) => {
  const node = data.astData as SelectionDAGNodeAST;
  const operands = node.operands ?? [];

  const typesStr = node.types.join(",");

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
        border: "1px solid #555",
        borderRadius: "4px",
        background: "#fff",
        fontFamily: "monospace",
        fontSize: "13px",
        lineHeight: "20px",
        textAlign: "left",
        position: "relative",
        minWidth: "120px",
      }}
    >
      {/* Header label (nodeId) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          padding: "1px 6px",
          backgroundColor: "#e0e0e0",
          borderTopLeftRadius: "3px",
          borderBottomRightRadius: "3px",
          borderRight: "1px solid #ccc",
          borderBottom: "1px solid #ccc",
          fontSize: "11px",
          fontWeight: "bold",
          color: "#444",
          zIndex: 10,
        }}
      >
        {node.nodeId}
      </div>

      {/* Row 1: Operand connection points */}
      {operands.length > 0 && (
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #ddd",
            marginTop: "20px",
          }}
        >
          {operands.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "2px 6px",
                borderRight:
                  i < operands.length - 1 ? "1px solid #ddd" : "none",
                fontSize: "11px",
                fontWeight: "bold",
                color: "#1976d2",
                position: "relative",
              }}
            >
              {i}
              <Handle
                type="target"
                position={Position.Top}
                id={`operand-${i}`}
                style={{
                  position: "absolute",
                  top: "-4px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "8px",
                  height: "8px",
                  background: "#1976d2",
                  border: "1px solid #fff",
                }}
                isConnectable={false}
              />
            </div>
          ))}
        </div>
      )}

      {/* If no operands, add a single invisible target handle + spacing for header */}
      {operands.length === 0 && (
        <div style={{ marginTop: "20px" }}>
          <Handle
            type="target"
            position={Position.Top}
            style={{
              opacity: 0,
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "1px",
              height: "1px",
            }}
            isConnectable={false}
          />
        </div>
      )}

      {/* Row 2: Operation name */}
      <div
        style={{
          padding: "4px 8px",
          fontWeight: "bold",
          fontSize: "14px",
          borderBottom: "1px solid #ddd",
          textAlign: "center",
        }}
      >
        {node.opName}
      </div>

      {/* Row 3: Types */}
      <div
        style={{
          padding: "2px 8px",
          fontSize: "12px",
          color: "#666",
          borderBottom:
            operands.length > 0 || detailParts.length > 0
              ? "1px solid #ddd"
              : "none",
          textAlign: "center",
        }}
      >
        {typesStr}
      </div>

      {/* Detail row (flags, detail, reg) */}
      {detailParts.length > 0 && (
        <div
          style={{
            padding: "2px 8px",
            fontSize: "11px",
            color: "#888",
            borderBottom: operands.length > 0 ? "1px solid #ddd" : "none",
            textAlign: "center",
          }}
        >
          {detailParts.join(" ")}
        </div>
      )}

      {/* Row 4+: Operands list */}
      {operands.length > 0 && (
        <div style={{ padding: "2px 8px 4px" }}>
          {operands.map((op, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "4px",
                fontSize: "12px",
              }}
            >
              <span style={{ color: "#1976d2", fontWeight: "bold" }}>{i}:</span>
              <span style={{ color: "#333" }}>{formatOperand(op)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Source handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          opacity: 0,
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "1px",
          height: "1px",
        }}
        isConnectable={false}
      />
    </div>
  );
};

export default SelectionDAGNode;
