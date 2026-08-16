/**
 * Single source of truth for layout spacing and live-router clearance
 * (`specs/graph-view.md` §3–§4). ELK options and `routeEdges` defaults both
 * read from here, so the gap ELK reserves is the gap the router will use.
 *
 * Lane width for non-bundle separation is not here yet — it lands with #86.
 */

/** Clearance the live router keeps around every node rect, px. */
export const NODE_MARGIN = 12;

/** Distance from a node's right edge to its self-loop lane, px. */
export const SELF_LOOP_GAP = 24;

/** ELK same-layer node-node spacing, px. */
export const NODE_NODE_SPACING = 40;

/** ELK between-layer node-node spacing, px. */
export const NODE_NODE_BETWEEN_LAYERS = 50;

/**
 * Use-Def view: extra between-layer spacing so operand ports have room
 * (`llvmMode` layoutOptions).
 */
export const USE_DEF_NODE_NODE_BETWEEN_LAYERS = 60;

/**
 * Corner radius of routed orthogonal bends, px — half the node margin
 * (`specs/graph-view.md` §4). Not a literal of its own.
 */
export const BEND_RADIUS = NODE_MARGIN / 2;

/**
 * ELK edge-node spacing, px. Derived from the live clearance, not from
 * ELK's discarded routes.
 */
export const EDGE_NODE_SPACING = NODE_MARGIN;

/** ELK edge-edge spacing, px. Same clearance family as `EDGE_NODE_SPACING`. */
export const EDGE_EDGE_SPACING = NODE_MARGIN;
