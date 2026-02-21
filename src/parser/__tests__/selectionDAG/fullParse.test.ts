import { describe, expect, it } from "vitest";
import { parseSelectionDAG } from "../../selectionDAG";
import { selectionDagFullDump } from "../helpers/selectionDagFixtures";

describe("selectionDAG parser", () => {
  describe("full parse", () => {
    it("when dump input is parsed, should preserve node and comment order", () => {
      const result = parseSelectionDAG(selectionDagFullDump);

      const nodes = result.entries
        .filter((entry) => entry.kind === "node")
        .map((entry) => entry.node);
      const comments = result.entries
        .filter((entry) => entry.kind === "comment")
        .map((entry) => entry.comment);

      expect(result.entries.map((entry) => entry.kind)).toEqual([
        "comment",
        "comment",
        "node",
        "node",
        "node",
      ]);
      expect(comments).toHaveLength(2);
      expect(nodes).toHaveLength(3);
      expect(nodes[1].operands?.[1]).toEqual({
        kind: "inline",
        opName: "Register",
        types: ["i64"],
        details: {
          flags: [],
          reg: { type: "VirtReg", value: "%0" },
        },
      });
    });

    it("when input has no node lines, should return comment-only result", () => {
      const result = parseSelectionDAG("SelectionDAG has 0 nodes:");

      const nodes = result.entries
        .filter((entry) => entry.kind === "node")
        .map((entry) => entry.node);
      const comments = result.entries
        .filter((entry) => entry.kind === "comment")
        .map((entry) => entry.comment);

      expect(nodes).toEqual([]);
      expect(comments).toEqual(["SelectionDAG has 0 nodes:"]);
    });
  });
});
