import { describe, expect, it } from "vitest";
import { parseLLVM, parseLLVMToAST } from "../../llvm";

describe("llvm parser", () => {
  describe("errors", () => {
    it("when input is invalid, should throw in parseLLVMToAST", () => {
      expect(() => parseLLVMToAST("this is not valid LLVM IR")).toThrow();
    });

    it("when input is invalid, should throw in parseLLVM", () => {
      expect(() => parseLLVM("this is not valid LLVM IR")).toThrow();
    });
  });
});
