import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import {
  NODE_BORDER_RADIUS,
  NODE_BORDER_WIDTH,
  NODE_FONT_FAMILY,
  NODE_HEADER_BACKGROUND,
  NODE_HEADER_BORDER_COLOR,
  NODE_HEADER_FONT_SIZE,
  NODE_HEADER_HEIGHT,
  NODE_HEADER_TEXT_COLOR,
  NODE_PADDING_X,
} from "./common/nodeTextStyle";

/**
 * Generic container frame (`contracts/graph-data.md`, Hierarchy). After layout
 * the React Flow node is given the ELK box; this fills it. During measure it
 * shrink-wraps to the header so ELK receives chrome size, not an estimate.
 */
const GraphGroupNode = ({ data }: NodeProps) => {
  const label = (data.label as string) || "";

  return (
    <div
      className="node-shell-wrapper"
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        border: `${NODE_BORDER_WIDTH}px solid #777`,
        background: "#fff",
        fontFamily: NODE_FONT_FAMILY,
        position: "relative",
        overflow: "visible",
      }}
    >
      <div
        style={{
          boxSizing: "border-box",
          height: `${NODE_HEADER_HEIGHT}px`,
          display: "flex",
          alignItems: "center",
          padding: `0 ${NODE_PADDING_X}px`,
          backgroundColor: NODE_HEADER_BACKGROUND,
          borderBottom: `1px solid ${NODE_HEADER_BORDER_COLOR}`,
          fontSize: `${NODE_HEADER_FONT_SIZE}px`,
          fontWeight: 600,
          color: NODE_HEADER_TEXT_COLOR,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>

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

export default GraphGroupNode;
