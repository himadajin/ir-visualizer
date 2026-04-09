import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../../graphBuilder/llvmGraphBuilder";
import { parseLLVM, parseLLVMToAST } from "../../llvm";
import { llvmComplexModule, llvmMinimalRet } from "../helpers/llvmFixtures";

describe("llvm parser", () => {
  describe("graph data", () => {
    it("when parseLLVM is used, should match convertASTToGraph(parseLLVMToAST(input))", () => {
      const direct = parseLLVM(llvmComplexModule);
      const viaAst = convertASTToGraph(parseLLVMToAST(llvmComplexModule));

      expect(direct).toEqual(viaAst);
    });

    it("when minimal function is parsed, should return TD graph with nodes and edges", () => {
      const graph = parseLLVM(llvmMinimalRet);

      expect(graph.direction).toBe("TD");
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
    });
  });
});
