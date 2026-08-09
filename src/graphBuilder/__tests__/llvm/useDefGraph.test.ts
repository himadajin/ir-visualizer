import { describe, expect, it } from "vitest";
import { convertASTToUseDefGraph } from "../../llvmUseDefGraphBuilder";
import { expectUniqueIds } from "../helpers/assertGraph";
import { createModule } from "../helpers/llvmFixtures";
import type {
  LLVMBasicBlock,
  LLVMBasicBlockItem,
  LLVMDebugRecord,
  LLVMFunction,
  LLVMGenericInstruction,
  LLVMOpaqueTerminator,
  LLVMParam,
  LLVMTerminator,
  LLVMUseDefInstructionData,
} from "../../../ast/llvmAST";
import type { GraphNode } from "../../../types/graph";

/**
 * Fixtures for the Use-Def view. The shared `llvmFixtures` helpers predate
 * the §3.5 `defs`/`uses` fields and build no parameters, so this suite
 * carries its own line/block/function builders that set them explicitly.
 */

interface LineSpec {
  text: string;
  defs?: string[];
  uses?: string[];
  opcode?: string;
}

function line({
  text,
  defs = [],
  uses = [],
  opcode = "op",
}: LineSpec): LLVMGenericInstruction {
  return {
    type: "Instruction",
    opcode,
    operands: [],
    originalText: text,
    defs,
    uses,
  };
}

function terminator(spec: LineSpec): LLVMGenericInstruction {
  return line(spec);
}

/** The §3.4 synthetic terminator: no source line, no defs/uses. */
function emptyTerminator(): LLVMOpaqueTerminator {
  return { type: "Instruction", opcode: "", successors: [], originalText: "" };
}

function debugRecord(): LLVMDebugRecord {
  return {
    type: "DebugRecord",
    content: "#dbg_value(i32 %a, !1, !DIExpression(), !2)",
    originalText: "  #dbg_value(i32 %a, !1, !DIExpression(), !2)",
  };
}

function block(
  id: string,
  label: string | null,
  instructions: LLVMBasicBlockItem[],
  term: LLVMTerminator = terminator({ text: "ret void" }),
): LLVMBasicBlock {
  return { type: "BasicBlock", id, label, instructions, terminator: term };
}

function func(
  name: string,
  blocks: LLVMBasicBlock[],
  params: LLVMParam[] = [],
): LLVMFunction {
  return {
    type: "Function",
    name,
    params,
    blocks,
    definition: `define void @${name}()`,
    entry: blocks[0],
  };
}

function moduleOf(...functions: LLVMFunction[]) {
  return createModule({ functions });
}

function instructionNodes(nodes: GraphNode[]): GraphNode[] {
  return nodes.filter((node) => node.nodeType === "llvm-useDefInstruction");
}

function valueNodes(nodes: GraphNode[]): GraphNode[] {
  return nodes.filter((node) => node.nodeType === "llvm-useDefValue");
}

function instructionData(node: GraphNode): LLVMUseDefInstructionData {
  if (node.nodeType !== "llvm-useDefInstruction") {
    throw new Error(`node ${node.id} is not a use-def instruction node`);
  }
  return node.astData;
}

describe("llvm useDef graphBuilder", () => {
  describe("nodes", () => {
    it("module-level items produce no nodes", () => {
      const graph = convertASTToUseDefGraph(
        createModule({
          globalVariables: [
            {
              type: "GlobalVariable",
              name: "@g",
              value: "i32 0",
              originalText: "@g = global i32 0",
            },
          ],
          attributes: [
            {
              type: "AttributeGroup",
              id: "#0",
              value: "{ nounwind }",
              originalText: "attributes #0 = { nounwind }",
            },
          ],
          metadata: [
            {
              type: "Metadata",
              id: "!0",
              value: "!{i32 1}",
              originalText: "!0 = !{i32 1}",
            },
          ],
          declarations: [
            {
              type: "Declaration",
              name: "declaration",
              definition: "declare i32 @puts(ptr)",
            },
          ],
          targets: [{ type: "Target", key: "datalayout", value: '"e-m:o"' }],
          sourceFilenames: [
            {
              type: "SourceFilename",
              name: "a.c",
              originalText: 'source_filename = "a.c"',
            },
          ],
        }),
      );

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });

    it("one node per instruction with defs or uses", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block(
              "entry",
              "entry",
              [
                line({ text: "%a = add i32 1, 2", defs: ["a"] }),
                line({ text: "%b = mul i32 %a, 3", defs: ["b"], uses: ["a"] }),
              ],
              terminator({ text: "ret i32 %b", opcode: "ret", uses: ["b"] }),
            ),
          ]),
        ),
      );

      expect(instructionNodes(graph.nodes)).toHaveLength(3);
      expectUniqueIds(graph.nodes);
    });

    it("lines with neither defs nor uses get no node", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block(
              "entry",
              "entry",
              [
                line({ text: "fence seq_cst", opcode: "fence" }),
                line({ text: "%a = add i32 1, 2", defs: ["a"] }),
              ],
              terminator({ text: "br label %next", opcode: "br" }),
            ),
          ]),
        ),
      );

      const nodes = instructionNodes(graph.nodes);
      expect(nodes).toHaveLength(1);
      expect(instructionData(nodes[0]).text).toBe("%a = add i32 1, 2");
      // The skipped `fence` line consumes no index: emitted lines are what
      // `i<n>` counts (spec §2.1).
      expect(nodes[0].id).toBe("func_foo_ud_entry_i0");
    });

    it("terminators that read or define values get nodes", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block(
              "entry",
              "entry",
              [line({ text: "%c = icmp eq i32 1, 2", defs: ["c"] })],
              terminator({
                text: "br i1 %c, label %then, label %else",
                opcode: "br",
                uses: ["c"],
              }),
            ),
          ]),
        ),
      );

      const nodes = instructionNodes(graph.nodes);
      expect(nodes).toHaveLength(2);
      const term = nodes[1];
      expect(instructionData(term).isTerminator).toBe(true);
      expect(instructionData(term).text).toBe(
        "br i1 %c, label %then, label %else",
      );
      expect(instructionData(nodes[0]).isTerminator).toBe(false);
    });

    it("debug records and the synthetic empty terminator get no node", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block(
              "entry",
              "entry",
              [line({ text: "%a = add i32 1, 2", defs: ["a"] }), debugRecord()],
              emptyTerminator(),
            ),
          ]),
        ),
      );

      const nodes = instructionNodes(graph.nodes);
      expect(nodes).toHaveLength(1);
      expect(instructionData(nodes[0]).text).toBe("%a = add i32 1, 2");
    });

    it("instruction node ids are namespaced per function", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("entry", "entry", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
            ]),
          ]),
          func("bar", [
            block("entry", "entry", [
              line({ text: "%a = add i32 3, 4", defs: ["a"] }),
            ]),
          ]),
        ),
      );

      const ids = instructionNodes(graph.nodes).map((node) => node.id);
      expect(ids).toEqual(["func_foo_ud_entry_i0", "func_bar_ud_entry_i0"]);
      expectUniqueIds(graph.nodes);
    });

    it("instruction astData carries text, def and isTerminator", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block(
              "entry",
              "entry",
              [line({ text: "%a = add i32 1, 2", defs: ["a"] })],
              terminator({ text: "ret i32 %a", opcode: "ret", uses: ["a"] }),
            ),
          ]),
        ),
      );

      const [defining, returning] = instructionNodes(graph.nodes);
      expect(instructionData(defining)).toMatchObject({
        text: "%a = add i32 1, 2",
        def: "a",
        isTerminator: false,
      });
      expect(instructionData(returning)).toMatchObject({
        text: "ret i32 %a",
        def: null,
        isTerminator: true,
      });
    });

    it("blockLabel is entry for the unlabeled entry block", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("0", null, [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
            ]),
            block("named", "named", [
              line({ text: "%b = add i32 3, 4", defs: ["b"] }),
            ]),
            block("7", null, [
              line({ text: "%c = add i32 5, 6", defs: ["c"] }),
            ]),
          ]),
        ),
      );

      const labels = instructionNodes(graph.nodes).map(
        (node) => instructionData(node).blockLabel,
      );
      // First block with a null label reads "entry"; a later null-labeled
      // block falls back to its block id (spec §2.1).
      expect(labels).toEqual(["entry", "named", "7"]);
    });

    it("blockIndex is the block's position in its function", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("entry", "entry", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
            ]),
            block("mid", "mid", [
              line({ text: "%b = add i32 3, 4", defs: ["b"] }),
            ]),
            block("tail", "tail", [
              line({ text: "%c = add i32 5, 6", defs: ["c"] }),
            ]),
          ]),
        ),
      );

      const indexes = instructionNodes(graph.nodes).map(
        (node) => instructionData(node).blockIndex,
      );
      expect(indexes).toEqual([0, 1, 2]);
    });

    it("one argument node per named parameter", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func(
            "foo",
            [block("entry", "entry", [])],
            [
              { type: "i32", name: "%x" },
              { type: "ptr noundef", name: "%y" },
            ],
          ),
        ),
      );

      const args = valueNodes(graph.nodes);
      expect(args).toHaveLength(2);
      expect(args.map((node) => node.id)).toEqual([
        "func_foo_udarg_x",
        "func_foo_udarg_y",
      ]);
      expect(args[0].astData).toEqual({
        name: "x",
        kind: "argument",
        paramType: "i32",
      });
      expect(args[1].astData).toEqual({
        name: "y",
        kind: "argument",
        paramType: "ptr noundef",
      });
    });

    it("unnamed parameters get no argument node", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func(
            "foo",
            [
              block("entry", "entry", [
                line({ text: "%a = add i32 %0, 1", defs: ["a"], uses: ["0"] }),
              ]),
            ],
            [
              { type: "i32", name: null },
              { type: "...", name: null },
            ],
          ),
        ),
      );

      expect(
        valueNodes(graph.nodes).filter(
          (node) =>
            node.nodeType === "llvm-useDefValue" &&
            node.astData.kind === "argument",
        ),
      ).toHaveLength(0);
      // The implicit `%0` parameter name resolves as external instead.
      expect(graph.nodes.map((node) => node.id)).toContain("func_foo_udext_0");
    });

    it("external value node for names with no known def", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("entry", "entry", [
              line({
                text: "%a = add i32 %undef, 1",
                defs: ["a"],
                uses: ["undef"],
              }),
              line({
                text: "%b = mul i32 %undef, 2",
                defs: ["b"],
                uses: ["undef"],
              }),
            ]),
          ]),
        ),
      );

      const externals = valueNodes(graph.nodes);
      expect(externals).toHaveLength(1);
      expect(externals[0].id).toBe("func_foo_udext_undef");
      expect(externals[0].astData).toEqual({ name: "undef", kind: "external" });
      // Created once and reused by every unresolved reader.
      expect(
        graph.edges.filter((edge) => edge.source === externals[0].id),
      ).toHaveLength(2);
    });
  });

  describe("edges", () => {
    it("one edge per use, from the defining node", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("entry", "entry", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
              line({ text: "%b = mul i32 %a, 3", defs: ["b"], uses: ["a"] }),
              line({
                text: "%c = sub i32 %a, %b",
                defs: ["c"],
                uses: ["a", "b"],
              }),
            ]),
          ]),
        ),
      );

      const [a, b, c] = instructionNodes(graph.nodes).map((node) => node.id);
      expect(
        graph.edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
        })),
      ).toEqual([
        { source: a, target: b },
        { source: a, target: c },
        { source: b, target: c },
      ]);
      expectUniqueIds(graph.edges);
    });

    it("plain use-def edges carry no label", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("entry", "entry", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
              line({ text: "%b = mul i32 %a, 3", defs: ["b"], uses: ["a"] }),
            ]),
          ]),
        ),
      );

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].label).toBeUndefined();
      expect(graph.edges[0].dashed).toBeUndefined();
    });

    it("edge ids embed the value name", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("entry", "entry", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
              line({ text: "%b = mul i32 %a, 3", defs: ["b"], uses: ["a"] }),
            ]),
          ]),
        ),
      );

      expect(graph.edges[0].id).toBe(
        "e-func_foo_ud_entry_i0-func_foo_ud_entry_i1-a",
      );
    });

    it("a value read twice on one line gets one edge", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("entry", "entry", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
              // `uses` is deduplicated per line by the parser (§3.5).
              line({ text: "%b = mul i32 %a, %a", defs: ["b"], uses: ["a"] }),
            ]),
          ]),
        ),
      );

      expect(graph.edges).toHaveLength(1);
    });

    it("uses of parameters connect to the argument node", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func(
            "foo",
            [
              block("entry", "entry", [
                line({ text: "%a = add i32 %x, 1", defs: ["a"], uses: ["x"] }),
              ]),
            ],
            [{ type: "i32", name: "%x" }],
          ),
        ),
      );

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].source).toBe("func_foo_udarg_x");
      expect(graph.edges[0].target).toBe("func_foo_ud_entry_i0");
      expect(graph.edges[0].label).toBeUndefined();
    });

    it("phi incoming edges are dashed and labeled with the incoming block", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("bb1", "bb1", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
            ]),
            block("bb2", "bb2", [
              line({ text: "%b = add i32 3, 4", defs: ["b"] }),
            ]),
            block("join", "join", [
              line({
                text: "%r = phi i32 [ %a, %bb1 ], [ %b, %bb2 ]",
                opcode: "phi",
                defs: ["r"],
                uses: ["a", "b"],
              }),
            ]),
          ]),
        ),
      );

      expect(graph.edges).toHaveLength(2);
      expect(graph.edges.every((edge) => edge.dashed === true)).toBe(true);
      expect(graph.edges.map((edge) => edge.label)).toEqual([
        "%a (%bb1)",
        "%b (%bb2)",
      ]);
    });

    it("a value arriving from several blocks gets one edge listing them", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("bb1", "bb1", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
            ]),
            block("join", "join", [
              line({
                text: "%r = phi i32 [ %a, %bb1 ], [ %a, %bb2 ]",
                opcode: "phi",
                defs: ["r"],
                uses: ["a"],
              }),
            ]),
          ]),
        ),
      );

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].label).toBe("%a (%bb1, %bb2)");
      expect(graph.edges[0].dashed).toBe(true);
      expect(graph.edges[0].id).toBe(
        "e-func_foo_ud_bb1_i0-func_foo_ud_join_i0-a",
      );
    });

    it("constant phi incoming values contribute no edge", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("bb2", "bb2", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
            ]),
            block("join", "join", [
              line({
                text: "%r = phi i32 [ 0, %bb1 ], [ %a, %bb2 ]",
                opcode: "phi",
                defs: ["r"],
                uses: ["a"],
              }),
            ]),
          ]),
        ),
      );

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].label).toBe("%a (%bb2)");
    });
  });

  describe("invariants", () => {
    it("direction is TD", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func("foo", [
            block("entry", "entry", [
              line({ text: "%a = add i32 1, 2", defs: ["a"] }),
            ]),
          ]),
        ),
      );

      expect(graph.direction).toBe("TD");
    });

    it("no node carries parentId", () => {
      const graph = convertASTToUseDefGraph(
        moduleOf(
          func(
            "foo",
            [
              block(
                "entry",
                null,
                [
                  line({
                    text: "%a = add i32 %x, 1",
                    defs: ["a"],
                    uses: ["x"],
                  }),
                  line({
                    text: "%b = mul i32 %a, %undef",
                    defs: ["b"],
                    uses: ["a", "undef"],
                  }),
                ],
                terminator({ text: "ret i32 %b", opcode: "ret", uses: ["b"] }),
              ),
            ],
            [{ type: "i32", name: "%x" }],
          ),
        ),
      );

      expect(graph.nodes.length).toBeGreaterThan(0);
      graph.nodes.forEach((node) => {
        expect(node).not.toHaveProperty("parentId");
      });
    });
  });
});
