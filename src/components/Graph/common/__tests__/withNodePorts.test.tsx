// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NodeProps } from "@xyflow/react";
import type { NodePortLayout } from "../../../../types/nodePorts";
import { withNodePorts } from "../withNodePorts";

const update = vi.hoisted(() => vi.fn());
vi.mock("@xyflow/react", () => ({
  Position: { Top: "top", Bottom: "bottom" },
  useUpdateNodeInternals: () => update,
  Handle: ({ id, style }: { id: string; style: React.CSSProperties }) => (
    <div data-testid={id} style={style} />
  ),
}));

const Wrapped = withNodePorts(() => <div>card</div>);
const props: NodeProps = {
  id: "N",
  data: {},
  type: "test",
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

describe("rendered port updates", () => {
  it("replaces handles and requests measurement when only the arrival assignment changes", () => {
    const plan: NodePortLayout = {
      minWidth: 72,
      ports: [
        { id: "a", side: "top", x: 1 / 3, relative: true },
        { id: "b", side: "top", x: 2 / 3, relative: true },
      ],
    };
    const view = render(<Wrapped {...props} data={{ portLayout: plan }} />);
    expect(view.getByTestId("a").parentElement!.style.minWidth).toBe("72px");
    expect(view.getByTestId("a").style.left).toContain("33.333");
    update.mockClear();
    act(() =>
      view.rerender(
        <Wrapped
          {...props}
          data={{
            portLayout: {
              ...plan,
              ports: [{ id: "c", side: "top", x: 40, relative: false }],
            },
          }}
        />,
      ),
    );
    expect(view.queryByTestId("a")).toBeNull();
    expect(view.queryByTestId("b")).toBeNull();
    expect(view.getByTestId("c").style.left).toBe("40px");
    expect(update).toHaveBeenCalledWith("N");
    view.unmount();
  });
});
