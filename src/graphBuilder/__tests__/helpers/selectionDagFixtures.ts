import type { SelectionDAGNode } from "../../../ast/selectionDAGAST";
import type { ParseResult } from "../../../parser/selectionDAG";

export function makeParseResult(nodes: SelectionDAGNode[]): ParseResult {
  return {
    entries: nodes.map((node, index) => ({
      kind: "node" as const,
      node,
      line: index + 1,
    })),
  };
}
