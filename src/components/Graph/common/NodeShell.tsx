import type { CSSProperties, ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  NODE_BORDER_RADIUS,
  NODE_BORDER_WIDTH,
  NODE_FONT_FAMILY,
  NODE_FONT_SIZE,
  NODE_HEADER_FONT_SIZE,
  NODE_HEADER_HEIGHT,
  NODE_LINE_HEIGHT,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  NODE_WRAP_MAX_CHARS_LLVM,
  NODE_WRAP_MIN_CHARS_LLVM,
} from "./nodeTextStyle";
import classes from "./NodeShell.module.css";

export interface NodeShellWrap {
  minChars: number;
  maxChars: number;
}

export interface NodeShellProps {
  children: ReactNode;
  borderRadius?: string;
  /** Paint variant layered over the frame (e.g. a border color). */
  className?: string;
  headerLabel?: string;
  style?: CSSProperties;
  /** Omit for the centered handle; null/empty removes it. */
  sourceHandles?: ReactNode;
  targetHandles?: ReactNode;
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
 * The full-width header band that names a node or container
 * (`specs/graph-view.md` §7).
 */
export const NodeHeader = ({ label }: { label: string }) => (
  <div
    className={classes.header}
    style={{
      boxSizing: "border-box",
      height: `${NODE_HEADER_HEIGHT}px`,
      borderBottomWidth: `${NODE_BORDER_WIDTH}px`,
      display: "flex",
      alignItems: "center",
      padding: `0 ${NODE_PADDING_X}px`,
      fontSize: `${NODE_HEADER_FONT_SIZE}px`,
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </div>
);

/**
 * The shared node frame (specs/graph-view.md §5, §7): `node-line` border,
 * `sm` radius, opaque surface, dense `font-mono`, and — when a name is
 * present — a header band. Lengths come from nodeTextStyle.ts, paint from
 * NodeShell.module.css. `style` lands on the wrapper: border width/style
 * overrides (Mermaid shapes) apply directly, inherited text properties reach
 * the content.
 */
const NodeShell = ({
  children,
  borderRadius = `${NODE_BORDER_RADIUS}px`,
  className,
  headerLabel,
  style,
  sourceHandles,
  targetHandles,
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
      className={
        className === undefined
          ? classes.frame
          : `${classes.frame} ${className}`
      }
      style={{
        borderRadius,
        borderWidth: `${NODE_BORDER_WIDTH}px`,
        borderStyle: "solid",
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
      {headerLabel !== undefined && <NodeHeader label={headerLabel} />}

      <div
        style={{
          padding: `${NODE_PADDING_Y}px ${NODE_PADDING_X}px`,
          ...wrapStyle,
        }}
      >
        {children}
      </div>

      {targetHandles === undefined ? (
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
      ) : (
        targetHandles
      )}
      {sourceHandles === undefined ? (
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
      ) : (
        sourceHandles
      )}
    </div>
  );
};

export default NodeShell;
