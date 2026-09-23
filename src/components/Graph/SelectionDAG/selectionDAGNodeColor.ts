export type SelectionDAGNodeCategory =
  | "entryToken"
  | "targetSpecific"
  | "memory"
  | "register"
  | "tokenFactor"
  | "default";

export function classifySelectionDAGNode(
  opName: string,
): SelectionDAGNodeCategory {
  if (opName === "EntryToken") return "entryToken";
  if (opName === "TokenFactor") return "tokenFactor";
  if (opName === "CopyFromReg" || opName === "CopyToReg") return "register";
  if (opName.includes("::")) return "targetSpecific";
  if (/^(load|store)$/i.test(opName)) return "memory";
  return "default";
}

/**
 * Mantine hue per category (`specs/selectiondag.md` §4), filled at shade 2
 * (`specs/graph-view.md` §7).
 */
export const NODE_CATEGORY_HUES: Record<SelectionDAGNodeCategory, string> = {
  entryToken: "green",
  targetSpecific: "orange",
  memory: "blue",
  register: "grape",
  tokenFactor: "yellow",
  default: "gray",
};

export function getSelectionDAGNodeColor(opName: string): string {
  return `var(--mantine-color-${NODE_CATEGORY_HUES[classifySelectionDAGNode(opName)]}-2)`;
}
