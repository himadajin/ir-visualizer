import type { Meta, StoryObj } from "@storybook/react-vite";
import LLVMGlobalVariableNode from "./LLVMGlobalVariableNode";
import { NodeStoryCanvas } from "../common/NodeStoryCanvas";
import type { LLVMGlobalVariable } from "../../../ast/llvmAST";

interface StoryArgs {
  astData: LLVMGlobalVariable;
}

const meta = {
  title: "Graph/LLVM/GlobalVariable",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="llvmGlobalVariable"
      component={LLVMGlobalVariableNode}
      astData={args.astData}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    astData: {
      type: "GlobalVariable",
      name: "@global_str",
      value: '@global_str = private constant [14 x i8] c"Hello, World!\\00"',
      originalText:
        '@global_str = private constant [14 x i8] c"Hello, World!\\00"',
    },
  },
};
