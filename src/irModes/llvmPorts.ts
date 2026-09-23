import { getUseDefPorts } from "../components/Graph/LLVM/UseDef/useDefPorts";
import {
  cfgPortFraction,
  getCFGSuccessors,
} from "../graphBuilder/llvmCFGSuccessors";
import type { NodePortPreferences } from "../types/nodePorts";

/** LLVM port dispatch belongs to the registry, not the shared layout engine. */
export const getLLVMNodePorts: NodePortPreferences = (node) => {
  if (node.nodeType === "llvm-basicBlock") {
    const successors = getCFGSuccessors(node.astData.terminator);
    return successors.map(({ id }, index) => ({
      id,
      side: "bottom",
      x: cfgPortFraction(index, successors.length),
      relative: true,
    }));
  }
  if (node.nodeType === "llvm-useDefInstruction") {
    return getUseDefPorts(node.astData);
  }
  return undefined;
};
