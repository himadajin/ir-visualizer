import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLLVM, parseLLVMToAST } from "../../llvm";
import { corpusEntries } from "./corpus/manifest";
import type { CorpusEntry } from "./corpus/manifest";

const corpusDir = join(dirname(fileURLToPath(import.meta.url)), "corpus");

/**
 * Render an edge as one comparable string so edge sets can be compared
 * order-independently while a mismatch still reports the complete sets.
 */
function edgeKey(source: string, target: string, label?: string): string {
  return label ? `${source} -> ${target} [${label}]` : `${source} -> ${target}`;
}

function assertMatchesProjection(entry: CorpusEntry): void {
  const input = readFileSync(join(corpusDir, entry.file), "utf8");

  const ast = parseLLVMToAST(input);
  const graph = parseLLVM(input);

  const functions = ast.functions.map((func) => ({
    name: func.name,
    blockIds: func.blocks.map((block) => block.id),
  }));
  expect(functions).toEqual(entry.expected.functions);

  const terminatorOpcodes = Object.fromEntries(
    ast.functions.map((func) => [
      func.name,
      func.blocks.map((block) => block.terminator.opcode),
    ]),
  );
  expect(terminatorOpcodes).toEqual(entry.expected.terminatorOpcodes);

  const actualEdges = graph.edges
    .map((edge) => edgeKey(edge.source, edge.target, edge.label))
    .sort();
  const expectedEdges = entry.expected.edges
    .map(([source, target, label]) => edgeKey(source, target, label))
    .sort();
  expect(actualEdges).toEqual(expectedEdges);

  const counts = entry.expected.moduleCounts;
  if (counts) {
    expect({
      declarations: ast.declarations.length,
      globals: ast.globalVariables.length,
      metadata: ast.metadata.length,
      attributes: ast.attributes.length,
    }).toEqual({
      declarations: counts.declarations ?? 0,
      globals: counts.globals ?? 0,
      metadata: counts.metadata ?? 0,
      attributes: counts.attributes ?? 0,
    });
  }
}

describe("llvm parser", () => {
  describe("acceptance corpus", () => {
    for (const entry of corpusEntries) {
      if (entry.expectedToFail) {
        // Known old-parser gap (named in the manifest's expectedToFail
        // reason). The assertion body is identical to the passing path;
        // step 9 deletes the flag and this entry runs as a plain `it`.
        it.fails(
          `when ${entry.title} is parsed, should match its CFG projection ` +
            `(expected to fail: ${entry.expectedToFail.reason})`,
          () => {
            assertMatchesProjection(entry);
          },
        );
      } else {
        it(`when ${entry.title} is parsed, should match its CFG projection`, () => {
          assertMatchesProjection(entry);
        });
      }
    }
  });
});
