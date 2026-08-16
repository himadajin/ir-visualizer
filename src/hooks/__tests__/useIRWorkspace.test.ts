// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { GraphData } from "../../types/graph";
import type { IRParseDiagnostic, IRParseResult } from "../../irModes/types";

// The registry contract makes `parse` async and leaves discarding stale results
// to the caller (contracts/ir-mode-registry.md, "Parsing is asynchronous").
// These tests stand in a registry whose parses never settle on their own, so a
// slow parse can be made to land *after* a newer one — the case a real parser
// only hits under a race.
const { modeA, modeB, updateGraph, graphState } = vi.hoisted(() => {
  interface Pending {
    code: string;
    resolve: (graph: unknown) => void;
    reject: (error: unknown) => void;
  }

  const makeMode = (key: string, defaultCode: string) => {
    const pending: Pending[] = [];
    const parse = vi.fn(
      (code: string) =>
        new Promise((resolve, reject) => {
          pending.push({ code, resolve, reject });
        }),
    );
    return {
      pending,
      parse,
      definition: {
        key,
        label: key,
        editorLanguage: "plaintext",
        defaultCode,
        parse,
        nodeTypes: {},
        edgeBuilder: { buildReactFlowEdge: (edge: unknown) => edge },
      },
    };
  };

  const modeA = makeMode("a", "code-a");
  const modeB = makeMode("b", "code-b");
  const updateGraph = vi.fn();

  return {
    modeA,
    modeB,
    updateGraph,
    graphState: {
      nodes: [],
      edges: [],
      onNodesChange: vi.fn(),
      onEdgesChange: vi.fn(),
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      updateGraph,
      applyLayout: vi.fn(),
      layoutPending: false,
    },
  };
});

vi.mock("../../irModes", () => ({
  IR_MODES: { a: modeA.definition, b: modeB.definition },
  IR_MODE_LIST: [modeA.definition, modeB.definition],
  DEFAULT_IR_MODE_KEY: "a",
}));

vi.mock("../useGraphData", () => ({ useGraphData: () => graphState }));

const { useIRWorkspace } = await import("../useIRWorkspace");

const PARSE_DEBOUNCE_MS = 750;

function graph(id: string): GraphData {
  return { direction: "TD", nodes: [{ id, label: id }], edges: [] };
}

/** What a mode's `parse` resolves to (contracts/ir-mode-registry.md). */
function parsed(id: string, diagnostics?: IRParseDiagnostic[]): IRParseResult {
  return { graph: graph(id), diagnostics };
}

/** Run the debounce timer out, so the pending parse for the current code starts. */
async function runDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(PARSE_DEBOUNCE_MS);
  });
}

/** Settle hand-held parse promises and let their continuations run. */
async function settle(fn: () => void) {
  await act(async () => {
    fn();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  modeA.pending.length = 0;
  modeB.pending.length = 0;
  modeA.parse.mockClear();
  modeB.parse.mockClear();
  updateGraph.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useIRWorkspace parse effect", () => {
  it("applies a parse that resolves while it is still current", async () => {
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();

    expect(modeA.parse).toHaveBeenCalledWith("code-a");
    await settle(() => modeA.pending[0].resolve(parsed("n1")));

    expect(updateGraph).toHaveBeenCalledTimes(1);
    expect(updateGraph.mock.calls[0][0]).toEqual(graph("n1"));
    expect(result.current.error).toBeNull();
  });

  it("reports a rejected parse as the error message", async () => {
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();

    await settle(() => modeA.pending[0].reject(new Error("bad syntax")));

    expect(result.current.error).toBe("bad syntax");
    expect(updateGraph).not.toHaveBeenCalled();
  });

  it("discards a parse whose code changed while it was in flight", async () => {
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();

    act(() => result.current.setCode("code-a2"));
    await runDebounce();

    expect(modeA.pending).toHaveLength(2);
    // The newer parse lands first, then the stale one — the order a slow
    // parser produces and the reason a plain "last write wins" is not enough.
    await settle(() => modeA.pending[1].resolve(parsed("new")));
    await settle(() => modeA.pending[0].resolve(parsed("stale")));

    expect(updateGraph).toHaveBeenCalledTimes(1);
    expect(updateGraph.mock.calls[0][0]).toEqual(graph("new"));
  });

  it("discards a parse whose mode changed while it was in flight", async () => {
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();

    act(() => result.current.changeMode("b" as never));
    await runDebounce();

    expect(modeB.parse).toHaveBeenCalledWith("code-b");
    await settle(() => modeB.pending[0].resolve(parsed("from-b")));
    await settle(() => modeA.pending[0].resolve(parsed("from-a")));

    expect(updateGraph).toHaveBeenCalledTimes(1);
    expect(updateGraph.mock.calls[0][0]).toEqual(graph("from-b"));
  });

  it("does not let a stale rejection overwrite a newer success", async () => {
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();

    act(() => result.current.setCode("code-a2"));
    await runDebounce();

    await settle(() => modeA.pending[1].resolve(parsed("new")));
    await settle(() => modeA.pending[0].reject(new Error("stale failure")));

    expect(result.current.error).toBeNull();
  });
});

// contracts/ir-mode-registry.md, "Recoverable diagnostics" + specs/graph-view.md §1.
describe("useIRWorkspace diagnostics", () => {
  const warning: IRParseDiagnostic = { line: 4, message: "recovered" };

  it("publishes the diagnostics of a successful parse, which stays a success", async () => {
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();

    await settle(() => modeA.pending[0].resolve(parsed("n1", [warning])));

    expect(result.current.diagnostics).toEqual([warning]);
    expect(result.current.error).toBeNull();
    expect(updateGraph).toHaveBeenCalledTimes(1);
  });

  it("reports no diagnostics for a clean parse", async () => {
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();

    await settle(() => modeA.pending[0].resolve(parsed("n1")));

    expect(result.current.diagnostics).toEqual([]);
  });

  it("clears the previous diagnostics when the next parse is clean", async () => {
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();
    await settle(() => modeA.pending[0].resolve(parsed("n1", [warning])));

    act(() => result.current.setCode("code-a2"));
    await runDebounce();
    await settle(() => modeA.pending[1].resolve(parsed("n2")));

    expect(result.current.diagnostics).toEqual([]);
  });

  it("clears the previous diagnostics when the next parse fails", async () => {
    // The graph on screen survives a failure, but the diagnostics do not: their
    // line numbers describe text the editor no longer holds (spec §1).
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();
    await settle(() => modeA.pending[0].resolve(parsed("n1", [warning])));

    act(() => result.current.setCode("code-a2"));
    await runDebounce();
    await settle(() => modeA.pending[1].reject(new Error("bad syntax")));

    expect(result.current.error).toBe("bad syntax");
    expect(result.current.diagnostics).toEqual([]);
  });

  it("does not let a stale parse's diagnostics reach state", async () => {
    const { result } = renderHook(() => useIRWorkspace());
    await runDebounce();

    act(() => result.current.setCode("code-a2"));
    await runDebounce();

    await settle(() => modeA.pending[1].resolve(parsed("new")));
    await settle(() => modeA.pending[0].resolve(parsed("stale", [warning])));

    expect(result.current.diagnostics).toEqual([]);
  });
});
