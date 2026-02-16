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
  wrapped?: boolean;
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
  vtDetail?: string;
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
  type: "NoReg" | "Stack" | "VirtReg" | "PhysReg" | "Numbered" | "Bare";
  value: string;
}

export const formatSelectionDAGOperand = (op: SelectionDAGOperand): string => {
  switch (op.kind) {
    case "node": {
      const id =
        op.index !== undefined ? `${op.nodeId}:${op.index}` : op.nodeId;
      return op.wrapped ? `<${id}>` : id;
    }
    case "inline": {
      const types = op.types.length > 0 ? `:${op.types.join(",")}` : "";
      const detail = op.details?.detail ? `<${op.details.detail}>` : "";
      const reg = op.details?.reg ? ` ${op.details.reg.value}` : "";
      return `${op.opName}${types}${detail}${reg}`;
    }
    case "null":
      return "<null>";
  }
};

export const buildSelectionDAGOpNameLabel = (
  node: SelectionDAGNode,
): string => {
  return node.opName;
};

export const buildSelectionDAGDetailsLabel = (
  node: SelectionDAGNode,
): string => {
  const detailParts: string[] = [];
  if (node.details?.flags?.length) {
    detailParts.push(node.details.flags.join(" "));
  }
  if (node.details?.detail) {
    detailParts.push(node.details.detail);
  }
  if (node.details?.reg) {
    const r = node.details.reg;
    detailParts.push(r.value);
  }

  if (node.details?.vtDetail) {
    detailParts.push(`:${node.details.vtDetail}`);
  }

  return detailParts.join(" ");
};

export const buildSelectionDAGOpLabel = (node: SelectionDAGNode): string => {
  const opName = buildSelectionDAGOpNameLabel(node);
  const details = buildSelectionDAGDetailsLabel(node);
  return details ? `${opName} ${details}` : opName;
};
