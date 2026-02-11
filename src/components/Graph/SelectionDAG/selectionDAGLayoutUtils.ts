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
  const operandTexts = operands.map(formatSelectionDAGOperand);
  const operandText = operandTexts.join(", ");
  const operandFragments = operandTexts.length;
  const operandsWidth =
    operandText.length * charWidth +
    operandFragments * options.fragmentPaddingX +
    Math.max(0, operandFragments - 1) * options.rowGap;

  const opNameLabel = buildSelectionDAGOpNameLabel(node);
  const detailsLabel = buildSelectionDAGDetailsLabel(node);
  const opLabel = detailsLabel ? `${opNameLabel} ${detailsLabel}` : opNameLabel;
  const opLabelWidth = opLabel.length * charWidth + options.fragmentPaddingX;

  const typesText = node.types.join(",");
  const nodeLineTextLength = node.nodeId.length + typesText.length + 1;
  const nodeLineWidth =
    nodeLineTextLength * charWidth +
    options.fragmentPaddingX * 2 +
    options.typesGap;

  return [operandsWidth, opLabelWidth, nodeLineWidth];
};
