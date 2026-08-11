import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";
import type { GraphData } from "../types/graph";
import type { IREdgeBuilder } from "../utils/layout";
import type { EditorLanguageId } from "./editorLanguages";

/**
 * One recoverable problem found while parsing: the parser produced a graph but
 * had to recover from a line rather than understand it. See the registry
 * contract, "Recoverable diagnostics". `line` is 1-based in the editor text and
 * `message` carries no severity word — the status footer writes `warning:`.
 */
export interface IRParseDiagnostic {
  line: number;
  message: string;
}

/**
 * What a mode's `parse` resolves to. The graph is what the layout stage
 * consumes; diagnostics travel beside it, never inside `GraphData`, because
 * they describe the parse rather than the graph (registry contract).
 */
export interface IRParseResult {
  graph: GraphData;
  /** Omitted when the parse was clean. */
  diagnostics?: IRParseDiagnostic[];
}

/**
 * Everything a graph view needs to support one IR (LLVM-IR, Mermaid,
 * SelectionDAG, ...). See docs/internal/contracts/ir-mode-registry.md.
 * Adding a new IR should mean adding one of these plus the IR's own
 * parser/AST/graphBuilder/node-component files — nothing else.
 */
export interface IRModeDefinition {
  /** Stable identifier, also the editor-panel <Select> value. */
  key: string;
  /** Toolbar display label, e.g. "LLVM-IR". */
  label: string;
  /** Which shipped grammar highlights this mode's code — see editorLanguages.ts. */
  editorLanguage: EditorLanguageId;
  /** Code shown in the editor when this mode is selected. */
  defaultCode: string;
  /** Text -> graph + diagnostics. Rejects with an Error on invalid input (see
   * the registry contract for SelectionDAG's per-line tolerance, which is not
   * an exception to this). Async because a parser may need to load before it
   * can parse; a synchronous parser is adapted here, not rewritten. Stale
   * results are discarded by the caller — see the contract, "Parsing is
   * asynchronous". */
  parse: (code: string) => Promise<IRParseResult>;
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
   * behave identically to the top-level parse/edgeBuilder/layoutOptions
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
  /** Text -> graph + diagnostics; same reject-on-invalid rule as the mode's parse. */
  parse: (code: string) => Promise<IRParseResult>;
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
