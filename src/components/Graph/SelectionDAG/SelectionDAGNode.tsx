import type { CSSProperties } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { SelectionDAGNode as SelectionDAGNodeAST } from "../../../ast/selectionDAGAST";
import {
  buildSelectionDAGDetailsLabel,
  buildSelectionDAGOpNameLabel,
  formatSelectionDAGOperand,
} from "../../../ast/selectionDAGAST";
import CodeFragment from "../common/CodeFragment";
import shellClasses from "../common/NodeShell.module.css";
import {
  NODE_BORDER_RADIUS,
  NODE_BORDER_WIDTH,
  NODE_FONT_FAMILY,
  NODE_FONT_SIZE,
  NODE_LINE_HEIGHT,
} from "../common/nodeTextStyle";
import classes from "./SelectionDAGNode.module.css";
import { getSelectionDAGNodeColor } from "./selectionDAGNodeColor";
import {
  SELECTION_DAG_CELL_PADDING_X,
  SELECTION_DAG_CELL_PADDING_Y,
} from "./selectionDAGStyleConstants";

// --- Style constants ---

const RULE_WIDTH = `${NODE_BORDER_WIDTH}px`;

/** Root container: the shared node frame around the table. */
const ROOT_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "stretch",
  borderWidth: RULE_WIDTH,
  borderStyle: "solid",
  borderRadius: `${NODE_BORDER_RADIUS}px`,
  fontFamily: NODE_FONT_FAMILY,
  fontSize: NODE_FONT_SIZE,
  lineHeight: NODE_LINE_HEIGHT,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  overflow: "hidden",
};

/** One table cell: operand, opName+details, type, or the node id. */
const CELL_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: `${SELECTION_DAG_CELL_PADDING_Y}px ${SELECTION_DAG_CELL_PADDING_X}px`,
};

/** A row of operand or type cells, sharing the width equally. */
const ROW_CELL_STYLE: CSSProperties = { ...CELL_STYLE, flex: 1 };

/** Right column: operands / opName+details / types */
const RIGHT_COLUMN_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  borderLeftWidth: RULE_WIDTH,
  borderLeftStyle: "solid",
  flex: 1,
  minWidth: 0,
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
};

/** Operands row (separated from content below by a bottom rule) */
const OPERANDS_ROW_STYLE: CSSProperties = {
  ...ROW_STYLE,
  borderBottomWidth: RULE_WIDTH,
  borderBottomStyle: "solid",
};

/** Types row (separated from content above by a top rule) */
const TYPES_ROW_STYLE: CSSProperties = {
  ...ROW_STYLE,
  borderTopWidth: RULE_WIDTH,
  borderTopStyle: "solid",
};

/** Left rule between neighbouring cells of a row. */
const CELL_DIVIDER_STYLE: CSSProperties = {
  borderLeftWidth: RULE_WIDTH,
  borderLeftStyle: "solid",
};

/**
 * Invisible handle (`specs/graph-view.md` §7). The operands row is the
 * table's first row and the types row its last, so offsetting a handle by
 * the border width from its cell puts the handle's outer side on the node's
 * outer border — where React Flow ends a bezier edge.
 */
const HANDLE_STYLE: CSSProperties = {
  opacity: 0,
  left: "50%",
  transform: "translateX(-50%)",
  width: "1px",
  height: "1px",
};

// --- Sub-components ---

const SelectionDAGOperandCell = ({
  node,
  index,
}: {
  node: SelectionDAGNodeAST;
  index: number;
}) => {
  const operand = node.operands?.[index];
  if (!operand) return null;

  return (
    <div
      className={classes.rule}
      style={{ ...ROW_CELL_STYLE, ...(index > 0 ? CELL_DIVIDER_STYLE : {}) }}
    >
      {operand.kind === "node" && (
        <Handle
          type="target"
          position={Position.Top}
          id={`${node.nodeId}-operand-${index}`}
          style={{ ...HANDLE_STYLE, top: `-${RULE_WIDTH}` }}
          isConnectable={false}
        />
      )}
      <CodeFragment code={formatSelectionDAGOperand(operand)} language="llvm" />
    </div>
  );
};

const SelectionDAGTypeCell = ({
  node,
  index,
}: {
  node: SelectionDAGNodeAST;
  index: number;
}) => {
  const type = node.types[index];
  if (!type) return null;

  return (
    <div
      className={classes.rule}
      style={{ ...ROW_CELL_STYLE, ...(index > 0 ? CELL_DIVIDER_STYLE : {}) }}
    >
      <CodeFragment code={type} language="llvm" />
      <Handle
        type="source"
        position={Position.Bottom}
        id={`${node.nodeId}-type-${index}`}
        style={{ ...HANDLE_STYLE, bottom: `-${RULE_WIDTH}` }}
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
    <div className={shellClasses.frame} style={ROOT_STYLE}>
      {/* Left column: nodeId, tinted by opName category */}
      <div
        style={{
          ...CELL_STYLE,
          background: getSelectionDAGNodeColor(node.opName),
        }}
      >
        <CodeFragment code={node.nodeId} language="text" />
      </div>

      {/* Right column: operands, opName/details, types */}
      <div className={classes.rule} style={RIGHT_COLUMN_STYLE}>
        {operands.length > 0 && (
          <div className={classes.rule} style={OPERANDS_ROW_STYLE}>
            {operands.map((_, i) => (
              <SelectionDAGOperandCell key={i} node={node} index={i} />
            ))}
          </div>
        )}

        {/* opName + details */}
        <div style={CELL_STYLE}>
          <CodeFragment
            code={detailsLabel ? `${opNameLabel} ${detailsLabel}` : opNameLabel}
            language="llvm"
          />
        </div>

        {/* types */}
        <div className={classes.rule} style={TYPES_ROW_STYLE}>
          {node.types.map((_, i) => (
            <SelectionDAGTypeCell key={i} node={node} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SelectionDAGNode;
