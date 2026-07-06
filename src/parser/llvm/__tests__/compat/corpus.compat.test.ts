// Step-8 corpus run against the line-oriented parser
// (docs/internal/plans/2026-07-llvm-line-oriented-parser.md §6, step 8).
//
// The manifest's `expectedToFail` flags describe the OLD parser's gaps and
// are deliberately ignored here: every one of the 31 entries must satisfy
// its projection against the new parser via a plain `it`. This is the
// step-8 exit criterion ("corpus manifest passes with the expectedToFail
// flags removed locally") expressed as a permanent test; step 9 deletes the
// flags from the manifest itself and points the original corpus.test.ts at
// the new parser via llvm/index.
//
// The projection-assertion body mirrors src/parser/__tests__/llvm/
// corpus.test.ts, retargeted at ../../parse.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLLVM, parseLLVMToAST } from "../../parse";
import { corpusEntries } from "../../../__tests__/llvm/corpus/manifest";
import type { CorpusEntry } from "../../../__tests__/llvm/corpus/manifest";

const corpusDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../__tests__/llvm/corpus",
);

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

describe("llvm parser (line-oriented)", () => {
  describe("acceptance corpus", () => {
    for (const entry of corpusEntries) {
      it(`when ${entry.title} is parsed, should match its CFG projection`, () => {
        assertMatchesProjection(entry);
      });
    }
  });
});
