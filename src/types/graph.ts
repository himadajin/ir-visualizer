import type {
  LLVMAttributeGroup,
  LLVMBasicBlock,
  LLVMDeclaration,
  LLVMFunctionHeaderData,
  LLVMGlobalVariable,
  LLVMMetadata,
} from "../ast/llvmAST";
import type { MermaidASTNode } from "../ast/mermaidAST";
import type { SelectionDAGNode as SelectionDAGNodeAST } from "../ast/selectionDAGAST";

interface GraphNodeBase {
  id: string;
  label: string;
  type?: string;
  language?: string; // For syntax highlighting
  blockLabel?: string; // Extracted BasicBlock label
}

/**
 * Ties a node's `nodeType` (its React Flow renderer, e.g. "llvm-basicBlock") to the
 * concrete AST shape that renderer expects as `astData`. See
 * docs/internal/contracts/graph-data.md. The final variant covers nodes with no
 * specialized renderer (falls back to the generic "codeNode").
 */
type GraphNodeAstData =
  | { nodeType: "llvm-basicBlock"; astData: LLVMBasicBlock }
  | { nodeType: "llvm-functionHeader"; astData: LLVMFunctionHeaderData }
  | { nodeType: "llvm-globalVariable"; astData: LLVMGlobalVariable }
  | { nodeType: "llvm-attributeGroup"; astData: LLVMAttributeGroup }
  | { nodeType: "llvm-metadata"; astData: LLVMMetadata }
  | { nodeType: "llvm-declaration"; astData: LLVMDeclaration }
  | { nodeType: "llvm-exit"; astData: Record<string, never> }
  | { nodeType: "mermaid-node"; astData: MermaidASTNode }
  | { nodeType: "selectionDAG-node"; astData: SelectionDAGNodeAST }
  | { nodeType?: undefined; astData?: undefined };

export type GraphNode = GraphNodeBase & GraphNodeAstData;

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  // SelectionDAG-only: edges connect specific operand/type Handles rather than
  // generic node boundaries, and chain/glue dependency edges render dashed.
  sourceHandle?: string;
  targetHandle?: string;
  isChainOrGlue?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  direction?: string;
}
