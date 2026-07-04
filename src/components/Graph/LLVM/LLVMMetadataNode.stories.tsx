import type { Meta, StoryObj } from "@storybook/react-vite";
import LLVMMetadataNode from "./LLVMMetadataNode";
import { NodeStoryCanvas } from "../common/NodeStoryCanvas";
import type { LLVMMetadata } from "../../../ast/llvmAST";

interface StoryArgs {
  astData: LLVMMetadata;
}

const meta = {
  title: "Graph/LLVM/Metadata",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="llvmMetadata"
      component={LLVMMetadataNode}
      astData={args.astData}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    astData: {
      type: "Metadata",
      id: "!0",
      value: '!0 = !{i32 1, !"wchar_size", i32 4}',
      originalText: '!0 = !{i32 1, !"wchar_size", i32 4}',
    },
  },
};
