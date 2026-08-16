import type { CSSProperties, ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  NODE_BORDER_RADIUS,
  NODE_BORDER_WIDTH,
  NODE_FONT_FAMILY,
  NODE_FONT_SIZE,
  NODE_HEADER_BACKGROUND,
  NODE_HEADER_BORDER_COLOR,
  NODE_HEADER_FONT_SIZE,
  NODE_HEADER_HEIGHT,
  NODE_HEADER_TEXT_COLOR,
  NODE_LINE_HEIGHT,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  NODE_WRAP_MAX_CHARS_LLVM,
  NODE_WRAP_MIN_CHARS_LLVM,
} from "./nodeTextStyle";

export interface NodeShellWrap {
  minChars: number;
  maxChars: number;
}

export interface NodeShellProps {
  children: ReactNode;
  borderRadius?: string;
  borderColor?: string;
  backgroundColor?: string;
  headerLabel?: string;
  headerColor?: string;
  style?: CSSProperties;
  /**
   * CSS `ch` wrap on the content box (`specs/graph-view.md` §5). `false`
   * leaves the node shrink-wrapped (Use-Def cards). Default is the LLVM
   * 16–80 ch clamp.
   */
  wrap?: NodeShellWrap | false;
}

const DEFAULT_WRAP: NodeShellWrap = {
  minChars: NODE_WRAP_MIN_CHARS_LLVM,
  maxChars: NODE_WRAP_MAX_CHARS_LLVM,
};

/**
 * The shared node frame (specs/graph-view.md §5–§6.6): 1px border, 2px
 * radius, white surface, dense monospace, and — when a block label is
 * present — a full-width header band with a bottom hairline. Frame metrics
 * come from nodeTextStyle.ts. `style` lands on the wrapper: border overrides
 * (Mermaid shapes) apply directly, inherited text properties reach the
 * content.
 */
const NodeShell = ({
  children,
  borderRadius = `${NODE_BORDER_RADIUS}px`,
  borderColor = "#777",
  backgroundColor = "#fff",
  headerLabel,
  headerColor = NODE_HEADER_BACKGROUND,
  style,
  wrap = DEFAULT_WRAP,
}: NodeShellProps) => {
  const wrapStyle: CSSProperties =
    wrap === false
      ? {}
      : {
          minWidth: `${String(wrap.minChars)}ch`,
          maxWidth: `${String(wrap.maxChars)}ch`,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        };

  return (
    <div
      className="node-shell-wrapper"
      style={{
        borderRadius,
        border: `${NODE_BORDER_WIDTH}px solid ${borderColor}`,
        background: backgroundColor,
        fontFamily: NODE_FONT_FAMILY,
        fontSize: NODE_FONT_SIZE,
        lineHeight: NODE_LINE_HEIGHT,
        textAlign: "left",
        height: "auto",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {headerLabel !== undefined && (
        <div
          style={{
            boxSizing: "border-box",
            height: `${NODE_HEADER_HEIGHT}px`,
            display: "flex",
            alignItems: "center",
            padding: `0 ${NODE_PADDING_X}px`,
            backgroundColor: headerColor,
            borderBottom: `1px solid ${NODE_HEADER_BORDER_COLOR}`,
            fontSize: `${NODE_HEADER_FONT_SIZE}px`,
            fontWeight: 600,
            color: NODE_HEADER_TEXT_COLOR,
            whiteSpace: "nowrap",
          }}
        >
          {headerLabel}
        </div>
      )}

      <div
        style={{
          padding: `${NODE_PADDING_Y}px ${NODE_PADDING_X}px`,
          ...wrapStyle,
        }}
      >
        {children}
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

export default NodeShell;
