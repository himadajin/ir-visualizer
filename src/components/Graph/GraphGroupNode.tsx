import type { NodeProps } from "@xyflow/react";
import {
  NODE_BORDER_RADIUS,
  NODE_BORDER_WIDTH,
  NODE_FONT_FAMILY,
} from "./common/nodeTextStyle";
import { NodeHeader } from "./common/NodeShell";
import shellClasses from "./common/NodeShell.module.css";

/**
 * Generic container frame (`contracts/graph-data.md`, Hierarchy), painted as
 * the node frame (`specs/graph-view.md` §7). After layout the React Flow node
 * is given the ELK box; this fills it. During measure it shrink-wraps to the
 * header so ELK receives chrome size, not an estimate.
 */
const GraphGroupNode = ({ data }: NodeProps) => {
  const label = (data.label as string) || "";

  return (
    <div
      className={shellClasses.frame}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        borderWidth: `${NODE_BORDER_WIDTH}px`,
        borderStyle: "solid",
        fontFamily: NODE_FONT_FAMILY,
        position: "relative",
        overflow: "visible",
      }}
    >
      <NodeHeader label={label} />
    </div>
  );
};

export default GraphGroupNode;
