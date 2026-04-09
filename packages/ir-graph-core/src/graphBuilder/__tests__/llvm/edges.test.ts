import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../llvmGraphBuilder";
import type {
  LLVMBrInstruction,
  LLVMSwitchInstruction,
} from "../../../ast/llvmAST";
import { edgesFrom } from "../helpers/assertGraph";
import {
  createBlock,
  createFunction,
  createModule,
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
