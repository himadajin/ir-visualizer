import type { LLVMTerminator } from "../ast/llvmAST";
import { cfgPortId } from "./llvmIds";

export const CFG_TARGET_HANDLE = cfgPortId("in");

export interface CFGSuccessor {
  id: string;
  /** null denotes the synthetic function exit, not an LLVM block label. */
  target: string | null;
  label?: string;
  edgeVariant: string[];
}

/** One definition of CFG edge semantics and port order (llvm-ir.md §4.2). */
export function getCFGSuccessors(terminator: LLVMTerminator): CFGSuccessor[] {
  const successor = (
    variant: string[],
    target: string | null,
    label?: string,
    edgeVariant = variant,
  ): CFGSuccessor => ({
    id: cfgPortId(...variant),
    target,
    label,
    edgeVariant,
  });

  // Shape, not opcode: structured terminators may degrade to opaque ones.
  if ("condition" in terminator && terminator.condition !== undefined) {
    return [
      successor(["true"], terminator.trueTarget ?? "", "true"),
      successor(["false"], terminator.falseTarget ?? "", "false"),
    ];
  }
  if ("destination" in terminator && terminator.destination !== undefined) {
    return [successor(["br"], terminator.destination, undefined, [])];
  }
  if (terminator.opcode === "ret") {
    return [successor(["ret"], null, undefined, [])];
  }
  if ("defaultTarget" in terminator) {
    const occurrences = new Map<string, number>();
    return [
      successor(["default"], terminator.defaultTarget, "default"),
      ...terminator.cases.map(({ value, target }) => {
        const occurrence = occurrences.get(value) ?? 0;
        occurrences.set(value, occurrence + 1);
        return successor(
          [
            "case",
            value,
            ...(occurrence > 0 ? ["occurrence", String(occurrence)] : []),
          ],
          target,
          value,
        );
      }),
    ];
  }
  if ("normalTarget" in terminator) {
    return [
      successor(["to"], terminator.normalTarget, "to"),
      successor(["unwind"], terminator.unwindTarget, "unwind"),
    ];
  }
  if ("successors" in terminator) {
    return terminator.successors.map((target, index) =>
      successor(["succ", String(index)], target),
    );
  }
  return [];
}

/** Fraction of the outer width; shared by CSS handles and ELK ports. */
export const cfgPortFraction = (index: number, count: number): number =>
  (index + 1) / (count + 1);
