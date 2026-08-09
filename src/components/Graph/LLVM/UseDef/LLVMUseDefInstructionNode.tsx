import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { LLVMUseDefInstructionData } from "../../../../ast/llvmAST";
import NodeShell from "../../common/NodeShell";
import HighlightedCode from "../../common/HighlightedCode";
import { getUseDefPorts } from "./useDefPorts";
import { NODE_BORDER_WIDTH } from "../../common/nodeTextStyle";
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
 * (specs/llvm-use-def-view.md §2.1), as a single row: the tinted block
 * badge sits inline to the left of the code line (the view is flat, so the
 * badge is what carries basic-block membership). Operand/def port handles
 * are placed at the operands' text offsets — shifted by the badge width —
 * so edges land on the exact slot they feed (§4).
 */
const LLVMUseDefInstructionNode = ({ data }: NodeProps) => {
  const instruction = data.astData as LLVMUseDefInstructionData;
  const ports = getUseDefPorts(instruction);
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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: `${USE_DEF_BADGE_GAP}px`,
        }}
      >
        <span
          style={{
            flexShrink: 0,
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
        <HighlightedCode
          code={instruction.text}
          language="llvm"
          style={{ whiteSpace: "pre" }}
        />
      </div>
      {/* Per-operand ports (specs/llvm-use-def-view.md §4). Port x is
          measured from the card's outer edge; absolute `left` is relative to
          the padding box, hence the border correction. */}
      {ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type={port.side === "top" ? "target" : "source"}
          position={port.side === "top" ? Position.Top : Position.Bottom}
          isConnectable={false}
          style={{
            opacity: 0,
            ...(port.side === "top" ? { top: 0 } : { bottom: 0 }),
            left:
              port.x === null
                ? "50%"
                : `${String(port.x - NODE_BORDER_WIDTH)}px`,
            transform:
              port.side === "top"
                ? "translate(-50%, -50%)"
                : "translate(-50%, 50%)",
            width: "1px",
            height: "1px",
          }}
        />
      ))}
    </NodeShell>
  );
};

export default LLVMUseDefInstructionNode;
