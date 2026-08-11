import { useCallback, useEffect, useState } from "react";
import { useGraphData } from "./useGraphData";
import { IR_MODES, DEFAULT_IR_MODE_KEY, type IRModeKey } from "../irModes";
import type { IRModeDefinition, IRParseDiagnostic } from "../irModes/types";

/** Shared empty list, so a clean parse does not re-render on identity alone. */
const NO_DIAGNOSTICS: IRParseDiagnostic[] = [];

const PARSE_DEBOUNCE_MS = 750;

/**
 * Owns the IR-mode/code/parse/error side of the app: which mode is active,
 * which of the mode's views is active (contracts/ir-mode-registry.md
 * "Views"), the editor's current text, the debounced parse-on-change
 * effect, the resulting graph (via useGraphData), and the parse's recoverable
 * diagnostics. Mode switching and parsing are driven entirely by the IR mode
 * registry (src/irModes).
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
  const [diagnostics, setDiagnostics] =
    useState<IRParseDiagnostic[]>(NO_DIAGNOSTICS);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    updateGraph,
    resetLayout,
  } = useGraphData();

  // Parsing is async (contracts/ir-mode-registry.md, "Parsing is
  // asynchronous"). The effect's deps cover every input a parse depends on, so
  // a `cancelled` flag set by the cleanup is enough to keep a parse that is
  // still in flight when the code/mode/view changes from landing: neither its
  // graph nor its error reaches state. Layout staleness is guarded separately,
  // by useGraphData's generation counter.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const parse = activeView?.parse ?? mode.parse;
          const result = await parse(code);
          if (cancelled) return;
          updateGraph(result.graph, {
            edgeBuilder: activeView?.edgeBuilder ?? mode.edgeBuilder,
            layoutOptions: activeView?.layoutOptions ?? mode.layoutOptions,
          });
          setError(null);
          setDiagnostics(result.diagnostics ?? NO_DIAGNOSTICS);
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Unknown error");
          // The diagnostics described the text of the last parse that produced
          // a graph; the editor now holds text that failed, so their line
          // numbers no longer point at what they describe (specs/graph-view.md
          // §1).
          setDiagnostics(NO_DIAGNOSTICS);
        }
      })();
    }, PARSE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
    diagnostics,
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
