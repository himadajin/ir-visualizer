import { describe, expect, it } from "vitest";
import { parseSelectionDAG, parseSelectionDAGNode } from "../selectionDAG";

describe("parseSelectionDAGNode", () => {
  it("parses a minimal node", () => {
    const result = parseSelectionDAGNode("t0: ch,glue = EntryToken");

    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe("t0");
    expect(result.node?.types).toEqual(["ch", "glue"]);
    expect(result.node?.opName).toBe("EntryToken");
    expect(result.node?.details).toBeUndefined();
    expect(result.node?.operands).toBeUndefined();
  });

  it("parses machine op with operands and index", () => {
    const result = parseSelectionDAGNode(
      "  t22: ch = RISCVISD::RET_GLUE t21, Register:i64 $x10, t21:1",
    );

    expect(result.error).toBeUndefined();
    expect(result.node?.opName).toBe("RISCVISD::RET_GLUE");
    expect(result.node?.operands).toEqual([
      { kind: "node", nodeId: "t21" },
      {
        kind: "inline",
        opName: "Register",
        types: ["i64"],
        details: {
          flags: [],
          reg: { type: "PhysReg", value: "$x10" },
        },
      },
      { kind: "node", nodeId: "t21", index: 1 },
    ]);
  });

  it("parses details/verbose/inline-detail", () => {
    const result = parseSelectionDAGNode(
      "t10: ch = store<(store (s64) into %ir.a.addr)> [ORD=5] t0, t2, FrameIndex:i64<0>, <null>",
    );

    expect(result.error).toBeUndefined();
    expect(result.node?.details).toEqual({
      flags: [],
      detail: "(store (s64) into %ir.a.addr)",
    });
    expect(result.node?.verbose).toBe("ORD=5");
    expect(result.node?.operands?.[2]).toEqual({
      kind: "inline",
      opName: "FrameIndex",
      types: ["i64"],
      details: { flags: [], detail: "0" },
    });
    expect(result.node?.operands?.[3]).toEqual({ kind: "null" });
  });

  it("parses flag list", () => {
    const result = parseSelectionDAGNode("t3: i64 = add nuw nsw t1, t2");

    expect(result.error).toBeUndefined();
    expect(result.node?.details).toEqual({ flags: ["nuw", "nsw"] });
    expect(result.node?.operands).toEqual([
      { kind: "node", nodeId: "t1" },
      { kind: "node", nodeId: "t2" },
    ]);
  });

  it("returns error on non-node line", () => {
    const result = parseSelectionDAGNode("SelectionDAG has 12 nodes:");
    expect(result.node).toBeUndefined();
    expect(result.comment).toBe("SelectionDAG has 12 nodes:");
    expect(result.error).toBeUndefined();
  });

  it("treats malformed node-looking lines as comments", () => {
    const result = parseSelectionDAGNode("t0: ch = EntryToken,");
    expect(result.node).toBeUndefined();
    expect(result.comment).toBe("t0: ch = EntryToken,");
    expect(result.error).toBeUndefined();
  });

  it("parses old-format hex id with [ORD=N] suffix", () => {
    const result = parseSelectionDAGNode(
      "  0x8c43010: ch = EntryToken [ORD=1]",
    );
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe("0x8c43010");
    expect(result.node?.opName).toBe("EntryToken");
    expect(result.node?.verbose).toBe("ORD=1");
  });

  it("parses [ORD=N] after operands (old format)", () => {
    const result = parseSelectionDAGNode(
      "  0x8c43210: i32,ch = CopyFromReg 0x8c43010, 0x8c43110 [ORD=2]",
    );
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe("0x8c43210");
    expect(result.node?.opName).toBe("CopyFromReg");
    expect(result.node?.verbose).toBe("ORD=2");
    expect(result.node?.operands).toEqual([
      { kind: "node", nodeId: "0x8c43010" },
      { kind: "node", nodeId: "0x8c43110" },
    ]);
  });

  it("parses angle-bracket wrapped operand", () => {
    const result = parseSelectionDAGNode(
      "  0x8c43810: ch = store 0x8c43010, 0x8c43610, 0x8c43710, <0x8c43910> [ORD=5]",
    );
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe("0x8c43810");
    expect(result.node?.opName).toBe("store");
    expect(result.node?.verbose).toBe("ORD=5");
    expect(result.node?.operands).toEqual([
      { kind: "node", nodeId: "0x8c43010" },
      { kind: "node", nodeId: "0x8c43610" },
      { kind: "node", nodeId: "0x8c43710" },
      { kind: "node", nodeId: "0x8c43910", wrapped: true },
    ]);
  });

  it("parses Register with %RAX (virtual register)", () => {
    const result = parseSelectionDAGNode("0x7fcbd985abcd: i64 = Register %RAX");
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe("0x7fcbd985abcd");
    expect(result.node?.opName).toBe("Register");
    expect(result.node?.details).toEqual({
      flags: [],
      reg: { type: "VirtReg", value: "%RAX" },
    });
  });

  it("parses Register with #1024 (numbered register)", () => {
    const result = parseSelectionDAGNode(
      "0x7fcbd985abcd: i64 = Register #1024",
    );
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe("0x7fcbd985abcd");
    expect(result.node?.opName).toBe("Register");
    expect(result.node?.details).toEqual({
      flags: [],
      reg: { type: "Numbered", value: "#1024" },
    });
  });

  it("parses Register with bare name like R1", () => {
    const result = parseSelectionDAGNode("0x7fcbd985abcd: i64 = Register R1");
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe("0x7fcbd985abcd");
    expect(result.node?.opName).toBe("Register");
    expect(result.node?.details).toEqual({
      flags: [],
      reg: { type: "Bare", value: "R1" },
    });
  });

  it("parses ValueType :i64", () => {
    const result = parseSelectionDAGNode("0x7fcbd985abcd: ch = ValueType :i64");
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe("0x7fcbd985abcd");
    expect(result.node?.types).toEqual(["ch"]);
    expect(result.node?.opName).toBe("ValueType");
    expect(result.node?.details).toEqual({
      flags: [],
      vtDetail: "i64",
    });
    expect(result.node?.operands).toBeUndefined();
  });

  it("parses ValueType :f32", () => {
    const result = parseSelectionDAGNode("t5: ch = ValueType :f32");
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.opName).toBe("ValueType");
    expect(result.node?.details).toEqual({
      flags: [],
      vtDetail: "f32",
    });
  });

  it("parses ValueType :v4i32", () => {
    const result = parseSelectionDAGNode("t6: ch = ValueType :v4i32");
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.opName).toBe("ValueType");
    expect(result.node?.details).toEqual({
      flags: [],
      vtDetail: "v4i32",
    });
  });

  it("parses old LLVM load with wrapped operand and trailing attrs", () => {
    const result = parseSelectionDAGNode(
      "0x7fcbd985abcd: i64,ch = load 0x7fcbd9850001, 0x7fcbd9850002, 0x7fcbd9850003 <0x7fcbd9850004:0> <sext i16> alignment=2",
    );
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe("0x7fcbd985abcd");
    expect(result.node?.types).toEqual(["i64", "ch"]);
    expect(result.node?.opName).toBe("load");
    expect(result.node?.details).toEqual({
      flags: [],
      detail: "sext i16 alignment=2",
    });
    expect(result.node?.operands).toEqual([
      { kind: "node", nodeId: "0x7fcbd9850001" },
      { kind: "node", nodeId: "0x7fcbd9850002" },
      { kind: "node", nodeId: "0x7fcbd9850003" },
      { kind: "node", nodeId: "0x7fcbd9850004", index: 0, wrapped: true },
    ]);
  });

  it("parses TargetGlobalAddress with immediate operand", () => {
    const result = parseSelectionDAGNode(
      "0x7fcbd985abcd: i32 = TargetGlobalAddress <void (...)* @function> 0",
    );
    expect(result.error).toBeUndefined();
    expect(result.node).toBeDefined();
    expect(result.node?.opName).toBe("TargetGlobalAddress");
    expect(result.node?.details).toEqual({
      flags: [],
      detail: "void (...)* @function",
    });
    expect(result.node?.operands).toEqual([{ kind: "immediate", value: "0" }]);
  });

  it("parses ArgFlags with empty detail (spaced and compact)", () => {
    const spaced = parseSelectionDAGNode("0x7fcbd985abcd: ch = ArgFlags < >");
    expect(spaced.error).toBeUndefined();
    expect(spaced.node).toBeDefined();
    expect(spaced.node?.opName).toBe("ArgFlags");
    expect(spaced.node?.details).toEqual({
      flags: [],
      detail: "",
    });

    const compact = parseSelectionDAGNode("0x7fcbd985abcd: ch = ArgFlags <>");
    expect(compact.error).toBeUndefined();
    expect(compact.node).toBeDefined();
    expect(compact.node?.opName).toBe("ArgFlags");
    expect(compact.node?.details).toEqual({
      flags: [],
      detail: "",
    });
  });
});

describe("parseSelectionDAG", () => {
  it("parses dump input and preserves node/comment order", () => {
    const input = `Optimized legalized selection DAG: %bb.0 'test:entry'
SelectionDAG has 3 nodes:
  t0: ch,glue = EntryToken
  t2: i64,ch = CopyFromReg t0, Register:i64 %0
  t22: ch = RISCVISD::RET_GLUE t2, Register:i64 $x10, t2:1`;

    const result = parseSelectionDAG(input);
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

  it("collects malformed node lines as comments", () => {
    const input = `SelectionDAG has 2 nodes:
  t0: ch = EntryToken
  t1: i32 = add t0,`;

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

  it("returns empty result for non-node input", () => {
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
