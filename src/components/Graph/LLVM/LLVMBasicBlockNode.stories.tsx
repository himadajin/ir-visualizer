import type { Meta, StoryObj } from "@storybook/react-vite";
import LLVMBasicBlockNode from "./LLVMBasicBlockNode";
import { NodeStoryCanvas } from "../common/NodeStoryCanvas";
import type { LLVMBasicBlock } from "../../../ast/llvmAST";

interface StoryArgs {
  astData: LLVMBasicBlock;
}

const meta = {
  title: "Graph/LLVM/BasicBlock",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="llvmBasicBlock"
      component={LLVMBasicBlockNode}
      astData={args.astData}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    astData: {
      type: "BasicBlock",
      id: "bb0",
      label: "entry",
      instructions: [
        {
          type: "Instruction",
          originalText: "%2 = add i32 %0, %1",
          opcode: "generic",
          operands: [],
        },
        {
          type: "Instruction",
          originalText: "%3 = mul i32 %2, 2",
          opcode: "generic",
          operands: [],
        },
      ],
      terminator: {
        type: "Instruction",
        originalText: "ret i32 %3",
        opcode: "ret",
      },
    },
  },
};
