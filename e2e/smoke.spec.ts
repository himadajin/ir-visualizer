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

    await focusEditor(page);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("this is not valid LLVM IR at all", {
      delay: 30,
    });

    // Monaco itself renders unrelated `role="alert"` live regions for screen
    // readers, so scope to our own MUI Alert rather than getByRole("alert").
    await expect(page.locator(".MuiAlert-root")).toBeVisible({
      timeout: 10_000,
    });
  });
});
