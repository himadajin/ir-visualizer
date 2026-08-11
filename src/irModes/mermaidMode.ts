import { codeGraphEdgeBuilder } from "../utils/layout";
import MermaidNode from "../components/Graph/Mermaid/MermaidNode";
import type { IRModeDefinition } from "./types";

const DEFAULT_CODE = `graph TD
  A[Is this working?] -->|Yes| B(Great!)
  A -->|No| C[Debug it]
  C --> D{Fixed?}
  D -->|Yes| B
  D -->|No| C
`;

// parseMermaid is synchronous today; the registry contract is async. See
// llvmMode.ts for why the adapter lives here and not in the parser layer, and
// why it `import()`s the parser instead of importing it at the top of the file.
// The Mermaid parser either produces a graph or throws — it has no recoverable
// middle ground to report, so the result carries no diagnostics.
const parse = async (code: string) => ({
  graph: (await import("../parser/mermaid")).parseMermaid(code),
});

export const mermaidMode = {
  key: "mermaid" as const,
  label: "Mermaid",
  editorLanguage: "mermaid",
  defaultCode: DEFAULT_CODE,
  parse,
  nodeTypes: {
    mermaidNode: MermaidNode,
  },
  edgeBuilder: codeGraphEdgeBuilder,
} satisfies IRModeDefinition;
