import type { Meta, StoryObj } from "@storybook/react-vite";
import SelectionDAGNode from "./SelectionDAGNode";
import { NodeStoryCanvas } from "../common/NodeStoryCanvas";
import type { SelectionDAGNode as SelectionDAGNodeAST } from "../../../ast/selectionDAGAST";

interface StoryArgs {
  astData: SelectionDAGNodeAST;
}

const meta = {
  title: "Graph/SelectionDAG/Node",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="selectionDAGNode"
      component={SelectionDAGNode}
      astData={args.astData}
      width={480}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Add: Story = {
  name: "add (2 operands)",
  args: {
    astData: {
      nodeId: "t5",
      types: ["i32"],
      opName: "add",
      operands: [
        { kind: "node", nodeId: "t3" },
        { kind: "node", nodeId: "t4" },
      ],
    },
  },
};

export const AddWithFlags: Story = {
  name: "add with flags",
  args: {
    astData: {
      nodeId: "t6",
      types: ["i32"],
      opName: "add",
      details: {
        flags: ["nuw", "nsw"],
      },
      operands: [
        { kind: "node", nodeId: "t3" },
        { kind: "node", nodeId: "t4" },
      ],
    },
  },
};

export const Store: Story = {
  name: "store (3 operands with chain)",
  args: {
    astData: {
      nodeId: "t8",
      types: ["ch"],
      opName: "store",
      operands: [
        { kind: "node", nodeId: "t0" },
        { kind: "node", nodeId: "t5" },
        { kind: "node", nodeId: "t7", index: 0 },
      ],
    },
  },
};

export const CopyFromReg: Story = {
  name: "CopyFromReg (register)",
  args: {
    astData: {
      nodeId: "t3",
      types: ["i32", "ch"],
      opName: "CopyFromReg",
      details: {
        flags: [],
        reg: { type: "PhysReg", value: "%0" },
      },
      operands: [
        { kind: "node", nodeId: "t0" },
        {
          kind: "inline",
          opName: "Register",
          types: ["i32"],
          details: { flags: [], reg: { type: "PhysReg", value: "%0" } },
        },
      ],
    },
  },
};

export const ConstantInlineOperand: Story = {
  name: "Constant (inline operand)",
  args: {
    astData: {
      nodeId: "t7",
      types: ["i32"],
      opName: "add",
      operands: [
        { kind: "node", nodeId: "t3" },
        {
          kind: "inline",
          opName: "Constant",
          types: ["i32"],
          details: { flags: [], detail: "42" },
        },
      ],
    },
  },
};

export const EntryToken: Story = {
  name: "EntryToken (no operands)",
  args: {
    astData: {
      nodeId: "t0",
      types: ["ch"],
      opName: "EntryToken",
    },
  },
};

export const NullOperand: Story = {
  name: "null operand",
  args: {
    astData: {
      nodeId: "t9",
      types: ["ch"],
      opName: "TokenFactor",
      operands: [{ kind: "node", nodeId: "t5" }, { kind: "null" }],
    },
  },
};

export const CopyToRegVirtReg: Story = {
  name: "CopyToReg (VirtReg)",
  args: {
    astData: {
      nodeId: "t10",
      types: ["ch", "glue"],
      opName: "CopyToReg",
      details: {
        flags: [],
        reg: { type: "VirtReg", value: "%vreg0" },
      },
      operands: [
        { kind: "node", nodeId: "t0" },
        {
          kind: "inline",
          opName: "Register",
          types: ["i32"],
          details: {
            flags: [],
            reg: { type: "VirtReg", value: "%vreg0" },
          },
        },
        { kind: "node", nodeId: "t5" },
      ],
    },
  },
};
