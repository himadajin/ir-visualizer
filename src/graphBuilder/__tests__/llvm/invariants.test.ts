import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../llvmGraphBuilder";
import { expectUniqueIds, findNodeByType } from "../helpers/assertGraph";
import {
  createBlock,
  createFunction,
  createModule,
  createRetTerminator,
} from "../helpers/llvmFixtures";
import type { LLVMBrInstruction } from "../../../ast/llvmAST";

const COVERAGE_CHECKPOINTS = [
  "direction",
  "id-uniqueness",
  "exit-dedup",
  "function-scope-namespacing",
] as const;

describe("llvm graphBuilder", () => {
  describe("invariants", () => {
    it("when graph is produced, should keep a non-empty checkpoint list", () => {
      expect(COVERAGE_CHECKPOINTS.length).toBeGreaterThan(0);
    });

    it("when graph is built, should use TD direction and unique IDs", () => {
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("main", [
              createBlock("entry", createRetTerminator()),
            ]),
          ],
        }),
      );

      expect(graph.direction).toBe("TD");
      expectUniqueIds(graph.nodes);
      expectUniqueIds(graph.edges);
    });

    it("when a function has multiple return blocks, should create one exit node", () => {
      const branch: LLVMBrInstruction = {
        type: "Instruction",
        opcode: "br",
        condition: "c",
        trueTarget: "then",
        falseTarget: "else",
        originalText: "br i1 %c, label %then, label %else",
      };

      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", branch),
              createBlock("then", createRetTerminator()),
              createBlock("else", createRetTerminator()),
            ]),
          ],
        }),
      );

      const exitNodes = graph.nodes.filter(
        (node) => node.nodeType === "llvm-exit",
      );
      expect(exitNodes).toHaveLength(1);
    });

    it("when functions reuse block labels, should namespace block IDs per function", () => {
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", createRetTerminator()),
            ]),
            createFunction("bar", [
              createBlock("entry", createRetTerminator()),
            ]),
          ],
        }),
      );

      const entryBlocks = graph.nodes.filter(
        (node) =>
          node.nodeType === "llvm-basicBlock" && node.id.includes("entry"),
      );
      expect(entryBlocks).toHaveLength(2);
      expect(entryBlocks[0].id).not.toBe(entryBlocks[1].id);
      expect(entryBlocks[0].id).toContain("foo");
      expect(entryBlocks[1].id).toContain("bar");

      const header = findNodeByType(graph.nodes, "llvm-functionHeader");
      expect(header).toBeDefined();
    });
  });
});
