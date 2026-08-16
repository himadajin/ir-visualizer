import type {
  LLVMAttributeGroup,
  LLVMBasicBlock,
  LLVMDeclaration,
  LLVMFunctionHeaderData,
  LLVMGlobalVariable,
  LLVMMetadata,
  LLVMUseDefInstructionData,
  LLVMUseDefValueData,
} from "../ast/llvmAST";
import type { MermaidASTNode, MermaidEdgeStroke } from "../ast/mermaidAST";
import type { SelectionDAGNode as SelectionDAGNodeAST } from "../ast/selectionDAGAST";

export const GRAPH_DIRECTIONS = ["TD", "TB", "BT", "LR", "RL"] as const;
export type GraphDirection = (typeof GRAPH_DIRECTIONS)[number];

export const isGraphDirection = (
  value: string | undefined,
): value is GraphDirection =>
  value === "TD" ||
  value === "TB" ||
  value === "BT" ||
  value === "LR" ||
  value === "RL";

/** Generic container payload (`contracts/graph-data.md`, Hierarchy). */
export interface GraphGroupData {
  /** This container's rank direction. Omitted: inherit parent. */
  direction?: GraphDirection;
}

interface GraphNodeBase {
  id: string;
  label: string;
  type?: string;
  language?: string; // For syntax highlighting
  blockLabel?: string; // Extracted BasicBlock label
  /** Container this node sits in. Omitted for a root. See graph-data.md Hierarchy. */
  parentId?: string;
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
  | { nodeType: "llvm-useDefInstruction"; astData: LLVMUseDefInstructionData }
  | { nodeType: "llvm-useDefValue"; astData: LLVMUseDefValueData }
  | { nodeType: "mermaid-node"; astData: MermaidASTNode }
  | { nodeType: "selectionDAG-node"; astData: SelectionDAGNodeAST }
  | { nodeType: "graph-group"; astData: GraphGroupData }
  | { nodeType?: undefined; astData?: undefined };

export type GraphNode = GraphNodeBase & GraphNodeAstData;

/** Graph-layer container (`contracts/graph-data.md`, Hierarchy). */
export const GRAPH_GROUP_NODE_TYPE = "graph-group" as const;

export const isContainerNode = (
  node: GraphNode,
): node is GraphNode & { nodeType: "graph-group" } =>
  node.nodeType === GRAPH_GROUP_NODE_TYPE;

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
  /**
   * Render with a dash pattern (strokeDasharray) via the standard edge
   * factory. Mode-agnostic; used by the LLVM Use-Def view's phi edges.
   */
  dashed?: boolean;
  /** Mermaid flowchart stroke. Omitted for other modes. */
  stroke?: MermaidEdgeStroke;
  /** Mermaid flowchart FlowDB arrow type. Omitted for other modes. */
  arrowhead?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  direction?: GraphDirection;
}
