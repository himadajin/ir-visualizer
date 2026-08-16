import type { NodeProps } from "@xyflow/react";
import NodeShell from "./common/NodeShell";
import HighlightedCode from "./common/HighlightedCode";
import {
  NODE_WRAP_MAX_CHARS_LLVM,
  NODE_WRAP_MAX_CHARS_MERMAID,
  NODE_WRAP_MIN_CHARS_LLVM,
  NODE_WRAP_MIN_CHARS_MERMAID,
} from "./common/nodeTextStyle";

const CodeNode = ({ data }: NodeProps) => {
  const rawCode = (data.label as string) || "";
  // explicit check for null to differentiate from undefined
  const blockLabelProp = data.blockLabel;
  const blockLabel =
    blockLabelProp === null ? "entry" : (blockLabelProp as string | undefined);

  const language = (data.language as string) || "text";
  const wrap =
    language === "mermaid"
      ? {
          minChars: NODE_WRAP_MIN_CHARS_MERMAID,
          maxChars: NODE_WRAP_MAX_CHARS_MERMAID,
        }
      : {
          minChars: NODE_WRAP_MIN_CHARS_LLVM,
          maxChars: NODE_WRAP_MAX_CHARS_LLVM,
        };

  return (
    <NodeShell headerLabel={blockLabel} wrap={wrap}>
      <HighlightedCode code={rawCode} language={language} />
    </NodeShell>
  );
};

export default CodeNode;
