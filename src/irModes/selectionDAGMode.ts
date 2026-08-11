import { selectionDAGEdgeBuilder } from "../utils/layout";
import SelectionDAGNode from "../components/Graph/SelectionDAG/SelectionDAGNode";
import type { IRModeDefinition } from "./types";

const DEFAULT_CODE = `
Optimized legalized selection DAG: %bb.0 'test:entry'
SelectionDAG has 22 nodes:
  t0: ch,glue = EntryToken
        t2: i64,ch = CopyFromReg t0, Register:i64 %0
      t10: ch = store<(store (s64) into %ir.a.addr)> t0, t2, FrameIndex:i64<0>, undef:i64
      t4: i64,ch = CopyFromReg t0, Register:i64 %1
    t12: ch = store<(store (s64) into %ir.b.addr)> t10, t4, FrameIndex:i64<1>, undef:i64
    t6: i64,ch = CopyFromReg t0, Register:i64 %2
  t14: ch = store<(store (s64) into %ir.c.addr)> t12, t6, FrameIndex:i64<2>, undef:i64
      t15: i64,ch = load<(dereferenceable load (s64) from %ir.a.addr)> t14, FrameIndex:i64<0>, undef:i64
        t16: i64,ch = load<(dereferenceable load (s64) from %ir.b.addr)> t14, FrameIndex:i64<1>, undef:i64
        t17: i64,ch = load<(dereferenceable load (s64) from %ir.c.addr)> t14, FrameIndex:i64<2>, undef:i64
      t18: i64 = mul t16, t17
    t19: i64 = add t15, t18
  t21: ch,glue = CopyToReg t14, Register:i64 $x10, t19
  t22: ch = RISCVISD::RET_GLUE t21, Register:i64 $x10, t21:1
`;

// parseSelectionDAGToGraphData is synchronous; the registry contract is async.
// See llvmMode.ts for why the adapter lives here and not in the parser layer,
// and why it `import()`s the parser instead of importing it at the top.
// The parser's per-line tolerance (registry contract, "Known behavior
// difference") is exactly what diagnostics are for, but it does not track which
// lines it skipped, so this result carries none yet.
const parse = async (code: string) => ({
  graph: (await import("../parser/selectionDAG")).parseSelectionDAGToGraphData(
    code,
  ),
});

export const selectionDAGMode = {
  key: "selectionDAG" as const,
  label: "SelectionDAG",
  editorLanguage: "llvm",
  defaultCode: DEFAULT_CODE,
  parse,
  nodeTypes: {
    selectionDAGNode: SelectionDAGNode,
  },
  edgeBuilder: selectionDAGEdgeBuilder,
  layoutOptions: { "elk.layered.spacing.nodeNodeBetweenLayers": "50" },
} satisfies IRModeDefinition;
