import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";
import type dagre from "dagre";
import type { GraphData } from "../types/graph";
import type { IREdgeBuilder } from "../utils/layout";

/**
 * Everything a graph view needs to support one IR (LLVM-IR, Mermaid,
 * SelectionDAG, ...). See docs/internal/contracts/ir-mode-registry.md.
 * Adding a new IR should mean adding one of these plus the IR's own
 * parser/AST/graphBuilder/node-component files — nothing else.
 */
export interface IRModeDefinition {
  /** Stable identifier, also the toolbar <Select> value. */
  key: string;
  /** Toolbar display label, e.g. "LLVM-IR". */
  label: string;
  /** Monaco language id (registered in CodeEditor's beforeMount). */
  editorLanguage: string;
  /** Code shown in the editor when this mode is selected. */
  defaultCode: string;
  /** Text -> graph. Throws Error on invalid input (see the registry contract
   * for SelectionDAG's per-line tolerance, which is not an exception to this). */
  parse: (code: string) => GraphData;
  /** This mode's React Flow node renderers, keyed by the camelCase nodeType. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeTypes: Record<string, ComponentType<NodeProps<any>>>;
  /** How to classify and build this mode's edges (see IREdgeBuilder). */
  edgeBuilder: IREdgeBuilder;
  /** Dagre layout overrides, e.g. SelectionDAG's wider row spacing. */
  dagreOptions?: Partial<dagre.GraphLabel>;
}
