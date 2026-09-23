import type { ELK, ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import type { Edge } from "@xyflow/react";
import type { NodePortLayout } from "../types/nodePorts";
import { elkPortId, portX } from "./nodePorts";
import { preserveUpwardFlow } from "./elkFlowOrder";

export const elkPorts = (
  id: string,
  layout: NodePortLayout,
  width: number,
  height: number,
) =>
  layout.ports.map((port) => ({
    id: elkPortId(id, port.id),
    x: portX(port, width),
    y: port.side === "top" ? 0 : height,
    width: 0,
    height: 0,
    layoutOptions: { "elk.port.side": port.side === "top" ? "NORTH" : "SOUTH" },
  }));

/**
 * Complete child layouts before placing their containing boxes. ELK's compound
 * port resizing can move FIXED_POS ports and fails for some FIXED_RATIO graphs;
 * flat fixed-size inputs let every pass honor the actual rendered port geometry.
 */
export const layoutHierarchy = async (
  elk: ELK,
  graph: ElkNode,
  edges: readonly Edge[],
  portLayouts: ReadonlyMap<string, NodePortLayout>,
): Promise<ElkNode> => {
  const children: ElkNode[] = [];
  for (const child of graph.children ?? []) {
    children.push(
      child.children?.length
        ? await layoutHierarchy(elk, child, edges, portLayouts)
        : child,
    );
  }
  const byId = new Map(children.map((node) => [node.id, node]));
  const owner = new Map<string, string>();
  const register = (node: ElkNode, id: string) => {
    owner.set(node.id, id);
    for (const child of node.children ?? []) register(child, id);
  };
  for (const child of children) register(child, child.id);
  const projected: Edge[] = [];
  for (const edge of edges) {
    const source = owner.get(edge.source);
    const target = owner.get(edge.target);
    if (source === undefined || target === undefined) continue;
    if (
      source === target &&
      !(edge.source === source && edge.target === target)
    )
      continue;
    projected.push({
      ...edge,
      source,
      target,
      sourceHandle: source === edge.source ? edge.sourceHandle : undefined,
      targetHandle: target === edge.target ? edge.targetHandle : undefined,
    });
  }
  const portIds = new Set(
    children.flatMap((n) => n.ports?.map((p) => p.id) ?? []),
  );
  const endpoint = (id: string, handle: string | null | undefined) => {
    const port = handle == null ? undefined : elkPortId(id, handle);
    return port !== undefined && portIds.has(port) ? port : id;
  };
  const elkEdges: ElkExtendedEdge[] = projected.map((edge, i) => ({
    id: `e${String(i)}`,
    sources: [endpoint(edge.source, edge.sourceHandle)],
    targets: [endpoint(edge.target, edge.targetHandle)],
  }));
  const flat: ElkNode = {
    ...graph,
    ports: undefined,
    children: children.map((child) => ({
      ...child,
      children: undefined,
      edges: undefined,
      layoutOptions: {
        ...child.layoutOptions,
        "elk.nodeSize.constraints": "[]",
      },
    })),
    edges: elkEdges,
  };
  preserveUpwardFlow(flat, projected);
  const result = await elk.layout(flat);
  for (const child of result.children ?? []) {
    const nested = byId.get(child.id)?.children;
    if (nested !== undefined) child.children = nested;
  }
  const ports = portLayouts.get(result.id);
  if (ports !== undefined)
    result.ports = elkPorts(result.id, ports, result.width!, result.height!);
  return result;
};
