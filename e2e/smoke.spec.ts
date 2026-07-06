import { test, expect, type Page } from "@playwright/test";

async function selectMode(
  page: Page,
  name: "LLVM-IR" | "SelectionDAG" | "Mermaid",
) {
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name }).click();
}

/**
 * Monaco renders its editable surface via the EditContext API: the focusable
 * element (`.native-edit-context`) has no visible size, so Playwright can't
 * click it directly. Clicking the visible code area (`.view-lines`) is what
 * a real user does, and it focuses the editor as a side effect.
 */
async function focusEditor(page: Page) {
  await page.locator(".view-lines").click();
}

/**
 * Type multi-line code into the focused Monaco editor.
 *
 * Monaco's word-based quick suggestions are active while typing, and a bare
 * Enter ACCEPTS the highlighted suggestion instead of inserting a newline
 * (mangling e.g. `%r` into `%ret`), so dismiss the widget with Escape before
 * every line break. The per-key delay keeps Monaco's EditContext-based input
 * from swallowing keystrokes sent back-to-back by CDP.
 */
async function typeCode(page: Page, text: string) {
  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    if (line) await page.keyboard.type(line, { delay: 30 });
    if (i < lines.length - 1) {
      await page.keyboard.press("Escape");
      await page.keyboard.press("Enter");
    }
  }
}

/**
 * src/parser/__tests__/llvm/corpus/era-2x-hello-invoke.ll, inlined.
 * LLVM 2.x flavor: typed pointers, a function-pointer call type on the
 * invoke, a one-line invoke, and the old `unwind` terminator.
 */
const ERA_2X_HELLO_INVOKE = `; LLVM 2.x flavor: typed pointers, function-pointer call type on the invoke,
; a one-line invoke, and the old \`unwind\` terminator.
@.str = internal constant [13 x i8] c"hello world\\0A\\00"

declare i32 @printf(i8*, ...)

define i32 @main() {
entry:
  %r = invoke i32 (i8*, ...)* @printf(i8* getelementptr ([13 x i8]* @.str, i32 0, i32 0)) to label %ok unwind label %err

ok:
  ret i32 %r

err:
  unwind
}`;

test.describe("IR Visualizer smoke tests", () => {
  test("renders a LLVM-IR graph from the default code on load", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await expect(page.locator(".react-flow")).toContainText("ret i32");
  });

  test("switching to Mermaid renders the Mermaid default graph", async ({
    page,
  }) => {
    await page.goto("/");
    await selectMode(page, "Mermaid");

    await expect(page.locator(".react-flow")).toContainText("Is this working?");
    await expect(page.locator(".react-flow")).toContainText("Debug it");
  });

  test("switching to SelectionDAG renders the SelectionDAG default graph", async ({
    page,
  }) => {
    await page.goto("/");
    await selectMode(page, "SelectionDAG");

    await expect(page.locator(".react-flow")).toContainText("EntryToken");
    await expect(page.locator(".react-flow")).toContainText("CopyFromReg");
  });

  test("editing the code updates the graph", async ({ page }) => {
    await page.goto("/");
    await selectMode(page, "Mermaid");
    await expect(page.locator(".react-flow")).toContainText("Is this working?");

    await focusEditor(page);
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    // Monaco's EditContext-based input can drop keystrokes sent back-to-back
    // by CDP; a small per-key delay keeps them from being swallowed.
    await page.keyboard.type("  A -->|Maybe| Z[Brand New Node]", {
      delay: 30,
    });

    await expect(page.locator(".react-flow")).toContainText("Brand New Node", {
      timeout: 10_000,
    });
  });

  test("invalid code shows a parse error", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    // Clear via the toolbar button, not select-all+type: under CPU load
    // Monaco's EditContext can swallow the Ctrl/Cmd+A, and garbage that is
    // merely INSERTED into the default code lands inside the function body,
    // where the parser's error recovery accepts it as an opaque instruction
    // (no error). Only a full replacement pins the error path.
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.locator(".view-lines")).not.toContainText("define");

    await focusEditor(page);
    await page.keyboard.type("this is not valid LLVM IR at all", {
      delay: 30,
    });
    await expect(page.locator(".view-lines")).toContainText("not valid");

    // Monaco itself renders unrelated `role="alert"` live regions for screen
    // readers, so scope to our own MUI Alert rather than getByRole("alert").
    await expect(page.locator(".MuiAlert-root")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("renders a graph from LLVM 2.x era IR with invoke/unwind", async ({
    page,
  }) => {
    // Typing the whole corpus file at 30ms/key alone takes ~15s.
    test.setTimeout(60_000);
    await page.goto("/");
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    // Clear via the toolbar button, not select-all+delete: under CPU load
    // Monaco's EditContext can swallow the Ctrl/Cmd+A, which would leave the
    // corpus text merely inserted into the middle of the default code.
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.locator(".view-lines")).not.toContainText("br i1");

    await focusEditor(page);
    await typeCode(page, ERA_2X_HELLO_INVOKE);
    await expect(page.locator(".view-lines")).toContainText("@main");

    // "unwind label" only exists in the pasted 2.x code, so this also proves
    // the graph re-rendered from the new input rather than the default code.
    await expect(page.locator(".react-flow")).toContainText("unwind label", {
      timeout: 10_000,
    });
    expect(await page.locator(".react-flow__node").count()).toBeGreaterThan(0);
    await expect(page.locator(".MuiAlert-root")).toHaveCount(0);
  });
});
