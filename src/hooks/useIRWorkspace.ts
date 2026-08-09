import { useCallback, useEffect, useState } from "react";
import { useGraphData } from "./useGraphData";
import { IR_MODES, DEFAULT_IR_MODE_KEY, type IRModeKey } from "../irModes";
import type { IRModeDefinition } from "../irModes/types";

const PARSE_DEBOUNCE_MS = 750;

/**
 * Owns the IR-mode/code/parse/error side of the app: which mode is active,
 * which of the mode's views is active (contracts/ir-mode-registry.md
 * "Views"), the editor's current text, the debounced parse-on-change
 * effect, and the resulting graph (via useGraphData). Mode switching and
 * parsing are driven entirely by the IR mode registry (src/irModes).
 */
export function useIRWorkspace() {
  const [modeKey, setModeKey] = useState<IRModeKey>(DEFAULT_IR_MODE_KEY);
  // Widen to the contract type: per-mode inferred literals differ in which
  // optional fields (views, layoutOptions) they carry.
  const mode: IRModeDefinition = IR_MODES[modeKey];
  // null = the mode's default view (views[0], or the implicit single view).
  const [viewKey, setViewKey] = useState<string | null>(null);
  const activeView =
    mode.views?.find((view) => view.key === viewKey) ?? mode.views?.[0];
  const [code, setCode] = useState(mode.defaultCode);
  const [error, setError] = useState<string | null>(null);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    updateGraph,
    resetLayout,
  } = useGraphData();

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const parse = activeView?.parse ?? mode.parse;
        const graph = parse(code);
        updateGraph(graph, {
          edgeBuilder: activeView?.edgeBuilder ?? mode.edgeBuilder,
          layoutOptions: activeView?.layoutOptions ?? mode.layoutOptions,
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }, PARSE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [code, mode, activeView, updateGraph]);

  const changeMode = useCallback((newModeKey: IRModeKey) => {
    setModeKey(newModeKey);
    setViewKey(null); // back to the new mode's default view
    setCode(IR_MODES[newModeKey].defaultCode);
  }, []);

  // Switching views keeps the editor code — that is the point of views.
  const changeView = useCallback((newViewKey: string) => {
    setViewKey(newViewKey);
  }, []);

  const clearCode = useCallback(() => setCode(""), []);

  return {
    mode,
    modeKey,
    views: mode.views,
    activeViewKey: activeView?.key ?? null,
    code,
    setCode,
    error,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    resetLayout,
    changeMode,
    changeView,
    clearCode,
  };
}
