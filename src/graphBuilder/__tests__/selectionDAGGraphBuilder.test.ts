import { describe, it, expect } from "vitest";
import { convertASTToGraph } from "../selectionDAGGraphBuilder";
import type { ParseResult } from "../../parser/selectionDAG";
import type { SelectionDAGNode } from "../../ast/selectionDAGAST";

function makeParseResult(nodes: SelectionDAGNode[]): ParseResult {
  return {
    entries: nodes.map((node, i) => ({
      kind: "node" as const,
      node,
      line: i + 1,
    })),
  };
}

describe("selectionDAGGraphBuilder", () => {
  it("converts a single node without operands", () => {
    const result = convertASTToGraph(
      makeParseResult([
        {
          nodeId: "t0",
          types: ["ch", "glue"],
          opName: "EntryToken",
        },
      ]),
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(result.nodes[0].id).toBe("t0");
    expect(result.nodes[0].nodeType).toBe("selectionDAG-node");
    expect(result.nodes[0].language).toBe("llvm");
    expect(result.direction).toBe("TD");
  });

  it("generates edges from node operands", () => {
    const result = convertASTToGraph(
      makeParseResult([
        {
          nodeId: "t0",
          types: ["ch"],
          opName: "EntryToken",
        },
        {
          nodeId: "t1",
          types: ["i64", "ch"],
          opName: "CopyFromReg",
          operands: [
            { kind: "node", nodeId: "t0" },
            { kind: "inline", opName: "Register", types: ["i64"] },
          ],
        },
      ]),
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    const edge = result.edges[0];
    expect(edge.source).toBe("t0");
    expect(edge.target).toBe("t1");
    expect(edge.targetHandle).toBe("t1-operand-0");
  });

  it("sets correct targetHandle for each operand index", () => {
    const result = convertASTToGraph(
      makeParseResult([
        { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
        { nodeId: "t1", types: ["i64"], opName: "Constant" },
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

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0].targetHandle).toBe("t2-operand-0");
    expect(result.edges[1].targetHandle).toBe("t2-operand-1");
  });

  it("does not create edges for inline operands", () => {
    const result = convertASTToGraph(
      makeParseResult([
        { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
        {
          nodeId: "t1",
          types: ["i64", "ch"],
          opName: "CopyFromReg",
          operands: [
            { kind: "node", nodeId: "t0" },
            {
              kind: "inline",
              opName: "Register",
              types: ["i64"],
              details: {
                flags: [],
                reg: { type: "VirtReg", value: "%0" },
              },
            },
          ],
        },
      ]),
    );

    // Only one edge (from t0), not from inline Register
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe("t0");
  });

  it("does not create edges for null operands", () => {
    const result = convertASTToGraph(
      makeParseResult([
        { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
        {
          nodeId: "t1",
          types: ["ch"],
          opName: "store",
          operands: [{ kind: "node", nodeId: "t0" }, { kind: "null" }],
        },
      ]),
    );

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe("t0");
  });

  it("skips edges referencing unknown node IDs", () => {
    const result = convertASTToGraph(
      makeParseResult([
        {
          nodeId: "t5",
          types: ["i64"],
          opName: "add",
          operands: [
            { kind: "node", nodeId: "t99" }, // not in the graph
          ],
        },
      ]),
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  it("skips comment entries in ParseResult", () => {
    const parseResult: ParseResult = {
      entries: [
        { kind: "comment", comment: "SelectionDAG has 2 nodes:", line: 1 },
        {
          kind: "node",
          node: { nodeId: "t0", types: ["ch"], opName: "EntryToken" },
          line: 2,
        },
      ],
    };

    const result = convertASTToGraph(parseResult);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("t0");
  });

  it("includes astData on each node", () => {
    const dagNode: SelectionDAGNode = {
      nodeId: "t3",
      types: ["i64"],
      opName: "add",
      details: { flags: ["nuw", "nsw"] },
      operands: [
        { kind: "node", nodeId: "t1" },
        { kind: "node", nodeId: "t2" },
      ],
    };

    const result = convertASTToGraph(makeParseResult([dagNode]));
    const astData = result.nodes[0].astData as unknown as SelectionDAGNode;
    expect(astData.nodeId).toBe("t3");
    expect(astData.opName).toBe("add");
    expect(astData.details?.flags).toEqual(["nuw", "nsw"]);
  });

  it("handles node with index on operand", () => {
    const result = convertASTToGraph(
      makeParseResult([
        { nodeId: "t0", types: ["ch", "glue"], opName: "EntryToken" },
        {
          nodeId: "t1",
          types: ["ch"],
          opName: "RET_GLUE",
          operands: [{ kind: "node", nodeId: "t0", index: 1 }],
        },
      ]),
    );

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe("t0");
    expect(result.edges[0].target).toBe("t1");
    expect(result.edges[0].targetHandle).toBe("t1-operand-0");
  });
});
