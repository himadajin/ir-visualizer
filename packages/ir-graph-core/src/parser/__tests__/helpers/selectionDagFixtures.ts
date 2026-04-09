export const selectionDagMinimalNodeLine = "t0: ch,glue = EntryToken";

export const selectionDagMachineOpLine =
  "  t22: ch = RISCVISD::RET_GLUE t21, Register:i64 $x10, t21:1";

export const selectionDagFullDump = `Optimized legalized selection DAG: %bb.0 'test:entry'
SelectionDAG has 3 nodes:
  t0: ch,glue = EntryToken
  t2: i64,ch = CopyFromReg t0, Register:i64 %0
  t22: ch = RISCVISD::RET_GLUE t2, Register:i64 $x10, t2:1`;
