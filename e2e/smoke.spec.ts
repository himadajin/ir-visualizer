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

    // Clear via the panel header button, not select-all+type: under CPU load
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

    // The panel's status footer is the only place parse status is reported
    // (spec: specs/graph-view.md §6.3). Monaco renders its own unrelated live
    // regions for screen readers, so scope by test id rather than by role.
    await expect(page.getByTestId("parse-status")).toContainText("error:", {
      timeout: 10_000,
    });
  });

  test("LLVM-IR use-def view", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    await page.getByRole("button", { name: "Use-Def" }).click();

    // Instruction nodes render individually; "%5 = add i32 %0, 45" only
    // exists as its own node in the use-def projection, never in the CFG
    // view's basic-block cards.
    await expect(
      page.locator(".react-flow__node", { hasText: "%5 = add i32 %0, 45" }),
    ).toBeVisible({ timeout: 10_000 });

    // Switching views keeps the editor content (spec: views/graph-view.md §1).
    await expect(page.locator(".view-lines")).toContainText("define");

    // Toggling back restores the CFG (exit node is CFG-only).
    await page.getByRole("button", { name: "CFG" }).click();
    await expect(page.locator(".react-flow")).toContainText("exit", {
      timeout: 10_000,
    });
  });

  test("edge paths are orthogonal polylines from the live router, not React Flow's default bezier", async ({
    page,
  }) => {
    // specs/graph-view.md §4: every LLVM/Mermaid edge is drawn by RoutedEdge
    // from src/utils/edgeRouter.ts's output — an orthogonal, rounded-corner
    // polyline (`M x y (L x y (Q ...)?)+`) — never React Flow's built-in
    // smooth/bezier path grammar (which never emits `L`/`Q` segments at all
    // for a bezier `path.d`, only `C` curve commands). This is the one thing
    // no unit test can see: edgeRouter.test.ts asserts the *point list*
    // routeEdges returns, not that RoutedEdge actually renders it.
    await page.goto("/");
    const edgePaths = page.locator(".react-flow__edge-path");
    await expect(edgePaths.first()).toBeVisible();

    const dValues = await edgePaths.evaluateAll((paths) =>
      paths.map((p) => p.getAttribute("d")),
    );
    expect(dValues.length).toBeGreaterThan(0);
    for (const d of dValues) {
      expect(d).toBeTruthy();
      // Orthogonal polyline with rounded corners: starts with an absolute
      // moveto, then a run of line/quadratic-curve segments. No cubic
      // bezier ("C") or smooth-curve ("S") commands, which is what a
      // handle-anchored default/smoothstep edge would draw instead.
      expect(d).toMatch(/^M[\d.\s-]+(?:L[\d.\s-]+|Q[\d.\s,-]+)+$/);
      expect(d).not.toMatch(/[CS]/);
    }
  });

  test("dragging a node changes its edges' paths, not their shape grammar", async ({
    page,
  }) => {
    // The whole point of live edge routing (specs/graph-view.md §4):
    // one geometry generator, always, including mid-drag. Before this change,
    // a drag flipped edges to a visibly different shape (React Flow's
    // smoothstep fallback) once the node moved far enough from its layout
    // position. Pin that this no longer happens: the path *coordinates*
    // change, but every path is still the same orthogonal/rounded grammar
    // the previous test pins, both before and after.
    await page.goto("/");
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    // Block "7" (`%8 = icmp sgt i32 %1, 0`) has both an incoming edge (from
    // `entry`) and outgoing edges (to `12` and `9`), so it exercises source
    // and target geometry together.
    const node = page.locator(".react-flow__node", {
      hasText: "icmp sgt i32 %1, 0",
    });
    await expect(node).toBeVisible();

    const ORTHOGONAL_RE = /^M[\d.\s-]+(?:L[\d.\s-]+|Q[\d.\s,-]+)+$/;
    const edgePaths = page.locator(".react-flow__edge-path");
    const before = await edgePaths.evaluateAll((paths) =>
      paths.map((p) => p.getAttribute("d")),
    );

    const box = await node.boundingBox();
    if (!box) throw new Error("node has no bounding box");
    // A real, slow, multi-step drag: React Flow's drag handling (d3-drag)
    // needs a mousedown, movement past its drag threshold, then mouseup —
    // a single jump can be missed entirely.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 180,
      box.y + box.height / 2 + 160,
      {
        steps: 20,
      },
    );
    await page.mouse.up();

    // The dragged node actually moved: confirms the drag was received at
    // all, so a "nothing changed" result below can't be a no-op drag.
    const movedBox = await node.boundingBox();
    if (!movedBox) throw new Error("node has no bounding box after drag");
    expect(Math.hypot(movedBox.x - box.x, movedBox.y - box.y)).toBeGreaterThan(
      50,
    );

    const after = await edgePaths.evaluateAll((paths) =>
      paths.map((p) => p.getAttribute("d")),
    );
    expect(after.length).toBe(before.length);

    let changed = 0;
    for (const d of after) {
      expect(d).toBeTruthy();
      expect(d).toMatch(ORTHOGONAL_RE);
      expect(d).not.toMatch(/[CS]/);
    }
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) changed++;
    }
    // At least the edges incident to the dragged node must have moved.
    expect(changed).toBeGreaterThan(0);
  });

  test("renders a graph from LLVM 2.x era IR with invoke/unwind", async ({
    page,
  }) => {
    // Typing the whole corpus file at 30ms/key alone takes ~15s.
    test.setTimeout(60_000);
    await page.goto("/");
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    // Clear via the panel header button, not select-all+delete: under CPU load
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

    // The status footer reports success, not an error (spec: §6.3): the 2.x
    // constructs above parsed rather than merely leaving the old graph up.
    const status = page.getByTestId("parse-status");
    await expect(status).toContainText("✓ parsed", { timeout: 10_000 });
    await expect(status).not.toContainText("error:");
  });
});
