import type { NodeProps } from "@xyflow/react";
import NodeShell from "../common/NodeShell";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LLVMExitNode = (_nodeProps: NodeProps) => {
  return (
    <NodeShell borderRadius="20px">
      <div
        style={{
          textAlign: "center",
          fontWeight: "bold",
          color: "#555",
        }}
      >
        exit
      </div>
    </NodeShell>
  );
};

export default LLVMExitNode;
