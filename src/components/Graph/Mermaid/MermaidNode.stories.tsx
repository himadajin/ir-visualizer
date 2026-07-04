import type { Meta, StoryObj } from "@storybook/react-vite";
import MermaidNode from "./MermaidNode";
import { NodeStoryCanvas } from "../common/NodeStoryCanvas";
import type { MermaidASTNode } from "../../../ast/mermaidAST";

interface StoryArgs {
  astData: MermaidASTNode;
}

const meta = {
  title: "Graph/Mermaid/Node",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="mermaidNode"
      component={MermaidNode}
      astData={args.astData}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Square: Story = {
  args: {
    astData: { id: "A", label: "Hello World", shape: "square" },
  },
};

export const Round: Story = {
  args: {
    astData: { id: "B", label: "Rounded node", shape: "round" },
  },
};

export const Curly: Story = {
  args: {
    astData: { id: "C", label: "Decision?", shape: "curly" },
  },
};
