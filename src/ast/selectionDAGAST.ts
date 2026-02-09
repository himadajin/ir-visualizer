export interface SelectionDAGNode {
  nodeId: string;
  types: SelectionDAGType[];
  opName: string;
  details?: SelectionDAGDetails;
  verbose?: string;
  operands?: SelectionDAGOperand[];
}

export type SelectionDAGOperand =
  | SelectionDAGNullOperand
  | SelectionDAGNodeOperand
  | SelectionDAGInlineOperand;

export interface SelectionDAGNullOperand {
  kind: "null";
}

export interface SelectionDAGNodeOperand {
  kind: "node";
  nodeId: string;
  index?: number;
}

export interface SelectionDAGInlineOperand {
  kind: "inline";
  opName: string;
  types: SelectionDAGType[];
  details?: SelectionDAGDetails;
}

export type SelectionDAGType = string;

export interface SelectionDAGDetails {
  flags: SelectionDAGFlag[];
  detail?: string;
  reg?: SelectionDAGReg;
}

export type SelectionDAGFlag =
  | "nuw"
  | "nsw"
  | "exact"
  | "samesign"
  | "nneg"
  | "nnan"
  | "ninf"
  | "nsz"
  | "arcp"
  | "contract"
  | "afn"
  | "reassoc"
  | "nofpexcept";

export interface SelectionDAGReg {
  type: "NoReg" | "Stack" | "VirtReg" | "PhysReg";
  value: string;
}
