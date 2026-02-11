import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { SelectionDAGNode as SelectionDAGNodeAST } from "../../../ast/selectionDAGAST";
import {
  buildSelectionDAGDetailsLabel,
  buildSelectionDAGOpNameLabel,
  formatSelectionDAGOperand,
} from "../../../ast/selectionDAGAST";
import NodeShell from "../common/NodeShell";
import CodeFragment from "../common/CodeFragment";

// --- Styles ---

const HANDLE_STYLE: React.CSSProperties = {
  width: "4px",
  height: "4px",
  background: "#ffffff",
  border: "1px solid #050505",
  zIndex: 10,
};

const ROW_CONTAINER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const SelectionDAGOperandItem = ({
  node,
  index,
}: {
  node: SelectionDAGNodeAST;
  index: number;
}) => {
  const operand = node.operands?.[index];
  if (!operand) return null;

  const isLast = index === (node.operands?.length ?? 0) - 1;

  return (
    <div style={{ position: "relative", padding: "2px 2px" }}>
      <Handle
        type="target"
        position={Position.Top}
        id={`${node.nodeId}-operand-${index}`}
        style={{
          ...HANDLE_STYLE,
          top: "-10px",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center" }}>
        <CodeFragment code={formatSelectionDAGOperand(operand)} />
        {!isLast && <span style={{ marginLeft: "2px" }}>,</span>}
      </div>
    </div>
  );
};

const SelectionDAGNode = ({ data }: NodeProps) => {
  const node = data.astData as SelectionDAGNodeAST;
  const operands = node.operands ?? [];

  const opNameLabel = buildSelectionDAGOpNameLabel(node);
  const detailsLabel = buildSelectionDAGDetailsLabel(node);
  const opLabel = detailsLabel ? `${opNameLabel} ${detailsLabel}` : opNameLabel;

  return (
    <NodeShell
      borderColor="#050505"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        padding: "8px 10px",
        whiteSpace: "nowrap",
        fontSize: "13px",
      }}
    >
      <div style={ROW_CONTAINER_STYLE}>
        {operands.map((_, i) => (
          <SelectionDAGOperandItem key={i} node={node} index={i} />
        ))}
      </div>
      <div style={ROW_CONTAINER_STYLE}>
        <CodeFragment code={opLabel} />
      </div>
      <div style={ROW_CONTAINER_STYLE}>
        <div style={{ position: "relative" }}>
          <CodeFragment code={node.nodeId} />
          <Handle
            type="source"
            position={Position.Bottom}
            style={{
              ...HANDLE_STYLE,
              bottom: "-10px",
              left: "50%",
              transform: "translateX(-50%)",
            }}
            isConnectable={false}
          />
        </div>
        <span style={{ fontWeight: "bold" }}>:</span>
        <CodeFragment code={node.types.join(",")} />
      </div>
    </NodeShell>
  );
};

export default SelectionDAGNode;
