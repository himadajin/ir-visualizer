/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import * as ohm from "ohm-js";
import selectionDAGGrammar from "./selectionDAG.ohm?raw";
import type {
  SelectionDAGDetails,
  SelectionDAGFlag,
  SelectionDAGInlineOperand,
  SelectionDAGNode,
  SelectionDAGOperand,
  SelectionDAGReg,
} from "../ast/selectionDAGAST";
import {
  convertASTToGraph,
  type SelectionDAGGraphData,
} from "../graphBuilder/selectionDAGGraphBuilder";

export interface ParseResult {
  entries: SelectionDAGParseEntry[];
}

export type SelectionDAGParseEntry =
  | { kind: "node"; node: SelectionDAGNode; line: number }
  | { kind: "comment"; comment: string; line: number };

let _grammar: ohm.Grammar | null = null;
let _semantics: ohm.Semantics | null = null;

function getGrammarAndSemantics() {
  if (!_grammar) {
    try {
      _grammar = ohm.grammar(selectionDAGGrammar);
      _semantics = _grammar.createSemantics();
      registerSemantics(_semantics);
    } catch (error) {
      _grammar = null;
      _semantics = null;
      throw error;
    }
  }

  return { grammar: _grammar, semantics: _semantics! };
}

function maybeDetails(
  details: SelectionDAGDetails,
): SelectionDAGDetails | undefined {
  if (
    details.flags.length === 0 &&
    details.detail === undefined &&
    details.reg === undefined
  ) {
    return undefined;
  }
  return details;
}

function registerSemantics(semantics: ohm.Semantics) {
  semantics.addOperation<any>("toAST", {
    Node(
      _leading: any,
      lhs: any,
      _spaceBeforeEq: any,
      _eq: any,
      _spaceAfterEq: any,
      rhs: any,
      _trailing: any,
    ) {
      const left = lhs.toAST() as { nodeId: string; types: string[] };
      const right = rhs.toAST() as {
        opName: string;
        details?: SelectionDAGDetails;
        verbose?: string;
        operands?: SelectionDAGOperand[];
      };

      return {
        node: {
          nodeId: left.nodeId,
          types: left.types,
          opName: right.opName,
          details: right.details,
          verbose: right.verbose,
          operands: right.operands,
        } as SelectionDAGNode,
      };
    },
    Line(line: any) {
      return line.toAST() as { node?: SelectionDAGNode; comment?: string };
    },
    Comment(_chars: any) {
      return { comment: this.sourceString };
    },
    NodeLHS(nodeId: any, _colon: any, types: any) {
      return {
        nodeId: nodeId.toAST() as string,
        types: types.toAST() as string[],
      };
    },
    NodeRHS(
      opName: any,
      details: any,
      verboseBefore: any,
      operands: any,
      verboseAfter: any,
    ) {
      const operandNodes =
        operands.numChildren > 0
          ? (operands.children[0].toAST() as SelectionDAGOperand[])
          : undefined;
      const detailsNode = maybeDetails(details.toAST() as SelectionDAGDetails);
      const verbose =
        verboseBefore.numChildren > 0
          ? (verboseBefore.children[0].toAST() as string)
          : verboseAfter.numChildren > 0
            ? (verboseAfter.children[0].toAST() as string)
            : undefined;
      return {
        opName: opName.toAST() as string,
        details: detailsNode,
        verbose,
        operands:
          operandNodes && operandNodes.length > 0 ? operandNodes : undefined,
      };
    },
    Details(flags: any, detail: any, reg: any) {
      return {
        flags: flags.children.map((f: any) => f.toAST()) as SelectionDAGFlag[],
        detail:
          detail.numChildren > 0
            ? (detail.children[0].toAST() as string)
            : undefined,
        reg:
          reg.numChildren > 0
            ? (reg.children[0].toAST() as SelectionDAGReg)
            : undefined,
      } as SelectionDAGDetails;
    },
    flag(_text: any) {
      return this.sourceString as SelectionDAGFlag;
    },
    Detail(_open: any, text: any, _close: any) {
      return text.sourceString;
    },
    Verbose(_open: any, text: any, _close: any) {
      return text.sourceString;
    },
    Operands(first: any, _commas: any, rest: any) {
      const firstOperand = first.toAST() as SelectionDAGOperand;
      const restOperands = rest.children.map(
        (operand: any) => operand.toAST() as SelectionDAGOperand,
      );
      return [firstOperand, ...restOperands];
    },
    Operand_null(_null: any) {
      return { kind: "null" };
    },
    Operand_wrappedNodeOp(_open: any, nodeOperand: any, _close: any) {
      const inner = nodeOperand.toAST() as SelectionDAGOperand;
      return { ...inner, wrapped: true };
    },
    Operand_nodeOp(nodeOperand: any) {
      return nodeOperand.toAST() as SelectionDAGOperand;
    },
    Operand_inlineOp(inlineOperand: any) {
      return inlineOperand.toAST() as SelectionDAGOperand;
    },
    NodeOperand(nodeId: any, nodeIndex: any) {
      return {
        kind: "node",
        nodeId: nodeId.toAST() as string,
        index:
          nodeIndex.numChildren > 0
            ? (nodeIndex.children[0].toAST() as number)
            : undefined,
      };
    },
    NodeIndex(_colon: any, digits: any) {
      return Number(digits.sourceString);
    },
    InlineOperand(opName: any, _colon: any, types: any, details: any) {
      return {
        kind: "inline",
        opName: opName.toAST() as string,
        types: types.toAST() as string[],
        details: maybeDetails(details.toAST() as SelectionDAGDetails),
      } as SelectionDAGInlineOperand;
    },
    Types(first: any, _commas: any, rest: any) {
      const firstType = first.toAST() as string;
      const restTypes = rest.children.map(
        (typeNode: any) => typeNode.toAST() as string,
      );
      return [firstType, ...restTypes];
    },
    Type(typeNode: any) {
      return typeNode.toAST() as string;
    },
    type(_chars: any) {
      return this.sourceString;
    },
    opName_unknown(name: any) {
      return name.toAST() as string;
    },
    opName_machine(name: any) {
      return name.toAST() as string;
    },
    opName_ident(_chars: any) {
      return this.sourceString;
    },
    unknownOpName(_open: any, _content: any, _close: any) {
      return this.sourceString;
    },
    machineISDName(_prefix: any, _sep: any, _suffix: any) {
      return this.sourceString;
    },
    Reg(reg: any) {
      return reg.toAST() as SelectionDAGReg;
    },
    RegNoReg(_value: any) {
      return { type: "NoReg", value: this.sourceString };
    },
    RegStack(_prefix: any, _digits: any) {
      return { type: "Stack", value: this.sourceString };
    },
    RegVirtReg(_prefix: any, _name: any) {
      return { type: "VirtReg", value: this.sourceString };
    },
    RegPhysReg(_prefix: any, _name: any) {
      return { type: "PhysReg", value: this.sourceString };
    },
    nodeId_tId(_t: any, _digits: any) {
      return this.sourceString;
    },
    nodeId_hexId(_prefix: any, _digits: any) {
      return this.sourceString;
    },
  });
}

export function parseSelectionDAGNode(line: string): {
  node?: SelectionDAGNode;
  comment?: string;
  error?: string;
} {
  const { grammar, semantics } = getGrammarAndSemantics();
  const match = grammar.match(line, "Line");
  if (match.failed()) {
    return { comment: line };
  }

  const parsed = semantics(match).toAST() as {
    node?: SelectionDAGNode;
    comment?: string;
  };
  if (parsed.node !== undefined || parsed.comment !== undefined) {
    return parsed;
  }
  return { comment: line };
}

export function parseSelectionDAGToGraphData(
  input: string,
): SelectionDAGGraphData {
  const parseResult = parseSelectionDAG(input);
  return convertASTToGraph(parseResult);
}

export function parseSelectionDAG(input: string): ParseResult {
  const lines = input.split("\n").filter((line) => line.trim().length > 0);

  const entries: SelectionDAGParseEntry[] = [];

  lines.forEach((line, index) => {
    const { node, comment } = parseSelectionDAGNode(line);
    if (node) {
      entries.push({ kind: "node", node, line: index + 1 });
      return;
    }
    if (comment !== undefined) {
      entries.push({ kind: "comment", comment, line: index + 1 });
    }
  });

  return { entries };
}
