// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseMermaidToAST } from "../../mermaid";
import { mermaidCorpus } from "./corpus/manifest";

describe("mermaid parser corpus", () => {
  it.each(mermaidCorpus)(
    "pins FlowDB adapter output for $name",
    async (entry) => {
      const ast = await parseMermaidToAST(entry.input);
      const expected = entry.expected;

      expect(ast.direction).toBe(expected.direction);
      expect(ast.nodes.map((node) => node.id).sort()).toEqual(
        [...expected.nodeIds].sort(),
      );

      if (expected.shapes) {
        for (const [id, shape] of Object.entries(expected.shapes)) {
          expect(ast.nodes.find((node) => node.id === id)?.shape).toBe(shape);
        }
      }
      if (expected.labels) {
        for (const [id, label] of Object.entries(expected.labels)) {
          expect(ast.nodes.find((node) => node.id === id)?.label).toBe(label);
        }
      }

      expect(ast.edges).toHaveLength(expected.edges.length);
      expected.edges.forEach((edge, i) => {
        expect(ast.edges[i].sourceId).toBe(edge.sourceId);
        expect(ast.edges[i].targetId).toBe(edge.targetId);
        if (edge.label !== undefined) {
          expect(ast.edges[i].label).toBe(edge.label);
        }
        if (edge.stroke !== undefined) {
          expect(ast.edges[i].stroke).toBe(edge.stroke);
        }
        if (edge.arrowhead !== undefined) {
          expect(ast.edges[i].arrowhead).toBe(edge.arrowhead);
        }
      });

      if (expected.subgraphs) {
        expect(ast.subgraphs).toHaveLength(expected.subgraphs.length);
        for (const sg of expected.subgraphs) {
          const actual = ast.subgraphs.find((item) => item.id === sg.id);
          expect(actual?.title).toBe(sg.title);
          expect(actual?.nodeIds.sort()).toEqual([...sg.nodeIds].sort());
          expect(actual?.direction).toBe(sg.direction);
        }
      }
    },
  );
});
