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
  describe("nodes", () => {
    it("when a function has a single return block, should create header, block, and exit nodes", () => {
      const func = createFunction("main", [
        createBlock("entry", createRetTerminator()),
      ]);
      const graph = convertASTToGraph(createModule({ functions: [func] }));

      expect(graph.nodes).toHaveLength(3);

      const header = findNodeByType(graph.nodes, "llvm-functionHeader");
      const basicBlock = findNodeByType(graph.nodes, "llvm-basicBlock");
      const exitNode = findNodeByType(graph.nodes, "llvm-exit");

      expect(header).toBeDefined();
      expect(header?.label).toContain("main");
      expect(header?.language).toBe("llvm");

      expect(basicBlock).toBeDefined();
      expect(basicBlock?.language).toBe("llvm");

      expect(exitNode).toBeDefined();
      expect(exitNode?.label).toBe("exit");
    });

    it("when module-level LLVM entries exist, should create dedicated nodes for each entry kind", () => {
      const graph = convertASTToGraph(
        createModule({
          globalVariables: [
            {
              type: "GlobalVariable",
              name: "g",
              value: "global i32 42",
              originalText: "@g = global i32 42",
            },
          ],
          declarations: [
            {
              type: "Declaration",
              name: "printf",
              definition: "declare void @printf()",
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
        }),
      );

      expect(findNodeByType(graph.nodes, "llvm-globalVariable")).toBeDefined();
      expect(findNodeByType(graph.nodes, "llvm-declaration")).toBeDefined();
      expect(findNodeByType(graph.nodes, "llvm-attributeGroup")).toBeDefined();
      expect(findNodeByType(graph.nodes, "llvm-metadata")).toBeDefined();
    });
  });
});
