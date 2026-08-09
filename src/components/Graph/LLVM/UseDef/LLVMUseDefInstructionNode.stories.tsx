import type { Meta, StoryObj } from "@storybook/react-vite";
import LLVMUseDefInstructionNode from "./LLVMUseDefInstructionNode";
import { NodeStoryCanvas } from "../../common/NodeStoryCanvas";
import type { LLVMUseDefInstructionData } from "../../../../ast/llvmAST";
import { USE_DEF_BADGE_PALETTE } from "./useDefStyleConstants";

interface StoryArgs {
  astData: LLVMUseDefInstructionData;
}

const meta = {
  title: "Graph/LLVM/UseDef/Instruction",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="llvmUseDefInstruction"
      component={LLVMUseDefInstructionNode}
      astData={args.astData}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    astData: {
      text: "%5 = add i32 %0, 45",
      def: "5",
      uses: ["0"],
      isTerminator: false,
      blockLabel: "entry",
      blockIndex: 0,
    },
  },
};

export const Terminator: Story = {
  args: {
    astData: {
      text: "br i1 %2, label %4, label %7",
      def: null,
      uses: ["2"],
      isTerminator: true,
      blockLabel: "4",
      blockIndex: 1,
    },
  },
};

export const Phi: Story = {
  args: {
    astData: {
      text: "%10 = phi i32 [ %1, %7 ], [ %15, %12 ]",
      def: "10",
      uses: ["1", "15"],
      isTerminator: false,
      blockLabel: "loop.header",
      blockIndex: 2,
    },
  },
};

export const LongLine: Story = {
  args: {
    astData: {
      text: "%42 = call noundef i32 @very_long_function_name(ptr noundef %ptr, i64 noundef %len, i32 noundef %flags)",
      def: "42",
      uses: ["ptr", "len", "flags"],
      isTerminator: false,
      blockLabel: "cleanup.cont.unwind",
      blockIndex: 3,
    },
  },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="llvmUseDefInstruction"
      component={LLVMUseDefInstructionNode}
      astData={args.astData}
      width={900}
    />
  ),
};

/**
 * The badge tint is `blockIndex % 8`, so the palette repeats once a function
 * has more than eight blocks. This story shows all eight tints at once.
 */
export const BadgePalette: Story = {
  args: {
    astData: {
      text: "%1 = load i32, ptr %p",
      def: "1",
      uses: ["p"],
      isTerminator: false,
      blockLabel: "bb0",
      blockIndex: 0,
    },
  },
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap" }}>
      {USE_DEF_BADGE_PALETTE.map((_, blockIndex) => (
        <NodeStoryCanvas
          key={blockIndex}
          nodeType="llvmUseDefInstruction"
          component={LLVMUseDefInstructionNode}
          astData={{
            text: `%${blockIndex} = load i32, ptr %p`,
            def: String(blockIndex),
            uses: ["p"],
            isTerminator: false,
            blockLabel: `bb${blockIndex}`,
            blockIndex,
          }}
          width={340}
          height={150}
        />
      ))}
    </div>
  ),
};
