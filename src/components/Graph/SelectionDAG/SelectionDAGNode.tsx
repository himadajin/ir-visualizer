import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { SelectionDAGNode as SelectionDAGNodeAST } from "../../../ast/selectionDAGAST";
import {
  buildSelectionDAGDetailsLabel,
  buildSelectionDAGOpNameLabel,
  formatSelectionDAGOperand,
} from "../../../ast/selectionDAGAST";
import CodeFragment from "../common/CodeFragment";

// --- Style constants ---

const BORDER_COLOR = "#050505";
const BORDER = `1px solid ${BORDER_COLOR}`;
const CELL_PADDING = "2px 2px";

const HANDLE_STYLE: React.CSSProperties = {
  width: "4px",
  height: "4px",
  background: "#ffffff",
  border: BORDER,
  zIndex: 10,
};

/** Root container — replaces NodeShell */
const ROOT_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "stretch",
  border: BORDER,
  borderRadius: "4px",
  background: "#ffffff",
  fontFamily: "monospace",
  fontSize: "14px",
  lineHeight: "20px",
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  width: "100%",
};

/** Left column: nodeId + source handle */
const LEFT_COLUMN_STYLE: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderTopLeftRadius: "4px",
  borderBottomLeftRadius: "4px",
  padding: CELL_PADDING,
  background: "#f4f2ff",
};

/** Right column: operands / opName+details / types */
const RIGHT_COLUMN_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  borderLeft: BORDER,
  flex: 1,
  minWidth: 0,
};

/** Operands row (separated from content below by borderBottom) */
const OPERANDS_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  borderBottom: BORDER,
};

/** Main content area: opName + optional details */
const MAIN_CONTENT_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: CELL_PADDING,
  gap: "6px",
};

/** Types row (separated from content above by borderTop) */
const TYPES_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  borderTop: BORDER,
};

// --- Sub-components ---

const SelectionDAGOperandItem = ({
  node,
  index,
}: {
  node: SelectionDAGNodeAST;
  index: number;
}) => {
  const operand = node.operands?.[index];
  if (!operand) return null;

  return (
    <div style={{ position: "relative", padding: "2px 2px" }}>
      {operand.kind === "node" && (
        <Handle
          type="target"
          position={Position.Top}
          id={`${node.nodeId}-operand-${index}`}
          style={{
            ...HANDLE_STYLE,
            top: "-6px",
            left: "50%",
            transform: "translateX(-50%)",
          }}
          isConnectable={false}
        />
      )}
      <CodeFragment code={formatSelectionDAGOperand(operand)} language="llvm" />
    </div>
  );
};

const SelectionDAGTypeItem = ({
  node,
  index,
}: {
  node: SelectionDAGNodeAST;
  index: number;
}) => {
  const type = node.types[index];
  if (!type) return null;

  return (
    <div style={{ position: "relative", padding: "2px 2px" }}>
      <CodeFragment code={type} language="llvm" />
      <Handle
        type="source"
        position={Position.Bottom}
        id={`${node.nodeId}-type-${index}`}
        style={{
          ...HANDLE_STYLE,
          bottom: "-6px",
          left: "50%",
          transform: "translateX(-50%)",
        }}
        isConnectable={false}
      />
    </div>
  );
};

// --- Main component ---

const SelectionDAGNode = ({ data }: NodeProps) => {
  const node = data.astData as SelectionDAGNodeAST;
  const operands = node.operands ?? [];

  const opNameLabel = buildSelectionDAGOpNameLabel(node);
  const detailsLabel = buildSelectionDAGDetailsLabel(node);

  return (
    <div style={ROOT_STYLE}>
      {/* Left column: nodeId */}
      <div style={LEFT_COLUMN_STYLE}>
        <CodeFragment code={node.nodeId} language="text" />
      </div>

      {/* Right column: operands, opName/details, types */}
      <div style={RIGHT_COLUMN_STYLE}>
        {operands.length > 0 && (
          <div style={OPERANDS_ROW_STYLE}>
            {operands.map((_, i) => (
              <div
                key={i}
                style={{
                  padding: CELL_PADDING,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  ...(i > 0 ? { borderLeft: BORDER } : {}),
                }}
              >
                <SelectionDAGOperandItem node={node} index={i} />
              </div>
            ))}
          </div>
        )}

        {/* opName + details */}
        <div style={MAIN_CONTENT_STYLE}>
          <CodeFragment
            code={detailsLabel ? `${opNameLabel} ${detailsLabel}` : opNameLabel}
            language="llvm"
          />
        </div>

        {/* types */}
        <div style={TYPES_ROW_STYLE}>
          {node.types.map((_, i) => (
            <div
              key={i}
              style={{
                padding: CELL_PADDING,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                ...(i > 0 ? { borderLeft: BORDER } : {}),
              }}
            >
              <SelectionDAGTypeItem node={node} index={i} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SelectionDAGNode;
