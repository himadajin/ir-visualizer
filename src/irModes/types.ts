import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";
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
  /** This mode's React Flow node renderers, keyed by the camelCase nodeType.
   * Covers every view's renderers (GraphViewer merges per mode, not per view). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeTypes: Record<string, ComponentType<NodeProps<any>>>;
  /** How to build this mode's edges (see IREdgeBuilder). */
  edgeBuilder: IREdgeBuilder;
  /** ELK layout option overrides, e.g. SelectionDAG's wider layer spacing. */
  layoutOptions?: Record<string, string>;
  /**
   * Optional alternative projections of the same text (e.g. LLVM's CFG vs
   * Use-Def). When present: >= 2 entries, views[0] is the default and must
   * behave identically to the top-level parse/edgeBuilder/dagreOptions
   * (share the function references). See the registry contract, "Views".
   */
  views?: IRViewDefinition[];
}

/** One selectable projection of a mode's text (registry contract, "Views"). */
export interface IRViewDefinition {
  /** Stable identifier, e.g. "cfg", "use-def". */
  key: string;
  /** Toggle label, e.g. "CFG". */
  label: string;
  /** Text -> graph; same throw-on-invalid rule as the mode's parse. */
  parse: (code: string) => GraphData;
  /** Defaults to the mode's edgeBuilder. */
  edgeBuilder?: IREdgeBuilder;
  /** Defaults to the mode's layoutOptions. */
  layoutOptions?: Record<string, string>;
}

/**
 * The layout-relevant behavior of the active view: what useGraphData needs
 * to lay a graph out. A bare IRModeDefinition satisfies it structurally
 * (single-view modes), and useIRWorkspace builds one from the active view.
 */
export type IRLayoutBehavior = Pick<
  IRModeDefinition,
  "edgeBuilder" | "layoutOptions"
>;
