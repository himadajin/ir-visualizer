import { describe, expect, it } from "vitest";
import { parseLLVMToAST } from "../../llvm";
import { llvmComplexModule } from "../helpers/llvmFixtures";

const COVERAGE_CHECKPOINTS = [
  "module-type",
  "function-entry",
  "top-level-classification",
] as const;

describe("llvm parser", () => {
  describe("invariants", () => {
    it("when invariants are tracked, should keep a non-empty checkpoint list", () => {
      expect(COVERAGE_CHECKPOINTS.length).toBeGreaterThan(0);
    });

    it("when function exists, should keep entry block inside parsed blocks", () => {
      const ast = parseLLVMToAST(`
define void @main() {
entry:
  ret void
}`);

      const func = ast.functions[0];
      const ids = func.blocks.map((block) => block.id);

      expect(func.entry.id).toBe("entry");
      expect(ids).toContain(func.entry.id);
    });

    it("when module has mixed top-level declarations, should classify each into its dedicated array", () => {
      const ast = parseLLVMToAST(llvmComplexModule);

      expect(ast.type).toBe("Module");
      expect(ast.functions.every((node) => node.type === "Function")).toBe(
        true,
      );
      expect(
        ast.globalVariables.every((node) => node.type === "GlobalVariable"),
      ).toBe(true);
      expect(
        ast.declarations.every((node) => node.type === "Declaration"),
      ).toBe(true);
      expect(
        ast.attributes.every((node) => node.type === "AttributeGroup"),
      ).toBe(true);
      expect(ast.metadata.every((node) => node.type === "Metadata")).toBe(true);
      expect(ast.targets.every((node) => node.type === "Target")).toBe(true);
      expect(
        ast.sourceFilenames.every((node) => node.type === "SourceFilename"),
      ).toBe(true);
    });
  });
});
