import type { Meta, StoryObj } from "@storybook/react-vite";
import GraphGroupNode from "./GraphGroupNode";
import { NodeStoryCanvas } from "./common/NodeStoryCanvas";

interface StoryArgs {
  label: string;
}

const meta = {
  title: "Graph/Group",
  parameters: { layout: "centered" },
  render: (args) => (
    <NodeStoryCanvas
      nodeType="graphGroup"
      component={GraphGroupNode}
      astData={{}}
      data={{ label: args.label }}
      width={280}
      height={160}
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "subgraph",
  },
};
