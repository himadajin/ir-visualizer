import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../llvmGraphBuilder";
import { findNodeByType } from "../helpers/assertGraph";
import {
  createBlock,
  createFunction,
  createModule,
  createRetTerminator,
} from "../helpers/llvmFixtures";

describe("llvm graphBuilder", () => {
  describe("metadata", () => {
    it("when nodes are built, should include astData for node-specific rendering", () => {
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("main", [
              createBlock("entry", createRetTerminator()),
            ]),
          ],
          globalVariables: [
            {
              type: "GlobalVariable",
              name: "g",
              value: "global i32 42",
              originalText: "@g = global i32 42",
            },
          ],
        }),
      );

      const basicBlock = findNodeByType(graph.nodes, "llvm-basicBlock");
      const globalNode = findNodeByType(graph.nodes, "llvm-globalVariable");
      const header = findNodeByType(graph.nodes, "llvm-functionHeader");

      expect(basicBlock?.astData).toBeDefined();
      expect((basicBlock?.astData as { id?: string })?.id).toBe("entry");

      expect(globalNode?.astData).toBeDefined();
      expect((globalNode?.astData as { name?: string })?.name).toBe("g");

      expect(header?.astData).toBeDefined();
      expect((header?.astData as { name?: string })?.name).toBe("main");
    });
  });
});
