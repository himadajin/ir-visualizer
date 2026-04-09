import type { NodeProps } from "@xyflow/react";
import NodeShell from "./common/NodeShell";
import HighlightedCode from "./common/HighlightedCode";

const CodeNode = ({ data }: NodeProps) => {
  const rawCode = (data.label as string) || "";
  // explicit check for null to differentiate from undefined
  const blockLabelProp = data.blockLabel;
  const blockLabel =
    blockLabelProp === null ? "entry" : (blockLabelProp as string | undefined);

  const language = (data.language as string) || "text";

  return (
    <NodeShell headerLabel={blockLabel}>
      <HighlightedCode code={rawCode} language={language} />
    </NodeShell>
  );
};

export default CodeNode;
