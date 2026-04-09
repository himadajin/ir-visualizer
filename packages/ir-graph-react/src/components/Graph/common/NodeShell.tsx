import type { CSSProperties, ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";

export interface NodeShellProps {
  children: ReactNode;
  borderRadius?: string;
  borderColor?: string;
  backgroundColor?: string;
  headerLabel?: string;
  headerColor?: string;
  style?: CSSProperties;
}

const NodeShell = ({
  children,
  borderRadius = "4px",
  borderColor = "#777",
  backgroundColor = "#fff",
  headerLabel,
  headerColor = "#f0f0f0",
  style,
}: NodeShellProps) => {
  return (
    <div
      className="node-shell-wrapper"
      style={{
        padding: headerLabel ? "28px 10px 10px 10px" : "10px",
        borderRadius,
        border: `1px solid ${borderColor}`,
        background: backgroundColor,
        fontFamily: "monospace",
        fontSize: "14px",
        lineHeight: "20px",
        textAlign: "left",
        height: "100%",
        boxSizing: "border-box",
        position: "relative",
        ...style,
      }}
    >
      {headerLabel && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            padding: "2px 6px",
            backgroundColor: headerColor,
            borderTopLeftRadius: borderRadius,
            borderBottomRightRadius: borderRadius,
            borderRight: "1px solid #ddd",
            borderBottom: "1px solid #ddd",
            fontSize: "12px",
            fontWeight: "bold",
            color: "#555",
            zIndex: 10,
          }}
        >
          {headerLabel}
        </div>
      )}

      {children}

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

export default NodeShell;
