import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../llvmGraphBuilder";
import type {
  LLVMBrInstruction,
  LLVMInvokeInstruction,
  LLVMSwitchInstruction,
} from "../../../ast/llvmAST";
import { edgesFrom } from "../helpers/assertGraph";
import {
  createBlock,
  createFunction,
  createModule,
  createOpaqueTerminator,
  createRetTerminator,
} from "../helpers/llvmFixtures";

describe("llvm graphBuilder", () => {
  describe("edges", () => {
    it("when branch is conditional, should create true and false edges", () => {
      const terminator: LLVMBrInstruction = {
        type: "Instruction",
        opcode: "br",
        condition: "cond",
        trueTarget: "then",
        falseTarget: "else",
        originalText: "br i1 %cond, label %then, label %else",
      };

      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", terminator),
              createBlock("then", createRetTerminator()),
              createBlock("else", createRetTerminator()),
            ]),
          ],
        }),
      );

      const entryId = graph.nodes.find(
        (node) =>
          node.nodeType === "llvm-basicBlock" && node.id.includes("entry"),
      )?.id;
      expect(entryId).toBeDefined();

      const edges = edgesFrom(graph.edges, entryId!);
      expect(edges).toHaveLength(2);

      expect(edges.find((edge) => edge.label === "true")?.target).toContain(
        "then",
      );
      expect(edges.find((edge) => edge.label === "false")?.target).toContain(
        "else",
      );
    });

    it("when branch is unconditional, should create one edge without label", () => {
      const terminator: LLVMBrInstruction = {
        type: "Instruction",
        opcode: "br",
        destination: "next",
        originalText: "br label %next",
      };

      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", terminator),
              createBlock("next", createRetTerminator()),
            ]),
          ],
        }),
      );

      const entryId = graph.nodes.find(
        (node) =>
          node.nodeType === "llvm-basicBlock" && node.id.includes("entry"),
      )?.id;
      expect(entryId).toBeDefined();

      const edges = edgesFrom(graph.edges, entryId!);
      expect(edges).toHaveLength(1);
      expect(edges[0].target).toContain("next");
      expect(edges[0].label).toBeUndefined();
    });

    it("when terminator is switch, should create default and case edges", () => {
      const terminator: LLVMSwitchInstruction = {
        type: "Instruction",
        opcode: "switch",
        conditionType: "i32",
        conditionValue: "v",
        defaultTarget: "default",
        cases: [
          { type: "i32", value: "0", target: "case0" },
          { type: "i32", value: "1", target: "case1" },
        ],
        originalText:
          "switch i32 %v, label %default [ i32 0, label %case0 i32 1, label %case1 ]",
      };

      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", terminator),
              createBlock("case0", createRetTerminator()),
              createBlock("case1", createRetTerminator()),
              createBlock("default", createRetTerminator()),
            ]),
          ],
        }),
      );

      const entryId = graph.nodes.find(
        (node) =>
          node.nodeType === "llvm-basicBlock" &&
          node.id.includes("_block_entry"),
      )?.id;
      expect(entryId).toBeDefined();

      const edges = edgesFrom(graph.edges, entryId!);
      expect(edges).toHaveLength(3);
      expect(edges.find((edge) => edge.label === "default")?.target).toContain(
        "default",
      );
      expect(edges.find((edge) => edge.label === "0")).toBeDefined();
      expect(edges.find((edge) => edge.label === "1")).toBeDefined();
    });

    it("when terminator is invoke, should create to and unwind edges", () => {
      const terminator: LLVMInvokeInstruction = {
        type: "Instruction",
        opcode: "invoke",
        callee: "g",
        normalTarget: "cont",
        unwindTarget: "lpad",
        originalText: "invoke void @g() to label %cont unwind label %lpad",
      };

      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", terminator),
              createBlock("cont", createRetTerminator()),
              createBlock(
                "lpad",
                createOpaqueTerminator("resume", [], "resume ptr %e"),
              ),
            ]),
          ],
        }),
      );

      const entryId = graph.nodes.find(
        (node) =>
          node.nodeType === "llvm-basicBlock" &&
          node.id.includes("_block_entry"),
      )?.id;
      expect(entryId).toBeDefined();

      const edges = edgesFrom(graph.edges, entryId!);
      expect(edges).toHaveLength(2);
      expect(edges.find((edge) => edge.label === "to")?.target).toContain(
        "cont",
      );
      expect(edges.find((edge) => edge.label === "unwind")?.target).toContain(
        "lpad",
      );
    });

    it("when terminator carries successors, should create one unlabeled edge per successor", () => {
      const terminator = createOpaqueTerminator(
        "callbr",
        ["cont", "alt"],
        "callbr void asm sideeffect ... to label %cont [label %alt]",
      );

      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", terminator),
              createBlock("cont", createRetTerminator()),
              createBlock("alt", createRetTerminator()),
            ]),
          ],
        }),
      );

      const entryId = graph.nodes.find(
        (node) =>
          node.nodeType === "llvm-basicBlock" &&
          node.id.includes("_block_entry"),
      )?.id;
      expect(entryId).toBeDefined();

      const edges = edgesFrom(graph.edges, entryId!);
      expect(edges).toHaveLength(2);
      expect(edges.map((edge) => edge.label)).toEqual([undefined, undefined]);
      expect(edges[0].target).toContain("cont");
      expect(edges[1].target).toContain("alt");
    });

    it.each(["unreachable", "resume", "unwind"])(
      "when terminator is %s (empty successors), should create no edges and no exit",
      (opcode) => {
        const graph = convertASTToGraph(
          createModule({
            functions: [
              createFunction("foo", [
                createBlock(
                  "entry",
                  createOpaqueTerminator(opcode, [], opcode),
                ),
              ]),
            ],
          }),
        );

        const entryId = graph.nodes.find(
          (node) => node.nodeType === "llvm-basicBlock",
        )?.id;
        expect(entryId).toBeDefined();

        expect(edgesFrom(graph.edges, entryId!)).toHaveLength(0);
        expect(
          graph.nodes.find((node) => node.nodeType === "llvm-exit"),
        ).toBeUndefined();
      },
    );

    it("when a degraded switch arrives as an opaque terminator, should fall back to successor edges", () => {
      // A `switch i32 %v, label %d` with no bracket group parses to an
      // LLVMOpaqueTerminator with opcode "switch" and NO cases field; the
      // dispatch must narrow on shape, not opcode, or it would read
      // `cases` off a node that does not have it.
      const terminator = createOpaqueTerminator(
        "switch",
        ["d"],
        "switch i32 %v, label %d",
      );

      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", terminator),
              createBlock("d", createRetTerminator()),
            ]),
          ],
        }),
      );

      const entryId = graph.nodes.find(
        (node) =>
          node.nodeType === "llvm-basicBlock" &&
          node.id.includes("_block_entry"),
      )?.id;
      expect(entryId).toBeDefined();

      const edges = edgesFrom(graph.edges, entryId!);
      expect(edges).toHaveLength(1);
      expect(edges[0].target).toContain("_block_d");
      expect(edges[0].label).toBeUndefined();
    });

    it("when function has an entry block, should connect header to entry", () => {
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("main", [
              createBlock("entry", createRetTerminator()),
            ]),
          ],
        }),
      );

      const header = graph.nodes.find(
        (node) => node.nodeType === "llvm-functionHeader",
      );
      const entryBlock = graph.nodes.find(
        (node) => node.nodeType === "llvm-basicBlock",
      );
      expect(header).toBeDefined();
      expect(entryBlock).toBeDefined();

      expect(
        graph.edges.find(
          (edge) =>
            edge.source === header?.id && edge.target === entryBlock?.id,
        ),
      ).toBeDefined();
    });
  });
});
