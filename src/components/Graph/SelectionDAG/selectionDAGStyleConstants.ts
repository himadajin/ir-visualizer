/**
 * Single source of truth for SelectionDAGNode's box model. Shared by the
 * component itself (SelectionDAGNode.tsx), its width estimation
 * (selectionDAGLayoutUtils.ts), and its height calculation (converter.ts) —
 * these three previously duplicated the same pixel values with a
 * "MUST stay in sync" comment instead of importing one definition.
 */
export const SELECTION_DAG_BORDER_COLOR = "#050505";
export const SELECTION_DAG_BORDER_WIDTH = 1;
export const SELECTION_DAG_BORDER = `${SELECTION_DAG_BORDER_WIDTH}px solid ${SELECTION_DAG_BORDER_COLOR}`;

// Cell padding (row/column wrappers) and item padding (individual
// operand/type wrappers) are both "2px 2px" in the current design, applied
// equally on both axes.
export const SELECTION_DAG_CELL_PADDING = 2;
export const SELECTION_DAG_ITEM_PADDING = 2;
