import type { SelectionDAGNode as SelectionDAGNodeAST } from "../../../ast/selectionDAGAST";
import {
  buildSelectionDAGDetailsLabel,
  buildSelectionDAGOpNameLabel,
  formatSelectionDAGOperand,
} from "../../../ast/selectionDAGAST";

// --- CSS-matching layout constants ---
// These MUST stay in sync with the styles in SelectionDAGNode.tsx.

/** Horizontal padding inside each cell: padding "2px 2px" → 2px per side */
const CELL_PADDING_X = 2;
const ITEM_PADDING_X = 2;
const ROOT_BORDER = 1;
const RIGHT_COL_BORDER_LEFT = 1;
const OPERAND_CELL_BORDER_LEFT = 1;
const CODE_FRAGMENT_PADDING_X = 4;

export const estimateSelectionDAGRowWidths = (
  node: SelectionDAGNodeAST,
  charWidth: number,
) => {
  // Left column: nodeId text + cell padding
  const leftColumnWidth =
    node.nodeId.length * charWidth +
    CELL_PADDING_X * 2 +
    CODE_FRAGMENT_PADDING_X * 2;

  // --- Right column rows ---

  // 1) Operands row
  const operands = node.operands ?? [];
  let operandsRowWidth = 0;
  if (operands.length > 0) {
    operands.forEach((op, i) => {
      const opText = formatSelectionDAGOperand(op);
      // Each cell: outer cell padding + inner item padding + text
      let cellWidth =
        opText.length * charWidth +
        CELL_PADDING_X * 2 +
        ITEM_PADDING_X * 2 +
        CODE_FRAGMENT_PADDING_X * 2;
      // Non-first cells have a borderLeft separator
      if (i > 0) {
        cellWidth += OPERAND_CELL_BORDER_LEFT;
      }
      operandsRowWidth += cellWidth;
    });
  }

  // 2) Main content row (opName + details): padding applied once around the block
  const opNameLabel = buildSelectionDAGOpNameLabel(node);
  const detailsLabel = buildSelectionDAGDetailsLabel(node);
  const mainContentText = detailsLabel
    ? `${opNameLabel} ${detailsLabel}`
    : opNameLabel;

  const mainContentWidth =
    mainContentText.length * charWidth +
    CELL_PADDING_X * 2 +
    CODE_FRAGMENT_PADDING_X * 2;

  // 3) Types row: each type in its own cell (like operands)
  let typesRowWidth = 0;
  if (node.types.length > 0) {
    node.types.forEach((t, i) => {
      let cellWidth =
        t.length * charWidth +
        CELL_PADDING_X * 2 +
        ITEM_PADDING_X * 2 +
        CODE_FRAGMENT_PADDING_X * 2;
      if (i > 0) {
        cellWidth += OPERAND_CELL_BORDER_LEFT;
      }
      typesRowWidth += cellWidth;
    });
  }
  const typesWidth = typesRowWidth;

  // Right column width = max of its rows
  const rightColumnWidth = Math.max(
    operandsRowWidth,
    mainContentWidth,
    typesWidth,
  );

  // Total = left column + right-col borderLeft + right column + root border (left+right)
  const totalWidth =
    leftColumnWidth +
    RIGHT_COL_BORDER_LEFT +
    rightColumnWidth +
    ROOT_BORDER * 2;

  return [totalWidth];
};
