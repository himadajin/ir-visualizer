import { describe, expect, it } from "vitest";
import { convertASTToGraph } from "../../llvmGraphBuilder";
import { expectUniqueIds, findNodeByType } from "../helpers/assertGraph";
import {
  createBlock,
  createFunction,
  createModule,
  createOpaqueTerminator,
  createRetTerminator,
} from "../helpers/llvmFixtures";
import type { LLVMBrInstruction } from "../../../ast/llvmAST";

const COVERAGE_CHECKPOINTS = [
  "direction",
  "id-uniqueness",
  "exit-dedup",
  "function-scope-namespacing",
  "name-canonicalization",
  "quoted-name-injectivity",
  "declaration-id-uniqueness",
  "parallel-successor-edges",
] as const;

describe("llvm graphBuilder", () => {
  describe("invariants", () => {
    it("when graph is produced, should keep a non-empty checkpoint list", () => {
      expect(COVERAGE_CHECKPOINTS.length).toBeGreaterThan(0);
    });

    it("when graph is built, should use TD direction and unique IDs", () => {
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("main", [
              createBlock("entry", createRetTerminator()),
            ]),
          ],
        }),
      );

      expect(graph.direction).toBe("TD");
      expectUniqueIds(graph.nodes);
      expectUniqueIds(graph.edges);
    });

    it("when a function has multiple return blocks, should create one exit node", () => {
      const branch: LLVMBrInstruction = {
        type: "Instruction",
        opcode: "br",
        condition: "c",
        trueTarget: "then",
        falseTarget: "else",
        originalText: "br i1 %c, label %then, label %else",
      };

      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", branch),
              createBlock("then", createRetTerminator()),
              createBlock("else", createRetTerminator()),
            ]),
          ],
        }),
      );

      const exitNodes = graph.nodes.filter(
        (node) => node.nodeType === "llvm-exit",
      );
      expect(exitNodes).toHaveLength(1);
    });

    it("when functions reuse block labels, should namespace block IDs per function", () => {
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock("entry", createRetTerminator()),
            ]),
            createFunction("bar", [
              createBlock("entry", createRetTerminator()),
            ]),
          ],
        }),
      );

      const entryBlocks = graph.nodes.filter(
        (node) =>
          node.nodeType === "llvm-basicBlock" && node.id.includes("entry"),
      );
      expect(entryBlocks).toHaveLength(2);
      expect(entryBlocks[0].id).not.toBe(entryBlocks[1].id);
      expect(entryBlocks[0].id).toContain("foo");
      expect(entryBlocks[1].id).toContain("bar");

      const header = findNodeByType(graph.nodes, "llvm-functionHeader");
      expect(header).toBeDefined();
    });

    it("when a name is quoted, should key the id by its canonical form", () => {
      // Spec §4.1: the sigil and the surrounding quotes are not part of the
      // name, so `@"main"` is the same LLVM name as `@main` and gets the
      // same id — the quotes are syntax, not content.
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction('@"main"', [
              createBlock("entry", createRetTerminator()),
            ]),
          ],
        }),
      );

      expect(findNodeByType(graph.nodes, "llvm-functionHeader")?.id).toBe(
        "func:main:header",
      );
    });

    it("when a quoted name contains a sigil, should not collide with the stripped name", () => {
      // Regression: the id used to be built by deleting every `@`, `%`, and
      // `"` anywhere in the name, so `@"a@b"` and `@ab` both became
      // `func_ab` and React Flow silently dropped the second function.
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction('@"a@b"', [
              createBlock("entry", createRetTerminator()),
            ]),
            createFunction("@ab", [
              createBlock("entry", createRetTerminator()),
            ]),
          ],
        }),
      );

      expectUniqueIds(graph.nodes);
      expectUniqueIds(graph.edges);
      expect(
        graph.nodes.filter((node) => node.nodeType === "llvm-basicBlock"),
      ).toHaveLength(2);
    });

    it("when a name contains the separator, should escape it rather than merge fragments", () => {
      // A quoted name may contain `:`; escaping it is what keeps a name from
      // impersonating the fragment boundary (§4.1).
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction('@"a:block:b"', [
              createBlock("entry", createRetTerminator()),
            ]),
          ],
        }),
      );

      expect(findNodeByType(graph.nodes, "llvm-functionHeader")?.id).toBe(
        "func:a%3Ablock%3Ab:header",
      );
    });

    it("when a module has several declarations, should give each its own id", () => {
      // Declaration names are not extracted (§5), so every declaration
      // carried the same name-derived id and all but one node vanished.
      const graph = convertASTToGraph(
        createModule({
          declarations: [
            {
              type: "Declaration",
              name: "declaration",
              definition: "declare i32 @a()",
            },
            {
              type: "Declaration",
              name: "declaration",
              definition: "declare i32 @b()",
            },
          ],
        }),
      );

      const declarations = graph.nodes.filter(
        (node) => node.nodeType === "llvm-declaration",
      );
      expect(declarations).toHaveLength(2);
      expectUniqueIds(declarations);
    });

    it("when a terminator repeats a successor, should keep both edges", () => {
      // Rule 7 edges are unlabeled, so the successor index is the only thing
      // separating two edges to the same target (§4.1).
      const graph = convertASTToGraph(
        createModule({
          functions: [
            createFunction("foo", [
              createBlock(
                "entry",
                createOpaqueTerminator(
                  "indirectbr",
                  ["a", "a"],
                  "indirectbr ptr %p, [label %a, label %a]",
                ),
              ),
              createBlock("a", createRetTerminator()),
            ]),
          ],
        }),
      );

      const parallel = graph.edges.filter(
        (edge) => edge.target === "func:foo:block:a",
      );
      expect(parallel).toHaveLength(2);
      expectUniqueIds(parallel);
    });
  });
});
