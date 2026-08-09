import { getFontMetrics } from "../../../../utils/fontUtils";
import type { LLVMUseDefInstructionData } from "../../../../ast/llvmAST";
import {
  NODE_BORDER_WIDTH,
  NODE_FONT_FAMILY,
  NODE_FONT_SIZE,
  NODE_LINE_HEIGHT,
  NODE_PADDING_X,
} from "../../common/nodeTextStyle";
import {
  USE_DEF_BADGE_FONT_SIZE,
  USE_DEF_BADGE_GAP,
  USE_DEF_BADGE_PADDING_X,
} from "./useDefStyleConstants";

/**
 * Per-operand port geometry for Use-Def instruction cards
 * (specs/llvm-use-def-view.md §4): one target port per used name at that
 * operand's first occurrence in the monospace text, plus a source port under
 * the def name. Both the node component (React Flow `Handle` positions) and
 * the ELK layout (`FIXED_POS` ports) call this, so routed edges aim at the
 * exact pixel the handle actually sits on. The code line starts after the
 * inline block badge, so every port shifts right by the badge's width.
 */

export interface UseDefPort {
  /** React Flow handle id: `u-<name>` (target) or `def` (source). */
  id: string;
  /**
   * Horizontal center of the port in px from the card's left edge, or null
   * when the name cannot be located in the text (render at the card's
   * horizontal center instead).
   */
  x: number | null;
  side: "top" | "bottom";
}

/** First occurrence of `%name` (or `%"name"`) as a whole token. */
export const findOperandToken = (
  text: string,
  name: string,
): { index: number; length: number } | null => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Unquoted form must not match a longer name's prefix (%1 vs %15).
  const re = new RegExp(`%(?:${escaped}(?![A-Za-z0-9$._-])|"${escaped}")`);
  const match = re.exec(text);
  if (match === null) return null;
  return { index: match.index, length: match[0].length };
};

/**
 * Rendered width of the inline block badge chip: its label at the badge font
 * size (the chip is monospace, so this scales linearly from the measured
 * char width) plus its horizontal padding.
 */
export const estimateBadgeWidth = (blockLabel: string): number => {
  const { width: charWidth } = getFontMetrics(
    NODE_FONT_FAMILY,
    NODE_FONT_SIZE,
    NODE_LINE_HEIGHT,
  );
  const scale = USE_DEF_BADGE_FONT_SIZE / parseFloat(NODE_FONT_SIZE);
  return blockLabel.length * charWidth * scale + USE_DEF_BADGE_PADDING_X * 2;
};

/** Px from the card's left edge to the code line's first character. */
export const cardTextLeft = (blockLabel: string): number =>
  NODE_BORDER_WIDTH +
  NODE_PADDING_X +
  estimateBadgeWidth(blockLabel) +
  USE_DEF_BADGE_GAP;

const tokenCenterX = (
  text: string,
  name: string,
  textLeft: number,
): number | null => {
  const token = findOperandToken(text, name);
  if (token === null) return null;
  const { width: charWidth } = getFontMetrics(
    NODE_FONT_FAMILY,
    NODE_FONT_SIZE,
    NODE_LINE_HEIGHT,
  );
  return textLeft + (token.index + token.length / 2) * charWidth;
};

/**
 * Every port the card exposes. A port exists for every use (and for the def
 * when present) even when its text position is unresolved — the edge's
 * `targetHandle`/`sourceHandle` reference must always resolve, or React Flow
 * drops the edge.
 */
export const getUseDefPorts = (
  data: LLVMUseDefInstructionData,
): UseDefPort[] => {
  const textLeft = cardTextLeft(data.blockLabel);
  const ports: UseDefPort[] = data.uses.map((name) => ({
    id: `u-${name}`,
    x: tokenCenterX(data.text, name, textLeft),
    side: "top" as const,
  }));
  if (data.def !== null) {
    ports.push({
      id: "def",
      x: tokenCenterX(data.text, data.def, textLeft),
      side: "bottom",
    });
  }
  return ports;
};
