import { getUseDefPorts } from "../components/Graph/LLVM/UseDef/useDefPorts";
import {
  CFG_TARGET_HANDLE,
  cfgPortFraction,
  getCFGSuccessors,
} from "../graphBuilder/llvmCFGSuccessors";
import type { NodePortProvider } from "../utils/layout";

/** LLVM port dispatch belongs to the registry, not the shared layout engine. */
export const getLLVMNodePorts: NodePortProvider = (node, { width, height }) => {
  if (node.nodeType === "llvm-basicBlock") {
    const successors = getCFGSuccessors(node.astData.terminator);
    return [
      { id: CFG_TARGET_HANDLE, x: width / 2, y: 0 },
      ...successors.map(({ id }, index) => ({
        id,
        x: width * cfgPortFraction(index, successors.length),
        y: height,
      })),
    ];
  }
  if (node.nodeType === "llvm-useDefInstruction") {
    return getUseDefPorts(node.astData).map((port) => ({
      id: port.id,
      x: Math.min(Math.max(port.x ?? width / 2, 0), width),
      y: port.side === "top" ? 0 : height,
    }));
  }
  return [];
};
