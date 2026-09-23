import { describe, expect, it } from "vitest";
import {
  MERMAID_FAMILY_SHAPES,
  mermaidFamilyPresentation,
  mermaidShapeFamily,
  type MermaidShapeFamily,
} from "../shapeFamily";
import {
  NODE_BORDER_RADIUS,
  NODE_BORDER_RADIUS_PILL,
  NODE_BORDER_WIDTH,
} from "../../common/nodeTextStyle";

/** Spec table in `docs/internal/specs/mermaid.md` §5. */
const SPEC_FAMILY_SHAPES: Record<MermaidShapeFamily, readonly string[]> = {
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

describe("mermaidShapeFamily", () => {
  it("lists the spec's upstream names", () => {
    expect(MERMAID_FAMILY_SHAPES).toEqual(SPEC_FAMILY_SHAPES);
  });

  it.each(
    Object.entries(SPEC_FAMILY_SHAPES).flatMap(([family, names]) =>
      names.map((name) => [name, family as MermaidShapeFamily] as const),
    ),
  )("classifies %s as %s", (shape, family) => {
    expect(mermaidShapeFamily(shape)).toBe(family);
  });

  it("classifies an omitted shape as process", () => {
    expect(mermaidShapeFamily(undefined)).toBe("process");
  });

  it.each([
    "hexagon",
    "hex",
    "doc",
    "delay",
    "bang",
    "cloud",
    "curly",
  ] as const)("falls back to process for unmapped shape %s", (shape) => {
    expect(mermaidShapeFamily(shape)).toBe("process");
  });
});

describe("mermaidFamilyPresentation", () => {
  it("gives process the default frame", () => {
    expect(mermaidFamilyPresentation("process")).toEqual({
      borderRadius: `${NODE_BORDER_RADIUS}px`,
      borderWidth: `${NODE_BORDER_WIDTH}px`,
      borderStyle: "solid",
    });
  });

  it("gives decision a dashed border", () => {
    expect(mermaidFamilyPresentation("decision")).toEqual({
      borderRadius: `${NODE_BORDER_RADIUS}px`,
      borderWidth: "2px",
      borderStyle: "dashed",
    });
  });

  it("gives terminal a pill radius", () => {
    expect(mermaidFamilyPresentation("terminal")).toEqual({
      borderRadius: `${NODE_BORDER_RADIUS_PILL}px`,
      borderWidth: `${NODE_BORDER_WIDTH}px`,
      borderStyle: "solid",
    });
  });

  it("gives data/IO a dotted border", () => {
    expect(mermaidFamilyPresentation("data-io")).toEqual({
      borderRadius: `${NODE_BORDER_RADIUS}px`,
      borderWidth: `${NODE_BORDER_WIDTH}px`,
      borderStyle: "dotted",
    });
  });

  it("gives storage a thick solid border", () => {
    expect(mermaidFamilyPresentation("storage")).toEqual({
      borderRadius: `${NODE_BORDER_RADIUS}px`,
      borderWidth: "2px",
      borderStyle: "solid",
    });
  });

  it("gives subroutine a double border", () => {
    expect(mermaidFamilyPresentation("subroutine")).toEqual({
      borderRadius: `${NODE_BORDER_RADIUS}px`,
      borderWidth: "3px",
      borderStyle: "double",
    });
  });
});
