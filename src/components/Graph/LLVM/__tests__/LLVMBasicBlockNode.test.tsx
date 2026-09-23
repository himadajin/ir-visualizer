// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import LLVMBasicBlockNode from "../LLVMBasicBlockNode";
import type { LLVMBasicBlock } from "../../../../ast/llvmAST";

const { updateNodeInternals } = vi.hoisted(() => ({
  updateNodeInternals: vi.fn(),
}));
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  useUpdateNodeInternals: () => updateNodeInternals,
}));
vi.mock("../../common/HighlightedCode", () => ({
  default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

const props: NodeProps = {
  id: "block",
  type: "llvmBasicBlock",
  data: {},
  selected: false,
  dragging: false,
  draggable: true,
  selectable: true,
  deletable: true,
  isConnectable: false,
  zIndex: 0,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
};
const block: LLVMBasicBlock = {
  type: "BasicBlock",
  id: "entry",
  label: "entry",
  instructions: [],
  terminator: {
    type: "Instruction",
    opcode: "switch",
    originalText: "switch",
    conditionType: "i32",
    conditionValue: "%v",
    defaultTarget: "entry",
    cases: [
      { type: "i32", value: "1", target: "entry" },
      { type: "i32", value: "2", target: "entry" },
    ],
  },
};
const view = (astData = block) => (
  <ReactFlowProvider>
    <LLVMBasicBlockNode {...props} data={{ astData }} />
  </ReactFlowProvider>
);

beforeEach(() => updateNodeInternals.mockClear());

describe("CFG handles", () => {
  it("renders only the named departures in source order and one centered target", () => {
    const { container } = render(view());
    const handles = [
      ...container.querySelectorAll<HTMLElement>(".react-flow__handle.source"),
    ];
    expect(handles.map((handle) => handle.dataset.handleid)).toEqual([
      "cfg:default",
      "cfg:case:1",
      "cfg:case:2",
    ]);
    expect(handles.map((handle) => handle.style.left)).toEqual([
      "calc(25% - 0.5px)",
      "calc(50% + 0px)",
      "calc(75% + 0.5px)",
    ]);
    expect(handles.every((handle) => handle.style.opacity === "0")).toBe(true);
    const targets = container.querySelectorAll<HTMLElement>(
      ".react-flow__handle.target",
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].dataset.handleid).toBe("cfg:in");
    expect(targets[0].style.left).toBe("50%");
  });

  it("remeasures a same-size reorder or renamed port without moving the node", () => {
    const { container, rerender } = render(view());
    updateNodeInternals.mockClear();
    if (!("cases" in block.terminator))
      throw new Error("fixture must be a switch");
    rerender(
      view({
        ...block,
        terminator: {
          ...block.terminator,
          cases: [...block.terminator.cases].reverse(),
        },
      }),
    );
    expect(updateNodeInternals).toHaveBeenCalledWith("block");
    expect(
      [...container.querySelectorAll<HTMLElement>(".source")].map(
        (handle) => handle.dataset.handleid,
      ),
    ).toEqual(["cfg:default", "cfg:case:2", "cfg:case:1"]);
    updateNodeInternals.mockClear();
    rerender(
      view({
        ...block,
        terminator: {
          ...block.terminator,
          cases: [
            { type: "i32", value: "3", target: "entry" },
            block.terminator.cases[1],
          ],
        },
      }),
    );
    expect(updateNodeInternals).toHaveBeenCalledWith("block");
    expect(
      container.querySelector('[data-handleid="cfg:case:3"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-handleid="cfg:case:1"]')).toBeNull();
  });

  it("removes every departure when a terminator has no successors", () => {
    const { container, rerender } = render(view());
    rerender(
      view({
        ...block,
        terminator: {
          type: "Instruction",
          opcode: "unreachable",
          originalText: "unreachable",
          successors: [],
        },
      }),
    );
    expect(
      container.querySelectorAll(".react-flow__handle.source"),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll(".react-flow__handle.target"),
    ).toHaveLength(1);
  });
});
