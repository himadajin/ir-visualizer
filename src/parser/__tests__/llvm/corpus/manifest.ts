/**
 * Acceptance corpus manifest for the line-oriented LLVM parser
 * (docs/internal/specs/llvm-ir.md).
 *
 * Every `expected` projection describes what the parser must produce per
 * spec section 3.2 (terminator successor rules) and section 3.3 (implicit
 * block numbering). Every entry must pass the line-oriented parser.
 */

/**
 * A [source, target, label?] edge triple using the graphBuilder's node id
 * scheme (`specs/llvm-ir.md` §4.1: `func:<name>:header`,
 * `func:<name>:block:<id>`, `func:<name>:exit`).
 * Compared order-independently, but as the complete edge set: no missing or
 * extra edges are allowed.
 */
export type CorpusEdge = [source: string, target: string, label?: string];

export interface CorpusFunctionProjection {
  /** Function name as stored in the AST (includes the leading `@`). */
  name: string;
  /** Ordered raw basic-block ids, e.g. ["entry", "a"] or ["0", "5"]. */
  blockIds: string[];
}

/** Counts of interesting top-level module entries (asserted only when set). */
export interface CorpusModuleCounts {
  declarations?: number;
  globals?: number;
  metadata?: number;
  attributes?: number;
}

export interface CorpusExpectation {
  functions: CorpusFunctionProjection[];
  edges: CorpusEdge[];
  /** Per function (keyed by AST name), the ordered terminator opcodes. */
  terminatorOpcodes: Record<string, string[]>;
  moduleCounts?: CorpusModuleCounts;
}

export interface CorpusEntry {
  file: string;
  title: string;
  expected: CorpusExpectation;
}

export const corpusEntries: CorpusEntry[] = [
  {
    file: "probe-01-minimal-add-ret.ll",
    title: "a modern minimal function",
    expected: {
      functions: [{ name: "@main", blockIds: ["entry"] }],
      edges: [
        ["func:main:header", "func:main:block:entry"],
        ["func:main:block:entry", "func:main:exit"],
      ],
      terminatorOpcodes: { "@main": ["ret"] },
    },
  },
  {
    file: "probe-02-varargs-printf-call.ll",
    title: "the classic hello world with a varargs printf call",
    expected: {
      functions: [{ name: "@main", blockIds: ["entry"] }],
      edges: [
        ["func:main:header", "func:main:block:entry"],
        ["func:main:block:entry", "func:main:exit"],
      ],
      terminatorOpcodes: { "@main": ["ret"] },
      moduleCounts: { globals: 1, declarations: 1 },
    },
  },
  {
    file: "probe-03-gep-constexpr-call-arg.ll",
    title: "a call with a getelementptr constant-expression argument",
    expected: {
      functions: [{ name: "@main", blockIds: ["entry"] }],
      edges: [
        ["func:main:header", "func:main:block:entry"],
        ["func:main:block:entry", "func:main:exit"],
      ],
      terminatorOpcodes: { "@main": ["ret"] },
      moduleCounts: { globals: 1 },
    },
  },
  {
    file: "probe-04-unreachable.ll",
    title: "an unreachable terminator",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      // unreachable has no successors and no exit edge (spec section 3.2).
      edges: [["func:f:header", "func:f:block:entry"]],
      terminatorOpcodes: { "@f": ["unreachable"] },
    },
  },
  {
    file: "probe-05-negative-ret-value.ll",
    title: "a negative integer in ret",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-06-br-literal-true-condition.ll",
    title: "a conditional br on the literal true",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "a", "b"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:block:a", "true"],
        ["func:f:block:entry", "func:f:block:b", "false"],
        ["func:f:block:a", "func:f:exit"],
        ["func:f:block:b", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["br", "ret", "ret"] },
    },
  },
  {
    file: "probe-07-constexpr-add-operand.ll",
    title: "a ptrtoint constant expression as an add operand",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
      moduleCounts: { globals: 1 },
    },
  },
  {
    file: "probe-08-br-loop-metadata.ll",
    title: "an unconditional br with !llvm.loop metadata",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "loop"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:block:loop"],
        ["func:f:block:loop", "func:f:block:loop"],
      ],
      terminatorOpcodes: { "@f": ["br", "br"] },
      moduleCounts: { metadata: 1 },
    },
  },
  {
    file: "probe-09-br-prof-metadata.ll",
    title: "a conditional br with !prof metadata",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "a", "b"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:block:a", "true"],
        ["func:f:block:entry", "func:f:block:b", "false"],
        ["func:f:block:a", "func:f:exit"],
        ["func:f:block:b", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["br", "ret", "ret"] },
      moduleCounts: { metadata: 1 },
    },
  },
  {
    file: "probe-10-unnamed-params.ll",
    title: "a define with unnamed parameters",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-11-function-pointer-param.ll",
    title: "a function-pointer parameter type",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-12-aggregate-return-type.ll",
    title: "an aggregate return type",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-13-switch-negative-case.ll",
    title: "a switch with a negative case value",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "a", "d"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:block:d", "default"],
        ["func:f:block:entry", "func:f:block:a", "-1"],
        ["func:f:block:a", "func:f:exit"],
        ["func:f:block:d", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["switch", "ret", "ret"] },
    },
  },
  {
    file: "probe-14-invoke-landingpad.ll",
    title: "an invoke with a landingpad (C++ EH)",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "cont", "lpad"] }],
      // invoke: `to` edge labeled "to", `unwind` edge labeled "unwind";
      // resume has no successors and no exit edge (spec section 3.2).
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:block:cont", "to"],
        ["func:f:block:entry", "func:f:block:lpad", "unwind"],
        ["func:f:block:cont", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["invoke", "ret", "resume"] },
      moduleCounts: { declarations: 2 },
    },
  },
  {
    file: "probe-15-phi-node.ll",
    title: "a phi node joining two predecessors",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "a", "b", "m"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:block:a", "true"],
        ["func:f:block:entry", "func:f:block:b", "false"],
        ["func:f:block:a", "func:f:block:m"],
        ["func:f:block:b", "func:f:block:m"],
        ["func:f:block:m", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["br", "br", "br", "ret"] },
    },
  },
  {
    file: "probe-16-old-style-load-gep.ll",
    title: "old-style (LLVM <= 3.6) load/gep with pointer type first",
    expected: {
      functions: [{ name: "@main", blockIds: ["entry"] }],
      edges: [
        ["func:main:header", "func:main:block:entry"],
        ["func:main:block:entry", "func:main:exit"],
      ],
      terminatorOpcodes: { "@main": ["ret"] },
      moduleCounts: { globals: 1 },
    },
  },
  {
    file: "probe-17-trailing-comment.ll",
    title: "a trailing comment on an instruction",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-18-select-constants.ll",
    title: "a select with constant operands",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-19-float-constants.ll",
    title: "float constants in scientific and negative decimal form",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-20-callbr-asm-goto.ll",
    title: "a callbr (asm goto)",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "cont", "alt"] }],
      // callbr: fallthrough `to` edge and indirect-target edges, all
      // unlabeled (spec section 3.2).
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:block:cont"],
        ["func:f:block:entry", "func:f:block:alt"],
        ["func:f:block:cont", "func:f:exit"],
        ["func:f:block:alt", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["callbr", "ret", "ret"] },
    },
  },
  {
    file: "probe-21-opaque-ptr-clang-o0.ll",
    title: "an opaque-pointer modern clang -O0 style body",
    expected: {
      // The unlabeled entry block keeps id "entry" because the body never
      // references numeric block labels (spec section 3.3); %1/%2 are
      // instruction results, not labels.
      functions: [{ name: "@main", blockIds: ["entry"] }],
      edges: [
        ["func:main:header", "func:main:block:entry"],
        ["func:main:block:entry", "func:main:exit"],
      ],
      terminatorOpcodes: { "@main": ["ret"] },
    },
  },
  {
    file: "probe-22-declare-attrs-comment.ll",
    title: "a declare with attributes and an interleaved comment line",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
      moduleCounts: { declarations: 1 },
    },
  },
  {
    file: "probe-23-vector-types.ll",
    title: "vector types in parameters, arithmetic, and ret",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-24-ret-null-pointer.ll",
    title: "a ret of a null pointer",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-25-icmp-conditional-br.ll",
    title: "an icmp followed by a conditional br",
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "a", "b"] }],
      edges: [
        ["func:f:header", "func:f:block:entry"],
        ["func:f:block:entry", "func:f:block:a", "true"],
        ["func:f:block:entry", "func:f:block:b", "false"],
        ["func:f:block:a", "func:f:exit"],
        ["func:f:block:b", "func:f:exit"],
      ],
      terminatorOpcodes: { "@f": ["br", "ret", "ret"] },
    },
  },
  {
    file: "era-2x-hello-invoke.ll",
    title: "an LLVM 2.x hello world with one-line invoke and unwind",
    expected: {
      functions: [{ name: "@main", blockIds: ["entry", "ok", "err"] }],
      // unwind (like resume) has no successors and no exit edge (spec
      // section 3.2).
      edges: [
        ["func:main:header", "func:main:block:entry"],
        ["func:main:block:entry", "func:main:block:ok", "to"],
        ["func:main:block:entry", "func:main:block:err", "unwind"],
        ["func:main:block:ok", "func:main:exit"],
      ],
      terminatorOpcodes: { "@main": ["invoke", "ret", "unwind"] },
      moduleCounts: { globals: 1, declarations: 1 },
    },
  },
  {
    file: "era-3x-loop-unnamed-blocks.ll",
    title: "an LLVM 3.x loop with ; <label>:N unnamed blocks",
    expected: {
      // Entry block: unlabeled and the body references numeric labels, so it
      // takes the unnamed-value counter start (0); the other block ids come
      // from the ; <label>:N boundary hints (spec section 3.3).
      functions: [{ name: "@loop", blockIds: ["0", "1", "6"] }],
      edges: [
        ["func:loop:header", "func:loop:block:0"],
        ["func:loop:block:0", "func:loop:block:1"],
        ["func:loop:block:1", "func:loop:block:1", "true"],
        ["func:loop:block:1", "func:loop:block:6", "false"],
        ["func:loop:block:6", "func:loop:exit"],
      ],
      terminatorOpcodes: { "@loop": ["br", "br", "ret"] },
      moduleCounts: { globals: 1, metadata: 1 },
    },
  },
  {
    file: "era-current-clang-o0.ll",
    title: "modern clang -O0 output with printed numeric labels",
    expected: {
      functions: [{ name: "@main", blockIds: ["0", "5", "8", "9"] }],
      edges: [
        ["func:main:header", "func:main:block:0"],
        ["func:main:block:0", "func:main:block:5", "true"],
        ["func:main:block:0", "func:main:block:8", "false"],
        ["func:main:block:5", "func:main:block:9"],
        ["func:main:block:8", "func:main:block:9"],
        ["func:main:block:9", "func:main:exit"],
      ],
      terminatorOpcodes: { "@main": ["br", "br", "br", "ret"] },
      moduleCounts: { metadata: 4, attributes: 1 },
    },
  },
  {
    file: "era-cpp-eh.ll",
    title: "C++ EH with two invokes sharing one landing pad",
    expected: {
      functions: [
        { name: "@run", blockIds: ["entry", "cont1", "cont2", "lpad"] },
      ],
      edges: [
        ["func:run:header", "func:run:block:entry"],
        ["func:run:block:entry", "func:run:block:cont1", "to"],
        ["func:run:block:entry", "func:run:block:lpad", "unwind"],
        ["func:run:block:cont1", "func:run:block:cont2", "to"],
        ["func:run:block:cont1", "func:run:block:lpad", "unwind"],
        ["func:run:block:cont2", "func:run:exit"],
      ],
      terminatorOpcodes: { "@run": ["invoke", "invoke", "ret", "resume"] },
      moduleCounts: { declarations: 2 },
    },
  },
  {
    file: "era-switch-heavy.ll",
    title: "a switch with negative and large case values",
    expected: {
      functions: [
        {
          name: "@classify",
          blockIds: ["entry", "neg", "zero", "one", "big", "other", "merge"],
        },
      ],
      edges: [
        ["func:classify:header", "func:classify:block:entry"],
        ["func:classify:block:entry", "func:classify:block:other", "default"],
        ["func:classify:block:entry", "func:classify:block:neg", "-1"],
        ["func:classify:block:entry", "func:classify:block:zero", "0"],
        ["func:classify:block:entry", "func:classify:block:one", "1"],
        ["func:classify:block:entry", "func:classify:block:big", "4294967296"],
        ["func:classify:block:neg", "func:classify:block:merge"],
        ["func:classify:block:zero", "func:classify:block:merge"],
        ["func:classify:block:one", "func:classify:block:merge"],
        ["func:classify:block:big", "func:classify:block:merge"],
        ["func:classify:block:other", "func:classify:block:merge"],
        ["func:classify:block:merge", "func:classify:exit"],
      ],
      terminatorOpcodes: {
        "@classify": ["switch", "br", "br", "br", "br", "br", "ret"],
      },
    },
  },
  {
    file: "era-vectors-aggregates.ll",
    title: "vector arithmetic with aggregate insertvalue/extractvalue",
    expected: {
      functions: [
        { name: "@pack", blockIds: ["entry"] },
        { name: "@second", blockIds: ["entry"] },
        { name: "@sumlanes", blockIds: ["entry"] },
      ],
      edges: [
        ["func:pack:header", "func:pack:block:entry"],
        ["func:pack:block:entry", "func:pack:exit"],
        ["func:second:header", "func:second:block:entry"],
        ["func:second:block:entry", "func:second:exit"],
        ["func:sumlanes:header", "func:sumlanes:block:entry"],
        ["func:sumlanes:block:entry", "func:sumlanes:exit"],
      ],
      terminatorOpcodes: {
        "@pack": ["ret"],
        "@second": ["ret"],
        "@sumlanes": ["ret"],
      },
    },
  },
];
