export type CorpusCase = {
  name: string;
  input: string;
  expected: {
    direction: string;
    nodeIds: string[];
    shapes?: Record<string, string | undefined>;
    labels?: Record<string, string>;
    edges: Array<{
      sourceId: string;
      targetId: string;
      label?: string;
      stroke?: string;
      arrowhead?: string;
    }>;
    subgraphs?: Array<{
      id: string;
      title: string;
      nodeIds: string[];
      direction?: string;
    }>;
  };
};

export const mermaidCorpus: CorpusCase[] = [
  {
    name: "default-example",
    input: `graph TD
  A[Is this working?] -->|Yes| B(Great!)
  A -->|No| C[Debug it]
  C --> D{Fixed?}
  D -->|Yes| B
  D -->|No| C
`,
    expected: {
      direction: "TB",
      nodeIds: ["A", "B", "C", "D"],
      shapes: { A: "square", B: "round", C: "square", D: "diamond" },
      labels: {
        A: "Is this working?",
        B: "Great!",
        C: "Debug it",
        D: "Fixed?",
      },
      edges: [
        {
          sourceId: "A",
          targetId: "B",
          label: "Yes",
          arrowhead: "arrow_point",
        },
        { sourceId: "A", targetId: "C", label: "No", arrowhead: "arrow_point" },
        { sourceId: "C", targetId: "D", arrowhead: "arrow_point" },
        {
          sourceId: "D",
          targetId: "B",
          label: "Yes",
          arrowhead: "arrow_point",
        },
        { sourceId: "D", targetId: "C", label: "No", arrowhead: "arrow_point" },
      ],
    },
  },
  {
    name: "edge-variants",
    input: `graph TD
A --> B
A --- C
A -.-> D
A ==> E
A --o F
A --x G
A <--> H
`,
    expected: {
      direction: "TB",
      nodeIds: ["A", "B", "C", "D", "E", "F", "G", "H"],
      edges: [
        {
          sourceId: "A",
          targetId: "B",
          arrowhead: "arrow_point",
          stroke: "normal",
        },
        {
          sourceId: "A",
          targetId: "C",
          arrowhead: "arrow_open",
          stroke: "normal",
        },
        {
          sourceId: "A",
          targetId: "D",
          arrowhead: "arrow_point",
          stroke: "dotted",
        },
        {
          sourceId: "A",
          targetId: "E",
          arrowhead: "arrow_point",
          stroke: "thick",
        },
        {
          sourceId: "A",
          targetId: "F",
          arrowhead: "arrow_circle",
          stroke: "normal",
        },
        {
          sourceId: "A",
          targetId: "G",
          arrowhead: "arrow_cross",
          stroke: "normal",
        },
        {
          sourceId: "A",
          targetId: "H",
          arrowhead: "double_arrow_point",
          stroke: "normal",
        },
      ],
    },
  },
  {
    name: "nested-subgraph",
    input: `graph TD
subgraph outer [Outer]
  subgraph inner [Inner]
    A --> B
  end
  C --> A
end
`,
    expected: {
      direction: "TB",
      nodeIds: ["A", "B", "C"],
      edges: [
        { sourceId: "A", targetId: "B", arrowhead: "arrow_point" },
        { sourceId: "C", targetId: "A", arrowhead: "arrow_point" },
      ],
      subgraphs: [
        { id: "inner", title: "Inner", nodeIds: ["A", "B"] },
        { id: "outer", title: "Outer", nodeIds: ["inner", "C"] },
      ],
    },
  },
  {
    name: "subgraph-direction",
    input: `graph TD
subgraph box [Box]
  direction LR
  A --> B
end
`,
    expected: {
      direction: "TB",
      nodeIds: ["A", "B"],
      edges: [{ sourceId: "A", targetId: "B", arrowhead: "arrow_point" }],
      subgraphs: [
        { id: "box", title: "Box", nodeIds: ["A", "B"], direction: "LR" },
      ],
    },
  },
];
