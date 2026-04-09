/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import * as ohm from "ohm-js";
import mermaidGrammar from "./mermaid.ohm?raw";
import type { GraphData } from "../types/graph";
import type {
  MermaidAST,
  MermaidASTNode,
  MermaidASTEdge,
} from "../ast/mermaidAST";
import { convertASTToGraph } from "../graphBuilder/mermaidGraphBuilder";

const grammar = ohm.grammar(mermaidGrammar);

const semantics = grammar.createSemantics();

semantics.addOperation("toAST", {
  Graph(_leadingSep: any, header: any, statements: any) {
    const dir = header.toAST();
    const nodes = new Map<string, MermaidASTNode>();
    const edges: MermaidASTEdge[] = [];

    statements.children.forEach((c: any) => {
      const res = c.toAST();
      if (!res) return;

      if (res.type === "node_decl") {
        nodes.set(res.node.id, {
          id: res.node.id,
          label: res.node.label || res.node.id,
          shape: res.node.shape,
        });
      } else if (res.type === "edge") {
        // Ensure source node exists
        if (!nodes.has(res.source.id)) {
          nodes.set(res.source.id, {
            id: res.source.id,
            label: res.source.label || res.source.id,
            shape: res.source.shape,
          });
        } else {
          const existing = nodes.get(res.source.id)!;
          if (res.source.label && existing.label === existing.id) {
            existing.label = res.source.label;
            existing.shape = res.source.shape || existing.shape;
          }
        }

        // Ensure target node exists
        if (!nodes.has(res.target.id)) {
          nodes.set(res.target.id, {
            id: res.target.id,
            label: res.target.label || res.target.id,
            shape: res.target.shape,
          });
        } else {
          const existing = nodes.get(res.target.id)!;
          if (res.target.label && existing.label === existing.id) {
            existing.label = res.target.label;
            existing.shape = res.target.shape || existing.shape;
          }
        }

        edges.push({
          sourceId: res.source.id,
          targetId: res.target.id,
          label: res.label,
          edgeType: res.edgeType,
        });
      }
    });

    return {
      direction: dir,
      nodes: Array.from(nodes.values()),
      edges,
    } as MermaidAST;
  },
  Header(_graph: any, dir: any, _sep: any) {
    return dir.sourceString;
  },
  Statement(stmt: any) {
    return stmt.toAST();
  },
  NodeDeclaration(id: any, label: any, _sep: any) {
    const nodeId = id.sourceString;
    const nodeLabel = label.numChildren > 0 ? label.children[0].toAST() : null;
    return {
      type: "node_decl",
      node: { id: nodeId, label: nodeLabel?.text, shape: nodeLabel?.shape },
    };
  },
  Edge(n1: any, link: any, n2: any, _sep: any) {
    const source = n1.toAST();
    const target = n2.toAST();
    const edgeInfo = link.toAST();

    return {
      type: "edge",
      source,
      target,
      label: edgeInfo.label,
      edgeType: edgeInfo.type,
    };
  },
  Node(id: any, label: any) {
    const nodeId = id.sourceString;
    const nodeLabel = label.numChildren > 0 ? label.children[0].toAST() : null;
    return { id: nodeId, label: nodeLabel?.text, shape: nodeLabel?.shape };
  },
  Link_arrowWithLabel(_arrow: any, _pipe1: any, text: any, _pipe2: any) {
    return {
      type: "arrow",
      label: text.numChildren > 0 ? text.sourceString : undefined,
    };
  },
  Link_lineWithLabel(_line: any, _pipe1: any, text: any, _pipe2: any) {
    return {
      type: "line",
      label: text.numChildren > 0 ? text.sourceString : undefined,
    };
  },
  Link_arrowWithTextMiddle(_dash: any, text: any, _arrow: any) {
    return { type: "arrow", label: text.sourceString };
  },
  Link_lineWithTextMiddle(_dash: any, text: any, _line: any) {
    return { type: "line", label: text.sourceString };
  },
  NodeLabel_square(_open: any, text: any, _close: any) {
    return { text: text.sourceString, shape: "square" };
  },
  NodeLabel_round(_open: any, text: any, _close: any) {
    return { text: text.sourceString, shape: "round" };
  },
  NodeLabel_curly(_open: any, text: any, _close: any) {
    return { text: text.sourceString, shape: "curly" };
  },
  // Default fallbacks
  _iter(...children: any[]) {
    return children.map((c) => c.toAST());
  },
  _terminal() {
    return null;
  },
});

export function parseMermaidToAST(input: string): MermaidAST {
  const match = grammar.match(input);
  if (match.failed()) {
    throw new Error(match.message);
  }
  return semantics(match).toAST() as MermaidAST;
}

export function parseMermaid(input: string): GraphData {
  const ast = parseMermaidToAST(input);
  return convertASTToGraph(ast);
}
