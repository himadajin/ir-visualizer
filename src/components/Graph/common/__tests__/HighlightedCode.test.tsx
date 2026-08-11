// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import HighlightedCode from "../HighlightedCode";

// Shiki's real codeToHtml output for a <pre> block always carries a `style`
// attribute (theme background/foreground colors), so a fixture without one
// wouldn't exercise the margin-reset regex the way production code does.
const SHIKI_PRE_HTML =
  '<pre class="shiki github-light" style="background-color:#fff;color:#24292e" tabindex="0"><code><span class="line">ret i32 0</span></code></pre>';

vi.mock("../../../../utils/highlighter", () => ({
  HIGHLIGHT_THEME: "github-light",
  getHighlighter: vi.fn().mockResolvedValue({
    codeToHtml: () => SHIKI_PRE_HTML,
  }),
}));

/**
 * Regression coverage for the drift fixed alongside live edge routing
 * (specs/graph-view.md §5): Shiki's <pre> carries the user-agent default
 * block margin, which converter.ts's node-size estimate (nodeTextStyle.ts,
 * specs/graph-view.md §5) does not account for. jsdom cannot run real
 * layout, so this only asserts the rendered frame declares no margin of its
 * own — not that text metrics match — which is what the estimator actually
 * assumes.
 */
describe("HighlightedCode", () => {
  it("resets the UA margin on the rendered <pre> (block mode)", async () => {
    const { container } = render(
      <HighlightedCode code="ret i32 0" language="llvm" />,
    );

    const pre = await waitFor(() => {
      const el = container.querySelector("pre");
      if (!el) throw new Error("pre not rendered yet");
      return el;
    });

    expect(pre.style.margin).toBe("0px");
  });

  it("still strips <pre>/<code> tags entirely in inline mode", async () => {
    const { container } = render(
      <HighlightedCode code="ret i32 0" language="llvm" inline />,
    );

    await waitFor(() => {
      expect(container.querySelector("pre")).toBeNull();
    });
  });
});
