import type { GraphData } from "../types/graph";
import type { MermaidAST } from "../ast/mermaidAST";
import { convertASTToGraph } from "../graphBuilder/mermaidGraphBuilder";
import {
  isFlowchartSource,
  NOT_A_FLOWCHART_MESSAGE,
  preprocessFlowchartSource,
} from "./mermaid/preprocess";
import { flowDbToAST, type FlowDbSnapshot } from "./mermaid/flowDbAdapter";
import { createFlowDiagram } from "./mermaid/upstream";

// FlowDB's jison parser is a module singleton (`parser.yy`). Serialize parses
// so overlapping calls from vitest workers or a fast debounce cannot clobber
// each other.
let parseLock: Promise<void> = Promise.resolve();

function withParseLock<T>(run: () => Promise<T>): Promise<T> {
  const next = parseLock.then(run, run);
  parseLock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function parseFlowDb(preprocessed: string): Promise<FlowDbSnapshot> {
  const diagram = createFlowDiagram();
  const db = diagram.db as unknown as FlowDbSnapshot & {
    clear?: () => void;
  };
  if (diagram.parser.parser) {
    diagram.parser.parser.yy = db;
  }
  db.clear?.();
  await diagram.parser.parse(preprocessed + "\n");
  return db;
}

export async function parseMermaidToAST(input: string): Promise<MermaidAST> {
  return withParseLock(async () => {
    const preprocessed = preprocessFlowchartSource(input);
    if (!isFlowchartSource(preprocessed)) {
      throw new Error(NOT_A_FLOWCHART_MESSAGE);
    }
    const db = await parseFlowDb(preprocessed);
    return flowDbToAST(db);
  });
}

export async function parseMermaid(input: string): Promise<GraphData> {
  const ast = await parseMermaidToAST(input);
  return convertASTToGraph(ast);
}
