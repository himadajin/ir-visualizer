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

export interface MermaidFamilyPresentation {
  borderRadius: string;
  border: string;
}

const NODE_BORDER_COLOR = "#777";
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
        border: `${DECISION_BORDER_WIDTH}px dashed ${NODE_BORDER_COLOR}`,
      };
    case "terminal":
      return {
        borderRadius: `${NODE_BORDER_RADIUS_PILL}px`,
        border: `${NODE_BORDER_WIDTH}px solid ${NODE_BORDER_COLOR}`,
      };
    case "data-io":
      return {
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        border: `${NODE_BORDER_WIDTH}px dotted ${NODE_BORDER_COLOR}`,
      };
    case "storage":
      return {
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        border: `${STORAGE_BORDER_WIDTH}px solid ${NODE_BORDER_COLOR}`,
      };
    case "subroutine":
      return {
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        border: `${SUBROUTINE_BORDER_WIDTH}px double ${NODE_BORDER_COLOR}`,
      };
    case "process":
      return {
        borderRadius: `${NODE_BORDER_RADIUS}px`,
        border: `${NODE_BORDER_WIDTH}px solid ${NODE_BORDER_COLOR}`,
      };
  }
}
