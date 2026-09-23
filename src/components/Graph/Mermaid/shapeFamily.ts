import {
  NODE_BORDER_RADIUS,
  NODE_BORDER_RADIUS_PILL,
  NODE_BORDER_WIDTH,
} from "../common/nodeTextStyle";

/**
 * Semantic families for mermaid node shapes (`specs/mermaid.md` §5).
 * Classification is a render concern: the AST keeps the upstream name.
 */
export type MermaidShapeFamily =
  | "process"
  | "decision"
  | "terminal"
  | "data-io"
  | "storage"
  | "subroutine";

/** Border geometry per family; the color is always `node-line`. */
export interface MermaidFamilyPresentation {
  borderRadius: string;
  borderWidth: string;
  borderStyle: "solid" | "dashed" | "dotted" | "double";
}

const DECISION_BORDER_WIDTH = 2;
const STORAGE_BORDER_WIDTH = 2;
const SUBROUTINE_BORDER_WIDTH = 3;

/** Upstream names classified into a non-fallback family. Process names that
 *  are listed in the spec are included so `square` / `rect` are classified
 *  rather than merely falling through. */
export const MERMAID_FAMILY_SHAPES: Record<
  MermaidShapeFamily,
  readonly string[]
> = {
  process: ["square", "rect", "proc", "process", "rectangle", "squareRect"],
  decision: ["diamond", "diam", "decision", "question"],
  terminal: [
    "round",
    "rounded",
    "event",
    "roundedRect",
    "stadium",
    "terminal",
    "pill",
    "circle",
    "circ",
    "ellipse",
    "sm-circ",
    "start",
    "small-circle",
    "stateStart",
    "dbl-circ",
    "double-circle",
    "doublecircle",
    "fr-circ",
    "stop",
    "framed-circle",
    "stateEnd",
  ],
  "data-io": [
    "lean_right",
    "lean-r",
    "lean-right",
    "in-out",
    "lean_left",
    "lean-l",
    "lean-left",
    "out-in",
  ],
  storage: [
    "cylinder",
    "cyl",
    "db",
    "database",
    "datastore",
    "data-store",
    "h-cyl",
    "das",
    "horizontal-cylinder",
    "lin-cyl",
    "disk",
    "lined-cylinder",
    "bow-rect",
    "stored-data",
    "bow-tie-rectangle",
    "win-pane",
    "internal-storage",
    "window-pane",
  ],
  subroutine: [
    "subroutine",
    "fr-rect",
    "subprocess",
    "subproc",
    "framed-rectangle",
  ],
};

const FAMILY_BY_SHAPE = new Map<string, MermaidShapeFamily>(
  Object.entries(MERMAID_FAMILY_SHAPES).flatMap(([family, names]) =>
    names.map((name) => [name, family as MermaidShapeFamily]),
  ),
);

export function mermaidShapeFamily(shape?: string): MermaidShapeFamily {
  if (shape === undefined) {
    return "process";
  }
  return FAMILY_BY_SHAPE.get(shape) ?? "process";
}

export function mermaidFamilyPresentation(
  family: MermaidShapeFamily,
): MermaidFamilyPresentation {
  switch (family) {
    case "decision":
      return {
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        borderWidth: `${DECISION_BORDER_WIDTH}px`,
        borderStyle: "dashed",
      };
    case "terminal":
      return {
        borderRadius: `${NODE_BORDER_RADIUS_PILL}px`,
        borderWidth: `${NODE_BORDER_WIDTH}px`,
        borderStyle: "solid",
      };
    case "data-io":
      return {
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        borderWidth: `${NODE_BORDER_WIDTH}px`,
        borderStyle: "dotted",
      };
    case "storage":
      return {
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        borderWidth: `${STORAGE_BORDER_WIDTH}px`,
        borderStyle: "solid",
      };
    case "subroutine":
      return {
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        borderWidth: `${SUBROUTINE_BORDER_WIDTH}px`,
        borderStyle: "double",
      };
    case "process":
      return {
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        borderWidth: `${NODE_BORDER_WIDTH}px`,
        borderStyle: "solid",
      };
  }
}
