import type { NodeDefGroup } from "./types";

import SelectionDAGNode from "../../components/Graph/SelectionDAG/SelectionDAGNode";

export const selectionDAGNodeGroup: NodeDefGroup = {
  nodeTypes: {
    selectionDAGNode: SelectionDAGNode,
  },
  defs: [
    {
      title: "SelectionDAG: add (2 operands)",
      nodeType: "selectionDAGNode",
      astData: {
        nodeId: "t5",
        types: ["i32"],
        opName: "add",
        operands: [
          { kind: "node", nodeId: "t3" },
          { kind: "node", nodeId: "t4" },
        ],
      },
    },
    {
      title: "SelectionDAG: add with flags",
      nodeType: "selectionDAGNode",
      astData: {
        nodeId: "t6",
        types: ["i32"],
        opName: "add",
        details: {
          flags: ["nuw", "nsw"],
        },
        operands: [
          { kind: "node", nodeId: "t3" },
          { kind: "node", nodeId: "t4" },
        ],
      },
    },
    {
      title: "SelectionDAG: store (3 operands with chain)",
      nodeType: "selectionDAGNode",
      astData: {
        nodeId: "t8",
        types: ["ch"],
        opName: "store",
        operands: [
          { kind: "node", nodeId: "t0" },
          { kind: "node", nodeId: "t5" },
          { kind: "node", nodeId: "t7", index: 0 },
        ],
      },
    },
    {
      title: "SelectionDAG: CopyFromReg (register)",
      nodeType: "selectionDAGNode",
      astData: {
        nodeId: "t3",
        types: ["i32", "ch"],
        opName: "CopyFromReg",
        details: {
          flags: [],
          reg: { type: "PhysReg", value: "%0" },
        },
        operands: [
          { kind: "node", nodeId: "t0" },
          {
            kind: "inline",
            opName: "Register",
            types: ["i32"],
            details: { flags: [], reg: { type: "PhysReg", value: "%0" } },
          },
        ],
      },
    },
    {
      title: "SelectionDAG: Constant (inline operand)",
      nodeType: "selectionDAGNode",
      astData: {
        nodeId: "t7",
        types: ["i32"],
        opName: "add",
        operands: [
          { kind: "node", nodeId: "t3" },
          {
            kind: "inline",
            opName: "Constant",
            types: ["i32"],
            details: { flags: [], detail: "42" },
          },
        ],
      },
    },
    {
      title: "SelectionDAG: EntryToken (no operands)",
      nodeType: "selectionDAGNode",
      astData: {
        nodeId: "t0",
        types: ["ch"],
        opName: "EntryToken",
      },
    },
    {
      title: "SelectionDAG: null operand",
      nodeType: "selectionDAGNode",
      astData: {
        nodeId: "t9",
        types: ["ch"],
        opName: "TokenFactor",
        operands: [{ kind: "node", nodeId: "t5" }, { kind: "null" }],
      },
    },
    {
      title: "SelectionDAG: CopyToReg (VirtReg)",
      nodeType: "selectionDAGNode",
      astData: {
        nodeId: "t10",
        types: ["ch", "glue"],
        opName: "CopyToReg",
        details: {
          flags: [],
          reg: { type: "VirtReg", value: "%vreg0" },
        },
        operands: [
          { kind: "node", nodeId: "t0" },
          {
            kind: "inline",
            opName: "Register",
            types: ["i32"],
            details: {
              flags: [],
              reg: { type: "VirtReg", value: "%vreg0" },
            },
          },
          { kind: "node", nodeId: "t5" },
        ],
      },
    },
  ],
};
