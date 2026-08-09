import { getFontMetrics } from "../../../../utils/fontUtils";
import type { LLVMUseDefInstructionData } from "../../../../ast/llvmAST";
import {
  NODE_FONT_FAMILY,
  NODE_FONT_SIZE,
  NODE_LINE_HEIGHT,
} from "../../common/nodeTextStyle";
import {
  USE_DEF_CARD_BORDER,
  USE_DEF_CARD_PADDING,
} from "./useDefStyleConstants";

/**
 * Per-operand port geometry for Use-Def instruction cards
 * (specs/llvm-use-def-view.md §4): one target port per used name at that
 * operand's first occurrence in the monospace text, plus a source port under
 * the def name. Both the node component (React Flow `Handle` positions) and
 * the ELK layout (`FIXED_POS` ports) call this, so routed edges aim at the
 * exact pixel the handle actually sits on.
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

/** Px from the card's left border to the first text column. */
const CARD_TEXT_LEFT = USE_DEF_CARD_PADDING + USE_DEF_CARD_BORDER;

const tokenCenterX = (text: string, name: string): number | null => {
  const token = findOperandToken(text, name);
  if (token === null) return null;
  const { width: charWidth } = getFontMetrics(
    NODE_FONT_FAMILY,
    NODE_FONT_SIZE,
    NODE_LINE_HEIGHT,
  );
  return CARD_TEXT_LEFT + (token.index + token.length / 2) * charWidth;
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
  const ports: UseDefPort[] = data.uses.map((name) => ({
    id: `u-${name}`,
    x: tokenCenterX(data.text, name),
    side: "top" as const,
  }));
  if (data.def !== null) {
    ports.push({
      id: "def",
      x: tokenCenterX(data.text, data.def),
      side: "bottom",
    });
  }
  return ports;
};
