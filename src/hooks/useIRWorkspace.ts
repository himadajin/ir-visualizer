import { useCallback, useEffect, useState } from "react";
import { useGraphData } from "./useGraphData";
import { IR_MODES, DEFAULT_IR_MODE_KEY, type IRModeKey } from "../irModes";

const PARSE_DEBOUNCE_MS = 750;

/**
 * Owns the IR-mode/code/parse/error side of the app: which mode is active,
 * the editor's current text, the debounced parse-on-change effect, and the
 * resulting graph (via useGraphData). Mode switching and parsing are driven
 * entirely by the IR mode registry (src/irModes) — see
 * docs/internal/contracts/ir-mode-registry.md.
 */
export function useIRWorkspace() {
  const [modeKey, setModeKey] = useState<IRModeKey>(DEFAULT_IR_MODE_KEY);
  const mode = IR_MODES[modeKey];
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
        const graph = mode.parse(code);
        updateGraph(graph, mode);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }, PARSE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [code, mode, updateGraph]);

  const changeMode = useCallback((newModeKey: IRModeKey) => {
    setModeKey(newModeKey);
    setCode(IR_MODES[newModeKey].defaultCode);
  }, []);

  const clearCode = useCallback(() => setCode(""), []);

  return {
    mode,
    modeKey,
    code,
    setCode,
    error,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    resetLayout,
    changeMode,
    clearCode,
  };
}
