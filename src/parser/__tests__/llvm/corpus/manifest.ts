/**
 * Acceptance corpus manifest for the LLVM parser rewrite
 * (docs/internal/plans/2026-07-llvm-line-oriented-parser.md, step 2).
 *
 * Every `expected` projection describes what the future line-oriented parser
 * must produce per plan section 3.2 (terminator successor rules) and section
 * 3.3 (implicit block numbering). For `expectedToFail` entries the projection
 * is derived from those rules, not from the old parser's output; entries
 * without `expectedToFail` pin current behavior that must survive the rewrite.
 * Step 9 deletes the `expectedToFail` flags — nothing else may need to change
 * then.
 */

/**
 * A [source, target, label?] edge triple using the graphBuilder's node id
 * scheme (`func_<name>_header`, `func_<name>_block_<id>`, `func_<name>_exit`).
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
  /**
   * Present while the old Ohm parser cannot produce `expected`; `reason`
   * names the old-parser gap. Deleted wholesale in step 9.
   */
  expectedToFail?: { reason: string };
  expected: CorpusExpectation;
}

export const corpusEntries: CorpusEntry[] = [
  {
    file: "probe-01-minimal-add-ret.ll",
    title: "a modern minimal function",
    expected: {
      functions: [{ name: "@main", blockIds: ["entry"] }],
      edges: [
        ["func_main_header", "func_main_block_entry"],
        ["func_main_block_entry", "func_main_exit"],
      ],
      terminatorOpcodes: { "@main": ["ret"] },
    },
  },
  {
    file: "probe-02-varargs-printf-call.ll",
    title: "the classic hello world with a varargs printf call",
    expectedToFail: {
      reason: "parens and varargs function type in call arguments",
    },
    expected: {
      functions: [{ name: "@main", blockIds: ["entry"] }],
      edges: [
        ["func_main_header", "func_main_block_entry"],
        ["func_main_block_entry", "func_main_exit"],
      ],
      terminatorOpcodes: { "@main": ["ret"] },
      moduleCounts: { globals: 1, declarations: 1 },
    },
  },
  {
    file: "probe-03-gep-constexpr-call-arg.ll",
    title: "a call with a getelementptr constant-expression argument",
    expectedToFail: {
      reason: "parens (getelementptr constant expression) in call arguments",
    },
    expected: {
      functions: [{ name: "@main", blockIds: ["entry"] }],
      edges: [
        ["func_main_header", "func_main_block_entry"],
        ["func_main_block_entry", "func_main_exit"],
      ],
      terminatorOpcodes: { "@main": ["ret"] },
      moduleCounts: { globals: 1 },
    },
  },
  {
    file: "probe-04-unreachable.ll",
    title: "an unreachable terminator",
    expectedToFail: {
      reason: "unreachable is not in the terminator grammar",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      // unreachable has no successors and no exit edge (plan section 3.2).
      edges: [["func_f_header", "func_f_block_entry"]],
      terminatorOpcodes: { "@f": ["unreachable"] },
    },
  },
  {
    file: "probe-05-negative-ret-value.ll",
    title: "a negative integer in ret",
    expectedToFail: {
      reason: "negative integer is not accepted as a ret value",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-06-br-literal-true-condition.ll",
    title: "a conditional br on the literal true",
    expectedToFail: {
      reason: "literal true is not accepted as a br condition",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "a", "b"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_block_a", "true"],
        ["func_f_block_entry", "func_f_block_b", "false"],
        ["func_f_block_a", "func_f_exit"],
        ["func_f_block_b", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["br", "ret", "ret"] },
    },
  },
  {
    file: "probe-07-constexpr-add-operand.ll",
    title: "a ptrtoint constant expression as an add operand",
    expectedToFail: {
      reason: "parens (ptrtoint constant expression) in instruction operands",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
      moduleCounts: { globals: 1 },
    },
  },
  {
    file: "probe-08-br-loop-metadata.ll",
    title: "an unconditional br with !llvm.loop metadata",
    expectedToFail: {
      reason: "metadata suffix after br targets",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "loop"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_block_loop"],
        ["func_f_block_loop", "func_f_block_loop"],
      ],
      terminatorOpcodes: { "@f": ["br", "br"] },
      moduleCounts: { metadata: 1 },
    },
  },
  {
    file: "probe-09-br-prof-metadata.ll",
    title: "a conditional br with !prof metadata",
    expectedToFail: {
      reason: "metadata suffix after conditional br targets",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "a", "b"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_block_a", "true"],
        ["func_f_block_entry", "func_f_block_b", "false"],
        ["func_f_block_a", "func_f_exit"],
        ["func_f_block_b", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["br", "ret", "ret"] },
      moduleCounts: { metadata: 1 },
    },
  },
  {
    file: "probe-10-unnamed-params.ll",
    title: "a define with unnamed parameters",
    expectedToFail: {
      reason: "parameters without a name are not accepted",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-11-function-pointer-param.ll",
    title: "a function-pointer parameter type",
    expectedToFail: {
      reason: "parens in a function-pointer parameter type",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-12-aggregate-return-type.ll",
    title: "an aggregate return type",
    expectedToFail: {
      reason: "aggregate types containing spaces are not accepted in ret",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-13-switch-negative-case.ll",
    title: "a switch with a negative case value",
    expectedToFail: {
      reason: "negative switch case value",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "a", "d"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_block_d", "default"],
        ["func_f_block_entry", "func_f_block_a", "-1"],
        ["func_f_block_a", "func_f_exit"],
        ["func_f_block_d", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["switch", "ret", "ret"] },
    },
  },
  {
    file: "probe-14-invoke-landingpad.ll",
    title: "an invoke with a landingpad (C++ EH)",
    expectedToFail: {
      reason: "invoke/landingpad/resume are not supported",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "cont", "lpad"] }],
      // invoke: `to` edge labeled "to", `unwind` edge labeled "unwind";
      // resume has no successors and no exit edge (plan section 3.2).
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_block_cont", "to"],
        ["func_f_block_entry", "func_f_block_lpad", "unwind"],
        ["func_f_block_cont", "func_f_exit"],
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
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_block_a", "true"],
        ["func_f_block_entry", "func_f_block_b", "false"],
        ["func_f_block_a", "func_f_block_m"],
        ["func_f_block_b", "func_f_block_m"],
        ["func_f_block_m", "func_f_exit"],
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
        ["func_main_header", "func_main_block_entry"],
        ["func_main_block_entry", "func_main_exit"],
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
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
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
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
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
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-20-callbr-asm-goto.ll",
    title: "a callbr (asm goto)",
    expectedToFail: {
      reason:
        "silent misparse: callbr parsed as a call and the cont: label " +
        "absorbed as an instruction, dropping block cont",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry", "cont", "alt"] }],
      // callbr: fallthrough `to` edge and indirect-target edges, all
      // unlabeled (plan section 3.2).
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_block_cont"],
        ["func_f_block_entry", "func_f_block_alt"],
        ["func_f_block_cont", "func_f_exit"],
        ["func_f_block_alt", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["callbr", "ret", "ret"] },
    },
  },
  {
    file: "probe-21-opaque-ptr-clang-o0.ll",
    title: "an opaque-pointer modern clang -O0 style body",
    expected: {
      // The unlabeled entry block keeps id "entry" because the body never
      // references numeric block labels (plan section 3.3); %1/%2 are
      // instruction results, not labels.
      functions: [{ name: "@main", blockIds: ["entry"] }],
      edges: [
        ["func_main_header", "func_main_block_entry"],
        ["func_main_block_entry", "func_main_exit"],
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
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
      moduleCounts: { declarations: 1 },
    },
  },
  {
    file: "probe-23-vector-types.ll",
    title: "vector types in parameters, arithmetic, and ret",
    expectedToFail: {
      reason: "vector types containing spaces are not accepted in ret",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["ret"] },
    },
  },
  {
    file: "probe-24-ret-null-pointer.ll",
    title: "a ret of a null pointer",
    expectedToFail: {
      reason: "null is not accepted as a ret value",
    },
    expected: {
      functions: [{ name: "@f", blockIds: ["entry"] }],
      edges: [
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_exit"],
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
        ["func_f_header", "func_f_block_entry"],
        ["func_f_block_entry", "func_f_block_a", "true"],
        ["func_f_block_entry", "func_f_block_b", "false"],
        ["func_f_block_a", "func_f_exit"],
        ["func_f_block_b", "func_f_exit"],
      ],
      terminatorOpcodes: { "@f": ["br", "ret", "ret"] },
    },
  },
  {
    file: "era-2x-hello-invoke.ll",
    title: "an LLVM 2.x hello world with one-line invoke and unwind",
    expectedToFail: {
      reason: "invoke and the LLVM 2.x unwind terminator are not supported",
    },
    expected: {
      functions: [{ name: "@main", blockIds: ["entry", "ok", "err"] }],
      // unwind (like resume) has no successors and no exit edge (plan
      // section 3.2).
      edges: [
        ["func_main_header", "func_main_block_entry"],
        ["func_main_block_entry", "func_main_block_ok", "to"],
        ["func_main_block_entry", "func_main_block_err", "unwind"],
        ["func_main_block_ok", "func_main_exit"],
      ],
      terminatorOpcodes: { "@main": ["invoke", "ret", "unwind"] },
      moduleCounts: { globals: 1, declarations: 1 },
    },
  },
  {
    file: "era-3x-loop-unnamed-blocks.ll",
    title: "an LLVM 3.x loop with ; <label>:N unnamed blocks",
    expectedToFail: {
      reason:
        "unnamed blocks introduced only by ; <label>:N comments, plus a " +
        "metadata suffix on br",
    },
    expected: {
      // Entry block: unlabeled and the body references numeric labels, so it
      // takes the unnamed-value counter start (0); the other block ids come
      // from the ; <label>:N boundary hints (plan section 3.3).
      functions: [{ name: "@loop", blockIds: ["0", "1", "6"] }],
      edges: [
        ["func_loop_header", "func_loop_block_0"],
        ["func_loop_block_0", "func_loop_block_1"],
        ["func_loop_block_1", "func_loop_block_1", "true"],
        ["func_loop_block_1", "func_loop_block_6", "false"],
        ["func_loop_block_6", "func_loop_exit"],
      ],
      terminatorOpcodes: { "@loop": ["br", "br", "ret"] },
      moduleCounts: { globals: 1, metadata: 1 },
    },
  },
  {
    file: "era-current-clang-o0.ll",
    title: "modern clang -O0 output with printed numeric labels",
    expectedToFail: {
      reason:
        "silent misparse: the unlabeled numeric entry block is hardcoded " +
        "to id entry instead of 0",
    },
    expected: {
      functions: [{ name: "@main", blockIds: ["0", "5", "8", "9"] }],
      edges: [
        ["func_main_header", "func_main_block_0"],
        ["func_main_block_0", "func_main_block_5", "true"],
        ["func_main_block_0", "func_main_block_8", "false"],
        ["func_main_block_5", "func_main_block_9"],
        ["func_main_block_8", "func_main_block_9"],
        ["func_main_block_9", "func_main_exit"],
      ],
      terminatorOpcodes: { "@main": ["br", "br", "br", "ret"] },
      moduleCounts: { metadata: 4, attributes: 1 },
    },
  },
  {
    file: "era-cpp-eh.ll",
    title: "C++ EH with two invokes sharing one landing pad",
    expectedToFail: {
      reason: "invoke/landingpad/resume are not supported",
    },
    expected: {
      functions: [
        { name: "@run", blockIds: ["entry", "cont1", "cont2", "lpad"] },
      ],
      edges: [
        ["func_run_header", "func_run_block_entry"],
        ["func_run_block_entry", "func_run_block_cont1", "to"],
        ["func_run_block_entry", "func_run_block_lpad", "unwind"],
        ["func_run_block_cont1", "func_run_block_cont2", "to"],
        ["func_run_block_cont1", "func_run_block_lpad", "unwind"],
        ["func_run_block_cont2", "func_run_exit"],
      ],
      terminatorOpcodes: { "@run": ["invoke", "invoke", "ret", "resume"] },
      moduleCounts: { declarations: 2 },
    },
  },
  {
    file: "era-switch-heavy.ll",
    title: "a switch with negative and large case values",
    expectedToFail: {
      reason: "negative switch case value",
    },
    expected: {
      functions: [
        {
          name: "@classify",
          blockIds: ["entry", "neg", "zero", "one", "big", "other", "merge"],
        },
      ],
      edges: [
        ["func_classify_header", "func_classify_block_entry"],
        ["func_classify_block_entry", "func_classify_block_other", "default"],
        ["func_classify_block_entry", "func_classify_block_neg", "-1"],
        ["func_classify_block_entry", "func_classify_block_zero", "0"],
        ["func_classify_block_entry", "func_classify_block_one", "1"],
        ["func_classify_block_entry", "func_classify_block_big", "4294967296"],
        ["func_classify_block_neg", "func_classify_block_merge"],
        ["func_classify_block_zero", "func_classify_block_merge"],
        ["func_classify_block_one", "func_classify_block_merge"],
        ["func_classify_block_big", "func_classify_block_merge"],
        ["func_classify_block_other", "func_classify_block_merge"],
        ["func_classify_block_merge", "func_classify_exit"],
      ],
      terminatorOpcodes: {
        "@classify": ["switch", "br", "br", "br", "br", "br", "ret"],
      },
    },
  },
  {
    file: "era-vectors-aggregates.ll",
    title: "vector arithmetic with aggregate insertvalue/extractvalue",
    expectedToFail: {
      reason: "aggregate and vector types containing spaces are not accepted",
    },
    expected: {
      functions: [
        { name: "@pack", blockIds: ["entry"] },
        { name: "@second", blockIds: ["entry"] },
        { name: "@sumlanes", blockIds: ["entry"] },
      ],
      edges: [
        ["func_pack_header", "func_pack_block_entry"],
        ["func_pack_block_entry", "func_pack_exit"],
        ["func_second_header", "func_second_block_entry"],
        ["func_second_block_entry", "func_second_exit"],
        ["func_sumlanes_header", "func_sumlanes_block_entry"],
        ["func_sumlanes_block_entry", "func_sumlanes_exit"],
      ],
      terminatorOpcodes: {
        "@pack": ["ret"],
        "@second": ["ret"],
        "@sumlanes": ["ret"],
      },
    },
  },
];
