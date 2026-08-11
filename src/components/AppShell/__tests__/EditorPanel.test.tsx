// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EditorPanel } from "../EditorPanel";
import { SHELL_COLORS } from "../shellTokens";
import type { IRParseDiagnostic } from "../../../irModes/types";

// Monaco needs a real editor host; the footer is what this file is about.
vi.mock("../../Editor/CodeEditor", () => ({
  CodeEditor: () => <div data-testid="code-editor" />,
}));

/**
 * The status footer's three states (`specs/graph-view.md` §6.3). It is the only
 * place parse status is reported, so "did this input parse?" has to stay
 * answerable from the words in this one element: `error:` for a failure,
 * `warning:` for a parse that succeeded with recoverable diagnostics.
 */
function renderPanel(
  overrides: Partial<Parameters<typeof EditorPanel>[0]> = {},
) {
  return render(
    <EditorPanel
      open
      onOpenChange={vi.fn()}
      narrow={false}
      width={420}
      sheetHeight={0}
      onResizeHandleMouseDown={vi.fn()}
      mode={"llvm-ir" as never}
      onModeChange={vi.fn()}
      code=""
      language="llvm"
      onCodeChange={vi.fn()}
      onClear={vi.fn()}
      error={null}
      diagnostics={[]}
      nodeCount={3}
      edgeCount={2}
      {...overrides}
    />,
  );
}

// Vitest runs without `globals`, so testing-library's auto-cleanup is off and
// each render would otherwise stack another panel in the document.
afterEach(cleanup);

const warning: IRParseDiagnostic = {
  line: 5,
  message: "terminator targets label '%missing', but no block has that id.",
};

describe("EditorPanel status footer", () => {
  it("reports a clean parse with the node and edge counts alone", () => {
    renderPanel();

    const status = screen.getByTestId("parse-status");
    expect(status).toHaveTextContent("✓ parsed · 3 nodes · 2 edges");
    expect(status).not.toHaveTextContent("warning:");
    expect(status).not.toHaveTextContent("error:");
    expect(status).toHaveStyle({ borderLeft: "" });
  });

  it("keeps the success line and adds one warning line per diagnostic", () => {
    renderPanel({ diagnostics: [warning, { line: 9, message: "second" }] });

    const status = screen.getByTestId("parse-status");
    expect(status).toHaveTextContent("✓ parsed · 3 nodes · 2 edges");
    expect(status).toHaveTextContent(`warning: line 5: ${warning.message}`);
    expect(status).toHaveTextContent("warning: line 9: second");
    // A diagnostic is not a failure: the word that answers "did it parse?"
    // must not appear (spec §6.3).
    expect(status).not.toHaveTextContent("error:");
    expect(status).toHaveStyle({
      borderLeft: `2px solid ${SHELL_COLORS.warn}`,
    });
  });

  it("shows a failure as an error and nothing else", () => {
    renderPanel({ error: "Line 4: block 'entry' has no terminator" });

    const status = screen.getByTestId("parse-status");
    expect(status).toHaveTextContent(
      "error: Line 4: block 'entry' has no terminator",
    );
    expect(status).not.toHaveTextContent("✓ parsed");
    expect(status).toHaveStyle({
      borderLeft: `2px solid ${SHELL_COLORS.error}`,
    });
  });

  it("lets an error outrank diagnostics that arrived with it", () => {
    // The workspace clears diagnostics on failure (spec §1), so this pins the
    // footer's own precedence rather than a state the app can produce.
    renderPanel({ error: "boom", diagnostics: [warning] });

    const status = screen.getByTestId("parse-status");
    expect(status).toHaveTextContent("error: boom");
    expect(status).not.toHaveTextContent("warning:");
    expect(status).toHaveStyle({
      borderLeft: `2px solid ${SHELL_COLORS.error}`,
    });
  });
});
