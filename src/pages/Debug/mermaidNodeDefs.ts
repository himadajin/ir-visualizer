import type { NodeDefGroup } from "./types";

import MermaidNode from "../../components/Graph/Mermaid/MermaidNode";

export const mermaidNodeGroup: NodeDefGroup = {
  nodeTypes: {
    mermaidNode: MermaidNode,
  },
  defs: [
    {
      title: "Mermaid Node (square)",
      nodeType: "mermaidNode",
      astData: { id: "A", label: "Hello World", shape: "square" },
    },
    {
      title: "Mermaid Node (round)",
      nodeType: "mermaidNode",
      astData: { id: "B", label: "Rounded node", shape: "round" },
    },
    {
      title: "Mermaid Node (curly)",
      nodeType: "mermaidNode",
      astData: { id: "C", label: "Decision?", shape: "curly" },
    },
  ],
};
