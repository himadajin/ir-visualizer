// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import LLVMBasicBlockNode from "../LLVMBasicBlockNode";
import type { LLVMBasicBlock } from "../../../../ast/llvmAST";
import { withNodePorts } from "../../common/withNodePorts";
import { prepareNodePorts, arrivalHandleId } from "../../../../utils/nodePorts";
import { llvmMode } from "../../../../irModes/llvmMode";
import { getCFGSuccessors } from "../../../../graphBuilder/llvmCFGSuccessors";

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
const PortNode = withNodePorts(LLVMBasicBlockNode);
const view = (astData = block) => {
  const prepared = prepareNodePorts(
    {
      nodes: [
        { id: "block", label: "entry", nodeType: "llvm-basicBlock", astData },
        { id: "header", label: "f" },
      ],
      edges: [
        { id: "entry", source: "header", target: "block" },
        ...getCFGSuccessors(astData.terminator).map(({ id }) => ({
          id,
          source: "block",
          target: "block",
          sourceHandle: id,
        })),
      ],
    },
    llvmMode.edgeBuilder,
    llvmMode.nodePorts,
  );
  return (
    <ReactFlowProvider>
      <PortNode
        {...props}
        data={{ astData, portLayout: prepared.layouts.get("block") }}
      />
    </ReactFlowProvider>
  );
};

beforeEach(() => updateNodeInternals.mockClear());

describe("CFG handles", () => {
  it("renders named departures in source order and distinct targets for each input", () => {
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
      "25%",
      "50%",
      "75%",
    ]);
    expect(handles.every((handle) => handle.style.opacity === "0")).toBe(true);
    const targets = container.querySelectorAll<HTMLElement>(
      ".react-flow__handle.target",
    );
    expect(targets).toHaveLength(4);
    expect([...targets].map((handle) => handle.dataset.handleid)).toEqual(
      ["cfg:case:1", "cfg:case:2", "cfg:default", "entry"].map(arrivalHandleId),
    );
    expect([...targets].map((handle) => handle.style.left)).toEqual([
      "20%",
      "40%",
      "60%",
      "80%",
    ]);
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
