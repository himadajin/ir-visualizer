import * as ohm from "ohm-js";
import mermaidGrammar from "./mermaid.ohm?raw";
import type { GraphData, GraphNode, GraphEdge } from "../types/graph";

const grammar = ohm.grammar(mermaidGrammar);

// Re-export specific types if needed, or just use GraphData aliases
export type MermaidNode = GraphNode;
export type MermaidEdge = GraphEdge;
export type MermaidGraph = GraphData;

const semantics = grammar.createSemantics();

semantics.addOperation("parse", {
  Graph(header: any, statements: any) {
    const dir = header.parse();
    const nodes = new Map<string, MermaidNode>();
    const edges: MermaidEdge[] = [];

    statements.children.forEach((c: any) => {
      const res = c.parse(); // res can be NodeDeclaration, Edge, or null (comment/separator)
      if (!res) return;

      if (res.type === "node_decl") {
        nodes.set(res.node.id, {
          ...res.node,
          label: res.node.label || res.node.id,
          language: "mermaid",
        });
      } else if (res.type === "edge") {
        // Ensure nodes exist
        if (!nodes.has(res.source.id)) {
          nodes.set(res.source.id, {
            ...res.source,
            label: res.source.label || res.source.id,
            language: "mermaid",
          });
        } else {
          // Update label if provided in the edge definition and not previously set properly?
          // Mermaid allows defining node details in edge: A[Label] --> B
          // So we should merge/update if the usage has more info.
          const existing = nodes.get(res.source.id)!;
          if (res.source.label && existing.label === existing.id) {
            existing.label = res.source.label;
            existing.type = res.source.type || existing.type;
          }
          existing.language = "mermaid"; // Ensure language is set
        }

        if (!nodes.has(res.target.id)) {
          nodes.set(res.target.id, {
            ...res.target,
            label: res.target.label || res.target.id,
            language: "mermaid",
          });
        } else {
          const existing = nodes.get(res.target.id)!;
          if (res.target.label && existing.label === existing.id) {
            existing.label = res.target.label;
            existing.type = res.target.type || existing.type;
          }
          existing.language = "mermaid"; // Ensure language is set
        }

        edges.push({
          id: `e${edges.length}-${res.source.id}-${res.target.id}`,
          source: res.source.id,
          target: res.target.id,
          label: res.label,
        });
      }
    });

    return {
      direction: dir,
      nodes: Array.from(nodes.values()),
      edges,
    };
  },
  Header(_graph: any, dir: any, _sep: any) {
    return dir.sourceString;
  },
  Statement(stmt: any) {
    return stmt.parse();
  },
  NodeDeclaration(id: any, label: any, _sep: any) {
    const nodeId = id.sourceString;
    const nodeLabel = label.numChildren > 0 ? label.children[0].parse() : null;
    return {
      type: "node_decl",
      node: { id: nodeId, label: nodeLabel?.text, type: nodeLabel?.shape },
    };
  },
  Edge(n1: any, link: any, n2: any, _sep: any) {
    const source = n1.parse();
    const target = n2.parse();
    const edgeInfo = link.parse();

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
    const nodeLabel = label.numChildren > 0 ? label.children[0].parse() : null;
    return { id: nodeId, label: nodeLabel?.text, type: nodeLabel?.shape };
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
    return children.map((c) => c.parse());
  },
  _terminal() {
    return null;
  },
});

export function parseMermaid(input: string): MermaidGraph {
  const match = grammar.match(input);
  if (match.failed()) {
    throw new Error(match.message);
  }
  return semantics(match).parse();
}
