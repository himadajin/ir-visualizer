import { llvmMode } from "./llvmMode";
import { mermaidMode } from "./mermaidMode";
import { selectionDAGMode } from "./selectionDAGMode";
import type { IRModeDefinition } from "./types";

export type { IRModeDefinition } from "./types";
export { llvmMode } from "./llvmMode";
export { mermaidMode } from "./mermaidMode";
export { selectionDAGMode } from "./selectionDAGMode";

// Object keys (not computed from each mode's `.key` field, so the literal
// union below is reliable) — insertion order drives the toolbar dropdown order.
export const IR_MODES = {
  "llvm-ir": llvmMode,
  selectionDAG: selectionDAGMode,
  mermaid: mermaidMode,
} satisfies Record<string, IRModeDefinition>;

export type IRModeKey = keyof typeof IR_MODES;

export const IR_MODE_LIST: IRModeDefinition[] = Object.values(IR_MODES);

export const DEFAULT_IR_MODE_KEY: IRModeKey = llvmMode.key;
