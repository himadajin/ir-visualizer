import type { Meta, StoryObj } from "@storybook/react-vite";
import LLVMFunctionHeaderNode from "./LLVMFunctionHeaderNode";
import { NodeStoryCanvas } from "../common/NodeStoryCanvas";
import type { LLVMFunctionHeaderData } from "../../../ast/llvmAST";

interface StoryArgs {
  astData: LLVMFunctionHeaderData;
}

const meta = {
  title: "Graph/LLVM/FunctionHeader",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="llvmFunctionHeader"
      component={LLVMFunctionHeaderNode}
      astData={args.astData}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    astData: {
      name: "@main",
      definition: "define i32 @main(i32 %0, i8** %1)",
    },
  },
};
