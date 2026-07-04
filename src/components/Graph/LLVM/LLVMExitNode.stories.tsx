import type { Meta, StoryObj } from "@storybook/react-vite";
import LLVMExitNode from "./LLVMExitNode";
import { NodeStoryCanvas } from "../common/NodeStoryCanvas";

const meta = {
  title: "Graph/LLVM/Exit",
  parameters: { layout: "centered" },
  render: () => (
    <NodeStoryCanvas
      nodeType="llvmExit"
      component={LLVMExitNode}
      astData={{}}
    />
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
