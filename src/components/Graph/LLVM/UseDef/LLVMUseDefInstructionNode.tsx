import type { NodeProps } from "@xyflow/react";
import type { LLVMUseDefInstructionData } from "../../../../ast/llvmAST";
import NodeShell from "../../common/NodeShell";
import HighlightedCode from "../../common/HighlightedCode";
import {
  USE_DEF_BADGE_BORDER_RADIUS,
  USE_DEF_BADGE_FONT_SIZE,
  USE_DEF_BADGE_GAP,
  USE_DEF_BADGE_LINE_HEIGHT,
  USE_DEF_BADGE_PADDING_X,
  USE_DEF_BADGE_PADDING_Y,
  USE_DEF_BADGE_PALETTE,
  USE_DEF_INSTRUCTION_BORDER_COLOR,
  USE_DEF_TERMINATOR_BORDER_COLOR,
} from "./useDefStyleConstants";

/**
 * One instruction/terminator line of the Use-Def view
 * (specs/llvm-use-def-view.md §2.1). The view is flat, so basic-block
 * membership is shown by a tinted badge chip instead of a container.
 * NodeShell provides the hidden top target / bottom source handles that
 * use-def edges attach to.
 */
const LLVMUseDefInstructionNode = ({ data }: NodeProps) => {
  const instruction = data.astData as LLVMUseDefInstructionData;
  const tint =
    USE_DEF_BADGE_PALETTE[
      ((instruction.blockIndex % USE_DEF_BADGE_PALETTE.length) +
        USE_DEF_BADGE_PALETTE.length) %
        USE_DEF_BADGE_PALETTE.length
    ];

  return (
    <NodeShell
      borderColor={
        instruction.isTerminator
          ? USE_DEF_TERMINATOR_BORDER_COLOR
          : USE_DEF_INSTRUCTION_BORDER_COLOR
      }
      style={{ whiteSpace: "pre" }}
    >
      <div style={{ marginBottom: `${USE_DEF_BADGE_GAP}px` }}>
        <span
          style={{
            display: "inline-block",
            padding: `${USE_DEF_BADGE_PADDING_Y}px ${USE_DEF_BADGE_PADDING_X}px`,
            borderRadius: `${USE_DEF_BADGE_BORDER_RADIUS}px`,
            fontFamily: "monospace",
            fontSize: `${USE_DEF_BADGE_FONT_SIZE}px`,
            lineHeight: `${USE_DEF_BADGE_LINE_HEIGHT}px`,
            fontWeight: 600,
            backgroundColor: tint.bg,
            color: tint.fg,
          }}
        >
          {instruction.blockLabel}
        </span>
      </div>
      <HighlightedCode
        code={instruction.text}
        language="llvm"
        style={{ whiteSpace: "pre" }}
      />
    </NodeShell>
  );
};

export default LLVMUseDefInstructionNode;
