import type { GraphNode } from "./graph";

/** Named source or operand position, measured from the outer left border. */
export interface NodePortPreference {
  id: string;
  side: "top" | "bottom";
  x: number | null;
  /** Source positions may be fractions of the width; operands use flow px. */
  relative?: boolean;
}

export type NodePortPreferences = (
  node: GraphNode,
) => readonly NodePortPreference[] | undefined;

export interface NodePort {
  id: string;
  side: "top" | "bottom";
  /** Fraction of the box width when relative, otherwise flow px. */
  x: number;
  relative: boolean;
}

/** Rendering data shared by the measure mount, ELK, and the live handles. */
export interface NodePortLayout {
  ports: NodePort[];
  minWidth: number;
}
