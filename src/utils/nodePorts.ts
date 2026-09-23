import type { Edge } from "@xyflow/react";
import type { GraphData, GraphEdge } from "../types/graph";
import type {
  NodePort,
  NodePortLayout,
  NodePortPreferences,
} from "../types/nodePorts";
import type { IREdgeBuilder } from "./layout";
import { ARRIVAL_GAP } from "./spacing";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const edgeOrder = (a: GraphEdge, b: GraphEdge) =>
  compare(a.source, b.source) || compare(a.id, b.id);

/** Node-local ids; JSON tuple encoding also keeps ELK's global ids injective. */
export const arrivalHandleId = (edgeId: string) =>
  JSON.stringify(["in", edgeId]);
export const departureHandleId = (edgeId: string) =>
  JSON.stringify(["out", edgeId]);
export const elkPortId = (nodeId: string, handleId: string) =>
  JSON.stringify(["port", nodeId, handleId]);

export const portX = (port: NodePort, width: number) =>
  port.relative ? port.x * width : port.x;

/**
 * Assign handles before measurement, without mutating GraphData. Position and
 * array order do not influence the generic assignment (graph-view §4).
 */
export const prepareNodePorts = (
  graph: GraphData,
  edgeBuilder: IREdgeBuilder,
  preferences?: NodePortPreferences,
  bundleOf?: (edge: GraphEdge) => string | undefined,
): { edges: Edge[]; layouts: Map<string, NodePortLayout> } => {
  const edges = graph.edges.map((edge) => {
    const rendered = edgeBuilder.buildReactFlowEdge(edge);
    const bundleId = bundleOf?.(edge);
    return { ...rendered, data: { ...rendered.data, bundleId } };
  });
  const incoming = new Map<string, GraphEdge[]>();
  const outgoing = new Map<string, Edge[]>();
  edges.forEach((edge, i) => {
    if (edge.type !== "routed" || edge.hidden === true) return;
    const ins = incoming.get(edge.target) ?? [];
    ins.push(graph.edges[i]);
    incoming.set(edge.target, ins);
    const outs = outgoing.get(edge.source) ?? [];
    outs.push(edge);
    outgoing.set(edge.source, outs);
    edge.targetHandle = arrivalHandleId(edge.id);
  });

  const layouts = new Map<string, NodePortLayout>();
  for (const node of graph.nodes) {
    const ins = incoming.get(node.id) ?? [];
    const outs = outgoing.get(node.id) ?? [];
    if (ins.length === 0 && outs.length === 0) continue;
    const preferred = preferences?.(node);
    const targets = new Map(
      preferred?.filter((p) => p.side === "top").map((p) => [p.id, p.x]),
    );
    const preferredX = (edge: GraphEdge) =>
      targets.get(edge.targetHandle ?? "") ?? null;
    ins.sort((a, b) => {
      const ax = preferredX(a);
      const bx = preferredX(b);
      if (ax !== bx) {
        if (ax === null) return 1;
        if (bx === null) return -1;
        return ax - bx;
      }
      return edgeOrder(a, b);
    });

    let lastX = 0;
    const ports: NodePort[] = ins.map((edge, i) => {
      if (targets.size === 0) {
        return {
          id: arrivalHandleId(edge.id),
          side: "top",
          x: (i + 1) / (ins.length + 1),
          relative: true,
        };
      }
      lastX = Math.max(lastX + ARRIVAL_GAP, Math.ceil(preferredX(edge) ?? 0));
      return {
        id: arrivalHandleId(edge.id),
        side: "top",
        x: lastX,
        relative: false,
      };
    });
    let minWidth =
      ins.length === 0
        ? 0
        : targets.size === 0
          ? (ins.length + 1) * ARRIVAL_GAP
          : lastX + ARRIVAL_GAP;
    if (outs.length > 0) {
      const sources = preferred?.filter((p) => p.side === "bottom") ?? [];
      // Preserve preferred port order (e.g. CFG successor order), then edge id.
      const sourceIndex = (edge: Edge) => {
        const index = sources.findIndex((p) => p.id === edge.sourceHandle);
        return index < 0 ? sources.length : index;
      };
      outs.sort(
        (a, b) => sourceIndex(a) - sourceIndex(b) || compare(a.id, b.id),
      );
      const groups = new Map<string, Edge[]>();
      for (const edge of outs) {
        const key =
          typeof edge.data?.bundleId === "string"
            ? JSON.stringify([
                "bundle",
                edge.data.bundleId,
                edge.sourceHandle ?? null,
              ])
            : JSON.stringify(["edge", edge.id]);
        const group = groups.get(key) ?? [];
        group.push(edge);
        groups.set(key, group);
      }
      const slots = [...groups.values()];
      let lastSourceX = 0;
      const absolute = sources.some((p) => p.x !== null && p.relative !== true);
      slots.forEach((group, i) => {
        const preference = sources[sourceIndex(group[0])];
        const uniquePreference =
          preference !== undefined &&
          slots.filter((slot) => sourceIndex(slot[0]) === sourceIndex(group[0]))
            .length === 1;
        const id = uniquePreference
          ? preference.id
          : departureHandleId(group[0].id);
        const x = absolute
          ? Math.max(lastSourceX + ARRIVAL_GAP, Math.ceil(preference?.x ?? 0))
          : (i + 1) / (slots.length + 1);
        lastSourceX = x;
        ports.push({ id, side: "bottom", x, relative: !absolute });
        for (const edge of group) edge.sourceHandle = id;
      });
      minWidth = Math.max(
        minWidth,
        absolute ? lastSourceX + ARRIVAL_GAP : (slots.length + 1) * ARRIVAL_GAP,
      );
    }
    layouts.set(node.id, { ports, minWidth });
  }
  return { edges, layouts };
};
