import { describe, expect, it } from "vitest";
import { parseSelectionDAG, parseSelectionDAGNode } from "../../selectionDAG";

describe("selectionDAG parser", () => {
  describe("errors and fallbacks", () => {
    it("when line is non-node text, should classify it as comment", () => {
      const result = parseSelectionDAGNode("SelectionDAG has 12 nodes:");

      expect(result.node).toBeUndefined();
      expect(result.comment).toBe("SelectionDAG has 12 nodes:");
      expect(result.error).toBeUndefined();
    });

    it("when line looks like malformed node, should fallback to comment", () => {
      const result = parseSelectionDAGNode("t0: ch = EntryToken,");

      expect(result.node).toBeUndefined();
      expect(result.comment).toBe("t0: ch = EntryToken,");
      expect(result.error).toBeUndefined();
    });

    it("when dump includes malformed node line, should keep malformed line as comment entry", () => {
      const input = `SelectionDAG has 2 nodes:\n  t0: ch = EntryToken\n  t1: i32 = add t0,`;
      const result = parseSelectionDAG(input);

      const nodes = result.entries
        .filter((entry) => entry.kind === "node")
        .map((entry) => entry.node);
      const comments = result.entries
        .filter((entry) => entry.kind === "comment")
        .map((entry) => entry.comment);

      expect(result.entries.map((entry) => entry.kind)).toEqual([
        "comment",
        "node",
        "comment",
      ]);
      expect(nodes).toHaveLength(1);
      expect(comments).toEqual([
        "SelectionDAG has 2 nodes:",
        "  t1: i32 = add t0,",
      ]);
    });

    it("when input includes blank lines, should skip blanks and keep source line numbers", () => {
      const input = "SelectionDAG has 1 nodes:\n\n  t0: ch = EntryToken\n";
      const result = parseSelectionDAG(input);

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].line).toBe(1);
      expect(result.entries[1].line).toBe(2);
    });
  });
});
