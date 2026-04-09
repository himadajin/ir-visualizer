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

export const NODE_CATEGORY_COLORS: Record<SelectionDAGNodeCategory, string> = {
  entryToken: "#c8e6c9",
  targetSpecific: "#ffe0b2",
  memory: "#bbdefb",
  register: "#e1bee7",
  tokenFactor: "#fff9c4",
  default: "#f4f2ff",
};

export function getSelectionDAGNodeColor(opName: string): string {
  return NODE_CATEGORY_COLORS[classifySelectionDAGNode(opName)];
}
