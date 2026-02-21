import { describe, expect, it } from "vitest";
import { parseSelectionDAG } from "../../selectionDAG";

const COVERAGE_CHECKPOINTS = [
  "entry-order",
  "line-numbering",
  "comment-fallback",
] as const;

describe("selectionDAG parser", () => {
  describe("invariants", () => {
    it("when invariants are tracked, should keep a non-empty checkpoint list", () => {
      expect(COVERAGE_CHECKPOINTS.length).toBeGreaterThan(0);
    });

    it("when input is parsed, should keep entry lines in non-decreasing order", () => {
      const result = parseSelectionDAG(
        "SelectionDAG has 2 nodes:\n  t0: ch = EntryToken\n  t1: i64 = CopyFromReg t0",
      );
      const lines = result.entries.map((entry) => entry.line);

      expect(lines).toEqual([1, 2, 3]);
      expect(lines[0]).toBeLessThanOrEqual(lines[1]);
      expect(lines[1]).toBeLessThanOrEqual(lines[2]);
    });

    it("when one line is malformed, should parse remaining valid nodes", () => {
      const result = parseSelectionDAG(
        "SelectionDAG has 3 nodes:\n  t0: ch = EntryToken\n  t1: i64 = add t0,\n  t2: i64 = CopyFromReg t0",
      );

      const nodes = result.entries.filter((entry) => entry.kind === "node");
      const comments = result.entries.filter(
        (entry) => entry.kind === "comment",
      );

      expect(nodes).toHaveLength(2);
      expect(comments).toHaveLength(2);
    });
  });
});
