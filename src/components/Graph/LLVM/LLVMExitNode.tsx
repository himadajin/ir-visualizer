import type { NodeProps } from "@xyflow/react";
import NodeShell from "../common/NodeShell";
import { NODE_BORDER_RADIUS_PILL } from "../common/nodeTextStyle";
import classes from "./LLVMExitNode.module.css";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LLVMExitNode = (_nodeProps: NodeProps) => {
  return (
    <NodeShell borderRadius={`${NODE_BORDER_RADIUS_PILL}px`}>
      <div className={classes.label}>exit</div>
    </NodeShell>
  );
};

export default LLVMExitNode;
