import type { Meta, StoryObj } from "@storybook/react-vite";
import LLVMDeclarationNode from "./LLVMDeclarationNode";
import { NodeStoryCanvas } from "../common/NodeStoryCanvas";
import type { LLVMDeclaration } from "../../../ast/llvmAST";

interface StoryArgs {
  astData: LLVMDeclaration;
}

const meta = {
  title: "Graph/LLVM/Declaration",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="llvmDeclaration"
      component={LLVMDeclarationNode}
      astData={args.astData}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    astData: {
      type: "Declaration",
      name: "@printf",
      definition: "declare i32 @printf(i8*, ...)",
    },
  },
};
