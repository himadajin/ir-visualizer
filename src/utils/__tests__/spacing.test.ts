import { describe, it, expect } from "vitest";
import {
  BEND_RADIUS,
  EDGE_EDGE_SPACING,
  EDGE_NODE_SPACING,
  CONTAINER_PADDING,
  NODE_MARGIN,
  NODE_NODE_BETWEEN_LAYERS,
  NODE_NODE_SPACING,
  SELF_LOOP_GAP,
  USE_DEF_NODE_NODE_BETWEEN_LAYERS,
} from "../spacing";

describe("spacing constants", () => {
  it("derives the bend radius from the node margin", () => {
    expect(BEND_RADIUS).toBe(NODE_MARGIN / 2);
  });

  it("leaves a full-radius bend room in a route's mandatory endpoint stub", () => {
    expect(2 * BEND_RADIUS).toBeLessThanOrEqual(NODE_MARGIN);
  });

  it("leaves a full-radius bend room in the narrowest configured node spacing", () => {
    expect(2 * NODE_MARGIN + 2 * BEND_RADIUS).toBeLessThanOrEqual(
      NODE_NODE_SPACING,
    );
  });

  it("derives ELK edge spacing from the live node margin", () => {
    expect(EDGE_NODE_SPACING).toBe(NODE_MARGIN);
    expect(EDGE_EDGE_SPACING).toBe(NODE_MARGIN);
  });

  it("keeps Use-Def layer spacing at least the default", () => {
    expect(USE_DEF_NODE_NODE_BETWEEN_LAYERS).toBeGreaterThanOrEqual(
      NODE_NODE_BETWEEN_LAYERS,
    );
  });

  it("keeps the self-loop lane outside the node margin", () => {
    expect(SELF_LOOP_GAP).toBeGreaterThanOrEqual(NODE_MARGIN);
  });

  it("derives container padding from the node margin", () => {
    expect(CONTAINER_PADDING).toBe(NODE_MARGIN);
  });
});
