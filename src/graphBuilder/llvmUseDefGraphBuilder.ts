import type { GraphData, GraphNode, GraphEdge } from "../types/graph";
import type {
  LLVMBasicBlock,
  LLVMFunction,
  LLVMInstruction,
  LLVMModule,
  LLVMTerminator,
} from "../ast/llvmAST";
import {
  canonicalName,
  edgeId,
  functionId,
  udArgumentId,
  udExternalId,
  udLineId,
} from "./llvmIds";

/**
 * Use-Def view builder (docs/internal/specs/llvm-use-def-view.md): SSA
 * dataflow per function — one node per instruction/terminator line that
 * participates in dataflow, plus value nodes for named parameters and for
 * names with no known def, and one edge per (defining line → reading line).
 *
 * Consumes the §3.5 `defs`/`uses` fields. The graph is deliberately FLAT:
 * no container nodes and no `parentId`, so layered ELK layout ranks instruction
 * nodes by their use-def edges and vertical position means dataflow depth.
 * Module-level items — globals, metadata, attribute groups, declarations,
 * targets, debug records — never participate in SSA dataflow and contribute
 * nothing here.
 */

/** One line already emitted as a node, queued for the edge pass. */
interface EmittedLine {
  nodeId: string;
  line: LLVMInstruction | LLVMTerminator;
}

/**
 * The block's display label (spec §2.1): "entry" for a first block whose
 * label is null, otherwise the block's label, falling back to the block id
 * (implicit numeric blocks carry no label).
 */
function blockDisplayLabel(block: LLVMBasicBlock, blockIndex: number): string {
  if (block.label !== null && block.label !== "") return block.label;
  return blockIndex === 0 ? "entry" : block.id;
}

/** A line participates in dataflow when it defines or reads something. */
function participates(line: LLVMInstruction | LLVMTerminator): boolean {
  return (line.defs?.length ?? 0) > 0 || (line.uses?.length ?? 0) > 0;
}

/**
 * Incoming `[ value, %block ]` pairs of a phi line, extracted textually
 * from originalText: the AST keeps phi generic (`specs/llvm-ir.md` §5) and
 * `src/graphBuilder` must not import from `src/parser`, so the builder
 * scans the text itself (spec §3.1). Maps a local incoming VALUE name to
 * the incoming block(s) it arrives from. Constant incoming values and
 * quoted names do not match the value slot and simply produce no entry.
 */
function phiIncomingBlocks(originalText: string): Map<string, string[]> {
  const incoming = new Map<string, string[]>();
  const pair = /\[\s*%([A-Za-z0-9$._-]+)\s*,\s*%([A-Za-z0-9$._-]+)\s*\]/g;
  for (const match of originalText.matchAll(pair)) {
    const [, value, block] = match;
    const blocks = incoming.get(value) ?? [];
    blocks.push(block);
    incoming.set(value, blocks);
  }
  return incoming;
}

function isPhi(line: LLVMInstruction | LLVMTerminator): boolean {
  return line.opcode === "phi";
}

function buildFunctionGraph(
  func: LLVMFunction,
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  const funcPrefix = functionId(func.name);
  /** value name -> id of the node that defines it (argument or instruction) */
  const defSource = new Map<string, string>();
  /** instruction node ids — these expose a "def" source port (spec §3). */
  const instructionIds = new Set<string>();
  const emitted: EmittedLine[] = [];

  // Argument value nodes: one per NAMED parameter, emitted whether or not
  // the parameter is used. Unnamed parameters have no name to resolve
  // against, so a body reading an implicit `%0` resolves as external.
  func.params.forEach((param) => {
    if (param.name === null) return;
    // The canonical form is what `uses` entries carry, so a parameter written
    // `%"odd name"` compares equal to the body's reads of it.
    const name = canonicalName(param.name);
    const argId = udArgumentId(funcPrefix, name);
    nodes.push({
      id: argId,
      label: param.type === "" ? `%${name}` : `%${name}: ${param.type}`,
      type: "round",
      language: "text",
      nodeType: "llvm-useDefValue",
      astData: { name, kind: "argument", paramType: param.type },
    });
    defSource.set(name, argId);
  });

  // Pass 1 — instruction nodes, registering every def. Edges are a separate
  // pass so a phi can read a value defined in a later block.
  func.blocks.forEach((block, blockIndex) => {
    const lines: { line: LLVMInstruction | LLVMTerminator; term: boolean }[] =
      [];
    block.instructions.forEach((item) => {
      // Debug records (#dbg_*) never participate in dataflow.
      if (item.type === "DebugRecord") return;
      lines.push({ line: item, term: false });
    });
    // The §3.4 synthetic empty terminator has no source line — no node.
    if (block.terminator.originalText !== "") {
      lines.push({ line: block.terminator, term: true });
    }

    const blockLabel = blockDisplayLabel(block, blockIndex);
    // `index` counts the lines the block actually EMITS: a skipped line
    // (no defs and no uses) consumes no index (spec §2.1).
    let index = 0;
    lines.forEach(({ line, term }) => {
      if (!participates(line)) return;
      const nodeId = udLineId(funcPrefix, block.id, index);
      index++;
      const def = line.defs?.[0] ?? null;
      nodes.push({
        id: nodeId,
        label: line.originalText,
        type: "square",
        language: "llvm",
        nodeType: "llvm-useDefInstruction",
        astData: {
          text: line.originalText,
          def,
          uses: line.uses ?? [],
          isTerminator: term,
          blockLabel,
          blockIndex,
        },
      });
      instructionIds.add(nodeId);
      if (def !== null) defSource.set(def, nodeId);
      emitted.push({ nodeId, line });
    });
  });

  // Pass 2 — edges. A name with no known def lazily gets an "external"
  // value node so edge construction is total (spec §2.2): use extraction is
  // heuristic, so an unresolved name must not throw.
  const externals = new Map<string, string>();
  const resolveSource = (name: string): string => {
    const known = defSource.get(name);
    if (known !== undefined) return known;
    let externalId = externals.get(name);
    if (externalId === undefined) {
      externalId = udExternalId(funcPrefix, name);
      externals.set(name, externalId);
      nodes.push({
        id: externalId,
        label: `%${name}`,
        type: "round",
        language: "text",
        nodeType: "llvm-useDefValue",
        astData: { name, kind: "external" },
      });
    }
    return externalId;
  };

  emitted.forEach(({ nodeId, line }) => {
    const incoming = isPhi(line)
      ? phiIncomingBlocks(line.originalText)
      : undefined;
    (line.uses ?? []).forEach((name) => {
      const sourceId = resolveSource(name);
      // `uses` is deduplicated per line (§3.5), so one edge per name; the
      // incoming blocks of a phi value are aggregated into that one edge's
      // label rather than producing several colliding edges.
      const fromBlocks = incoming?.get(name);
      const edge: GraphEdge = {
        id: edgeId(sourceId, nodeId, name),
        source: sourceId,
        target: nodeId,
        type: "arrow",
        // Land on the reading line's per-operand port (spec §3); leave from
        // the defining line's "def" port when the source is an instruction
        // (value pills keep their single centered handle).
        targetHandle: `u-${name}`,
      };
      if (instructionIds.has(sourceId)) {
        edge.sourceHandle = "def";
      }
      if (fromBlocks !== undefined) {
        // phi edge: dashed, and labeled with the incoming block(s). Plain
        // use-def edges stay unlabeled — the name is visible in the source
        // node's text (spec §3).
        edge.label = `%${name} (${fromBlocks.map((b) => `%${b}`).join(", ")})`;
        edge.dashed = true;
      }
      edges.push(edge);
    });
  });
}

export function convertASTToUseDefGraph(module: LLVMModule): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  module.functions.forEach((func) => {
    buildFunctionGraph(func, nodes, edges);
  });

  return { nodes, edges, direction: "TD" };
}
