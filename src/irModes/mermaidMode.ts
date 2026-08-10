import { parseMermaid } from "../parser/mermaid";
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
// llvmMode.ts for why the adapter lives here and not in the parser layer.
const parse = async (code: string) => parseMermaid(code);

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
