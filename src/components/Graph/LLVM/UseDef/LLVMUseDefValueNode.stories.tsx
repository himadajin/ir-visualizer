import type { Meta, StoryObj } from "@storybook/react-vite";
import LLVMUseDefValueNode from "./LLVMUseDefValueNode";
import { NodeStoryCanvas } from "../../common/NodeStoryCanvas";
import type { LLVMUseDefValueData } from "../../../../ast/llvmAST";

interface StoryArgs {
  astData: LLVMUseDefValueData;
}

const meta = {
  title: "Graph/LLVM/UseDef/Value",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="llvmUseDefValue"
      component={LLVMUseDefValueNode}
      astData={args.astData}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Argument: Story = {
  args: {
    astData: { name: "a", kind: "argument", paramType: "i32" },
  },
};

/** A parameter whose type the parser did not capture renders as `%name`. */
export const ArgumentWithoutType: Story = {
  args: {
    astData: { name: "cond", kind: "argument" },
  },
};

export const External: Story = {
  args: {
    astData: { name: "undefined.value", kind: "external" },
  },
};
