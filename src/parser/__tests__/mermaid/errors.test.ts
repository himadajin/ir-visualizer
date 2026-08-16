// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMermaid, parseMermaidToAST } from "../../mermaid";
import { NOT_A_FLOWCHART_MESSAGE } from "../../mermaid/preprocess";

describe("mermaid parser", () => {
  describe("errors", () => {
    it("when input is empty, should reject", async () => {
      await expect(parseMermaidToAST("")).rejects.toThrow(
        NOT_A_FLOWCHART_MESSAGE,
      );
    });

    it("when input has no graph header, should reject", async () => {
      await expect(parseMermaidToAST("A --> B")).rejects.toThrow(
        NOT_A_FLOWCHART_MESSAGE,
      );
    });

    it("when input is a sequence diagram, should reject", async () => {
      await expect(
        parseMermaidToAST("sequenceDiagram\nAlice->>Bob: hi"),
      ).rejects.toThrow(NOT_A_FLOWCHART_MESSAGE);
    });

    it("when flowchart syntax is invalid, should reject from the upstream parser", async () => {
      await expect(parseMermaidToAST("graph TD\nA -->")).rejects.toThrow();
    });

    it("when parseMermaid is used on a non-flowchart, should reject", async () => {
      await expect(parseMermaid("A --> B")).rejects.toThrow(
        NOT_A_FLOWCHART_MESSAGE,
      );
    });
  });
});
