import { describe, expect, it } from "vitest";
import { parseLLVM } from "../../../parser/llvm";
import { getCFGSuccessors } from "../../llvmCFGSuccessors";
import { convertASTToGraph } from "../../llvmGraphBuilder";
import {
  createBlock,
  createFunction,
  createModule,
} from "../helpers/llvmFixtures";

function graphWith(terminator: string) {
  return parseLLVM(`define void @f() {
entry:
  ${terminator}
a:
  ret void
b:
  ret void
}`).graph;
}

const outgoing = (terminator: string) =>
  graphWith(terminator).edges.filter(
    (edge) => edge.source === "func:f:block:entry",
  );

describe("CFG successor ports", () => {
  it.each([
    [
      "br i1 %c, label %a, label %a",
      ["cfg:true", "cfg:false"],
      ["true", "false"],
    ],
    [
      "switch i32 %v, label %a [ i32 -1, label %a i32 2, label %b ]",
      ["cfg:default", "cfg:case:-1", "cfg:case:2"],
      ["default", "-1", "2"],
    ],
    [
      "invoke void @g() to label %a unwind label %a",
      ["cfg:to", "cfg:unwind"],
      ["to", "unwind"],
    ],
    [
      "indirectbr ptr %p, [label %a, label %a, label %b]",
      ["cfg:succ:0", "cfg:succ:1", "cfg:succ:2"],
      [undefined, undefined, undefined],
    ],
    [
      "callbr void @g() to label %a [label %b]",
      ["cfg:succ:0", "cfg:succ:1"],
      [undefined, undefined],
    ],
    [
      "catchswitch within none [label %a, label %b] unwind to caller",
      ["cfg:succ:0", "cfg:succ:1"],
      [undefined, undefined],
    ],
    ["switch i32 %v, label %a", ["cfg:succ:0"], [undefined]],
    ["br label %a", ["cfg:br"], [undefined]],
    ["ret void", ["cfg:ret"], [undefined]],
    ["unreachable", [], []],
  ])("connects %s in semantic/source order", (terminator, ids, labels) => {
    const edges = outgoing(terminator);
    expect(edges.map((edge) => edge.sourceHandle)).toEqual(ids);
    expect(edges.map((edge) => edge.label)).toEqual(labels);
    expect(new Set(edges.map((edge) => edge.id)).size).toBe(edges.length);
    const graph = graphWith(terminator);
    for (const node of graph.nodes) {
      if (node.nodeType !== "llvm-basicBlock") continue;
      const ports = getCFGSuccessors(node.astData.terminator).map(
        (port) => port.id,
      );
      expect(
        graph.edges
          .filter((edge) => edge.source === node.id)
          .map((edge) => edge.sourceHandle),
      ).toEqual(ports);
      expect(
        graph.edges
          .filter((edge) => edge.target === node.id)
          .every((edge) => edge.targetHandle === "cfg:in"),
      ).toBe(true);
    }
  });

  it("keeps handles stable across retargeting and distinct switch case reordering", () => {
    expect(
      outgoing("br i1 %other, label %b, label %a").map(
        (edge) => edge.sourceHandle,
      ),
    ).toEqual(
      outgoing("br i1 %c, label %a, label %b").map((edge) => edge.sourceHandle),
    );
    const before = outgoing(
      "switch i32 %v, label %a [ i32 1, label %a i32 2, label %b ]",
    );
    const after = outgoing(
      "switch i32 %v, label %b [ i32 2, label %a i32 1, label %b ]",
    );
    for (const edge of before) {
      expect(
        after.find((candidate) => candidate.label === edge.label)?.sourceHandle,
      ).toBe(edge.sourceHandle);
    }
  });

  it("keeps escaped and repeated case values collision-free", () => {
    const values = ["default", "a:b", "a%3Ab", "a:b", "a:b:occurrence:1"];
    const block = createBlock("entry", {
      type: "Instruction",
      opcode: "switch",
      originalText: "switch",
      conditionType: "i32",
      conditionValue: "%v",
      defaultTarget: "entry",
      cases: values.map((value) => ({ type: "i32", value, target: "entry" })),
    });
    const graph = convertASTToGraph(
      createModule({ functions: [createFunction("a:b%", [block])] }),
    );
    const edges = graph.edges.filter((edge) => edge.source === edge.target);
    expect(edges.map((edge) => edge.sourceHandle)).toEqual([
      "cfg:default",
      "cfg:case:default",
      "cfg:case:a%3Ab",
      "cfg:case:a%253Ab",
      "cfg:case:a%3Ab:occurrence:1",
      "cfg:case:a%3Ab%3Aoccurrence%3A1",
    ]);
    expect(new Set(edges.map((edge) => edge.id)).size).toBe(edges.length);
  });
});
