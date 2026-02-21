import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../selectionDAGGraphBuilder";
import { expectUniqueIds } from "../helpers/assertGraph";
import { makeParseResult } from "../helpers/selectionDagFixtures";

const COVERAGE_CHECKPOINTS = [
  "direction",
  "node-id-uniqueness",
  "edge-id-uniqueness",
] as const;

describe("selectionDAG graphBuilder", () => {
  describe("invariants", () => {
    it("when invariants are tracked, should keep a non-empty checkpoint list", () => {
      expect(COVERAGE_CHECKPOINTS.length).toBeGreaterThan(0);
    });

    it("when graph is built, should keep TD direction", () => {
      const result = convertASTToGraph(
        makeParseResult([
          { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
        ]),
      );

      expect(result.direction).toBe("TD");
    });

    it("when graph contains multiple nodes and edges, should keep IDs unique", () => {
      const result = convertASTToGraph(
        makeParseResult([
          { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
          {
            nodeId: "t1",
            types: ["i64"],
            opName: "CopyFromReg",
            operands: [{ kind: "node", nodeId: "t0" }],
          },
          {
            nodeId: "t2",
            types: ["i64"],
            opName: "add",
            operands: [
              { kind: "node", nodeId: "t0" },
              { kind: "node", nodeId: "t1" },
            ],
          },
        ]),
      );

      expectUniqueIds(result.nodes);
      expectUniqueIds(result.edges);
    });
  });
});
