import { type NodeProps } from "@xyflow/react";
import type { LLVMUseDefInstructionData } from "../../../../ast/llvmAST";
import NodeShell from "../../common/NodeShell";
import HighlightedCode from "../../common/HighlightedCode";
import {
  NODE_FONT_FAMILY,
  NODE_WRAP_MAX_CHARS_USE_DEF,
} from "../../common/nodeTextStyle";
import {
  USE_DEF_BADGE_BORDER_RADIUS,
  USE_DEF_BADGE_FONT_SIZE,
  USE_DEF_BADGE_GAP,
  USE_DEF_BADGE_LINE_HEIGHT,
  USE_DEF_BADGE_PADDING_X,
  USE_DEF_BADGE_PADDING_Y,
  USE_DEF_BADGE_HUES,
} from "./useDefStyleConstants";
import classes from "./useDef.module.css";

/**
 * One instruction/terminator line of the Use-Def view
 * (specs/llvm-use-def-view.md §2.1), as a single row: the tinted block
 * badge sits inline to the left of the code line (the view is flat, so the
 * badge is what carries basic-block membership). Operand/def port handles
 * are placed at the operands' text offsets — shifted by the badge width —
 * so edges land on the exact slot they feed (§4).
 */
const LLVMUseDefInstructionNode = ({ data }: NodeProps) => {
  const instruction = data.astData as LLVMUseDefInstructionData;
  const hue =
    USE_DEF_BADGE_HUES[
      ((instruction.blockIndex % USE_DEF_BADGE_HUES.length) +
        USE_DEF_BADGE_HUES.length) %
        USE_DEF_BADGE_HUES.length
    ];

  return (
    <NodeShell
      className={instruction.isTerminator ? classes.terminator : undefined}
      wrap={false}
      style={{ whiteSpace: "pre" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: `${USE_DEF_BADGE_GAP}px`,
        }}
      >
        <span
          className={classes.badge}
          style={{
            flexShrink: 0,
            padding: `${USE_DEF_BADGE_PADDING_Y}px ${USE_DEF_BADGE_PADDING_X}px`,
            borderRadius: `${USE_DEF_BADGE_BORDER_RADIUS}px`,
            fontFamily: NODE_FONT_FAMILY,
            fontSize: `${USE_DEF_BADGE_FONT_SIZE}px`,
            lineHeight: `${USE_DEF_BADGE_LINE_HEIGHT}px`,
            backgroundColor: `var(--mantine-color-${hue}-2)`,
          }}
        >
          {instruction.blockLabel}
        </span>
        <HighlightedCode
          code={instruction.text}
          language="llvm"
          style={{
            whiteSpace: "pre",
            maxWidth: `${String(NODE_WRAP_MAX_CHARS_USE_DEF)}ch`,
          }}
        />
      </div>
    </NodeShell>
  );
};

export default LLVMUseDefInstructionNode;
