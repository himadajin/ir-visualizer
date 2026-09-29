import type { CSSProperties } from "react";
import type { LabelSize } from "./edgeLabelPlacement";

/**
 * The one definition of a routed edge label's typography and background
 * padding (`specs/graph-view.md` §4). `RoutedEdge` draws the label with these
 * values and `measureEdgeLabel` measures it with them, so the box label
 * placement reasons about is the box that is painted.
 */

/** CSS custom property holding the label font family (the theme's UI font). */
const EDGE_LABEL_FONT_FAMILY_VAR = "--mantine-font-family";

export const EDGE_LABEL_FONT_SIZE = 10;

/** Background padding, `[horizontal, vertical]` px, as React Flow's `labelBgPadding`. */
export const EDGE_LABEL_BG_PADDING: [number, number] = [2, 4];

export const EDGE_LABEL_STYLE: CSSProperties = {
  fontFamily: `var(${EDGE_LABEL_FONT_FAMILY_VAR})`,
  fontSize: EDGE_LABEL_FONT_SIZE,
};

const sizeCache = new Map<string, LabelSize>();

let context: CanvasRenderingContext2D | null | undefined;

/**
 * A 2D context set to the label font, or `null` outside a browser (and in
 * environments without canvas). The font family is resolved from the same
 * custom property `EDGE_LABEL_STYLE` references, since canvas cannot read
 * `var()` itself.
 */
const labelContext = (): CanvasRenderingContext2D | null => {
  if (context !== undefined) return context;
  if (typeof document === "undefined") return (context = null);
  const ctx = document.createElement("canvas").getContext("2d");
  if (ctx === null) return (context = null);
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue(EDGE_LABEL_FONT_FAMILY_VAR)
    .trim();
  ctx.font = `${String(EDGE_LABEL_FONT_SIZE)}px ${family || "sans-serif"}`;
  return (context = ctx);
};

/** The painted box of a label with this text, background padding included. */
export const measureEdgeLabel = (text: string): LabelSize => {
  const cached = sizeCache.get(text);
  if (cached !== undefined) return cached;
  const ctx = labelContext();
  let width: number;
  let height: number;
  if (ctx === null) {
    // Estimate for non-browser environments.
    width = text.length * EDGE_LABEL_FONT_SIZE * 0.6;
    height = EDGE_LABEL_FONT_SIZE * 1.2;
  } else {
    const metrics = ctx.measureText(text);
    width = metrics.width;
    height = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
  }
  const [padX, padY] = EDGE_LABEL_BG_PADDING;
  const size = { width: width + 2 * padX, height: height + 2 * padY };
  sizeCache.set(text, size);
  return size;
};
