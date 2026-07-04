import type { Meta, StoryObj } from "@storybook/react-vite";
import LLVMAttributeGroupNode from "./LLVMAttributeGroupNode";
import { NodeStoryCanvas } from "../common/NodeStoryCanvas";
import type { LLVMAttributeGroup } from "../../../ast/llvmAST";

interface StoryArgs {
  astData: LLVMAttributeGroup;
}

const meta = {
  title: "Graph/LLVM/AttributeGroup",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="llvmAttributeGroup"
      component={LLVMAttributeGroupNode}
      astData={args.astData}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    astData: {
      type: "AttributeGroup",
      id: "0",
      value:
        'attributes #0 = { noinline nounwind optnone uwtable "frame-pointer"="all" }',
      originalText:
        'attributes #0 = { noinline nounwind optnone uwtable "frame-pointer"="all" }',
    },
  },
};
