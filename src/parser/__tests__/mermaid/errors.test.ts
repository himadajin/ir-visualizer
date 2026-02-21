import { describe, expect, it } from "vitest";
import { parseMermaid, parseMermaidToAST } from "../../mermaid";

describe("mermaid parser", () => {
  describe("errors", () => {
    it("when input is empty, should throw in parseMermaidToAST", () => {
      expect(() => parseMermaidToAST("")).toThrow();
    });

    it("when input has no graph header, should throw in parseMermaidToAST", () => {
      expect(() => parseMermaidToAST("A --> B")).toThrow();
    });

    it("when input has no graph header, should throw in parseMermaid", () => {
      expect(() => parseMermaid("A --> B")).toThrow();
    });
  });
});
