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

export const Process: Story = {
  args: {
    astData: { id: "A", label: "Process", shape: "square" },
  },
};

export const Decision: Story = {
  args: {
    astData: { id: "B", label: "Decision?", shape: "diamond" },
  },
};

export const Terminal: Story = {
  args: {
    astData: { id: "C", label: "Start", shape: "round" },
  },
};

export const TerminalStadium: Story = {
  args: {
    astData: { id: "D", label: "End", shape: "stadium" },
  },
};

export const DataIO: Story = {
  args: {
    astData: { id: "E", label: "Input", shape: "lean_right" },
  },
};

export const Storage: Story = {
  args: {
    astData: { id: "F", label: "Store", shape: "cylinder" },
  },
};

export const Subroutine: Story = {
  args: {
    astData: { id: "G", label: "Helper", shape: "subroutine" },
  },
};

export const UnknownShapeFallsBackToProcess: Story = {
  args: {
    astData: { id: "H", label: "Hexagon", shape: "hexagon" },
  },
};
