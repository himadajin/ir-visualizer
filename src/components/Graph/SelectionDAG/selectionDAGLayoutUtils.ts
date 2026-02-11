import type { SelectionDAGNode as SelectionDAGNodeAST } from "../../../ast/selectionDAGAST";
import {
  buildSelectionDAGDetailsLabel,
  buildSelectionDAGOpNameLabel,
  formatSelectionDAGOperand,
} from "../../../ast/selectionDAGAST";

export const estimateSelectionDAGRowWidths = (
  node: SelectionDAGNodeAST,
  charWidth: number,
  options: {
    fragmentPaddingX: number;
    rowGap: number;
    typesGap: number;
  },
) => {
  const operands = node.operands ?? [];
  let operandsWidth = 0;
  if (operands.length > 0) {
    operands.forEach((op, i) => {
      const isLast = i === operands.length - 1;
      const opText = formatSelectionDAGOperand(op);
      // SelectionDAGOperandItem has padding "2px 2px" = 4px horizontal
      let itemWidth = opText.length * charWidth + options.fragmentPaddingX + 4;
      if (!isLast) {
        // !isLast && <span style={{ marginLeft: "2px" }}>,</span>
        // comma is roughly 1 charWidth
        itemWidth += charWidth + 2;
      }
      operandsWidth += itemWidth;
    });
    // ROW_CONTAINER_STYLE has gap of 6px
    operandsWidth += (operands.length - 1) * options.rowGap;
  }

  const opNameLabel = buildSelectionDAGOpNameLabel(node);
  const opNameWidth = opNameLabel.length * charWidth + options.fragmentPaddingX;

  const detailsLabel = buildSelectionDAGDetailsLabel(node);
  const detailsWidth = detailsLabel
    ? detailsLabel.length * charWidth + options.fragmentPaddingX
    : 0;

  const typesText = node.types.join(",");
  // Row for ID and Types: [NodeId Fragment] [Gap] [:] [Gap] [Types Fragment]
  const nodeLineWidth =
    node.nodeId.length * charWidth +
    options.fragmentPaddingX +
    options.rowGap + // Gap before :
    charWidth + // Width of :
    options.rowGap + // Gap after :
    typesText.length * charWidth +
    options.fragmentPaddingX;

  return [operandsWidth, opNameWidth, detailsWidth, nodeLineWidth];
};
